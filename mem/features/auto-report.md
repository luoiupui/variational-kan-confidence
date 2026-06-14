---
name: Auto-report system
description: DOCX technical reports for V-KAN runs, sourced from the runs table, with rollover and download
type: feature
---
- Source of truth: the Cloud `runs` table (durable, multi-machine). No localStorage involved.
- Builder: `buildVolumesFromRuns(runs)` in `src/lib/reportLog.ts` — chronological, 50 entries per volume, includes only `done`/`failed` runs.
- Page: `/reports` calls `useRuns(500)` + `buildVolumesFromRuns`; per-volume "Download .docx".
- DOCX (`src/lib/reportDocx.ts`) contains: fixed V-KAN architecture/workflow front-matter, run history table, V-KAN vs ORB-SLAM3 vs DynaSLAM comparison + geomean, strength/weakness by dynamic_pct bucket, embedded ATE bar chart PNG, and per-run snapshots (up to 8 most recent V-KAN runs) with canvas-rendered trajectory top-down PNG (est vs GT + keyframes) and free-energy PNG (`src/lib/reportPerRunCharts.ts`).
- Legacy shims (`getVolumes`, `ingestRuns`, `clearLog`, `logEvent`) in reportLog.ts are no-ops kept for source compatibility.
