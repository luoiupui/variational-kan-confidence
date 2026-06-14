"""
Stage 4 · Step C — evo-based ATE/RPE evaluation harness.

Takes a V-KAN JSON (from Step A) and optionally an ORB-SLAM3 trajectory
(from Step B), runs evo_ape / evo_rpe against TUM ground truth, then emits
the final dashboard payload `stage4_results.json`.

Requires: pip install evo

Usage:
    python eval_with_evo.py \
        --vkan-json /data/results/freiburg1_xyz/vkan_freiburg1_xyz.json \
        --orb3-traj /data/results/freiburg1_xyz/orb3_traj.tum \
        --out /app/public/data/stage4_results.json
"""
from __future__ import annotations
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from typing import Optional

import numpy as np


def _run_evo_ape(gt: str, est: str) -> dict:
    """Call `evo_ape tum` and parse stats."""
    with tempfile.TemporaryDirectory() as td:
        out = os.path.join(td, "ape.json")
        cmd = [
            "evo_ape", "tum", gt, est,
            "-a",            # SE(3) Umeyama alignment
            "--save_results", out,
        ]
        _run_checked(cmd)
        cmd2 = ["evo_ape", "tum", gt, est, "-a", "-v"]
        res = _run_checked(cmd2)
        return _parse_evo_stdout(res.stdout)


def _run_evo_rpe(gt: str, est: str, delta: float = 1.0) -> dict:
    cmd = ["evo_rpe", "tum", gt, est, "-a", "--delta", str(delta), "-v"]
    res = _run_checked(cmd)
    return _parse_evo_stdout(res.stdout)


def _run_checked(cmd):
    """Like subprocess.run(check=True) but surfaces stderr/stdout on failure."""
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        msg = (
            f"command failed (exit {res.returncode}): {' '.join(cmd)}\n"
            f"--- stdout ---\n{res.stdout}\n"
            f"--- stderr ---\n{res.stderr}"
        )
        print(msg, file=sys.stderr, flush=True)
        raise RuntimeError(msg)
    return res


def _parse_evo_stdout(stdout: str) -> dict:
    """Parse the 'rmse', 'mean', 'max' lines from evo's verbose output."""
    out = {}
    for line in stdout.splitlines():
        for k in ("rmse", "mean", "max", "min", "std"):
            if line.strip().startswith(k):
                try:
                    out[k] = float(line.split()[-1])
                except (ValueError, IndexError):
                    pass
    return out


def _per_frame_ate(est_xyz: np.ndarray, gt_xyz: np.ndarray) -> list:
    """Quick per-frame Euclidean error after rigid alignment."""
    # Umeyama alignment
    mu_e, mu_g = est_xyz.mean(0), gt_xyz.mean(0)
    Xe, Xg = est_xyz - mu_e, gt_xyz - mu_g
    H = Xe.T @ Xg
    U, _, Vt = np.linalg.svd(H)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1, 1, d]) @ U.T
    s = (Xg * (Xe @ R.T)).sum() / (Xe ** 2).sum()
    aligned = s * (est_xyz @ R.T) + (mu_g - s * mu_e @ R.T)
    err = np.linalg.norm(aligned - gt_xyz, axis=1)
    return err.tolist()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vkan-json", required=True)
    ap.add_argument("--orb3-traj", help="Optional ORB-SLAM3 TUM trajectory")
    ap.add_argument("--orb3-map", help="Optional ORB-SLAM3 MapPoints file (xyz per line)")
    ap.add_argument("--dynaslam-traj", help="Optional DynaSLAM TUM trajectory")
    ap.add_argument("--out", required=True, help="Final dashboard JSON")
    args = ap.parse_args()

    with open(args.vkan_json) as f:
        vkan = json.load(f)

    tum = vkan["_tum_paths"]
    gt_tum = tum["gt"]
    est_tum = tum["est"]

    print("[C] running evo_ape on V-KAN ...")
    ape = _run_evo_ape(gt_tum, est_tum)
    print(f"[C]   ATE rmse={ape.get('rmse', float('nan')):.4f}")
    print("[C] running evo_rpe on V-KAN ...")
    rpe = _run_evo_rpe(gt_tum, est_tum)

    est_xyz = np.array(vkan["trajectory_est"])
    gt_xyz = np.array(vkan["trajectory_gt"])
    per_frame = _per_frame_ate(est_xyz, gt_xyz)

    seq = {
        "id": vkan["id"],
        "name": vkan["name"],
        "frames": vkan["frames"],
        "trajectory_est": vkan["trajectory_est"],
        "trajectory_gt": vkan["trajectory_gt"],
        "ate_per_frame": per_frame,
        "fe": vkan.get("fe", []),
        "keyframes": vkan["keyframes"],
        "metrics": {
            "vkan": {
                "ate_rmse": ape.get("rmse", 0.0),
                "ate_mean": ape.get("mean", 0.0),
                "ate_max": ape.get("max", 0.0),
                "rpe_trans": rpe.get("rmse", 0.0),
                "rpe_rot": 0.0,  # filled when rotation est is wired in
                "tracking_pct": 100.0 * vkan["frames"] / (vkan["frames"] + vkan.get("_skipped_frames", 0)),
                "fps": vkan.get("_fps", 0.0),
            }
        },
    }

    if args.orb3_traj and os.path.exists(args.orb3_traj):
        print("[C] running evo_ape on ORB-SLAM3 ...")
        ape3 = _run_evo_ape(gt_tum, args.orb3_traj)
        rpe3 = _run_evo_rpe(gt_tum, args.orb3_traj)
        seq["metrics"]["orb3"] = {
            "ate_rmse": ape3.get("rmse", 0.0),
            "ate_mean": ape3.get("mean", 0.0),
            "ate_max": ape3.get("max", 0.0),
            "rpe_trans": rpe3.get("rmse", 0.0),
            "rpe_rot": 0.0,
            "tracking_pct": 0.0,
        }
        # parse ORB3 trajectory xyz
        orb3_xyz = []
        with open(args.orb3_traj) as f:
            for line in f:
                if line.strip().startswith("#") or not line.strip():
                    continue
                parts = line.split()
                orb3_xyz.append([float(parts[1]), float(parts[2]), float(parts[3])])
        seq["trajectory_orb3"] = orb3_xyz

    if args.orb3_map and os.path.exists(args.orb3_map):
        pts = []
        with open(args.orb3_map) as f:
            for line in f:
                p = line.split()
                if len(p) >= 3:
                    pts.append({"pos": [float(p[0]), float(p[1]), float(p[2])]})
        seq["map_points"] = pts

    if args.dynaslam_traj and os.path.exists(args.dynaslam_traj):
        print("[C] running evo_ape on DynaSLAM ...")
        aped = _run_evo_ape(gt_tum, args.dynaslam_traj)
        rped = _run_evo_rpe(gt_tum, args.dynaslam_traj)
        seq["metrics"]["dynaslam"] = {
            "ate_rmse": aped.get("rmse", 0.0),
            "ate_mean": aped.get("mean", 0.0),
            "ate_max": aped.get("max", 0.0),
            "rpe_trans": rped.get("rmse", 0.0),
            "rpe_rot": 0.0,
            "tracking_pct": 0.0,
        }
        dyn_xyz = []
        with open(args.dynaslam_traj) as f:
            for line in f:
                if line.strip().startswith("#") or not line.strip():
                    continue
                parts = line.split()
                dyn_xyz.append([float(parts[1]), float(parts[2]), float(parts[3])])
        seq["trajectory_dynaslam"] = dyn_xyz

    payload = {
        "status": "live",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "sequences": [seq],
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(payload, f)
    print(f"[C] wrote {args.out}")


if __name__ == "__main__":
    main()
