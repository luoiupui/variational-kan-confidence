---
name: Auto-report system
description: Auto-logged DOCX technical reports for V-KAN runs, with rollover and download
type: feature
---
- Hook: `src/hooks/useAutoReport.ts` subscribes to `useRuns`, appends each newly-`done`/`failed` run to localStorage key `vkan_report_log_v1` with ISO timestamp.
- Rollover: when current volume exceeds 50 entries, start next volume (vol_2, vol_3, ...).
- Page: `/reports` — lists all volumes, "Download .docx" per volume; renders fixed front matter (V-KAN architecture + workflow), run history table, V-KAN vs ORB-SLAM3 vs DynaSLAM comparison + geomean, strength/weakness buckets (Low/Med/High dynamic_pct), and embedded ATE bar chart PNG (rendered via canvas).
- Mount: auto-logger initialised in `App.tsx` so logging happens regardless of current route.
