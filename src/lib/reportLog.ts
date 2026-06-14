// Volume builder for V-KAN technical reports.
// SOURCE: the `runs` table in Lovable Cloud (durable, multi-machine).
// Volumes are derived chronologically from completed/failed runs and
// rolled over every VOLUME_LIMIT entries. localStorage is no longer used
// as the source of truth; legacy helpers below are kept as no-ops for
// backwards compatibility with older call sites.

import type { RunRow } from "@/hooks/useRuns";

export type LogEntry =
  | {
      kind: "run";
      ts: string; // ISO
      run_id: string;
      sequence_id: string;
      sequence_name: string;
      method: string;
      status: string;
      frames: number | null;
      metrics: RunRow["metrics"];
      git_sha: string | null;
      error: string | null;
      trajectory_est?: [number, number, number][] | null;
      trajectory_gt?: [number, number, number][] | null;
      fe?: number[] | null;
      keyframes?: number[] | null;
      ate_per_frame?: number[] | null;
    }
  | {
      kind: "event";
      ts: string;
      label: string;
      detail?: string;
    };

export interface Volume {
  id: number; // 1-based
  started_at: string;
  entries: LogEntry[];
}

export const VOLUME_LIMIT = 50;

/** Convert a RunRow into a log entry (run kind). */
function runToEntry(r: RunRow): LogEntry {
  return {
    kind: "run",
    ts: r.completed_at ?? r.created_at,
    run_id: r.id,
    sequence_id: r.sequence_id,
    sequence_name: r.sequence_name,
    method: r.method,
    status: r.status,
    frames: r.frames,
    metrics: r.metrics,
    git_sha: r.git_sha,
    error: r.error,
    trajectory_est: r.trajectory_est ?? null,
    trajectory_gt: r.trajectory_gt ?? null,
    fe: r.fe ?? null,
    keyframes: r.keyframes ?? null,
  };
}

/**
 * Derive volumes from the runs table (the durable source of truth).
 * Volumes are chronological (oldest first), VOLUME_LIMIT entries each.
 * Only completed/failed runs are included.
 */
export function buildVolumesFromRuns(runs: RunRow[]): Volume[] {
  const finished = runs
    .filter((r) => r.status === "done" || r.status === "failed")
    .slice()
    .sort(
      (a, b) =>
        new Date(a.completed_at ?? a.created_at).getTime() -
        new Date(b.completed_at ?? b.created_at).getTime(),
    );
  if (finished.length === 0) {
    return [{ id: 1, started_at: new Date().toISOString(), entries: [] }];
  }
  const vols: Volume[] = [];
  for (let i = 0; i < finished.length; i += VOLUME_LIMIT) {
    const slice = finished.slice(i, i + VOLUME_LIMIT);
    vols.push({
      id: vols.length + 1,
      started_at: slice[0].completed_at ?? slice[0].created_at,
      entries: slice.map(runToEntry),
    });
  }
  return vols;
}

// ---------------------------------------------------------------------------
// Legacy no-op shims (kept so older imports still compile while we migrate).
// ---------------------------------------------------------------------------
export function getVolumes(): Volume[] {
  return [{ id: 1, started_at: new Date().toISOString(), entries: [] }];
}
export function ingestRuns(_runs: RunRow[]) {
  /* no-op: source of truth is now the runs table */
}
export function logEvent(_label: string, _detail?: string) {
  /* no-op */
}
export function clearLog() {
  /* no-op: cannot clear the runs table from the client */
}