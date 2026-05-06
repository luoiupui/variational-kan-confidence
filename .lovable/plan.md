I checked the app-side data and recent requests. The Dashboard operation is working: `enqueue-run` returned HTTP 200 and inserted new rows. The current blocker is after enqueue: the worker is not consuming the queue.

Current evidence:
- The database currently has `42` runs and all are `queued`.
- Recent `Enqueue run` / `Run all 3` requests succeeded and created run IDs.
- There are no recent `ingest-run` backend-function logs. If the Fly worker had claimed even one job, it would call `ingest-run` to mark it `running`, then `done` or `failed`.
- Your `fly status` only proves the Fly machine is started; it does not prove the Python poller is connected to the correct backend and consuming jobs.
- Your Fly output does not match the repo config exactly: repo config expects process `worker`, region `ams`, volume `worker_data`; your output shows process `app`, region `sin`, volume `tum_data`. That mismatch may be okay if you intentionally changed it, but it is a strong sign the running Fly app may not be the same/current worker config.

Correct run lifecycle:

```text
Dashboard: pick TUM sequence
  -> choose V-KAN or Run all 3
  -> Enqueue run
  -> row inserted with status = queued

Fly worker poller:
  -> polls Lovable Cloud for oldest queued row
  -> calls ingest-run to mark status = running
  -> runs V-KAN / ORB3 / DynaSLAM
  -> calls ingest-run to mark status = done or failed

Report system:
  -> only logs done/failed rows
  -> DOCX becomes downloadable after at least one done/failed row exists
```

So `No report data yet` is not an operation error. It means there are no finished rows yet.

Recommended local Fly checks before changing code:

```bash
fly logs -a worker-misty-butterfly-4770
```

Expected healthy lines:

```text
[poller] starting · ingest=... data=/data
[poller] claim <run_id> <method> <sequence_id>
[poller] done <run_id>
```

If logs show loop errors, check secrets:

```bash
fly secrets list -a worker-misty-butterfly-4770
```

The worker must have:

```text
SUPABASE_DB_URL
WORKER_INGEST_SECRET
```

Also verify it is polling the same backend as this Lovable project, not an old/other database URL.

Implementation plan to make the Dashboard clearer:

1. Improve Run Center status display
   - Add a compact worker/queue status panel under the enqueue buttons.
   - Show counts for `queued`, `running`, `done`, and `failed` more explicitly.
   - Add a warning when queued jobs exist but no running/done/failed jobs are detected, e.g. “Worker has not claimed queued jobs yet.”

2. Improve enqueue feedback
   - After `Enqueue run`, show the created run ID and status `queued`.
   - Add a short explanation that DOCX is only available after the worker changes a run to `done` or `failed`.
   - Keep the Download DOCX button visible, but disable or explain it when there are no reportable runs.

3. Add a “latest run” diagnostic row
   - Show the most recent run ID, method, sequence, status, and age.
   - If the latest run remains `queued`, display “waiting for Fly worker”.
   - If it becomes `running`, display “worker claimed run”.
   - If it becomes `done`, display “DOCX ready”.
   - If it becomes `failed`, show the stored error preview.

4. Fix DOCX empty-state messaging
   - Replace “No report data yet” with a more precise message:
     - `Queued/running only: report will be available after a run finishes.`
     - `No runs: enqueue a run first.`
     - `Failed/done exists but not logged: sync report log and retry.`

5. Optional worker config documentation update
   - Update the worker README/checklist to match the actual Fly setup or highlight the expected config.
   - Include commands for checking logs, secrets, process name, volume mount, and data path.

After this, the Dashboard will make it obvious whether the problem is:
- enqueue failed,
- jobs are queued but worker is not claiming them,
- worker is running a job,
- worker finished and DOCX is ready,
- or worker failed and an error is available.