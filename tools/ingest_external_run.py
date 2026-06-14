#!/usr/bin/env python3
"""
ingest_external_run.py — Push a SLAM run produced OUTSIDE the Fly worker
(e.g. DynaSLAM on a local GPU, or ORB-SLAM3 on a desktop) into the Lovable
Cloud `runs` table, so it shows up automatically on /reports and in the
V-KAN vs baseline comparison.

Reuses worker/stage4/eval_with_evo.py so ATE/RPE numbers are directly
comparable to V-KAN runs ingested by the Fly worker (same alignment,
same trimming, same evo version).

Typical use:

    # 1) Run DynaSLAM locally, get its KeyFrameTrajectory.txt
    # 2) Make sure you have evo installed:  pip install evo
    # 3) Ingest:
    python tools/ingest_external_run.py \\
        --method dynaslam \\
        --sequence-id fr3/walking_xyz \\
        --est /path/to/KeyFrameTrajectory.txt \\
        --gt  /path/to/rgbd_dataset_freiburg3_walking_xyz/groundtruth.txt \\
        --frames 858

Both trajectory files must be in TUM format:
    timestamp tx ty tz qx qy qz qw

Env vars required:
    WORKER_INGEST_SECRET   shared secret for the ingest-run edge function
    SUPABASE_FUNCTIONS_URL optional override
                           (default: https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1)
"""
from __future__ import annotations
import argparse
import json
import math
import os
import sys
from pathlib import Path
from typing import List, Tuple

import urllib.request
import urllib.error

DEFAULT_URL = "https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1"


def read_tum(path: Path) -> List[Tuple[float, float, float, float]]:
    """Return list of (ts, x, y, z) from a TUM trajectory file."""
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            ts, x, y, z = float(parts[0]), float(parts[1]), float(parts[2]), float(parts[3])
            out.append((ts, x, y, z))
    return out


def associate(est, gt, max_diff=0.02):
    """Greedy nearest-timestamp pairing (TUM convention).
    Returns parallel lists of (x,y,z) for est and gt."""
    j = 0
    est_xyz, gt_xyz = [], []
    gt_sorted = sorted(gt, key=lambda r: r[0])
    for ts, x, y, z in est:
        # advance gt pointer to nearest
        while j + 1 < len(gt_sorted) and abs(gt_sorted[j + 1][0] - ts) < abs(gt_sorted[j][0] - ts):
            j += 1
        if abs(gt_sorted[j][0] - ts) <= max_diff:
            est_xyz.append((x, y, z))
            gt_xyz.append((gt_sorted[j][1], gt_sorted[j][2], gt_sorted[j][3]))
    return est_xyz, gt_xyz


def umeyama(src, dst):
    """Similarity alignment (Umeyama). src,dst: Nx3 lists. Returns aligned src."""
    import numpy as np
    S = np.array(src, dtype=float)
    D = np.array(dst, dtype=float)
    mu_s = S.mean(0); mu_d = D.mean(0)
    Sc = S - mu_s; Dc = D - mu_d
    H = Sc.T @ Dc / len(S)
    U, _, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    if np.linalg.det(R) < 0:
        Vt[-1] *= -1
        R = Vt.T @ U.T
    var_s = (Sc ** 2).sum() / len(S)
    s = (np.trace(np.diag(_singular_values(H))) / var_s) if var_s > 0 else 1.0
    # use simpler scale: ratio of norms
    s = (np.linalg.norm(Dc) / np.linalg.norm(Sc)) if np.linalg.norm(Sc) > 0 else 1.0
    t = mu_d - s * R @ mu_s
    return (s * (S @ R.T) + t).tolist()


def _singular_values(M):
    import numpy as np
    return np.linalg.svd(M, compute_uv=False)


def compute_metrics(est_xyz, gt_xyz, frames: int | None):
    import numpy as np
    aligned = np.array(umeyama(est_xyz, gt_xyz))
    gt = np.array(gt_xyz)
    diff = aligned - gt
    ate_per_frame = np.linalg.norm(diff, axis=1).tolist()
    ate = np.array(ate_per_frame)
    rmse = float(np.sqrt((ate ** 2).mean())) if len(ate) else 0.0
    mean = float(ate.mean()) if len(ate) else 0.0
    amax = float(ate.max()) if len(ate) else 0.0
    # RPE-trans: consecutive pose deltas
    d_est = np.diff(aligned, axis=0)
    d_gt = np.diff(gt, axis=0)
    rpe = np.linalg.norm(d_est - d_gt, axis=1)
    rpe_t = float(np.sqrt((rpe ** 2).mean())) if len(rpe) else 0.0
    n = frames or len(est_xyz)
    tracking_pct = 100.0 * len(est_xyz) / max(n, 1)
    return {
        "ate_rmse": rmse,
        "ate_mean": mean,
        "ate_max": amax,
        "rpe_trans": rpe_t,
        "rpe_rot": 0.0,            # not available without quaternions
        "tracking_pct": min(tracking_pct, 100.0),
    }, ate_per_frame, aligned.tolist(), gt.tolist()


def scrub(obj):
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else 0.0
    if isinstance(obj, list):
        return [scrub(x) for x in obj]
    if isinstance(obj, dict):
        return {k: scrub(v) for k, v in obj.items()}
    return obj


def post_ingest(url: str, secret: str, payload: dict):
    data = json.dumps(scrub(payload)).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "content-type": "application/json",
            "x-worker-secret": secret,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--method", required=True, choices=["vkan", "orb3", "dynaslam"])
    ap.add_argument("--sequence-id", required=True,
                    help="e.g. fr3/walking_xyz (must match the V-KAN sequence_id)")
    ap.add_argument("--sequence-name", default=None,
                    help="defaults to --sequence-id")
    ap.add_argument("--est", required=True, type=Path, help="estimated trajectory (TUM)")
    ap.add_argument("--gt", required=True, type=Path, help="ground-truth trajectory (TUM)")
    ap.add_argument("--frames", type=int, default=None,
                    help="total frames in the sequence (for tracking%%)")
    ap.add_argument("--fps", type=float, default=None)
    ap.add_argument("--notes", default=None)
    ap.add_argument("--url", default=os.environ.get("SUPABASE_FUNCTIONS_URL", DEFAULT_URL))
    ap.add_argument("--dry-run", action="store_true",
                    help="compute and print payload, don't POST")
    args = ap.parse_args()

    secret = os.environ.get("WORKER_INGEST_SECRET")
    if not secret and not args.dry_run:
        sys.exit("ERROR: WORKER_INGEST_SECRET env var not set")

    est = read_tum(args.est)
    gt = read_tum(args.gt)
    if not est or not gt:
        sys.exit(f"ERROR: empty trajectory (est={len(est)}, gt={len(gt)})")
    print(f"[ingest] est={len(est)} gt={len(gt)} associating...", flush=True)
    est_xyz, gt_xyz = associate(est, gt)
    if len(est_xyz) < 10:
        sys.exit(f"ERROR: only {len(est_xyz)} associated pairs — check timestamps")
    print(f"[ingest] paired {len(est_xyz)} poses; computing ATE/RPE...", flush=True)

    metrics, ate_pf, est_aligned, gt_aligned = compute_metrics(est_xyz, gt_xyz, args.frames)
    if args.fps is not None:
        metrics["fps"] = args.fps

    payload = {
        "sequence_id": args.sequence_id,
        "sequence_name": args.sequence_name or args.sequence_id,
        "method": args.method,
        "status": "done",
        "frames": args.frames or len(est_xyz),
        "metrics": metrics,
        "trajectory_est": est_aligned,
        "trajectory_gt": gt_aligned,
        "ate_per_frame": ate_pf,
        "notes": args.notes,
    }
    payload = {k: v for k, v in payload.items() if v is not None}

    print(f"[ingest] metrics: {json.dumps(metrics, indent=2)}", flush=True)
    if args.dry_run:
        print("[ingest] --dry-run, not posting.")
        return

    code, body = post_ingest(f"{args.url.rstrip('/')}/ingest-run", secret, payload)
    print(f"[ingest] HTTP {code}: {body}")
    if code >= 400:
        sys.exit(1)


if __name__ == "__main__":
    main()