# Stage 4 — Real TUM RGB-D pipeline

End-to-end loop: **A → C → B**.

## Files

| File | Role |
|------|------|
| `tum_adapter.py` | Streams `(ts, rgb, depth, gt_pose)` from a TUM sequence dir. |
| `run_vkan_real.py` | **Step A** — V-KAN inference → `vkan_traj.tum` + `vkan_<seq>.json`. |
| `eval_with_evo.py` | **Step C** — runs `evo_ape`/`evo_rpe`, emits `stage4_results.json`. |
| `run_orb3_baseline.sh` | **Step B** — runs ORB-SLAM3 (Docker) → `orb3_traj.tum` (+ map). |

## On the Fly worker

```bash
# one-time
pip install numpy evo
mkdir -p /data/results/freiburg1_xyz

# upload these scripts
# (locally)  flyctl ssh sftp shell  ->  put worker/stage4/*  /app/worker/stage4/

# Step A — V-KAN on real data
cd /app/worker/stage4
python run_vkan_real.py \
    --sequence /data/rgbd_dataset_freiburg1_xyz \
    --out-dir  /data/results/freiburg1_xyz

# Step C — evaluation (V-KAN only first; baseline added once Step B done)
python eval_with_evo.py \
    --vkan-json /data/results/freiburg1_xyz/vkan_freiburg1_xyz.json \
    --out       /app/public/data/stage4_results.json

# Step B — ORB-SLAM3 baseline
./run_orb3_baseline.sh \
    /data/rgbd_dataset_freiburg1_xyz \
    /data/results/freiburg1_xyz

# Step C again — now with ORB3 baseline + map
python eval_with_evo.py \
    --vkan-json /data/results/freiburg1_xyz/vkan_freiburg1_xyz.json \
    --orb3-traj /data/results/freiburg1_xyz/orb3_traj.tum \
    --orb3-map  /data/results/freiburg1_xyz/MapPoints.txt \
    --out       /app/public/data/stage4_results.json
```

## Schema contract

Output `stage4_results.json` matches `src/lib/stage4-types.ts → Stage4RealData`.

The `/stage4` page reads it and feeds:
- `trajectory_est` → V-KAN line (cyan)
- `trajectory_gt` → ground truth (white dashed)
- `trajectory_orb3` → ORB-SLAM3 line (amber)
- `map_points` → sparse landmark cloud (yellow dots, MAP layer)
- `keyframes` → camera frustums (MAP layer)

The Trajectory3D viewer has a **Trajectory / Map / Both** toggle in the
top-right.
