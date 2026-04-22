

## Audit: what's wired in Lovable vs. what runs on Fly.io

### Loop A→C→B (V-KAN inference → eval → ORB-SLAM3 baseline)

| Step | Where it lives | Status |
|---|---|---|
| **A** V-KAN inference | `worker/stage4/run_vkan_real.py` (Fly.io worker) | Script ready, needs GPU runtime to actually execute |
| **C** evo evaluation | `worker/stage4/eval_with_evo.py` (Fly.io worker) | Script ready |
| **B** ORB-SLAM3 baseline | `worker/stage4/run_orb3_baseline.sh` (Fly.io worker, Docker) | Script ready, needs ORB-SLAM3 image |
| Result ingest | `supabase/functions/ingest-run` | ✅ Live, secret-protected |
| UI display | `src/pages/Stage4.tsx` + `Trajectory3D` | ✅ Renders est/gt/orb3 trajectories + map points |

### Loop D→E→F (intent trigger → aggregation → DynaSLAM baseline)

| Step | Where it lives | Status |
|---|---|---|
| **D** intent trigger | `supabase/functions/enqueue-run` + `RunCenter.tsx` | ✅ Wired — UI button inserts `status='queued'` row |
| **D** worker poller | `worker/stage4/poller.py` (Fly.io) | ✅ Code present, deployment in-progress on your side |
| **E** geomean panel | `src/components/vkan/GeomeanPanel.tsx`, mounted in `Stage4.tsx` | ✅ Live, reads from `runs` table |
| **F** DynaSLAM baseline | `worker/stage4/run_dynaslam_baseline.sh` (Fly.io) | Script ready, needs DynaSLAM Docker image |

### Backbone endpoints (Lovable Cloud side)

| Endpoint | Purpose | Status |
|---|---|---|
| `POST /functions/v1/enqueue-run` | UI → DB queued row (anon, RLS-protected) | ✅ |
| `POST /functions/v1/ingest-run` | Worker → DB result row (secret header) | ✅ |
| Postgres `runs` table | Source of truth | ✅ Migration applied |
| Realtime `postgres_changes` on `runs` | Live UI updates | ✅ Subscribed in `useRuns` |
| `useRuns` / `useSequences` / `GeomeanPanel` / `RunCenter` | Frontend wiring | ✅ |

**Conclusion: the Lovable side of both loops is fully built.** The only unfinished piece is the Fly.io worker actually starting and executing runs.

---

### What Lovable does vs. what Fly.io does (after you clone + deploy)

```text
┌──────────────────────────┐   queued row      ┌────────────────────────┐
│ Lovable frontend (UI)    │ ───────────────►  │ Postgres (runs table)  │
│  RunCenter, GeomeanPanel │                   │ Lovable Cloud          │
└──────────────────────────┘                   └────────┬───────────────┘
            ▲                                           │ asyncpg poll
            │ Realtime postgres_changes                 ▼
            │                                  ┌────────────────────────┐
            │                                  │ Fly.io worker (poller) │
            │                                  │  · run_vkan_real.py    │
            │       result via ingest-run      │  · run_orb3_baseline   │
            └──────────────────────────────────│  · run_dynaslam_*      │
                                               │  · eval_with_evo.py    │
                                               └────────────────────────┘
```

**Lovable will NOT touch Fly.io.** Lovable only:
- serves the frontend
- runs the two edge functions (`enqueue-run`, `ingest-run`)
- owns the Postgres database + Realtime channel
- holds the `WORKER_INGEST_SECRET` that the worker must present

**Fly.io is fully external.** It is operated by you (`flyctl deploy`, `flyctl logs`, `flyctl secrets`), and Lovable has no API to deploy, restart, or read logs from your Fly app. Future Lovable changes that affect the contract (e.g., adding a new method, adding a column, changing the ingest schema) will require a matching update to the worker code in your local clone followed by a `flyctl deploy` from your machine.

### What further work Lovable will do

Once your Fly worker is running and emitting real `done` rows, the natural next Lovable-side tasks are:

1. **Stage E enrichment** — extend `GeomeanPanel` with per-sequence dynamic-pct breakdown and median + IQR alongside geomean.
2. **Stage F UI** — add a third trajectory line (`trajectory_dyn`) and DynaSLAM column in the metrics panel of `Stage4.tsx` once `method='dynaslam'` rows arrive.
3. **Run detail drawer** — clicking a row in History opens a panel with full trajectory replay + per-frame ATE chart, sourced from `runs.trajectory_est` / `ate_per_frame` / `fe`.
4. **Failure surfacing** — when `status='failed'`, expose the truncated `error` traceback in a collapsible block inside RunCenter.
5. **Reproducibility column** — show `git_sha` + `checkpoint_hash` per run for paper-grade citation.

### Action items right now

- **No Lovable code change needed** to make the loops work — the contract is complete.
- On your side: finish `flyctl deploy` from the cloned repo root and confirm `flyctl logs` shows `[poller] starting · ingest=… data=/data`.
- After the first real run lands, ping me and we'll pick from the 5 enrichment items above.

