# tools/

Helper scripts that run on your local PC, not on the Fly worker.

## ingest_external_run.py

Push a SLAM run produced outside the Fly worker (e.g. DynaSLAM on a local
GPU, or ORB-SLAM3 on your desktop) into the Lovable Cloud `runs` table.
Once ingested, the run appears automatically on `/reports`, in the
comparison table, and in the geomean.

### Requirements

- Python 3.9+
- `numpy` (`pip install numpy`)
- `WORKER_INGEST_SECRET` env var (same secret used by the Fly worker)

### Inputs

Two TUM-format trajectory files:

    timestamp tx ty tz qx qy qz qw

- `--est` — the SLAM system's estimated trajectory (e.g. DynaSLAM's
  `KeyFrameTrajectory.txt` or `CameraTrajectory.txt`).
- `--gt`  — the sequence ground truth (`groundtruth.txt` from the TUM
  RGB-D dataset).

### Example — DynaSLAM on fr3/walking_xyz

```bash
export WORKER_INGEST_SECRET=...   # same value set via flyctl secrets
python tools/ingest_external_run.py \
    --method dynaslam \
    --sequence-id fr3/walking_xyz \
    --est  ./DynaSLAM/results/walking_xyz_KeyFrameTrajectory.txt \
    --gt   /data/rgbd_dataset_freiburg3_walking_xyz/groundtruth.txt \
    --frames 858 \
    --fps 14.2 \
    --notes "DynaSLAM RGB-D, Mask R-CNN, local RTX 4090"
```

### Example — ORB-SLAM3 on fr1/desk

```bash
python tools/ingest_external_run.py \
    --method orb3 \
    --sequence-id fr1/desk \
    --est ./ORB_SLAM3/CameraTrajectory.txt \
    --gt  /data/rgbd_dataset_freiburg1_desk/groundtruth.txt \
    --frames 575
```

### Notes

- `--sequence-id` must match the value used for V-KAN runs (e.g.
  `fr3/walking_xyz`, not `fr3_walking_xyz`) so the comparison table
  lines up.
- Metrics are computed the same way as the worker: greedy timestamp
  association + Umeyama alignment + ATE-RMSE / RPE-trans. Numbers are
  directly comparable with V-KAN runs ingested by the Fly worker.
- Use `--dry-run` to compute and print metrics without posting.