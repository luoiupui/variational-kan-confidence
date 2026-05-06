# Stage 4 worker — Fly deploy

Background poller that watches the Lovable Cloud `runs` table for
`status='queued'` rows and dispatches V-KAN / ORB-SLAM3 / DynaSLAM jobs.

## One-time setup

```bash
# from the repo root, on your local PC
cd worker

# 1. create a 20 GB volume for TUM sequences + results
flyctl volumes create worker_data --size 20 --region ams \
    -a worker-misty-butterfly-4770

# 2. set the two secrets the poller needs
#    The poller no longer talks to Postgres directly — it calls the
#    `claim-run` edge function. Only one secret is required:
flyctl secrets set \
    WORKER_INGEST_SECRET="<same value as in Lovable Cloud>" \
    -a worker-misty-butterfly-4770

# Optional overrides:
#   SUPABASE_FUNCTIONS_URL  (defaults to the project URL)
#   DATA_ROOT               (defaults to /data)

# 3. ship it
flyctl deploy -a worker-misty-butterfly-4770
```

## Verify it's polling

```bash
flyctl logs -a worker-misty-butterfly-4770
# expect two lines:
#   [poller] version=claim-run-no-db
#   [poller] starting · ingest=https://.../ingest-run data=/data
```

Then trigger a run from the dashboard's **Run Center** and watch the same
log stream show `[poller] claim …` → `[poller] done …`.

## Layout

```
worker/
├── Dockerfile          # python:3.11-slim + httpx/numpy/evo
├── fly.toml            # no [http_service] → silences port-8080 warning
├── requirements.txt
├── .dockerignore
└── stage4/             # the actual pipeline (unchanged)
    ├── poller.py       # main loop
    ├── run_vkan_real.py
    ├── eval_with_evo.py
    ├── run_orb3_baseline.sh
    ├── run_dynaslam_baseline.sh
    └── tum_adapter.py
```

## Why no port 8080?

The earlier `flyctl secrets set` warning ("app is not listening on
0.0.0.0:8080") came from the default `[http_service]` block. This worker
has no HTTP surface — it only **outbounds** to the `claim-run` and
`ingest-run` edge functions — so we removed the block entirely. Fly
will keep the machine alive based on the `[processes]` entry instead.