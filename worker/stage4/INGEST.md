# Worker → Lovable Cloud ingest contract

The Fly.io GPU worker (or any compute node) writes Stage-4 results into the
**Lovable Cloud** `runs` table via the `ingest-run` Edge Function.

## Endpoint

```
POST https://oedetxrzmzshdqtyhakm.supabase.co/functions/v1/ingest-run
Headers:
    content-type: application/json
    x-worker-secret: $WORKER_INGEST_SECRET
```

The `WORKER_INGEST_SECRET` is provisioned in Lovable Cloud → Connectors →
Secrets, and copied to the worker via `flyctl secrets set
WORKER_INGEST_SECRET=…`.

## Body schema (Zod-validated server-side)

| field | type | notes |
|---|---|---|
| `run_id` | uuid? | omit to INSERT a new row; include to UPDATE an existing queued row |
| `sequence_id` | string | matches `public.sequences.id`, e.g. `fr3_walking_xyz` |
| `sequence_name` | string | display name, e.g. `fr3/walking_xyz` |
| `method` | `"vkan" \| "orb3" \| "dynaslam"` | |
| `status` | `"running" \| "done" \| "failed"` | default `done` |
| `frames` | int? | |
| `metrics` | object? | `{ate_rmse, ate_mean, rpe_trans, rpe_rot, tracking_pct, fps?}` |
| `trajectory_est` | `[x,y,z][]?` | aligned to GT |
| `trajectory_gt` | `[x,y,z][]?` | |
| `ate_per_frame` | `number[]?` | |
| `keyframes` | `int[]?` | |
| `map_points` | `{pos:[x,y,z], weight?:number}[]?` | sparse landmarks |
| `fe` | `number[]?` | V-KAN free energy per frame |
| `git_sha` | string? | for reproducibility |
| `checkpoint_hash` | string? | model weights digest |
| `notes` / `error` | string? | |

## Worker-side polling (intent-based trigger)

The UI marks intent by inserting a `status='queued'` row via the
`enqueue-run` function. The worker polls for the next queued row using a
read-only direct Postgres connection (psql / asyncpg) with the
`SUPABASE_DB_URL` injected by Fly.

```python
import os, asyncpg, asyncio

async def claim_next():
    conn = await asyncpg.connect(os.environ["SUPABASE_DB_URL"])
    row = await conn.fetchrow("""
        SELECT id, sequence_id, sequence_name, method
        FROM runs WHERE status = 'queued'
        ORDER BY created_at ASC LIMIT 1
    """)
    await conn.close()
    return row
```

Then the worker:
1. POSTs `ingest-run` with `run_id=<uuid>`, `status="running"` → marks claim.
2. Runs Step A / B / F as needed (see scripts in this folder).
3. POSTs `ingest-run` again with the same `run_id`, `status="done"` and full
   metrics/trajectory payload.
4. On exception: POST with `status="failed"` and `error="<traceback>"`.

## Local repro (no cloud)

The whole worker tree is plain Python + bash. To run locally, just skip the
ingest step (or point `ingest-run` at a local Supabase) — the JSON files in
`/data/results/<seq>/` are the source of truth and can be hand-uploaded to
`public/data/stage4_results.json` for the static fallback.

## GitHub portability

Everything in `worker/stage4/` and `supabase/functions/` is committed; the
only piece that lives outside the repo is the `WORKER_INGEST_SECRET` value
itself (env var). A fresh clone + `flyctl secrets set` is enough to
reproduce the loop end-to-end.