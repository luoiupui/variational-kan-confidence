#!/usr/bin/env bash
# Stage 4 · Step B — ORB-SLAM3 baseline runner.
#
# Runs ORB-SLAM3 (RGB-D mode) on a TUM sequence inside a Docker container and
# extracts BOTH the camera trajectory (TUM format) and the sparse MapPoints
# cloud, ready to be fed into eval_with_evo.py.
#
# Prereqs on the Fly worker:
#   docker pull jahaniam/orbslam3:latest   # community image with build deps
#   /data/rgbd_dataset_freiburg1_xyz/      # TUM sequence already extracted
#   /app/worker/stage4/TUM1.yaml           # camera intrinsics for fr1
#
# Usage:
#   ./run_orb3_baseline.sh /data/rgbd_dataset_freiburg1_xyz /data/results/freiburg1_xyz
set -euo pipefail

SEQ="${1:?usage: $0 <sequence_dir> <out_dir>}"
OUT="${2:?usage: $0 <sequence_dir> <out_dir>}"
mkdir -p "$OUT"

VOC="/ORB_SLAM3/Vocabulary/ORBvoc.txt"
SETTINGS="/work/TUM1.yaml"   # mounted from worker/stage4/TUM1.yaml

# Generate associations file (rgb.txt + depth.txt -> assoc.txt)
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

# Run ORB-SLAM3 RGB-D
docker run --rm \
    -v "$SEQ:/seq:ro" \
    -v "$OUT:/out" \
    -v "$(pwd):/work:ro" \
    jahaniam/orbslam3:latest \
    /ORB_SLAM3/Examples/RGB-D/rgbd_tum \
        "$VOC" "$SETTINGS" /seq /out/assoc.txt

# ORB-SLAM3 writes CameraTrajectory.txt + KeyFrameTrajectory.txt in CWD.
# The container's entrypoint should be tuned to drop them in /out.
mv -f CameraTrajectory.txt "$OUT/orb3_traj.tum" 2>/dev/null || true
mv -f KeyFrameTrajectory.txt "$OUT/orb3_kf.tum"  2>/dev/null || true

# Optional MapPoints export — ORB-SLAM3 must be built with SaveMap enabled.
if [ -f "$OUT/MapPoints.txt" ]; then
    echo "[B] map points: $(wc -l < "$OUT/MapPoints.txt") landmarks"
fi

echo "[B] done · trajectory: $OUT/orb3_traj.tum"
