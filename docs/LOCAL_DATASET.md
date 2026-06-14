# Local dataset setup — TUM RGB-D

This project benchmarks V-KAN against ORB-SLAM3 and DynaSLAM on the
[TUM RGB-D dataset](https://cvg.cit.tum.de/rgbd/dataset). The whitelist of
supported sequences lives in `worker/stage4/tum_adapter.py` (lines 29-36).

## 1. Sequences

| seq_id | dynamic % | tarball | typical use |
|---|---|---|---|
| `fr1_xyz` | 0 | `rgbd_dataset_freiburg1_xyz.tgz` | sanity check, static |
| `fr1_desk` | 5 | `rgbd_dataset_freiburg1_desk.tgz` | low-dynamic |
| `fr2_desk` | 0 | `rgbd_dataset_freiburg2_desk.tgz` | longer static |
| `fr3_sitting_static` | 25 | `rgbd_dataset_freiburg3_sitting_static.tgz` | mild dynamic |
| `fr3_walking_xyz` | 70 | `rgbd_dataset_freiburg3_walking_xyz.tgz` | **headline V-KAN vs ORB3 vs DynaSLAM** |
| `fr3_walking_halfsphere` | 70 | `rgbd_dataset_freiburg3_walking_halfsphere.tgz` | second high-dynamic |

Total disk: ~3.5 GB compressed, ~7 GB extracted.

## 2. Layout the worker expects

```
~/slam_data/
├── rgbd_dataset_freiburg1_xyz/
├── rgbd_dataset_freiburg1_desk/
├── rgbd_dataset_freiburg2_desk/
├── rgbd_dataset_freiburg3_sitting_static/
├── rgbd_dataset_freiburg3_walking_xyz/
└── rgbd_dataset_freiburg3_walking_halfsphere/
```

Each sequence directory must contain `rgb.txt`, `depth.txt`, `groundtruth.txt`,
`rgb/*.png`, `depth/*.png` — this is exactly the layout produced by extracting
TUM's official `.tgz` files.

## 3. One-shot download

```bash
chmod +x docs/download_tum.sh
./docs/download_tum.sh ~/slam_data
export DATA_ROOT=~/slam_data
```

The script is idempotent — sequences already on disk are skipped.

## 4. Intrinsics

| Sequence family | Camera | Settings file |
|---|---|---|
| `fr1_*` | Kinect v1, 640×480 | `TUM1.yaml` |
| `fr2_*` | Kinect v1, 640×480 | `TUM2.yaml` (add if needed) |
| `fr3_*` | Asus Xtion, 640×480 | `TUM3.yaml` |

ORB-SLAM3 and DynaSLAM read these from `worker/stage4/`. The Docker images ship
the ORB vocabulary (`ORBvoc.txt`) — no extra download required.

## 5. Gotchas

- **Time sync.** RGB and depth streams are not hardware-synchronised. Both
  baseline runners regenerate `assoc.txt` with a 40 ms tolerance. Do not
  tighten that window.
- **Depth scale.** TUM depth PNGs encode 5000 = 1 m (uint16). All runners
  already handle this; never rescale on disk.
- **Groundtruth.** Vicon mocap at ~100 Hz. `eval_with_evo.py` interpolates to
  RGB timestamps and applies Umeyama alignment before computing ATE/RPE.

## 6. Importing into local Supabase

The six whitelisted sequences are inserted into `public.sequences` by the
migrations replayed during `supabase db reset`. To add a new sequence:

1. Append it to `TUM_WHITELIST` in `worker/stage4/tum_adapter.py`.
2. Write a one-line `INSERT` migration under `supabase/migrations/`.
3. Run `supabase db reset` (local) or push the migration (cloud).
4. The UI dropdown picks it up automatically.

## 7. Importing external results

If you ran a SLAM method outside this stack (DynaSLAM on Colab, ORB-SLAM3 on a
lab workstation, …), push the resulting TUM trajectory into the project DB
with:

```bash
python tools/ingest_external_run.py \
  --method dynaslam \
  --sequence-id fr3_walking_xyz \
  --est  path/to/KeyFrameTrajectory.txt \
  --gt   ~/slam_data/rgbd_dataset_freiburg3_walking_xyz/groundtruth.txt \
  --frames 858
```

See `tools/README.md` for the full flag list.