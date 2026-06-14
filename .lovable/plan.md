## Plan

This is an operations fix, not a code change. The `--app-dir` change fixes the import error, but it does not move an already-created Fly Machine between regions.

### 1. Remove the wrong-region `agent` Machine
Run from the `worker` folder:

```powershell
flyctl machine destroy 48ee163c763108 -a worker-misty-butterfly-4770
```

Confirm with `y` when prompted. This only removes the stopped `agent` Machine in `lax`.

### 2. Create the `agent` Machine in `sin`

```powershell
flyctl scale count agent=1 --region sin -a worker-misty-butterfly-4770
```

If Fly says there is already 1 agent, run:

```powershell
flyctl scale count agent=0 -a worker-misty-butterfly-4770
flyctl scale count agent=1 --region sin -a worker-misty-butterfly-4770
```

### 3. Start both process groups if still stopped
Check status:

```powershell
flyctl status -a worker-misty-butterfly-4770
```

If either machine is `stopped`, start it by ID:

```powershell
flyctl machine start <worker_machine_id> -a worker-misty-butterfly-4770
flyctl machine start <agent_machine_id> -a worker-misty-butterfly-4770
```

For your current worker ID, that is:

```powershell
flyctl machine start 48e0e9eb765448 -a worker-misty-butterfly-4770
```

Use the new `agent` ID shown after recreating it.

### 4. Verify both Machines are in `sin` and started

```powershell
flyctl status -a worker-misty-butterfly-4770
```

Expected:

```text
PROCESS │ REGION │ STATE
agent   │ sin    │ started
worker  │ sin    │ started
```

### 5. Check logs for the real boot result

```powershell
flyctl logs -a worker-misty-butterfly-4770
```

Expected lines:

```text
Uvicorn running on http://0.0.0.0:8080
[poller] starting · ingest=... data=/data
```

Press `Ctrl+C` to exit logs.

### 6. Test the HTTP endpoint

```powershell
curl https://worker-misty-butterfly-4770.fly.dev/agent/status
```

Expected: JSON response from the agent.

## Why this happened

Fly Machines are tied to a region after creation. Changing `primary_region = "sin"` or redeploying does not automatically migrate an existing Machine from `lax` to `sin`. The `lax` Machine must be destroyed and recreated in `sin`.