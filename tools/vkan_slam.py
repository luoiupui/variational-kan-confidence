#!/usr/bin/env python3
"""
vkan_slam.py — a minimal SLAM-*system* wrapper around the V-KAN algorithm.

Why a second file?
------------------
`vkan_demo.py` shows the **algorithm** end-to-end (encoder, ELBO, NOTEARS,
four diagnostic plots). It is research-grade but not a SLAM system: it has
no notion of frames, tracking, keyframes, or a map.

`vkan_slam.py` wraps the same V-KAN core behind the **public API a typical
SLAM package exposes** (think ORB-SLAM / OpenVSLAM / Kimera, minus ROS):

      stream of (t, pose7) frames
                  │
                  ▼
        ┌──────── Tracker ────────┐
        │ constant-velocity prior │
        └────────────┬────────────┘
                     ▼
               VKANKeyframeGate
         (online ELBO + robust z-score)
                     │ flagged?
                     ▼
              LocalMapper
        (insert Keyframe, summarise
         latent → MapPoint cloud)
                     │
                     ▼
        Trajectory + KeyframeSet + Map

It is **ROS-free on purpose** — the same wrapper can later be lifted into a
ROS 2 / micro-ROS node by attaching `process_frame` to a subscriber callback
(see the Roadmap page, L2/L3 layering). For pure research you replay any
pose stream (TUM groundtruth or the synthetic scene from vkan_demo) and get
a SLAM-style output bundle without installing anything beyond torch + numpy
+ matplotlib.

Run
---
    python tools/vkan_slam.py                          # synthetic 1200 frames
    python tools/vkan_slam.py --tum <groundtruth.txt>
    python tools/vkan_slam.py --tum <path> --emit-results 2026-06-14_slam_run

The last form drops a PNG + meta.json + metrics.json into
`docs/results/<run-id>/` so the React `/results` page picks it up.
"""
from __future__ import annotations

import argparse
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Iterator, List, Optional

import numpy as np
import torch

# Reuse the algorithm core verbatim — no duplication of the V-KAN model.
from vkan_demo import (
    VKAN,
    load_tum_groundtruth,
    synthetic_dynamic_scene,
    train,
)

try:
    # Only needed for the diagnostic plot; the SLAM loop itself is headless.
    import matplotlib.pyplot as plt
except Exception:                                                  # pragma: no cover
    plt = None


# ---------------------------------------------------------------------------
# 1. SLAM-style record types. Deliberately tiny — they are the only public
#    structures a downstream node (ROS wrapper, evaluator, visualiser) needs.
# ---------------------------------------------------------------------------
@dataclass
class Frame:
    t: float                       # timestamp (s)
    pose7: np.ndarray              # (7,) tx,ty,tz,qx,qy,qz,qw  (normalised)


@dataclass
class Keyframe:
    id: int
    t: float
    pose7: np.ndarray
    latent: np.ndarray             # V-KAN posterior mean μ (d_latent,)
    elbo: float                    # free-energy at insertion


@dataclass
class MapPoint:
    id: int
    xyz: np.ndarray                # (3,) — first 3 dims of latent, projected
    seen_by: List[int] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 2. Tracker — a constant-velocity predictor on the 7-D pose. Stand-in for
#    the front-end of any SLAM system; replace with PnP / ICP / direct VO
#    when wiring real sensors. The V-KAN gate does *not* care which tracker
#    runs in front of it.
# ---------------------------------------------------------------------------
class ConstVelTracker:
    def __init__(self) -> None:
        self._prev: Optional[np.ndarray] = None
        self._vel: np.ndarray = np.zeros(7, dtype=np.float32)

    def predict(self, dt: float) -> Optional[np.ndarray]:
        if self._prev is None:
            return None
        return self._prev + self._vel * dt

    def update(self, pose7: np.ndarray, dt: float) -> np.ndarray:
        if self._prev is not None and dt > 1e-6:
            self._vel = 0.7 * self._vel + 0.3 * (pose7 - self._prev) / dt
        self._prev = pose7.astype(np.float32, copy=True)
        return self._prev


# ---------------------------------------------------------------------------
# 3. V-KAN keyframe gate. Runs the trained encoder on each frame, keeps a
#    rolling estimate of mean/std of the free-energy, and fires when the
#    current ELBO is more than `z_thresh` σ above the running mean. This is
#    the SLAM-system contract: a boolean signal saying "the scene just
#    changed enough that a new keyframe is warranted".
# ---------------------------------------------------------------------------
class VKANKeyframeGate:
    def __init__(self, model: VKAN, z_thresh: float = 2.5, min_gap: int = 10,
                 ema: float = 0.02) -> None:
        self.model = model.eval()
        self.z_thresh = z_thresh
        self.min_gap = min_gap
        self.ema = ema
        self._mean = 0.0
        self._var = 1.0
        self._frames_since = 10 ** 9
        self._warmed = False

    @torch.no_grad()
    def step(self, pose7: np.ndarray) -> tuple[bool, float, float, np.ndarray]:
        x = torch.from_numpy(pose7[None].astype(np.float32))
        xr, mu, logvar, _ = self.model(x)
        fe, _, _ = VKAN.elbo(x, xr, mu, logvar, beta=0.5)
        elbo = float(fe.item())
        # Robust running stats (no list growth → O(1) per frame, edge-friendly).
        if not self._warmed:
            self._mean, self._var, self._warmed = elbo, 1.0, True
        d = elbo - self._mean
        self._mean += self.ema * d
        self._var = (1 - self.ema) * self._var + self.ema * d * d
        z = d / (self._var ** 0.5 + 1e-6)
        self._frames_since += 1
        fire = z > self.z_thresh and self._frames_since >= self.min_gap
        if fire:
            self._frames_since = 0
        return fire, elbo, float(z), mu.squeeze(0).cpu().numpy()


# ---------------------------------------------------------------------------
# 4. LocalMapper — toy version of the back-end. Each keyframe contributes
#    one MapPoint built from the first three latent dims. Replace with a
#    real triangulator / bundle-adjuster for sensor data; the interface
#    (insert_keyframe, points()) stays the same.
# ---------------------------------------------------------------------------
class LocalMapper:
    def __init__(self) -> None:
        self.keyframes: List[Keyframe] = []
        self.points: List[MapPoint] = []

    def insert(self, kf: Keyframe) -> None:
        self.keyframes.append(kf)
        if kf.latent.shape[0] >= 3:
            self.points.append(MapPoint(id=len(self.points),
                                        xyz=kf.latent[:3].copy(),
                                        seen_by=[kf.id]))


# ---------------------------------------------------------------------------
# 5. The system. One class, one entry point — `process_frame` — mirrors
#    `Tracking::GrabImage` in ORB-SLAM and `slam_pipeline::feed` in
#    OpenVSLAM. A ROS wrapper would do nothing more than forward each
#    incoming PoseStamped/Image into this method.
# ---------------------------------------------------------------------------
class VKANSlamSystem:
    def __init__(self, model: VKAN, z_thresh: float = 2.5, min_gap: int = 10):
        self.tracker = ConstVelTracker()
        self.gate = VKANKeyframeGate(model, z_thresh=z_thresh, min_gap=min_gap)
        self.mapper = LocalMapper()
        self.trajectory: List[np.ndarray] = []
        self.elbo_curve: List[float] = []
        self.z_curve: List[float] = []
        self.keyframe_idx: List[int] = []
        self._last_t: Optional[float] = None
        self._step = 0

    def process_frame(self, frame: Frame) -> dict:
        dt = 0.0 if self._last_t is None else max(0.0, frame.t - self._last_t)
        self._last_t = frame.t
        pose_est = self.tracker.update(frame.pose7, dt)
        self.trajectory.append(pose_est.copy())
        fire, elbo, z, latent = self.gate.step(frame.pose7)
        self.elbo_curve.append(elbo)
        self.z_curve.append(z)
        if fire:
            kf = Keyframe(id=len(self.mapper.keyframes), t=frame.t,
                          pose7=pose_est.copy(), latent=latent, elbo=elbo)
            self.mapper.insert(kf)
            self.keyframe_idx.append(self._step)
        self._step += 1
        return {"is_keyframe": fire, "elbo": elbo, "z": z,
                "n_keyframes": len(self.mapper.keyframes)}

    def run(self, stream: Iterable[Frame]) -> dict:
        t0 = time.time()
        for f in stream:
            self.process_frame(f)
        return {
            "trajectory": np.asarray(self.trajectory),
            "elbo": np.asarray(self.elbo_curve),
            "z": np.asarray(self.z_curve),
            "keyframe_idx": np.asarray(self.keyframe_idx, dtype=int),
            "map_xyz": np.asarray([mp.xyz for mp in self.mapper.points]),
            "fps": len(self.trajectory) / max(1e-6, time.time() - t0),
        }


# ---------------------------------------------------------------------------
# 6. Pose-stream helpers — turn the offline arrays from vkan_demo into the
#    frame iterator the system expects. A ROS bag replayer or sensor driver
#    would substitute its own iterator here.
# ---------------------------------------------------------------------------
def frames_from_array(poses: np.ndarray, hz: float = 30.0) -> Iterator[Frame]:
    dt = 1.0 / hz
    for i, p in enumerate(poses):
        yield Frame(t=i * dt, pose7=p)


# ---------------------------------------------------------------------------
# 7. Diagnostic plot + results-bundle export (so the React /results page
#    can render a SLAM run side-by-side with the algorithm-only demo).
# ---------------------------------------------------------------------------
def save_plot(out: Path, res: dict, gt: np.ndarray) -> None:
    if plt is None:
        print("matplotlib unavailable — skipping plot")
        return
    fig, ax = plt.subplots(2, 2, figsize=(11, 7))
    est = res["trajectory"]
    ax[0, 0].plot(gt[:, 0], gt[:, 1], color="#94a3b8", lw=1.0, label="groundtruth")
    ax[0, 0].plot(est[:, 0], est[:, 1], color="#2563eb", lw=1.2, label="estimate")
    if len(res["keyframe_idx"]):
        kf = est[res["keyframe_idx"]]
        ax[0, 0].scatter(kf[:, 0], kf[:, 1], s=18, color="#dc2626",
                         zorder=5, label="keyframes")
    ax[0, 0].set_title("Trajectory (x,y) — V-KAN SLAM")
    ax[0, 0].legend(fontsize=8); ax[0, 0].set_aspect("equal", "datalim")
    ax[0, 1].plot(res["elbo"], color="#0f172a", lw=0.8)
    for k in res["keyframe_idx"]:
        ax[0, 1].axvline(k, color="#dc2626", alpha=0.35, lw=0.8)
    ax[0, 1].set_title("Free-energy (ELBO) per frame + keyframe gates")
    ax[1, 0].plot(res["z"], color="#7c3aed", lw=0.8)
    ax[1, 0].axhline(0, color="#94a3b8", lw=0.6)
    ax[1, 0].set_title("Running z-score of ELBO (gate signal)")
    if len(res["map_xyz"]):
        mp = res["map_xyz"]
        ax[1, 1].scatter(mp[:, 0], mp[:, 1], s=14, color="#059669")
        ax[1, 1].set_title(f"MapPoint cloud  (n={len(mp)})")
    else:
        ax[1, 1].set_title("MapPoint cloud (empty)")
    fig.suptitle(f"V-KAN SLAM — {len(est)} frames @ {res['fps']:.1f} Hz",
                 fontsize=11)
    fig.tight_layout()
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=140)
    print(f"wrote {out}")


def emit_results(run_id: str, res: dict, gt: np.ndarray, source: str) -> None:
    """Drop a results-bundle into docs/results/<run-id>/ for the UI."""
    root = Path(__file__).resolve().parent.parent / "docs" / "results" / run_id
    root.mkdir(parents=True, exist_ok=True)
    save_plot(root / "slam.png", res, gt)
    meta = {
        "id": run_id,
        "title": "V-KAN SLAM wrapper run",
        "kind": "slam-system",
        "source": source,
        "summary": ("Constant-velocity tracker + V-KAN keyframe gate + "
                    "toy LocalMapper. ROS-free, single process."),
        "figures": [{"file": "slam.png", "caption": "Trajectory, ELBO, gate z-score, MapPoint cloud"}],
    }
    (root / "meta.json").write_text(json.dumps(meta, indent=2))
    metrics = {
        "fps": float(res["fps"]),
        "n_frames": int(len(res["trajectory"])),
        "n_keyframes": int(len(res["keyframe_idx"])),
        "n_map_points": int(len(res["map_xyz"])),
        "series": {
            "elbo": res["elbo"].tolist(),
            "z_score": res["z"].tolist(),
        },
    }
    (root / "metrics.json").write_text(json.dumps(metrics))
    print(f"emitted results bundle → docs/results/{run_id}/")


# ---------------------------------------------------------------------------
# 8. CLI.
# ---------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="V-KAN SLAM-system demo (ROS-free).")
    ap.add_argument("--tum", type=str, default=None,
                    help="Path to a TUM groundtruth.txt (otherwise synthetic).")
    ap.add_argument("--epochs", type=int, default=60,
                    help="V-KAN warm-up training epochs on the first half of the stream.")
    ap.add_argument("--z-thresh", type=float, default=2.5)
    ap.add_argument("--min-gap", type=int, default=10)
    ap.add_argument("--hz", type=float, default=30.0)
    ap.add_argument("--out", type=str, default="vkan_slam.png")
    ap.add_argument("--emit-results", type=str, default=None,
                    help="Run-id to drop a bundle into docs/results/ for the React UI.")
    args = ap.parse_args()

    if args.tum:
        gt = load_tum_groundtruth(Path(args.tum).expanduser())
        source = f"TUM groundtruth: {args.tum}"
    else:
        gt = synthetic_dynamic_scene()
        source = "synthetic dynamic scene (vkan_demo.synthetic_dynamic_scene)"
    print(f"loaded {len(gt)} poses — {source}")

    # Warm up V-KAN on the first half (mirrors how a SLAM system would
    # bootstrap on an initial map before going online).
    half = len(gt) // 2
    model = VKAN(d_in=7, d_hidden=16, d_latent=4)
    train(model, torch.from_numpy(gt[:half]), epochs=args.epochs, beta=0.5)

    # Replay the *full* stream through the SLAM system.
    system = VKANSlamSystem(model, z_thresh=args.z_thresh, min_gap=args.min_gap)
    res = system.run(frames_from_array(gt, hz=args.hz))
    print(f"done — {len(res['trajectory'])} frames, "
          f"{len(res['keyframe_idx'])} keyframes, "
          f"{len(res['map_xyz'])} map points, {res['fps']:.1f} Hz")

    save_plot(Path(args.out), res, gt)
    if args.emit_results:
        emit_results(args.emit_results, res, gt, source)


if __name__ == "__main__":
    main()