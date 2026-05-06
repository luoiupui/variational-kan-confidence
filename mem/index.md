# Project Memory

## Core
All actions, system builds, modifications, and experiment runs MUST be auto-logged into downloadable DOCX technical reports — append in real time when a run reaches `done`/`failed`, auto-rollover to new volume by size (~50 runs), include timestamps + tables + embedded charts. Never bypass the auto-logger.
V-KAN architecture and workflow front-matter is fixed at the start of every report volume; only update it when the architecture itself changes.

## Memories
- [Auto-report system](mem://features/auto-report) — client-side logger persists to localStorage, DOCX generated via `docx` lib, multi-volume rollover, downloadable from /reports route
