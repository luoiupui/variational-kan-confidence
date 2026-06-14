
# Local-PC operations guide — dataset, software, hardware

This complements the **"Migrating the V-KAN project to a fully local PC deployment"** plan already saved in `.lovable/plan.md`. Where that plan covers *what to move*, this one covers *what to install, where to get the data, and what hardware actually works*.

Two new files would be added when this plan is implemented:

- `docs/LOCAL_DATASET.md` — dataset download + layout (the long version of section 2 below).
- `docs/LOCAL_HARDWARE.md` — installation recipes per OS + hardware matrix (sections 3-5 below).

No source-code edits are needed for any of this — it is documentation plus shell recipes.

---

## 1. What the code already expects

The worker is hard-wired to the **TUM RGB-D benchmark**. The whitelist lives at `worker/stage4/tum_adapter.py` (lines 29-36) and currently enables 6 sequences:

| seq_id | dynamic % | tarball | typical use |
|---|---|---|---|
| `fr1_xyz` | 0 | `rgbd_dataset_freiburg1_xyz.tgz` | sanity check, static |
| `fr1_desk` | 5 | `rgbd_dataset_freiburg1_desk.tgz` | low-dynamic |
| `fr2_desk` | 0 | `rgbd_dataset_freiburg2_desk.tgz` | longer static |
| `fr3_sitting_static` | 25 | `rgbd_dataset_freiburg3_sitting_static.tgz` | mild dynamic |
| `fr3_walking_xyz` | 70 | `rgbd_dataset_freiburg3_walking_xyz.tgz` | **headline V-KAN vs ORB3 vs DynaSLAM** |
| `fr3_walking_halfsphere` | 70 | `rgbd_dataset_freiburg3_walking_halfsphere.tgz` | second high-dynamic |

Total disk: ~3.5 GB compressed, ~7 GB extracted. Each sequence ships `rgb.txt`, `depth.txt`, `groundtruth.txt`, `rgb/*.png`, `depth/*.png` — exactly the layout `tum_adapter.py` expects.

The baseline runners (`run_orb3_baseline.sh`, `run_dynaslam_baseline.sh`) additionally need:

- `worker/stage4/TUM1.yaml` — fr1 intrinsics (already in repo)
- `worker/stage4/TUM3.yaml` — fr3 intrinsics (already in repo)
- `ORBvoc.txt` — shipped inside the ORB-SLAM3 / DynaSLAM docker images

So **no new YAML / vocabulary files** are required; you only download datasets and pull two Docker images.

---

## 2. Dataset setup on the local PC

### 2.1 Layout

Pick one folder, e.g. `~/slam_data`. Final layout the worker expects (`DATA_ROOT=~/slam_data`):

```text
~/slam_data/
├── rgbd_dataset_freiburg1_xyz/
├── rgbd_dataset_freiburg1_desk/
├── rgbd_dataset_freiburg2_desk/
├── rgbd_dataset_freiburg3_sitting_static/
├── rgbd_dataset_freiburg3_walking_xyz/
└── rgbd_dataset_freiburg3_walking_halfsphere/
```

### 2.2 One-shot download script (proposed `docs/download_tum.sh`)

```bash
#!/usr/bin/env bash
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
  set -- $pair; fr=$1; tgz=$2
  [[ -d "$ROOT/${tgz%.tgz}" ]] && continue
  wget -c -O "/tmp/$tgz" "$BASE/$fr/$tgz"
  tar -xzf "/tmp/$tgz" -C "$ROOT"
done
echo "OK · sequences ready in $ROOT"
```

### 2.3 Sequence/intrinsics matrix

| Sequence family | Camera model | Use `TUMx.yaml` | Notes |
|---|---|---|---|
| fr1_* | Kinect v1, 640×480 | `TUM1.yaml` | Higher distortion |
| fr2_* | Kinect v1, 640×480 | `TUM2.yaml` (add if needed) | Long static |
| fr3_* | Asus Xtion, 640×480 | `TUM3.yaml` | All dynamic-people sequences |

Only `TUM1.yaml` and `TUM3.yaml` ship today; if you want fr2 baselines, add a `TUM2.yaml` (a 5-line copy with fr2 intrinsics from TUM's website).

### 2.4 Time-sync / depth-scale gotchas

- TUM RGB and depth streams are **not synchronised** at the hardware level. Both `run_orb3_baseline.sh` and `run_dynaslam_baseline.sh` already regenerate `assoc.txt` with a 40 ms tolerance — keep that tolerance, do not tighten.
- TUM depth PNGs are stored as **5000 = 1 m** (uint16). All three runners and `tum_adapter.py` already handle this; do not re-scale on disk.
- Groundtruth poses are at ~100 Hz from a Vicon mocap. `eval_with_evo.py` interpolates to RGB timestamps via Umeyama — no manual alignment needed.

### 2.5 Importing into the local Supabase

For each sequence already listed in `tum_adapter.py`'s whitelist, the row must also exist in `public.sequences` so the UI dropdown shows it. The cloud DB already has these rows; locally they are created by `supabase db reset` if the migrations include them (they do).

If you add a new sequence later, write a one-line `INSERT` migration and replay with `supabase db reset`.

---

## 3. Software installation on the local PC

### 3.1 Compatibility matrix

| Component | Linux (Ubuntu 22.04) | Windows 11 + WSL2 | macOS (Apple Silicon) |
|---|---|---|---|
| Frontend (Vite + bun) | ✅ native | ✅ native or WSL | ✅ native |
| Supabase CLI (Docker) | ✅ native | ✅ via Docker Desktop | ✅ native |
| Worker poller (Python) | ✅ native | ✅ WSL | ✅ native (CPU only) |
| **V-KAN (PyTorch)** | ✅ CUDA | ✅ CUDA via WSL | ⚠️ CPU or MPS, ~10× slower |
| **ORB-SLAM3 Docker** | ✅ | ⚠️ WSL only, X-forwarding off | ❌ no amd64 docker on M-series for this image |
| **DynaSLAM Docker (needs GPU)** | ✅ NVIDIA | ✅ NVIDIA via WSL | ❌ no CUDA path |

Bottom line: **Linux is the path of least resistance**; **Windows + WSL2 + NVIDIA** also works fully; **macOS** can run V-KAN (slowly) but not the two baseline Docker images.

### 3.2 Install recipe — Ubuntu 22.04 (primary target)

```bash
# 1. NVIDIA + CUDA + container toolkit
sudo apt install -y nvidia-driver-550
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# 2. Docker + Compose (Supabase CLI needs them)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # log out/in

# 3. Supabase CLI
curl -fsSL https://supabase.com/install.sh | sh

# 4. bun (frontend)
curl -fsSL https://bun.sh/install | bash

# 5. Python + PyTorch CUDA 12.4
sudo apt install -y python3.11 python3.11-venv
python3.11 -m venv ~/.venvs/vkan && source ~/.venvs/vkan/bin/activate
pip install --index-url https://download.pytorch.org/whl/cu124 torch==2.4.0
pip install -r worker/requirements.txt

# 6. Baseline images
docker pull jahaniam/orbslam3:latest
docker pull yubaoliu/dynaslam:latest
```

### 3.3 Install recipe — Windows 11 + WSL2

1. Install WSL2: `wsl --install -d Ubuntu-22.04`
2. Install **Docker Desktop** with the *WSL2 backend* enabled.
3. Install the NVIDIA Windows driver (≥ 555) — WSL inherits CUDA from it; do **not** install `nvidia-driver` inside WSL.
4. From inside the Ubuntu shell, follow steps 3-6 of the Linux recipe.
5. Run `nvidia-smi` inside WSL to confirm GPU passthrough before pulling DynaSLAM.

### 3.4 Install recipe — macOS (frontend + V-KAN CPU only)

```bash
brew install supabase/tap/supabase bun python@3.11
python3 -m venv ~/.venvs/vkan && source ~/.venvs/vkan/bin/activate
pip install torch  # CPU/MPS build
pip install -r worker/requirements.txt
```

Skip the two Docker baselines on macOS; if you need ORB-SLAM3 / DynaSLAM numbers, run them on a Linux box and push results via `tools/ingest_external_run.py`.

### 3.5 Standalone (non-Docker) baseline builds — optional

If you want to skip Docker and build the baselines from source:

- **ORB-SLAM3**: needs `Pangolin`, `OpenCV ≥ 4.4`, `Eigen ≥ 3.3`, `DBoW2`, `g2o`. ~30 min build on Ubuntu. Then set `ORB3_BIN=<path>/Examples/RGB-D/rgbd_tum` and the `run_orb3_baseline.sh` script will use it.
- **DynaSLAM**: same plus Mask-RCNN weights (~250 MB) and Python 2.7 (yes, really) for the segmentation server. Building this from source is painful; using `yubaoliu/dynaslam:latest` is strongly recommended.

---

## 4. Hardware options — what is "enough"?

### 4.1 Recommended GPU tiers

| Tier | GPU | V-KAN | DynaSLAM | Notes |
|---|---|---|---|---|
| **Min (CPU-only)** | none | ✅ slow (~3 fps on fr3) | ❌ | OK for UI dev + ingesting external results only |
| **Entry** | GTX 1660 / RTX 3050 (6 GB) | ✅ ~15 fps | ⚠️ Mask-RCNN fits but tight | Fine for a single sequence |
| **Comfort (recommended)** | RTX 3060 / 4060 (8-12 GB) | ✅ 25-30 fps | ✅ ~10 fps incl. masks | Sweet spot for thesis runs |
| **Generous** | RTX 4070 / 4080 (12-16 GB) | ✅ real-time | ✅ real-time | Parallel methods possible |

Numbers are for TUM 640×480 RGB-D; doubling resolution roughly halves fps.

### 4.2 CPU / RAM / disk

- **CPU**: any modern 6-core (Ryzen 5 / i5 12th gen+). ORB-SLAM3 front-end is single-thread heavy — clock speed matters more than core count.
- **RAM**: 16 GB minimum (Docker + Postgres + worker + browser). 32 GB if you want to keep MaskRCNN cached and run V-KAN training side by side.
- **Disk**: 50 GB free. Breakdown: ~7 GB datasets, ~10 GB docker images (ORB3 + DynaSLAM + Supabase), ~5 GB Postgres + result blobs, the rest is cache headroom.
- **GPU VRAM**: 6 GB is the floor for DynaSLAM's Mask-RCNN. V-KAN inference fits in 3 GB; training the V-KAN encoder from scratch wants ≥ 8 GB.

### 4.3 GPU-less fallback

If you do not have a GPU at all, the project is still useful:

1. Run the **frontend + Supabase + worker poller** on CPU — V-KAN runs slowly, ORB-SLAM3 Docker also works (CPU-only baseline).
2. Skip DynaSLAM locally; instead, run DynaSLAM on a Colab / friend's GPU machine and import results with `tools/ingest_external_run.py`.

This is exactly the **Path D** flow that the project already supports — the local PC then acts purely as the dashboard + DB.

---

## 5. Per-task hardware decision table

| Task | Needs GPU? | Min hardware | Recommended |
|---|---|---|---|
| Browse UI, look at past runs, build research bundles | No | Any laptop | Any |
| Run a fresh V-KAN evaluation on one TUM sequence | Yes (CUDA) | 6 GB VRAM | RTX 3060 |
| Run ORB-SLAM3 baseline | No (CPU OK) | 6-core CPU | 8-core CPU |
| Run DynaSLAM baseline | **Yes** (Mask-RCNN) | 6 GB VRAM | RTX 3060+ |
| Re-train V-KAN encoder from scratch | Yes (large) | 8 GB VRAM | RTX 4070+ |
| Sweep across all 6 TUM sequences × 3 methods | Yes + patience | 8 GB VRAM, 50 GB disk | RTX 4070, 32 GB RAM |

---

## 6. Action list when you switch to build mode

1. Add `docs/download_tum.sh` (script from § 2.2) and make it executable.
2. Add `docs/LOCAL_DATASET.md` (sections 1-2 of this plan) and `docs/LOCAL_HARDWARE.md` (sections 3-5).
3. Optionally add `worker/stage4/TUM2.yaml` so fr2 sequences can also be benchmarked.
4. Cross-link both new docs from the **Roadmap** page (`src/pages/Roadmap.tsx`) under section "5 · Where to go next" so a new collaborator finds them.

Nothing in the running app changes — these are docs + a helper script + an optional intrinsics file.
