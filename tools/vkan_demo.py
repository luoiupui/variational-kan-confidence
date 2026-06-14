#!/usr/bin/env python3
"""
vkan_demo.py — minimal, single-file V-KAN reference implementation.

Purpose
-------
A teaching / research-analysis version of the algorithm used in this project:

    variational KAN encoder  →  free-energy (ELBO) signal
                              ↘
                                bagged NOTEARS on latent  →  causal-graph change
                              ↗
                       keyframe trigger = (ELBO spike) ∧ (DAG edge flip)

It is intentionally small (~350 lines, only torch + numpy + matplotlib) so you
can read it end-to-end, change one thing, and watch the four diagnostic plots
move. It is NOT the production V-KAN in worker/stage4/run_vkan_real.py — but
it produces the same kind of free-energy and causal-change traces that the
research bundle exports.

Data source (in order of preference)
------------------------------------
1. A TUM RGB-D groundtruth.txt passed via --tum <path>. We turn the 7-D
   (tx, ty, tz, qx, qy, qz, qw) pose stream into the "scene state" the encoder
   sees. Real, reproducible, matches the project's whitelist.
2. If no path is given, a synthetic dynamic scene: a slow drift + two abrupt
   regime changes (mimics a person walking into frame at t=t1, leaving at t2).

Run
---
    python -m pip install --no-cache-dir torch numpy matplotlib
    python tools/vkan_demo.py                                   # synthetic
    python tools/vkan_demo.py --tum ~/slam_data/rgbd_dataset_freiburg3_walking_xyz/groundtruth.txt
    python tools/vkan_demo.py --tum <path> --out ./vkan_demo.png --epochs 80

The script writes a 2×2 PNG with: free-energy + keyframes, latent trajectory,
causal-graph heatmaps before/after a change, and ELBO loss curve.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ---------------------------------------------------------------------------
# 1. Efficient KAN layer (RBF basis — drop-in for the original B-spline KAN,
#    much faster, same expressivity for this 7-D scale). One learnable
#    spline per (in, out) edge, evaluated as a sum of Gaussian bumps on a
#    fixed grid.
# ---------------------------------------------------------------------------
class KANLayer(nn.Module):
    def __init__(self, d_in: int, d_out: int, n_knots: int = 8, grid_lo: float = -2.0, grid_hi: float = 2.0):
        super().__init__()
        # Grid of knot centres, shared across all edges (cheap and works well).
        grid = torch.linspace(grid_lo, grid_hi, n_knots)
        self.register_buffer("grid", grid)
        self.sigma = (grid_hi - grid_lo) / (n_knots - 1)        # RBF width
        # Per-edge spline coefficients  (d_in, d_out, n_knots).
        self.coeff = nn.Parameter(torch.randn(d_in, d_out, n_knots) * 0.1)
        # A small linear residual stabilises training (standard KAN trick).
        self.linear = nn.Linear(d_in, d_out, bias=True)

    def forward(self, x: torch.Tensor) -> torch.Tensor:           # x: (B, d_in)
        # RBF basis: (B, d_in, n_knots)
        b = torch.exp(-((x.unsqueeze(-1) - self.grid) ** 2) / (2 * self.sigma ** 2))
        # Apply per-edge coefficients and sum over input dim + knots.
        spline = torch.einsum("bik,iok->bo", b, self.coeff)
        return spline + self.linear(x)


# ---------------------------------------------------------------------------
# 2. Variational KAN encoder. Two KAN layers → (μ, logσ²) of a Gaussian
#    latent. Decoder is a tiny MLP (KAN there would help interpretability
#    of the *generative* model but is overkill for this demo).
# ---------------------------------------------------------------------------
class VKAN(nn.Module):
    def __init__(self, d_in: int = 7, d_hidden: int = 16, d_latent: int = 4):
        super().__init__()
        self.enc1 = KANLayer(d_in, d_hidden)
        self.enc2 = KANLayer(d_hidden, 2 * d_latent)              # μ ‖ logσ²
        self.dec = nn.Sequential(
            nn.Linear(d_latent, d_hidden), nn.GELU(),
            nn.Linear(d_hidden, d_in),
        )
        self.d_latent = d_latent

    def encode(self, x):
        h = F.gelu(self.enc1(x))
        mu_logvar = self.enc2(h)
        mu, logvar = mu_logvar.chunk(2, dim=-1)
        return mu, logvar

    def reparam(self, mu, logvar):
        std = (0.5 * logvar).exp()
        return mu + std * torch.randn_like(std)

    def forward(self, x):
        mu, logvar = self.encode(x)
        z = self.reparam(mu, logvar)
        xr = self.dec(z)
        return xr, mu, logvar, z

    @staticmethod
    def elbo(x, xr, mu, logvar, beta: float = 1.0):
        """Negative ELBO per sample → the 'free energy' / 'surprise' signal."""
        recon = F.mse_loss(xr, x, reduction="none").sum(dim=-1)
        kl = -0.5 * (1 + logvar - mu.pow(2) - logvar.exp()).sum(dim=-1)
        return recon + beta * kl, recon, kl


# ---------------------------------------------------------------------------
# 3. Bagged NOTEARS — extremely compact version sufficient for a 4-D latent.
#    Learns a weighted DAG W (d×d, zero diagonal) by minimising
#        ‖Z − Z W‖² + λ‖W‖₁  subject to h(W) = tr(e^{W∘W}) − d = 0
#    We enforce acyclicity via an augmented-Lagrangian penalty for a few
#    iterations — good enough to detect EDGE FLIPS, which is what we use.
# ---------------------------------------------------------------------------
def notears(Z: np.ndarray, lam: float = 0.05, rho: float = 1.0, iters: int = 200, lr: float = 0.05) -> np.ndarray:
    d = Z.shape[1]
    W = np.zeros((d, d), dtype=np.float64)
    for _ in range(iters):
        # Gradient of ‖Z − Z W‖²
        R = Z - Z @ W
        g_rec = -2.0 * Z.T @ R / Z.shape[0]
        # Soft-threshold for L1.
        g = g_rec + rho * _h_grad(W)
        W = W - lr * g
        W = np.sign(W) * np.maximum(np.abs(W) - lr * lam, 0.0)
        np.fill_diagonal(W, 0.0)
    return W


def _h_grad(W: np.ndarray) -> np.ndarray:
    """Gradient of h(W)=tr(e^{W∘W})−d w.r.t. W (NOTEARS acyclicity term)."""
    M = W * W
    E = _expm(M)
    return (E.T * 2.0) * W


def _expm(M: np.ndarray) -> np.ndarray:
    """Truncated matrix exponential (small d → 8 terms is more than enough)."""
    out = np.eye(M.shape[0])
    term = np.eye(M.shape[0])
    for k in range(1, 9):
        term = term @ M / k
        out = out + term
    return out


def bagged_notears(Z: np.ndarray, n_bags: int = 8, bag_frac: float = 0.6, **kw) -> np.ndarray:
    """Average |W| across bootstrap windows — denoises NOTEARS' instability."""
    rng = np.random.default_rng(0)
    n = Z.shape[0]
    acc = np.zeros((Z.shape[1], Z.shape[1]))
    for _ in range(n_bags):
        idx = rng.choice(n, size=int(n * bag_frac), replace=False)
        acc += np.abs(notears(Z[idx], **kw))
    return acc / n_bags


# ---------------------------------------------------------------------------
# 4. Data loaders.
# ---------------------------------------------------------------------------
def load_tum_groundtruth(path: Path) -> np.ndarray:
    """Read TUM groundtruth.txt → (T, 7) array of (tx,ty,tz,qx,qy,qz,qw)."""
    arr = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 8:
            continue
        arr.append([float(x) for x in parts[1:8]])
    a = np.asarray(arr, dtype=np.float32)
    # Centre + scale per channel so the KAN grid (-2..2) stays informative.
    a = (a - a.mean(0)) / (a.std(0) + 1e-6)
    return a


def synthetic_dynamic_scene(T: int = 1200, seed: int = 0) -> np.ndarray:
    """Slow random walk + two abrupt regime changes simulating dynamic events."""
    rng = np.random.default_rng(seed)
    x = np.zeros((T, 7), dtype=np.float32)
    x[0] = rng.standard_normal(7) * 0.3
    drift = rng.standard_normal(7) * 0.01
    for t in range(1, T):
        x[t] = 0.98 * x[t - 1] + drift + rng.standard_normal(7) * 0.05
    # Regime change A at t=400: rotate dims 3:6 (orientation flip).
    x[400:, 3:6] += np.array([1.5, -1.0, 0.7])
    # Regime change B at t=800: translate dims 0:3 (position jump).
    x[800:, 0:3] += np.array([-1.2, 1.0, -0.5])
    return (x - x.mean(0)) / (x.std(0) + 1e-6)


# ---------------------------------------------------------------------------
# 5. Training loop + keyframe gate.
# ---------------------------------------------------------------------------
def train(model: VKAN, X: torch.Tensor, epochs: int, lr: float = 1e-3, beta: float = 0.5):
    opt = torch.optim.Adam(model.parameters(), lr=lr)
    loss_curve = []
    for ep in range(epochs):
        model.train()
        opt.zero_grad()
        xr, mu, logvar, _ = model(X)
        fe, _, _ = VKAN.elbo(X, xr, mu, logvar, beta=beta)
        loss = fe.mean()
        loss.backward()
        opt.step()
        loss_curve.append(loss.item())
        if (ep + 1) % max(1, epochs // 10) == 0:
            print(f"epoch {ep+1:3d}/{epochs}  ELBO={loss.item():.3f}")
    return loss_curve


@torch.no_grad()
def per_frame_signals(model: VKAN, X: torch.Tensor):
    model.eval()
    xr, mu, logvar, z = model(X)
    fe, recon, kl = VKAN.elbo(X, xr, mu, logvar)
    return fe.cpu().numpy(), recon.cpu().numpy(), kl.cpu().numpy(), z.cpu().numpy(), mu.cpu().numpy()


def keyframe_trigger(fe: np.ndarray, Z: np.ndarray, win: int = 80, fe_z: float = 2.0,
                     edge_eps: float = 0.05) -> tuple[np.ndarray, list[tuple[int, np.ndarray, np.ndarray]]]:
    """Combined gate:
        • ELBO z-score over a rolling window  > fe_z      (surprise)
        • AND at least one DAG edge flips between two adjacent windows
    Returns (keyframe_indices, [(t, W_prev, W_curr), ...]) for plotting.
    """
    T = len(fe)
    mu = np.convolve(fe, np.ones(win) / win, mode="same")
    sd = np.sqrt(np.convolve((fe - mu) ** 2, np.ones(win) / win, mode="same")) + 1e-6
    zscore = (fe - mu) / sd

    keyframes = []
    snapshots = []
    last_W = None
    for t in range(win, T - win, win // 2):
        W = bagged_notears(Z[t - win:t], n_bags=4, iters=80)
        if last_W is not None:
            flipped = (np.abs(np.sign(W) - np.sign(last_W)) * (np.abs(W) > edge_eps)).sum()
            if flipped > 0 and zscore[t] > fe_z:
                keyframes.append(t)
                snapshots.append((t, last_W.copy(), W.copy()))
        last_W = W
    return np.asarray(keyframes), snapshots


# ---------------------------------------------------------------------------
# 6. Visualisation — 2×2 panel matching the figures the research bundle
#    already exports, so a reader of the thesis can compare apples to apples.
# ---------------------------------------------------------------------------
def visualise(out_path: Path, X_np, fe, Z, keyframes, snapshots, loss_curve):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(2, 2, figsize=(12, 8))

    # (a) Free-energy with keyframe markers.
    ax[0, 0].plot(fe, lw=1.0, color="#2563eb", label="free energy (−ELBO)")
    for k in keyframes:
        ax[0, 0].axvline(k, color="#dc2626", lw=0.8, alpha=0.6)
    ax[0, 0].set_title("Free-energy + keyframe triggers")
    ax[0, 0].set_xlabel("frame")
    ax[0, 0].set_ylabel("−ELBO")
    ax[0, 0].legend(loc="upper right", fontsize=9)

    # (b) Latent trajectory (first 2 dims), coloured by frame index.
    sc = ax[0, 1].scatter(Z[:, 0], Z[:, 1], c=np.arange(len(Z)), s=4, cmap="viridis")
    if len(keyframes):
        ax[0, 1].scatter(Z[keyframes, 0], Z[keyframes, 1], c="red", s=30,
                         marker="x", label="keyframe")
        ax[0, 1].legend(fontsize=9)
    ax[0, 1].set_title("Latent z (dim 0 vs 1) — colour = time")
    plt.colorbar(sc, ax=ax[0, 1], shrink=0.8, label="frame")

    # (c) Causal-graph change at the most prominent keyframe.
    if snapshots:
        t, Wp, Wc = max(snapshots, key=lambda s: np.abs(s[2] - s[1]).sum())
        im = ax[1, 0].imshow(Wc - Wp, cmap="RdBu_r", vmin=-0.5, vmax=0.5)
        ax[1, 0].set_title(f"NOTEARS edge change ΔW at frame {t}")
        ax[1, 0].set_xlabel("→ to latent dim")
        ax[1, 0].set_ylabel("from latent dim")
        plt.colorbar(im, ax=ax[1, 0], shrink=0.8)
    else:
        ax[1, 0].text(0.5, 0.5, "no causal edge flip detected",
                      ha="center", va="center")
        ax[1, 0].set_axis_off()

    # (d) Training loss.
    ax[1, 1].plot(loss_curve, color="#16a34a")
    ax[1, 1].set_title("Training ELBO")
    ax[1, 1].set_xlabel("epoch")
    ax[1, 1].set_ylabel("loss")

    fig.suptitle("V-KAN demo — variational KAN encoder + bagged NOTEARS",
                 fontsize=13, fontweight="bold")
    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    print(f"saved figure → {out_path}")


# ---------------------------------------------------------------------------
# 7. CLI.
# ---------------------------------------------------------------------------
def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--tum", type=str, default=None,
                   help="path to a TUM groundtruth.txt (else synthetic data)")
    p.add_argument("--out", type=str, default="vkan_demo.png")
    p.add_argument("--epochs", type=int, default=60)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--emit-results", type=str, default=None,
                   metavar="RUN_ID",
                   help="also write docs/results/<RUN_ID>/ so the run appears "
                        "on the React /results page")
    args = p.parse_args()

    torch.manual_seed(args.seed)

    if args.tum:
        X_np = load_tum_groundtruth(Path(args.tum))
        print(f"loaded TUM groundtruth: {X_np.shape} from {args.tum}")
    else:
        X_np = synthetic_dynamic_scene(seed=args.seed)
        print(f"using synthetic scene: {X_np.shape}  (two regime changes at t=400,800)")

    X = torch.from_numpy(X_np).float()
    model = VKAN(d_in=X.shape[1], d_hidden=16, d_latent=4)

    loss_curve = train(model, X, epochs=args.epochs)
    fe, recon, kl, z, mu = per_frame_signals(model, X)
    keyframes, snapshots = keyframe_trigger(fe, mu, win=80, fe_z=1.8)
    print(f"detected {len(keyframes)} keyframes  (mean FE={fe.mean():.2f}, "
          f"max FE={fe.max():.2f})")

    visualise(Path(args.out), X_np, fe, z, keyframes, snapshots, loss_curve)

    if args.emit_results:
        try:
            from results_writer import write_result
        except ImportError:
            from tools.results_writer import write_result  # type: ignore
        import matplotlib.pyplot as plt
        # Re-render as a Figure handle the writer can savefig() with consistent dpi.
        fig = plt.gcf()
        write_result(
            args.emit_results,
            title=("V-KAN — " + (Path(args.tum).stem if args.tum else "synthetic scene")),
            dataset=("TUM RGB-D" if args.tum else "synthetic"),
            sequence=(str(args.tum) if args.tum else ""),
            tags=["vkan", "demo", "dynamic" if args.tum else "synthetic"],
            description=(
                f"V-KAN variational encoder + bagged NOTEARS keyframe trigger. "
                f"{len(keyframes)} keyframes / {X_np.shape[0]} frames."
            ),
            figures={"diagnostic.png": fig},
            metrics={
                "frames": int(X_np.shape[0]),
                "keyframes": int(len(keyframes)),
                "free_energy_mean": float(fe.mean()),
                "free_energy_max": float(fe.max()),
            },
            series={
                "free_energy": fe.tolist(),
                "training_loss": [float(x) for x in loss_curve],
            },
        )


if __name__ == "__main__":
    main()