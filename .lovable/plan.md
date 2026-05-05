## Goal

Make the dynamic-SLAM comparison first-class in the UI and guarantee enough paired data exists to draw conclusions about where V-KAN wins and loses against **ORB-SLAM3** (geometric baseline) and **DynaSLAM** (dynamic-aware baseline).

## Current state (audit)

Wired:
- Backend supports all three methods (`runs.method ∈ {vkan, orb3, dynaslam}`); worker dispatch + ingest endpoint accept all three.
- `GeomeanPanel` already aggregates ATE-RMSE per method and computes V-KAN vs ORB-3 improvement on shared sequences.
- `RunCenter` lets the user enqueue any method on any sequence.

Gaps:
1. **Stage4 per-sequence table is V-KAN vs ORB-3 only** — no DynaSLAM column, no DynaSLAM trajectory line, no DynaSLAM tracking % even when rows exist.
2. **No strength/weakness analysis** — geomean is a single number; the user has no view of *where* V-KAN beats or loses to DynaSLAM (low/medium/high dynamic-content sequences).
3. **Data sparsity** — DB currently has 4 queued V-KAN rows and zero ORB-3/DynaSLAM rows, so the comparison surface would be empty even after the worker runs. Triggering one method per sequence at a time is fragile.

## Changes

### 1. Per-sequence comparison: add DynaSLAM as a 1st-class column

`src/pages/Stage4.tsx` (real-data branch around the metrics panel, lines ~233–262, and the table at lines ~301–420):
- Extend the table header to a 3-method layout (vkan / orb3 / dynaslam) for ATE-RMSE, RPE-trans, RPE-rot, tracked %.
- Compute the winner across all three methods present (lowest ATE-RMSE wins).
- In the 3D panel, add a magenta `DynaSLAM` line when `seq.trajectory_dynaslam` is present (already in `Stage4RealData`).
- Update the per-sequence "Metrics" Panel grid to a 3-column layout (vkan / orb3 / dynaslam), showing `—` when a method has no run yet.

`src/lib/stage4-types.ts`: already declares `metrics.dynaslam` and `trajectory_dynaslam` — no change needed.

`worker/stage4/eval_with_evo.py`: extend so the final `stage4_results.json` payload also accepts a `--dynaslam-traj` flag and emits `metrics.dynaslam` + `trajectory_dynaslam`. Wire it from `poller.py` so a `method='dynaslam'` run produces the same metric fields as ORB-3.

### 2. New Stage E component: `StrengthWeaknessPanel`

`src/components/vkan/StrengthWeaknessPanel.tsx` (new), mounted in `Stage4.tsx` directly under `GeomeanPanel`.

Reads from the same `useRuns(200)` + `useSequences()` data already in context. Joins each successful run to its sequence's `dynamic_pct` and buckets:

```text
  Low dynamic   (0–10%)   e.g. fr1/xyz, fr1/desk
  Medium        (10–50%)  e.g. fr3/sitting_static
  High          (50–100%) e.g. fr3/walking_*
```

For each bucket renders a small card with:
- per-method ATE-RMSE geomean (vkan / orb3 / dynaslam) and `n` sequences
- delta vs DynaSLAM (`(dynaslam - vkan) / dynaslam · 100`) — the headline number for "is V-KAN actually better than the dynamic-aware baseline?"
- delta vs ORB-3 (same formula)
- short, derived verdict line, e.g.:
  - "Strength: high-dynamic — V-KAN −18% vs DynaSLAM, +42% vs ORB-3"
  - "Weakness: low-dynamic — V-KAN +6% ATE vs ORB-3 (extra capacity not justified)"
  - "Insufficient data — need ≥1 paired sequence" when buckets are empty

Below the buckets, a compact "Per-sequence ranking" list: every sequence with all 3 methods complete, sorted by V-KAN's relative improvement vs DynaSLAM, with a tiny green/red bar. This makes strengths and weaknesses scannable without opening each row.

All math is client-side over already-streaming data — no new endpoint.

### 3. RunCenter: "Enqueue all 3 methods" action

`src/components/vkan/RunCenter.tsx`:
- Add a secondary button next to "Run" labeled **"Run all 3"** that POSTs three `enqueue-run` calls (vkan, orb3, dynaslam) for the selected sequence in parallel. This is the only practical way to populate paired comparison data for the strength/weakness panel.
- Add a top-level "Backfill comparison set" button that enqueues all 3 methods × 6 enabled sequences (with a confirm dialog showing the row count). Dedupe sequences that already have a recent successful run for that method (look at the latest `useRuns()` cache).

### 4. Sequence dedupe (data hygiene, optional but recommended)

The `sequences` table currently has duplicates (`fr3/walking_xyz` and `fr3_walking_xyz`, etc.). Add a one-shot data migration that disables the duplicate rows (`enabled=false`) so the UI and aggregation only count one canonical id per sequence. Pure data update, no schema change.

## Out of scope

- Adding more baselines beyond DynaSLAM (e.g., DROID-SLAM, TartanVO) — same pattern can be reused later by extending the `RunMethod` union and the worker dispatch.
- Per-frame ATE drawer — already on the deferred Lovable enrichment list.

## Acceptance

- Per-sequence Stage 4 table renders 3 method columns; DynaSLAM trajectory appears in 3D when present.
- Stage E shows three dynamic-content buckets each with vkan / orb3 / dynaslam geomeans and a derived strength/weakness verdict.
- Clicking "Run all 3" on any sequence creates 3 queued rows; the worker (already deployed) processes them and the comparison panels populate live via Realtime.
