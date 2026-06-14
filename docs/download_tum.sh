#!/usr/bin/env bash
# Download the six TUM RGB-D sequences whitelisted by worker/stage4/tum_adapter.py
# Usage:  ./docs/download_tum.sh [target_root]   # default: ~/slam_data
set -euo pipefail
ROOT="${1:-$HOME/slam_data}"
mkdir -p "$ROOT"
BASE="https://cvg.cit.tum.de/rgbd/dataset"

for pair in \
  "freiburg1 rgbd_dataset_freiburg1_xyz.tgz" \
  "freiburg1 rgbd_dataset_freiburg1_desk.tgz" \
  "freiburg2 rgbd_dataset_freiburg2_desk.tgz" \
  "freiburg3 rgbd_dataset_freiburg3_sitting_static.tgz" \
  "freiburg3 rgbd_dataset_freiburg3_walking_xyz.tgz" \
  "freiburg3 rgbd_dataset_freiburg3_walking_halfsphere.tgz"; do
  set -- $pair
  fr=$1
  tgz=$2
  if [[ -d "$ROOT/${tgz%.tgz}" ]]; then
    echo "skip · ${tgz%.tgz} already extracted"
    continue
  fi
  echo "fetch · $tgz"
  wget -c -O "/tmp/$tgz" "$BASE/$fr/$tgz"
  tar -xzf "/tmp/$tgz" -C "$ROOT"
done

echo "OK · sequences ready in $ROOT"
echo "Set DATA_ROOT=$ROOT before starting the worker poller."