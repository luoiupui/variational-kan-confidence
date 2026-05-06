## Root cause

Fly machine `worker-misty-butterfly-4770` is running the **wrong image**. Its logs print `Worker heartbeat...`, but the poller in this repo (`worker/stage4/poller.py`) only ever prints `[poller] starting`, `[poller] claim`, `[poller] done`, `[poller] FAIL`. The string `Worker heartbeat` does not exist anywhere in `worker/`. So the live container is some older placeholder that never queries Postgres and never calls `ingest-run` — which is why all 42 queued rows stay queued even though Fly says the app is "started" and the secrets are set.

Config also drifted: repo `fly.toml` uses process `worker`, region `ams`, volume `worker_data`; the live machine uses process `app`, region `sin`, volume `tum_data`.

## Plan

### 1. Fix `worker/fly.toml` to match the existing Fly machine
- Change `primary_region` to `sin`.
- Change the mount `source` to `tum_data` so we reuse the existing volume with TUM data.
- Keep process name `worker` (this is what gets redeployed; Fly will replace the old `app` process on next deploy).

### 2. Add a real worker-heartbeat probe (backend)
Migration:
```sql
create table public.worker_heartbeats (
  id text primary key default 'singleton',
  last_ingest_at timestamptz not null default now(),
  last_run_id uuid,
  last_method text,
  last_status text
);
alter table public.worker_heartbeats enable row level security;
create policy "anyone can read heartbeat"
  on public.worker_heartbeats for select using (true);
```
Modify `supabase/functions/ingest-run/index.ts`: on every successful request, upsert the singleton row with `last_ingest_at=now()`, `last_run_id`, `last_method`, `last_status`.

New edge function `worker-health` (public, no JWT) returns:
```json
{
  "last_ingest_at": "...",
  "seconds_since_ingest": 12,
  "queued": 42,
  "running": 0,
  "done_24h": 0,
  "failed_24h": 0,
  "oldest_queued_age_s": 3600
}
```

### 3. Dashboard changes (`src/components/vkan/RunCenter.tsx`)
- New `useWorkerHealth` hook polling `worker-health` every 10 s.
- Add a **Worker health** row with a badge:
  - `Healthy` — heartbeat < 2 min
  - `Stale` — 2–10 min
  - `Down` — > 10 min or never
- Replace the current "stuck" banner with a precise message:
  - **Down + queued > 0**: "Fly machine may be running the wrong image. From `worker/` run `fly deploy -a worker-misty-butterfly-4770`. Logs should print `[poller] starting` not `Worker heartbeat...`."
  - **Stale**: "Worker last responded N minutes ago — check `fly logs`."
  - **Healthy + queued > 0**: "Worker is processing — refresh in a moment."

### 4. User actions on Windows (you run these after I deploy)
```powershell
cd worker
fly deploy -a worker-misty-butterfly-4770
fly logs   -a worker-misty-butterfly-4770
```
Expected first line within ~10 s:
```
[poller] starting · ingest=https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1/ingest-run data=/data
```
Then the Dashboard's Worker health badge turns green within a minute and the 42 queued rows start draining.

## Files to change
- `worker/fly.toml` — region/volume fix
- `supabase/functions/ingest-run/index.ts` — heartbeat upsert
- `supabase/functions/worker-health/index.ts` — new
- `supabase/config.toml` — register `worker-health` with `verify_jwt = false`
- new migration — `worker_heartbeats` table + RLS
- `src/hooks/useWorkerHealth.ts` — new
- `src/components/vkan/RunCenter.tsx` — health badge + clearer guidance
