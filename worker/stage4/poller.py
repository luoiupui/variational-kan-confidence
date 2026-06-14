"""
Stage 4 · Worker poller.

Long-running loop on the Fly machine. Every 5 s:
  1. Calls the `claim-run` edge function which atomically picks the oldest
     `runs` row with status='queued' and flips it to 'running'.
  2. (Re-)marks it 'running' via the ingest-run edge function (idempotent,
     keeps the existing ingest contract / heartbeat behaviour intact).
  3. Dispatches to the right runner (V-KAN / ORB-SLAM3 / DynaSLAM).
  4. Parses the result JSON written by eval_with_evo.py.
  5. POSTs the final payload back to ingest-run with status='done' (or 'failed').

Env vars (set via `flyctl secrets set`):
  WORKER_INGEST_SECRET     — shared secret for the ingest-run function
  SUPABASE_FUNCTIONS_URL   — optional override, defaults to project URL
  DATA_ROOT                — where TUM sequences live, default /data
"""
from __future__ import annotations
import asyncio
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path

import httpx

from tum_adapter import TUM_WHITELIST, resolve_sequence

SECRET = os.environ["WORKER_INGEST_SECRET"]
FUNCTIONS_URL = os.environ.get(
    "SUPABASE_FUNCTIONS_URL",
    "https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1",
)
INGEST_URL = f"{FUNCTIONS_URL}/ingest-run"
CLAIM_URL = f"{FUNCTIONS_URL}/claim-run"
DATA_ROOT = Path(os.environ.get("DATA_ROOT", "/data"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))
SCRIPT_DIR = Path(__file__).resolve().parent


async def claim_next(client: httpx.AsyncClient):
    r = await client.post(
        CLAIM_URL,
        headers={"x-worker-secret": SECRET, "content-type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("id"):
        return None
    return data


async def post_ingest(client: httpx.AsyncClient, payload: dict) -> None:
    r = await client.post(
        INGEST_URL,
        json=payload,
        headers={"x-worker-secret": SECRET, "content-type": "application/json"},
        timeout=60,
    )
    if r.status_code >= 400:
        # Surface the ingest-run validation error AND a compact preview of the
        # payload so the failure shows up directly in the runs.error column.
        preview = {
            k: (
                f"<{type(v).__name__} len={len(v)}>"
                if isinstance(v, (list, dict)) else v
            )
            for k, v in payload.items()
        }
        raise RuntimeError(
            f"ingest-run {r.status_code}: {r.text[:1500]}\n"
            f"payload keys: {preview}"
        )


def run_method(method: str, sequence_id: str, out_dir: Path) -> Path:
    """Dispatch to the right runner. Returns path to final stage4_results.json."""
    # sequence_id may arrive as "fr1/desk" (matches sequence_name) or "fr1_desk"
    # (whitelist key). Normalize to the whitelist key, then resolve to the
    # on-disk directory (e.g. /data/rgbd_dataset_freiburg1_desk).
    key = sequence_id.replace("/", "_")
    if key not in TUM_WHITELIST:
        raise KeyError(
            f"unknown sequence_id {sequence_id!r}; "
            f"expected one of {list(TUM_WHITELIST)} (slash or underscore form)"
        )
    seq_dir = Path(resolve_sequence(key, str(DATA_ROOT)))
    out_dir.mkdir(parents=True, exist_ok=True)
    # run_vkan_real.py names the file from the on-disk sequence dir
    # (e.g. "rgbd_dataset_freiburg3_walking_xyz" -> "freiburg3_walking_xyz"),
    # NOT from the whitelist key ("fr3_walking_xyz"). Match that here.
    vkan_name = seq_dir.name.replace("rgbd_dataset_", "")
    vkan_json = out_dir / f"vkan_{vkan_name}.json"
    final_json = out_dir / "stage4_results.json"

    if method == "vkan":
        _run_checked([sys.executable, str(SCRIPT_DIR / "run_vkan_real.py"),
                      "--sequence", str(seq_dir), "--out-dir", str(out_dir)])
        _run_checked([sys.executable, str(SCRIPT_DIR / "eval_with_evo.py"),
                      "--vkan-json", str(vkan_json), "--out", str(final_json)])
    elif method == "orb3":
        _run_checked(["bash", str(SCRIPT_DIR / "run_orb3_baseline.sh"),
                      str(seq_dir), str(out_dir)])
    elif method == "dynaslam":
        _run_checked(["bash", str(SCRIPT_DIR / "run_dynaslam_baseline.sh"),
                      str(seq_dir), str(out_dir)])
    else:
        raise ValueError(f"Unknown method: {method}")

    return final_json


def _run_checked(cmd):
    """Like subprocess.run(check=True) but captures stdout+stderr and surfaces
    them in the exception message so that the ingest-run `error` column in
    Lovable Cloud contains the actual failure (not just 'returned exit 1')."""
    res = subprocess.run(cmd, capture_output=True, text=True)
    # Always echo to worker stdout/stderr so `flyctl logs` shows it too.
    if res.stdout:
        print(res.stdout, flush=True)
    if res.stderr:
        print(res.stderr, file=sys.stderr, flush=True)
    if res.returncode != 0:
        msg = (
            f"command failed (exit {res.returncode}): {' '.join(cmd)}\n"
            f"--- stdout (last 1500 chars) ---\n{(res.stdout or '')[-1500:]}\n"
            f"--- stderr (last 1500 chars) ---\n{(res.stderr or '')[-1500:]}"
        )
        raise RuntimeError(msg)
    return res


def build_payload(run_id: str, row, final_json: Path) -> dict:
    data = json.loads(final_json.read_text())
    seq = data["sequences"][0]
    method = row["method"]
    metrics = seq["metrics"].get(method, {})
    payload = {
        "run_id": run_id,
        "sequence_id": row["sequence_id"],
        "sequence_name": row["sequence_name"],
        "method": method,
        "status": "done",
        "frames": seq.get("frames"),
        "metrics": metrics,
        "trajectory_est": seq.get("trajectory_est"),
        "trajectory_gt": seq.get("trajectory_gt"),
        "ate_per_frame": seq.get("ate_per_frame"),
        "keyframes": seq.get("keyframes"),
        "map_points": seq.get("map_points"),
        "fe": seq.get("fe"),
    }
    # Strict JSON does not allow NaN/Infinity; Deno's req.json() rejects them
    # with a 400. Walking sequences occasionally produce non-finite values in
    # Umeyama alignment or evo stats, so scrub before posting.
    return _scrub_nonfinite(payload)


def _scrub_nonfinite(obj):
    import math
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else 0.0
    if isinstance(obj, list):
        return [_scrub_nonfinite(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _scrub_nonfinite(v) for k, v in obj.items()}
    return obj


async def process(client, row) -> None:
    run_id = str(row["id"])
    base = {
        "run_id": run_id,
        "sequence_id": row["sequence_id"],
        "sequence_name": row["sequence_name"],
        "method": row["method"],
    }
    print(f"[poller] claim {run_id} {row['method']} {row['sequence_id']}", flush=True)
    await post_ingest(client, {**base, "status": "running"})

    out_dir = DATA_ROOT / "results" / row["sequence_id"].replace("/", "_")
    try:
        final = run_method(row["method"], row["sequence_id"], out_dir)
        await post_ingest(client, build_payload(run_id, row, final))
        print(f"[poller] done  {run_id}", flush=True)
    except Exception:
        err = traceback.format_exc()
        print(f"[poller] FAIL  {run_id}\n{err}", flush=True)
        await post_ingest(client, {**base, "status": "failed", "error": err[-4000:]})


async def main() -> None:
    print("[poller] version=claim-run-no-db", flush=True)
    print(f"[poller] starting · ingest={INGEST_URL} data={DATA_ROOT}", flush=True)
    async with httpx.AsyncClient() as client:
        while True:
            try:
                row = await claim_next(client)
                if row is None:
                    await asyncio.sleep(POLL_INTERVAL)
                    continue
                await process(client, row)
            except Exception as e:
                print(f"[poller] loop error: {e!r}; retrying in 10s", flush=True)
                await asyncio.sleep(10)


if __name__ == "__main__":
    asyncio.run(main())