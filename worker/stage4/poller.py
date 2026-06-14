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
    r.raise_for_status()


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
    vkan_json = out_dir / f"vkan_{key}.json"
    final_json = out_dir / "stage4_results.json"

    if method == "vkan":
        subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "run_vkan_real.py"),
             "--sequence", str(seq_dir), "--out-dir", str(out_dir)],
            check=True,
        )
        subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "eval_with_evo.py"),
             "--vkan-json", str(vkan_json), "--out", str(final_json)],
            check=True,
        )
    elif method == "orb3":
        subprocess.run(
            ["bash", str(SCRIPT_DIR / "run_orb3_baseline.sh"),
             str(seq_dir), str(out_dir)],
            check=True,
        )
    elif method == "dynaslam":
        subprocess.run(
            ["bash", str(SCRIPT_DIR / "run_dynaslam_baseline.sh"),
             str(seq_dir), str(out_dir)],
            check=True,
        )
    else:
        raise ValueError(f"Unknown method: {method}")

    return final_json


def build_payload(run_id: str, row, final_json: Path) -> dict:
    data = json.loads(final_json.read_text())
    seq = data["sequences"][0]
    method = row["method"]
    metrics = seq["metrics"].get(method, {})
    return {
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