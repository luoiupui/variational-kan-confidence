# Stage 4 worker — polls Lovable Cloud for queued runs and dispatches V-KAN /
# ORB-SLAM3 / DynaSLAM. Built and run on Fly.io (worker-misty-butterfly-4770).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps: bash for the *.sh runners, ca-certs for HTTPS, git for evo,
# build-essential for numpy wheels on slim. Docker-in-Docker is NOT installed
# here — the ORB3 / DynaSLAM scripts shell out to the host docker socket
# (mount /var/run/docker.sock into this container if you want them to run).
RUN apt-get update && apt-get install -y --no-install-recommends \
        bash ca-certificates git build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/worker/requirements.txt
RUN pip install -r /app/worker/requirements.txt

COPY . /app/worker

# Default data root (override with DATA_ROOT env or a Fly volume mount).
ENV DATA_ROOT=/data
RUN mkdir -p /data

CMD ["python", "-u", "worker/stage4/poller.py"]