
## Feasibility (short answer)

Yes — but split into 3 layers, because Lovable's preview is a browser (no ROS, no PyTorch, no robot):

| Layer | Where it runs | Feasible in Lovable? |
|---|---|---|
| Dashboard UI + camera capture + panels | React app (this project) | Yes, fully |
| microAgent inference (microGPT / nanoGPT / SLM) | Fly.io worker (already deployed) or Lovable AI Gateway | Yes, via existing worker |
| Real ROS 2 node + physical/sim robot | User's own PC / Jetson / Isaac Sim | Out of scope — bridged via the worker over HTTP/WebSocket |

We will not run `rclpy` or PyTorch in the browser. The Dashboard will act as the **observation + control surface**; the worker will host the **micro-agent loop**; an optional local ROS bridge script (provided as a file in `worker/ros_bridge/`) lets advanced users plug a real robot in later.

---

## What gets built

### 1. New Dashboard route: `/agent` (Micro-ROS Agent)
Added to `AppShell` nav alongside Dashboard / Stage 4 / Reports.

### 2. Four new panels (laid out like existing `Index.tsx`)

1. **Camera Capture Panel** — `getUserMedia` live preview, FPS selector (1/5/10), resolution selector, "Start/Stop streaming" button. Captures frames to JPEG via `<canvas>`.
2. **Frame Ingestion Panel** — sends sampled frames (base64 or via Supabase Storage) to a new edge function `ingest-frame`; shows last N thumbnails, latency, drop rate.
3. **Agent Decision Panel** — live stream of the microAgent's structured action tokens (`[NAV] FORWARD 0.5`, `[ARM] GRASP [TARGET] OBJ_A`), with a parsed view (nav vs arm vs target). Subscribes via Supabase Realtime to a new `agent_decisions` table.
4. **Action Token Schema Panel** — read-only reference of the token protocol (NAV / ARM / TARGET) plus the current vocabulary size and model checkpoint name pulled from the worker `/agent/status` endpoint.

A 5th small **Telemetry Training Panel** (optional, behind a "Show advanced" toggle) lets the user upload a `telemetry_logs.txt` and trigger a worker training run; status polled from `runs` table (reuses existing infrastructure).

### 3. Where panels go on existing Dashboard
The existing SLAM panels stay untouched on `/`. The new panels live on `/agent`. If the user prefers, we can also add a single compact **"Agent · Last Decision"** strip at the bottom of `/` that links to `/agent` — non-intrusive.

---

## Backend additions (Lovable Cloud)

- **Edge functions** (new):
  - `ingest-frame` — auth-checked, writes frame metadata to `frames` table + uploads JPEG to Storage bucket `agent-frames`.
  - `agent-tick` — accepts a frame id + text context, calls the worker `/agent/infer` endpoint (or Lovable AI Gateway as fallback), inserts result into `agent_decisions`.
- **Tables**:
  - `frames(id, ts, width, height, storage_path, sequence_id)`
  - `agent_decisions(id, frame_id, raw_output, nav_cmd, arm_cmd, target_id, model_version, latency_ms, ts)`
- **Realtime** enabled on `agent_decisions` so the panel streams without polling.
- **Storage bucket** `agent-frames` (private, signed URLs for thumbnails).

---

## Worker additions (Fly.io, already running)

New `worker/agent/` module:
- `micro_agent.py` — implements the loop from your note (tiny_net + character-level generate).
- `serve.py` — small FastAPI/Flask endpoint: `POST /agent/infer {context} -> {raw, nav, arm, target}`, `GET /agent/status`.
- `ros_bridge/README.md` + `ros_bridge/nn_agent_node.py` — the rclpy script from your note, **as a downloadable artifact**, not deployed (Fly slim image won't have ROS).
- `requirements.txt` += `torch`, `numpy`, `fastapi`, `uvicorn`.

The worker stays the single deploy target — same GitHub Actions pipeline.

### Inference choice (one decision needed from you, but I'll default if you don't reply)
Default: ship a tiny PyTorch transformer trained on the sample `custom_telemetry.txt` from your note (matches the Karpathy-style microAgent narrative). If you want a real SLM instead, the same endpoint can call Lovable AI Gateway (`google/gemini-2.5-flash-lite`) with a JSON-schema prompt — much smarter but not "micro".

---

## Technical details

```text
Browser (Dashboard /agent)
  ├─ getUserMedia → <video> → canvas.toDataURL('image/jpeg', q)
  ├─ throttle to N fps → POST /functions/v1/ingest-frame
  └─ subscribe Realtime: agent_decisions

Lovable Cloud
  ├─ ingest-frame → Storage(agent-frames) + INSERT frames
  └─ agent-tick   → fetch worker /agent/infer → INSERT agent_decisions

Fly.io worker
  ├─ FastAPI /agent/infer → tiny_net.generate_action()
  └─ /agent/status → {model_version, vocab_size, device}

(Optional, user's own PC)
  └─ rclpy node → polls /agent/infer → publishes /cmd_vel, /arm_gripper/command
```

Frame size kept small (e.g. 320×240, q=0.6, 5 fps ≈ 30 KB/frame ≈ 150 KB/s) to stay under Supabase Storage and edge-function limits.

---

## Out of scope (call out explicitly)
- Running rclpy / Isaac Sim / Gazebo in Lovable preview — impossible (browser).
- Training large models in the worker — Fly's free machine is CPU-only and tiny; the included training is the toy `MicroRobotTransformer` from your note (~30 s on CPU), not nanoGPT-scale.
- Two-way actuation of a real robot from the cloud — provided as a local bridge script the user runs themselves; the cloud only emits decisions.

---

## Build order
1. DB migration (`frames`, `agent_decisions`, storage bucket, realtime).
2. Edge functions `ingest-frame`, `agent-tick`.
3. Worker `agent/` module + endpoint + GH Actions deploy.
4. Frontend route `/agent`, four panels, hooks (`useCamera`, `useAgentDecisions`).
5. Optional bottom strip on `/` linking to `/agent`.
6. Add `worker/ros_bridge/` files as downloadable reference for real-robot use.
