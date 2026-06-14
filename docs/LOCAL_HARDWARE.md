# Local install & hardware guide

How to install the V-KAN stack on your own PC, and what hardware you need for
each task. Pair this with `docs/LOCAL_DATASET.md` and the local-deployment
section of `.lovable/plan.md`.

## 1. Compatibility matrix

| Component | Ubuntu 22.04 | Windows 11 + WSL2 | macOS (Apple Silicon) |
|---|---|---|---|
| Frontend (Vite + bun) | ✅ native | ✅ native or WSL | ✅ native |
| Supabase CLI (Docker) | ✅ native | ✅ via Docker Desktop | ✅ native |
| Worker poller (Python) | ✅ native | ✅ WSL | ✅ native (CPU only) |
| **V-KAN (PyTorch)** | ✅ CUDA | ✅ CUDA via WSL | ⚠️ CPU/MPS, ~10× slower |
| **ORB-SLAM3 Docker** | ✅ | ⚠️ WSL only | ❌ no amd64 image on M-series |
| **DynaSLAM Docker (GPU)** | ✅ NVIDIA | ✅ NVIDIA via WSL | ❌ no CUDA path |

Linux is the path of least resistance; Windows + WSL2 + NVIDIA also works
fully; macOS can drive the UI/DB and run V-KAN slowly but not the two Docker
baselines.

## 2. Install — Ubuntu 22.04 (primary target)

```bash
# 1. NVIDIA driver + container toolkit
sudo apt install -y nvidia-driver-550
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/libnvidia-container/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# 2. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out/in

# 3. Supabase CLI
curl -fsSL https://supabase.com/install.sh | sh

# 4. bun (frontend)
curl -fsSL https://bun.sh/install | bash

# 5. Python + PyTorch (CUDA 12.4)
sudo apt install -y python3.11 python3.11-venv
python3.11 -m venv ~/.venvs/vkan && source ~/.venvs/vkan/bin/activate
pip install --index-url https://download.pytorch.org/whl/cu124 torch==2.4.0
pip install -r worker/requirements.txt

# 6. Baseline images
docker pull jahaniam/orbslam3:latest
docker pull yubaoliu/dynaslam:latest
```

## 3. Install — Windows 11 + WSL2

1. `wsl --install -d Ubuntu-22.04`
2. Install Docker Desktop with the WSL2 backend enabled.
3. Install the NVIDIA Windows driver (≥ 555). Do **not** install a Linux
   `nvidia-driver` inside WSL — CUDA is inherited from the Windows driver.
4. From inside the Ubuntu shell, follow steps 3-6 of the Ubuntu recipe.
5. Verify GPU passthrough: `nvidia-smi` inside WSL must list your card.

## 4. Install — macOS (frontend + V-KAN CPU only)

```bash
brew install supabase/tap/supabase bun python@3.11
python3 -m venv ~/.venvs/vkan && source ~/.venvs/vkan/bin/activate
pip install torch                 # CPU/MPS build
pip install -r worker/requirements.txt
```

Skip the two baseline Docker images. To still get ORB-SLAM3 / DynaSLAM numbers,
run them on a Linux box and push results via `tools/ingest_external_run.py`.

## 5. Optional — building baselines from source

- **ORB-SLAM3**: needs Pangolin, OpenCV ≥ 4.4, Eigen ≥ 3.3, DBoW2, g2o.
  ~30 min build on Ubuntu. Set `ORB3_BIN=<repo>/Examples/RGB-D/rgbd_tum` and
  `run_orb3_baseline.sh` will use it instead of Docker.
- **DynaSLAM**: same dependencies plus Mask-RCNN weights (~250 MB) and a
  Python 2.7 environment for the segmentation server. Building from source is
  painful — the `yubaoliu/dynaslam:latest` Docker image is recommended.

## 6. Hardware tiers

| Tier | GPU | V-KAN | DynaSLAM | Notes |
|---|---|---|---|---|
| Min (CPU-only) | none | ✅ ~3 fps | ❌ | UI dev + import external results |
| Entry | GTX 1660 / RTX 3050 (6 GB) | ✅ ~15 fps | ⚠️ tight | Single sequence |
| Comfort (recommended) | RTX 3060 / 4060 (8-12 GB) | ✅ 25-30 fps | ✅ ~10 fps | Sweet spot for thesis runs |
| Generous | RTX 4070 / 4080 (12-16 GB) | ✅ real-time | ✅ real-time | Parallel methods possible |

Numbers are for TUM 640×480 RGB-D; doubling resolution roughly halves fps.

### CPU / RAM / disk

- **CPU**: any modern 6-core (Ryzen 5 / i5 12th gen+). ORB-SLAM3's front end is
  single-thread heavy — clock speed matters more than core count.
- **RAM**: 16 GB minimum, 32 GB if you also train V-KAN.
- **Disk**: 50 GB free (≈ 7 GB datasets + 10 GB Docker images + Postgres +
  result blobs).
- **VRAM**: 6 GB floor for DynaSLAM's Mask-RCNN; V-KAN inference fits in 3 GB;
  re-training the V-KAN encoder wants ≥ 8 GB.

## 7. Per-task decision table

| Task | Needs GPU? | Min hardware | Recommended |
|---|---|---|---|
| Browse UI, look at past runs, build research bundles | No | Any laptop | Any |
| Run a fresh V-KAN evaluation on one TUM sequence | Yes (CUDA) | 6 GB VRAM | RTX 3060 |
| Run ORB-SLAM3 baseline | No (CPU OK) | 6-core CPU | 8-core CPU |
| Run DynaSLAM baseline | **Yes** (Mask-RCNN) | 6 GB VRAM | RTX 3060+ |
| Re-train V-KAN encoder from scratch | Yes (large) | 8 GB VRAM | RTX 4070+ |
| Sweep 6 sequences × 3 methods | Yes + patience | 8 GB VRAM, 50 GB disk | RTX 4070, 32 GB RAM |

## 8. GPU-less fallback

You can still use the project without a GPU:

1. Run the frontend + Supabase + worker poller on CPU. V-KAN runs slowly;
   ORB-SLAM3 Docker is CPU-friendly.
2. Skip DynaSLAM locally — run it on Colab / a friend's GPU box and import the
   trajectory via `tools/ingest_external_run.py`. This is the "Path D"
   workflow the project already supports.