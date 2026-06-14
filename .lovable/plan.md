## Diagnosis

`flyctl status` shows only **one machine** in the app:

- `worker` process group → 1 machine, state = `stopped`, last updated 2026-05-06 (over a month ago)
- `agent` process group → **0 machines** (missing entirely)

Two separate problems:

1. **No `agent` machine exists.** That's why `curl /agent/status` returns 404 and `worker-health` reports unhealthy — there is literally no process listening on port 8080.
2. **The `worker` machine is `stopped`, not `started`.** Even after the next deploy, Fly will create the new machine in the same stopped state unless you scale or start it.

This is exactly the case the comment in `worker/fly.toml` warns about:

> Each process group needs its OWN machine. After deploy, run `flyctl scale count worker=1 agent=1` — otherwise Fly only schedules one machine and the other process never runs.

That `scale count` step was never run, so only `worker` was ever created, and it has since been stopped.

---

## Plan (commands only — no code changes)

Run these in order from `C:\Users\Admin\.fly\variational-kan-confidence-main\worker`.

### Step 1 — Deploy the current config first
The existing image is from May and predates the `[[restart]]` / process-group fixes. Re-deploy so both process definitions are registered with Fly:

```
flyctl deploy -a worker-misty-butterfly-4770
```

Wait for "deployed successfully". This will create/update the `worker` machine but still won't create the `agent` machine.

### Step 2 — Scale both process groups to 1 machine each
```
flyctl scale count worker=1 agent=1 -a worker-misty-butterfly-4770
```

Answer `y` when prompted. This is the critical step: it tells Fly to spawn a second machine for the `agent` process group.

### Step 3 — Confirm two machines now exist
```
flyctl status -a worker-misty-butterfly-4770
```

Expected: two rows, one per `PROCESS` (`worker` and `agent`), both `started` in region `sin`.

If `worker` still shows `stopped`, start it explicitly:
```
flyctl machine start 48e0e9eb765448 -a worker-misty-butterfly-4770
```

### Step 4 — Verify logs
```
flyctl logs -a worker-misty-butterfly-4770
```

Expected lines:
- from `worker`: `[poller] starting · ingest=... data=/data`
- from `agent`:  `Uvicorn running on http://0.0.0.0:8080`

### Step 5 — Verify HTTP endpoints
```
curl https://worker-misty-butterfly-4770.fly.dev/agent/status
curl https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1/worker-health
```

Expected:
- `/agent/status` → JSON with `model_version`
- `/worker-health` → JSON `{"health":"healthy", ...}` (may take ~30s after agent boots)

---

## What I will change in the project (in build mode)

Nothing yet — this is an operations/deploy issue, not a code issue. Both `worker/Dockerfile` and `worker/fly.toml` in the repo are already correct (process groups, `[[vm]]`, `[[restart]]`, mounts, http_service). The missing piece is the one-time `flyctl scale count worker=1 agent=1` command, which must be run from your machine.

If after Step 3 the `agent` machine still fails to appear, paste the new `flyctl status` and `flyctl scale show` output and I will diagnose further (most likely cause would be a region/volume constraint, but `worker` is the only volume-bound group so `agent` should schedule freely).
