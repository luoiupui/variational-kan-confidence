#!/usr/bin/env bash
# Stage 4 · Step F — DynaSLAM baseline runner.
#
# DynaSLAM = ORB-SLAM2 + Mask R-CNN dynamic-object masking.
# We use the official BertaBescos/DynaSLAM Docker image and run RGB-D mode on
# a TUM sequence, then drop a TUM-format trajectory next to the V-KAN output
# so eval_with_evo.py can fold it into the same stage4_results.json.
#
# Prereqs on the Fly worker:
#   docker pull yubaoliu/dynaslam:latest        # community image w/ MaskRCNN weights
#   /data/rgbd_dataset_freiburg3_walking_xyz/   # high-dynamic TUM sequence
#   /app/worker/stage4/TUM3.yaml                # camera intrinsics for fr3
#
# Usage:
#   ./run_dynaslam_baseline.sh /data/rgbd_dataset_freiburg3_walking_xyz \
#                              /data/results/fr3_walking_xyz
set -euo pipefail

SEQ="${1:?usage: $0 <sequence_dir> <out_dir>}"
OUT="${2:?usage: $0 <sequence_dir> <out_dir>}"
mkdir -p "$OUT"

VOC="/DynaSLAM/Vocabulary/ORBvoc.txt"
SETTINGS="/work/TUM3.yaml"
MASKS_DIR="$OUT/masks"
mkdir -p "$MASKS_DIR"

# Reuse the assoc.txt produced by ORB3 if present, else regenerate.
if [ ! -f "$OUT/assoc.txt" ]; then
  python3 - "$SEQ" > "$OUT/assoc.txt" <<'PY'
import sys, os
root = sys.argv[1]
def load(p):
    out = []
    for line in open(os.path.join(root, p)):
        line = line.strip()
        if not line or line.startswith("#"): continue
        ts, rel = line.split(maxsplit=1)
        out.append((float(ts), rel))
    return out
rgb, depth = load("rgb.txt"), load("depth.txt")
import numpy as np
dts = np.array([t for t,_ in depth])
for t, r in rgb:
    i = int(np.argmin(np.abs(dts - t)))
    if abs(dts[i] - t) < 0.04:
        print(f"{t:.6f} {r} {depth[i][0]:.6f} {depth[i][1]}")
PY
fi

# Run DynaSLAM RGB-D — Mask R-CNN runs once and caches into MASKS_DIR.
docker run --rm --gpus all \
    -v "$SEQ:/seq:ro" \
    -v "$OUT:/out" \
    -v "$(pwd):/work:ro" \
    yubaoliu/dynaslam:latest \
    /DynaSLAM/Examples/RGB-D/rgbd_tum \
        "$VOC" "$SETTINGS" /seq /out/assoc.txt "$MASKS_DIR" /out

mv -f CameraTrajectory.txt "$OUT/dynaslam_traj.tum"  2>/dev/null || true
mv -f KeyFrameTrajectory.txt "$OUT/dynaslam_kf.tum"  2>/dev/null || true

echo "[F] done · trajectory: $OUT/dynaslam_traj.tum"
echo "[F] cached $(ls "$MASKS_DIR" | wc -l) Mask R-CNN masks for re-runs"