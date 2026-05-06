// Client-side auto-logger for V-KAN technical reports.
// Persists run completions + system events into localStorage, rolling over
// to new volumes once a volume exceeds VOLUME_LIMIT entries. The /reports
// page reads these volumes and renders downloadable DOCX files.

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

const KEY = "vkan_report_log_v1";
const SEEN_KEY = "vkan_report_log_v1_seen";
export const VOLUME_LIMIT = 50;

function readAll(): Volume[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as Volume[];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(vols: Volume[]) {
  localStorage.setItem(KEY, JSON.stringify(vols));
  window.dispatchEvent(new CustomEvent("vkan-report-updated"));
}

export function getVolumes(): Volume[] {
  const v = readAll();
  if (v.length === 0) {
    const initial: Volume = { id: 1, started_at: new Date().toISOString(), entries: [] };
    writeAll([initial]);
    return [initial];
  }
  return v;
}

function append(entry: LogEntry) {
  const vols = getVolumes();
  let cur = vols[vols.length - 1];
  if (cur.entries.length >= VOLUME_LIMIT) {
    cur = { id: cur.id + 1, started_at: new Date().toISOString(), entries: [] };
    vols.push(cur);
  }
  cur.entries.push(entry);
  writeAll(vols);
}

function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function writeSeen(s: Set<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
}

/** Append any newly-finished runs we haven't logged before. */
export function ingestRuns(runs: RunRow[]) {
  const seen = readSeen();
  let changed = false;
  // oldest first so volumes are chronological
  const finished = runs
    .filter((r) => r.status === "done" || r.status === "failed")
    .slice()
    .sort(
      (a, b) =>
        new Date(a.completed_at ?? a.created_at).getTime() -
        new Date(b.completed_at ?? b.created_at).getTime(),
    );
  for (const r of finished) {
    if (seen.has(r.id)) continue;
    append({
      kind: "run",
      ts: r.completed_at ?? new Date().toISOString(),
      run_id: r.id,
      sequence_id: r.sequence_id,
      sequence_name: r.sequence_name,
      method: r.method,
      status: r.status,
      frames: r.frames,
      metrics: r.metrics,
      git_sha: r.git_sha,
      error: r.error,
    });
    seen.add(r.id);
    changed = true;
  }
  if (changed) writeSeen(seen);
}

export function logEvent(label: string, detail?: string) {
  append({ kind: "event", ts: new Date().toISOString(), label, detail });
}

export function clearLog() {
  localStorage.removeItem(KEY);
  localStorage.removeItem(SEEN_KEY);
  window.dispatchEvent(new CustomEvent("vkan-report-updated"));
}