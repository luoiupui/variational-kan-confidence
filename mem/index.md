# Project Memory

## Core
All completed/failed experiment runs MUST surface in downloadable DOCX technical reports — source is the Cloud `runs` table (durable), rollover every ~50 entries, include timestamps + tables + ATE chart + per-run trajectory/FE snapshots. Never reintroduce a localStorage-based log.
V-KAN architecture and workflow front-matter is fixed at the start of every report volume; only update it when the architecture itself changes.

## Memories
- [Auto-report system](mem://features/auto-report) — client-side logger persists to localStorage, DOCX generated via `docx` lib, multi-volume rollover, downloadable from /reports route
