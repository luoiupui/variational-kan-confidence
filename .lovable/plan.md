
# Migrating the V-KAN project to a fully local PC deployment

Goal: run the whole stack — UI, database, edge-function-equivalents, GPU worker (V-KAN / ORB-SLAM3 / DynaSLAM), and storage — on a single Linux/Windows workstation, with **no Lovable Cloud and no Fly.io** dependency. The React frontend, the worker Python code, and the SQL schema are reused **as-is**; only the *hosting layer* changes.

---

## 1. Target local architecture

```text
┌───────────────────────────────────────────────────────────┐
│  Docker Compose stack on your PC                          │
│                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ frontend │→ │ supabase     │← │ worker (GPU, host)   │ │
│  │ (vite)   │  │  - postgres  │  │  - stage4/poller.py  │ │
│  │  :8080   │  │  - postgrest │  │  - VKAN / ORB3 /     │ │
│  └──────────┘  │  - gotrue    │  │    DynaSLAM          │ │
│                │  - storage   │  └──────────────────────┘ │
│                │  - studio    │                           │
│                │  - functions │ ← Deno, runs edge fns     │
│                │  :54321      │                           │
│                └──────────────┘                           │
└───────────────────────────────────────────────────────────┘
```

Two clean ways to provide the backend:

- **Option A (recommended): Supabase CLI local stack** (`supabase start`).
  Boots Postgres + PostgREST + GoTrue + Storage + Edge-Functions runtime + Studio in Docker. Your existing `supabase/migrations/*.sql` and `supabase/functions/*` run unchanged. Closest to current behaviour, lowest code churn.
- **Option B: plain Postgres + a tiny FastAPI/Express shim** that re-implements the 6 edge functions. Lighter weight, but you have to port `enqueue-run`, `claim-run`, `ingest-run`, `ingest-frame`, `worker-health`, `agent-tick` by hand.

The rest of the plan assumes **Option A**.

---

## 2. Prerequisites on the local PC

| Component | Version | Purpose |
|---|---|---|
| Docker Desktop / Engine | ≥ 24 | runs Supabase + frontend container |
| Supabase CLI | ≥ 1.180 | `supabase start`, applies migrations, serves edge functions |
| Node + bun | bun ≥ 1.1 | builds the Vite frontend |
| Python | 3.10 | worker (stage4 poller, ingestion) |
| CUDA + NVIDIA driver | ≥ 12.x | GPU for V-KAN / DynaSLAM |
| ORB-SLAM3, DynaSLAM | built natively | baselines |
| TUM RGB-D datasets | local FS | mounted at `./tum_data` |

---

## 3. Migration steps

### Step 1 — Clone the codebase locally
```bash
git clone <your-github-mirror>   # use the GitHub sync that Lovable already maintains
cd vkan-project
bun install
```

### Step 2 — Boot a local Supabase
```bash
supabase init       # only first time
supabase start      # spins up postgres+postgrest+studio at :54321 / studio :54323
supabase db reset   # replays every file in supabase/migrations/  → all tables/RLS/grants
```
This recreates `runs`, `frames`, `sequences`, `agent_decisions`, `worker_heartbeats` with the same RLS policies and GRANTs you already have in cloud.

### Step 3 — Deploy edge functions locally
```bash
supabase functions serve --env-file ./supabase/.env.local
```
Serves all six functions at `http://localhost:54321/functions/v1/<name>`. No code changes needed; they are standard Deno functions.

Create `supabase/.env.local` with the same secrets you currently keep in Lovable Cloud:
```env
WORKER_INGEST_SECRET=<same-value-you-already-use>
WORKER_AGENT_URL=http://host.docker.internal:8000   # local worker, see step 5
LOVABLE_API_KEY=<optional; only if you still call Lovable AI Gateway>
```

### Step 4 — Point the frontend at the local backend
Replace the cloud URL/anon key in `.env` (auto-generated file — for local you keep your **own** copy named `.env.local`, do NOT commit, do NOT touch the cloud-managed one):

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key printed by `supabase start`>
VITE_SUPABASE_PROJECT_ID=local
```
Then:
```bash
bun run dev   # http://localhost:8080
```
The React code is unchanged — `src/integrations/supabase/client.ts` reads these env vars.

### Step 5 — Run the worker against local Supabase
The poller already speaks generic Supabase HTTP, so only its env changes:
```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export SUPABASE_URL=http://localhost:54321
export SUPABASE_SERVICE_ROLE_KEY=<service-role key from `supabase start` output>
export WORKER_INGEST_SECRET=<same as edge function>
export VKAN_CHECKPOINT=/models/vkan_fr3.pt
export TUM_DATA_ROOT=/data/tum

python -m stage4.poller --methods vkan,orb3,dynaslam
```
No Fly.io, no `fly.toml`, no `min_machines_running`. Start/stop the worker by hitting Ctrl-C.

### Step 6 — Wire in DynaSLAM & ORB-SLAM3 locally
Build them once on the PC (CMake + Pangolin + OpenCV + DBoW2). The existing shell wrappers
`worker/stage4/run_dynaslam_baseline.sh` and `run_orb3_baseline.sh` already expect local binaries — just set their paths:
```bash
export ORB3_BIN=/opt/ORB_SLAM3/Examples/RGB-D/rgbd_tum
export DYNASLAM_BIN=/opt/DynaSLAM/Examples/RGB-D/rgbd_tum
```
The poller will pick them up. Results land in the same `runs` table → automatically visible in the React UI and in the research-bundle ZIP.

### Step 7 — (Optional) one-shot Docker Compose
After everything works manually, freeze the stack:
```yaml
# docker-compose.yml (new file at repo root, local-only)
services:
  frontend:
    build: .
    ports: ["8080:8080"]
    env_file: .env.local
  worker:
    build: ./worker
    runtime: nvidia
    volumes:
      - ./tum_data:/data/tum
      - ./models:/models
    env_file: ./worker/.env.local
# Supabase is started separately via `supabase start` (it owns its own compose).
```

### Step 8 — Data migration (cloud → local) — optional
If you want to keep the runs already produced in the cloud:
```bash
# Export from cloud (read-only)
psql "$CLOUD_DB_URL" -c "\\copy runs TO 'runs.csv' CSV HEADER"
# Import locally
psql "postgresql://postgres:postgres@localhost:54322/postgres" \
     -c "\\copy runs FROM 'runs.csv' CSV HEADER"
```
Or simpler: download a **research bundle ZIP** per volume from `/reports`, then use `tools/ingest_external_run.py` to push each run into local Supabase.

---

## 4. File-by-file mapping (online ↔ local)

Legend: ✅ reuse unchanged · ✏️ edit values (env/URLs only) · 🔁 replace/regenerate · ➕ add new · ❌ drop

| Area | File / Path | Online today | Local action | Notes |
|---|---|---|---|---|
| Frontend code | `src/**/*.tsx`, `src/lib/**`, `src/components/**` | served by Lovable preview | ✅ reuse | Pure client code, no host coupling |
| Frontend entry | `index.html`, `vite.config.ts`, `tailwind.config.ts` | ✅ | ✅ reuse | — |
| Supabase client | `src/integrations/supabase/client.ts` | auto-gen, points to cloud URL | ✏️ regenerated on first `supabase start` (or just leave it — it reads env vars) | Do NOT hand-edit; control via `.env.local` |
| Generated types | `src/integrations/supabase/types.ts` | auto-gen from cloud schema | 🔁 regenerate with `supabase gen types typescript --local > src/integrations/supabase/types.ts` | Run after every local migration |
| Env (managed) | `.env` | cloud values, auto-managed | ❌ ignore locally | Don't touch — Lovable owns it |
| Env (local) | `.env.local` | — | ➕ add | Points Vite at `localhost:54321` |
| SQL schema | `supabase/migrations/*.sql` | applied to cloud | ✅ reuse — `supabase db reset` replays them | Same files, same order |
| Edge functions | `supabase/functions/{enqueue-run,claim-run,ingest-run,ingest-frame,worker-health,agent-tick}/index.ts` | deployed to cloud | ✅ reuse — `supabase functions serve` runs them locally | Identical Deno code |
| Function config | `supabase/config.toml` | auto-managed | ✅ reuse (CLI reads same file) | Don't change project-level fields |
| Function secrets | Lovable Cloud secrets store | UI-managed | 🔁 move to `supabase/.env.local` | Same names: `WORKER_INGEST_SECRET`, `WORKER_AGENT_URL`, optional `LOVABLE_API_KEY` |
| Worker — poller | `worker/stage4/poller.py` | runs on Fly machine | ✅ reuse | Only env vars differ |
| Worker — V-KAN runner | `worker/stage4/run_vkan_real.py` | Fly GPU machine | ✅ reuse | Needs local CUDA |
| Worker — baselines | `worker/stage4/run_{orb3,dynaslam}_baseline.sh` | placeholder on Fly (no GPU) | ✅ reuse — finally usable on your local GPU | Set `ORB3_BIN` / `DYNASLAM_BIN` |
| Worker — eval | `worker/stage4/eval_with_evo.py`, `tum_adapter.py` | Fly | ✅ reuse | Pure Python |
| Worker — agent | `worker/agent/**`, `worker/ros_bridge/**` | Fly | ✅ reuse | Same |
| Worker — image | `worker/Dockerfile` | built for Fly amd64 | ✏️ add `--gpus all` base or switch base to `nvidia/cuda:12.4.0-runtime-ubuntu22.04` | Needed for DynaSLAM/Mask-RCNN |
| Worker — Python deps | `worker/requirements.txt` | Fly | ✅ reuse | Add `torch+cu124` index if you go GPU |
| Fly config | `worker/fly.toml` | drives Fly deploy | ❌ unused locally | Keep file for cloud option, or delete |
| Compose | `docker-compose.yml` | — | ➕ add | Optional one-command boot |
| External-run helper | `tools/ingest_external_run.py` | calls cloud ingest-run | ✏️ set `--supabase-url http://localhost:54321` and the local service-role key | Same script, different env |
| Reports / bundle | `src/pages/Reports.tsx`, `src/lib/researchBundle.ts` | reads from cloud | ✅ reuse | Reads via supabase client → works against local DB |
| Storage bucket | `agent-frames` (cloud) | cloud-managed | 🔁 recreate locally with `supabase storage create agent-frames --public=false` | One-time CLI call after `supabase start` |
| Memory / docs | `mem/**`, `worker/README.md`, `tools/README.md`, `worker/stage4/INGEST.md` | docs | ✅ reuse | Add a `LOCAL.md` describing this plan |
| GitHub sync | `.github/**`, `.git/` | Lovable ↔ GitHub | ✅ reuse | Keep mirror so you can still edit in Lovable if desired |
| Lovable runtime | `.lovable/**`, `bun.lockb`, `package.json` | Lovable preview | ✅ reuse | Frontend stack is identical |

---

## 5. What you gain / lose

**Gain**
- Real GPU for ORB-SLAM3 + DynaSLAM (Fly free machines have none).
- Zero hosting cost; full offline operation.
- Faster ingest (no Fly cold-start, no `min_machines_running` worry).
- Full Postgres access (`psql`) for thesis-grade SQL queries.

**Lose**
- No public URL — you'd run `cloudflared tunnel` or `ngrok` if you want to share.
- No automatic backups — schedule `pg_dump` yourself.
- No Lovable visual editing against the local DB (you can keep editing UI in Lovable and just `git pull` to your PC).

---

## 6. Suggested execution order (½ day of work)

1. `supabase init && supabase start && supabase db reset` → DB + functions live.
2. Create `.env.local` for Vite + `supabase/.env.local` for functions → `bun run dev` shows the UI against local DB.
3. Regenerate `src/integrations/supabase/types.ts` locally.
4. Boot worker poller against local Supabase, run one V-KAN job end-to-end → confirm a row in `runs` and a downloadable bundle.
5. Build ORB-SLAM3 + DynaSLAM, wire env paths, enqueue baseline runs.
6. (Optional) write `docker-compose.yml` and a `LOCAL.md` for reproducibility.
7. (Optional) `tools/ingest_external_run.py` past cloud runs into local DB.

After step 4 you already have a **fully working local clone**; steps 5-7 are polish.
