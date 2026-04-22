"""
TUM RGB-D adapter: streams (timestamp, rgb_path, depth_path, gt_pose) tuples
from a downloaded TUM sequence directory.

Expected layout (after `tar -xzf rgbd_dataset_freiburg1_xyz.tgz -C /data`):
  /data/rgbd_dataset_freiburg1_xyz/
    rgb.txt
    depth.txt
    groundtruth.txt
    rgb/*.png
    depth/*.png

Usage:
    from tum_adapter import TUMSequence
    seq = TUMSequence("/data/rgbd_dataset_freiburg1_xyz")
    for ts, rgb, depth, pose in seq.frames():
        ...
"""
from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Iterator, List, Optional, Tuple

import numpy as np


# Stage 4 — Step E sequence whitelist.
# Mirrors public.sequences in Lovable Cloud. Keep in sync.
TUM_WHITELIST: dict[str, dict] = {
    "fr1_xyz":              {"name": "fr1/xyz",              "family": "TUM-RGBD",     "dynamic_pct": 0,  "tarball": "rgbd_dataset_freiburg1_xyz.tgz"},
    "fr1_desk":             {"name": "fr1/desk",             "family": "TUM-RGBD",     "dynamic_pct": 5,  "tarball": "rgbd_dataset_freiburg1_desk.tgz"},
    "fr2_desk":             {"name": "fr2/desk",             "family": "TUM-RGBD",     "dynamic_pct": 0,  "tarball": "rgbd_dataset_freiburg2_desk.tgz"},
    "fr3_sitting_static":   {"name": "fr3/sitting_static",   "family": "TUM-RGBD-Dyn", "dynamic_pct": 25, "tarball": "rgbd_dataset_freiburg3_sitting_static.tgz"},
    "fr3_walking_xyz":      {"name": "fr3/walking_xyz",      "family": "TUM-RGBD-Dyn", "dynamic_pct": 70, "tarball": "rgbd_dataset_freiburg3_walking_xyz.tgz"},
    "fr3_walking_halfsphere": {"name": "fr3/walking_halfsphere", "family": "TUM-RGBD-Dyn", "dynamic_pct": 70, "tarball": "rgbd_dataset_freiburg3_walking_halfsphere.tgz"},
}


def resolve_sequence(seq_id: str, data_root: str = "/data") -> str:
    """Map a whitelist seq_id (e.g. 'fr3_walking_xyz') to its on-disk root.
    Expects `<data_root>/<basename(tarball without .tgz)>` to exist."""
    if seq_id not in TUM_WHITELIST:
        raise KeyError(f"unknown seq_id {seq_id!r}; whitelist={list(TUM_WHITELIST)}")
    base = TUM_WHITELIST[seq_id]["tarball"].removesuffix(".tgz")
    path = os.path.join(data_root, base)
    if not os.path.isdir(path):
        raise FileNotFoundError(
            f"sequence dir {path!r} not found — download with:\n"
            f"  wget -O /tmp/{TUM_WHITELIST[seq_id]['tarball']} "
            f"https://cvg.cit.tum.de/rgbd/dataset/freiburg{base[19]}/{TUM_WHITELIST[seq_id]['tarball']}\n"
            f"  tar -xzf /tmp/{TUM_WHITELIST[seq_id]['tarball']} -C {data_root}"
        )
    return path


@dataclass
class TumPose:
    ts: float
    tx: float
    ty: float
    tz: float
    qx: float
    qy: float
    qz: float
    qw: float

    def as_xyz(self) -> Tuple[float, float, float]:
        return (self.tx, self.ty, self.tz)


def _load_assoc(path: str) -> List[Tuple[float, str]]:
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            ts_str, rel = line.split(maxsplit=1)
            out.append((float(ts_str), rel))
    return out


def _load_gt(path: str) -> List[TumPose]:
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 8:
                continue
            ts, tx, ty, tz, qx, qy, qz, qw = map(float, parts[:8])
            out.append(TumPose(ts, tx, ty, tz, qx, qy, qz, qw))
    return out


def _nearest(target: float, sorted_keys: np.ndarray) -> int:
    i = np.searchsorted(sorted_keys, target)
    if i == 0:
        return 0
    if i >= len(sorted_keys):
        return len(sorted_keys) - 1
    return i if abs(sorted_keys[i] - target) < abs(sorted_keys[i - 1] - target) else i - 1


class TUMSequence:
    def __init__(self, root: str, max_dt: float = 0.04):
        self.root = root
        self.rgb = _load_assoc(os.path.join(root, "rgb.txt"))
        self.depth = _load_assoc(os.path.join(root, "depth.txt"))
        self.gt = _load_gt(os.path.join(root, "groundtruth.txt"))
        self.max_dt = max_dt
        self._depth_ts = np.array([t for t, _ in self.depth])
        self._gt_ts = np.array([p.ts for p in self.gt])

    def __len__(self) -> int:
        return len(self.rgb)

    def frames(self) -> Iterator[Tuple[float, str, Optional[str], Optional[TumPose]]]:
        for ts, rgb_rel in self.rgb:
            di = _nearest(ts, self._depth_ts)
            depth_rel = self.depth[di][1] if abs(self._depth_ts[di] - ts) < self.max_dt else None
            gi = _nearest(ts, self._gt_ts)
            pose = self.gt[gi] if abs(self._gt_ts[gi] - ts) < self.max_dt * 2 else None
            yield (
                ts,
                os.path.join(self.root, rgb_rel),
                os.path.join(self.root, depth_rel) if depth_rel else None,
                pose,
            )
