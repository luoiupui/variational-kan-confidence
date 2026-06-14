## Recommendation: go with Option 2 first, keep Option 1 as a last resort

Option 1 (destroy the Fly volume + worker app, recreate from scratch) is heavy and irreversible:
- The `tum_data` volume holds the TUM RGB-D sequences (≈1.4 GB per sequence). Deleting it means re-uploading every dataset over `flyctl ssh sftp` — hours of bandwidth, not minutes.
- The Fly app name `worker-misty-butterfly-4770` is wired into 6 places (`.github/workflows/deploy-worker.yml`, `worker/fly.toml`, `worker/README.md`, `worker/stage4/INGEST.md`, `supabase/functions/*`, and the `SUPABASE_FUNCTIONS_URL` hardcoded in `poller.py`). Recreating under a new name forces edits in all of them.
- Secrets (`WORKER_INGEST_SECRET`, etc.) would have to be re-set, and the GitHub Actions `FLY_API_TOKEN` may need to be re-issued.
- None of the historical errors since May 6 have actually been traced to volume corruption or app-level rot — they've been Dockerfile / `fly.toml` / process-group / Python-import issues, all fixable in-repo.

Option 2 is the correct first move: audit the files that actually ship to Fly, compare against the symptoms in the May-6-onward history, and patch in place. If after a clean redeploy the machine still won't boot or the volume is genuinely unreadable, *then* escalate to Option 1.

## Plan for Option 2 — file + config audit

### A. Files I will read end-to-end (Fly surface only)
1. `worker/Dockerfile` — base image, system deps, COPY layout, CMD.
2. `worker/fly.toml` — process groups, mounts, `[http_service]`, VM sizing, restart policy.
3. `worker/requirements.txt` — version pins (torch 2.2.2 on shared-cpu-1x / 1 GB is a known OOM risk).
4. `worker/stage4/poller.py` — env-var reads, claim-run URL, subprocess dispatch.
5. `worker/agent/serve.py` + `worker/agent/micro_agent.py` + `worker/agent/tiny_net.py` — uvicorn entrypoint path matches `fly.toml` `agent` process command.
6. `.github/workflows/deploy-worker.yml` — checkout depth, working-directory, app name, token name.
7. `supabase/functions/claim-run/index.ts`, `ingest-run/index.ts`, `worker-health/index.ts` — confirm contract still matches what `poller.py` sends.
8. `worker/stage4/run_vkan_real.py`, `eval_with_evo.py`, `tum_adapter.py` — confirm CLI flags the poller passes still exist.
9. `worker/agent/checkpoints/` — confirm `.gitkeep` only; the runtime fallback path in `micro_agent.py` already handles "no checkpoint" gracefully, but I'll verify.

### B. Symptom → likely-cause matrix I will fill in
For each error class seen since May 6 (you'll see them surfaced as a table in the final report), check the most probable file:

```text
Symptom                                       | Likely file              | Fix class
----------------------------------------------+--------------------------+------------------
"not listening on 0.0.0.0:8080"               | fly.toml (http_service)  | process-group split
"machine exited with code 137" (OOM)          | fly.toml [[vm]] / reqs   | bump memory / drop torch
ModuleNotFoundError: worker.agent.serve       | Dockerfile WORKDIR/COPY  | PYTHONPATH or -m path
"volume tum_data not found in region X"       | fly.toml primary_region  | region mismatch
GH Actions: "no app named ..."                | deploy-worker.yml        | wrong --app / token
poller: KeyError WORKER_INGEST_SECRET         | secrets not set          | flyctl secrets set
poller: 401 from claim-run                    | edge fn secret mismatch  | rotate + re-set
agent /agent/status returns 404               | fly scale (only worker=1)| flyctl scale count
```

### C. Deliverable
A single audit report (markdown, saved to `/mnt/documents/FLY_AUDIT.md`, downloadable) containing:
1. The current contents of every Fly-touching file (verbatim, so you can diff against your local PC copies).
2. The symptom→cause→fix table above, filled in against the actual files.
3. A **non-destructive recovery checklist** in order: (a) `flyctl status`, (b) `flyctl logs`, (c) `flyctl scale show`, (d) `flyctl secrets list`, (e) `flyctl volumes list` — with the expected output for each, so you can spot the first thing that diverges.
4. A clearly marked "**Only if Option 2 fails**" appendix with the exact Option-1 sequence (volume snapshot → app destroy → recreate → re-upload), including which 6 files need their app name updated if you choose a new name.

### D. What I will NOT do in this pass
- Not delete the Fly app or volume.
- Not change `app = "worker-misty-butterfly-4770"` or the Supabase project ref.
- Not touch `supabase/config.toml` or any auto-generated client file.
- Not run `flyctl` commands myself — your local PC holds the Fly auth; the report tells you exactly which commands to run and what the output should look like.

### E. One question that changes the plan
If you already know that the volume contents are stale or wrong (e.g. you re-downloaded TUM and want a fresh `/data`), then Option 1's volume-recreate step becomes cheap and we should fold it into the same pass. Otherwise the plan above keeps the data.

## Technical notes
- The current `fly.toml` already has the correct two-process split (`worker` + `agent`) and the `[restart] policy = "always"` block, so most pre-May-6 errors should already be gone. The audit will confirm whether the deployed machine actually reflects this `fly.toml` (a stale machine that pre-dates the split is a common silent failure).
- `torch==2.2.2` on a `shared-cpu-1x` / 1 GB VM is tight; if logs show exit-code 137 on the `agent` process, the fix is `flyctl scale memory 2048 --process-group agent`, not a code change.
- `poller.py` hardcodes `SUPABASE_FUNCTIONS_URL` to the project URL with an env-var override — safe, no change needed.
