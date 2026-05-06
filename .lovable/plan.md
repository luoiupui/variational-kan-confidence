
## Goal

Remove the Fly worker's dependency on `SUPABASE_DB_URL` (which is not retrievable for Lovable Cloud–managed projects) by moving the "claim next queued run" query into a Lovable Cloud edge function. The worker will call it over HTTPS using the `WORKER_INGEST_SECRET` it already has.

## Why

- The worker is crash-looping because `SUPABASE_DB_URL` is not set on Fly.
- Lovable Cloud manages the Supabase project on its own infrastructure; the raw DB password is not exposed in the Lovable UI and the project is not visible in the user's personal Supabase dashboard.
- All other worker → backend traffic already goes through the `ingest-run` edge function with `x-worker-secret`. Polling should follow the same pattern.

## Changes

### 1. New edge function: `supabase/functions/claim-run/index.ts`
- Accepts `POST` with header `x-worker-secret: $WORKER_INGEST_SECRET`.
- Uses the service-role key to atomically pick the oldest `status='queued'` row from `public.runs` and update it to `status='running'`, returning `{ id, sequence_id, sequence_name, method }` or `{ id: null }` if the queue is empty.
- Mirrors the CORS / auth pattern used in `ingest-run`.

### 2. Update `worker/stage4/poller.py`
- Remove `asyncpg` import and the `SUPABASE_DB_URL` env var requirement.
- Replace `claim_next(conn)` with an HTTPS call to `${FUNCTIONS_URL}/claim-run`.
- Remove the outer reconnect loop (no DB connection to reconnect); keep a simple `while True` poll loop with try/except.
- Keep all existing `ingest-run` calls unchanged — the worker will mark `status='running'` again immediately after claim (idempotent) so the contract stays the same.

### 3. Update `worker/requirements.txt`
- Remove `asyncpg`.

### 4. Update `worker/stage4/INGEST.md`
- Document the new `claim-run` endpoint and remove the direct-Postgres polling example.

## After deploy — what you do

1. Once the changes above land, the new edge function deploys automatically.
2. On your machine, redeploy the Fly worker:
   ```powershell
   fly deploy -a worker-misty-butterfly-4770
   ```
3. Tail logs and confirm:
   ```powershell
   fly logs -a worker-misty-butterfly-4770
   ```
   You should now see `[poller] starting · ingest=...` and no `KeyError`.
4. No new Fly secrets are needed. `WORKER_INGEST_SECRET` is already set.

## Out of scope

- No DB schema changes.
- No frontend changes.
- The `ingest-run` function is unchanged.
