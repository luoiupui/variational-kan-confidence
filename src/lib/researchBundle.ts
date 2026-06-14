// Builds a per-volume "research bundle" .zip with the raw numeric data
// behind the DOCX charts, so a reviewer can reproduce every plot and
// re-run evo independently from the artifacts of a thesis.
//
// Bundle layout:
//   metrics.csv                   — one row per run (all scalar metrics)
//   runs.json                     — full raw dump of LogEntry rows
//   trajectories/<run_id>_est.tum — TUM trajectory (est)
//   trajectories/<run_id>_gt.tum  — TUM trajectory (gt, if present)
//   per_frame/<run_id>_ate.csv    — per-frame ATE
//   per_frame/<run_id>_fe.csv     — per-frame free-energy
//   README.txt                    — schema description

import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { LogEntry, Volume } from "./reportLog";

type RunEntry = Extract<LogEntry, { kind: "run" }>;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function metricsCsv(runs: RunEntry[]): string {
  const header = [
    "run_id", "ts", "sequence_id", "sequence_name", "method", "status",
    "frames", "ate_rmse", "ate_mean", "ate_max", "rpe_trans", "rpe_rot",
    "tracking_pct", "fps", "git_sha", "n_traj_est", "n_traj_gt",
    "n_ate_per_frame", "n_fe", "n_keyframes", "error",
  ];
  const lines = [header.join(",")];
  for (const r of runs) {
    const m = (r.metrics ?? {}) as Record<string, number | undefined>;
    lines.push([
      r.run_id, r.ts, r.sequence_id, r.sequence_name, r.method, r.status,
      r.frames ?? "", m.ate_rmse ?? "", m.ate_mean ?? "", m.ate_max ?? "",
      m.rpe_trans ?? "", m.rpe_rot ?? "", m.tracking_pct ?? "", m.fps ?? "",
      r.git_sha ?? "", r.trajectory_est?.length ?? 0, r.trajectory_gt?.length ?? 0,
      (r as { ate_per_frame?: number[] }).ate_per_frame?.length ?? 0,
      r.fe?.length ?? 0, r.keyframes?.length ?? 0,
      r.error ? r.error.replace(/\s+/g, " ").slice(0, 500) : "",
    ].map(csvEscape).join(","));
  }
  return lines.join("\n") + "\n";
}

/** TUM format: `timestamp tx ty tz qx qy qz qw`.
 *  We only have xyz in the DB, so quaternion is identity (0 0 0 1) and the
 *  timestamp is the frame index (matches what evo_ape accepts in dummy mode).
 *  Reviewers who want true timestamps should pull from the original sequence. */
function trajectoryTum(traj: [number, number, number][]): string {
  const lines: string[] = [];
  for (let i = 0; i < traj.length; i++) {
    const [x, y, z] = traj[i];
    lines.push(`${i.toFixed(6)} ${x} ${y} ${z} 0 0 0 1`);
  }
  return lines.join("\n") + "\n";
}

function numericCsv(name: string, values: number[]): string {
  const lines = [`index,${name}`];
  for (let i = 0; i < values.length; i++) lines.push(`${i},${values[i]}`);
  return lines.join("\n") + "\n";
}

function readme(volume: Volume, runs: RunEntry[]): string {
  return [
    `V-KAN research bundle — Volume ${volume.id}`,
    `Generated: ${new Date().toISOString()}`,
    `Source: Lovable Cloud "runs" table (durable)`,
    `Runs in bundle: ${runs.length}`,
    ``,
    `Files:`,
    `  metrics.csv                    All scalar metrics, one row per run.`,
    `  runs.json                      Raw LogEntry dump (mirrors the DB row).`,
    `  trajectories/<run_id>_est.tum  Estimated trajectory in TUM format`,
    `                                 (timestamp tx ty tz qx qy qz qw). Quaternion`,
    `                                 is identity because only xyz is stored.`,
    `  trajectories/<run_id>_gt.tum   Ground-truth trajectory (TUM), when present.`,
    `  per_frame/<run_id>_ate.csv     Per-frame absolute trajectory error (m).`,
    `  per_frame/<run_id>_fe.csv      Per-frame variational free-energy (V-KAN only).`,
    ``,
    `To reproduce ATE/RPE with evo:`,
    `  evo_ape tum <run_id>_gt.tum <run_id>_est.tum -va --plot`,
    `Note: timestamps are frame indices, so use evo's --align/--correct_scale flags`,
    `as needed. Reviewers wanting true TUM timestamps should re-run the worker`,
    `with the original rgbd_dataset_freiburg* sequence.`,
    ``,
  ].join("\n");
}

export async function buildVolumeBundleZip(volume: Volume): Promise<Blob> {
  const zip = new JSZip();
  const runs = volume.entries.filter(
    (e): e is RunEntry => e.kind === "run",
  );

  zip.file("metrics.csv", metricsCsv(runs));
  zip.file("runs.json", JSON.stringify(runs, null, 2));
  zip.file("README.txt", readme(volume, runs));

  const trajDir = zip.folder("trajectories")!;
  const pfDir = zip.folder("per_frame")!;

  for (const r of runs) {
    if (r.trajectory_est?.length) {
      trajDir.file(`${r.run_id}_est.tum`, trajectoryTum(r.trajectory_est));
    }
    if (r.trajectory_gt?.length) {
      trajDir.file(`${r.run_id}_gt.tum`, trajectoryTum(r.trajectory_gt));
    }
    const ate = (r as { ate_per_frame?: number[] }).ate_per_frame;
    if (ate?.length) {
      pfDir.file(`${r.run_id}_ate.csv`, numericCsv("ate", ate));
    }
    if (r.fe?.length) {
      pfDir.file(`${r.run_id}_fe.csv`, numericCsv("fe", r.fe));
    }
  }

  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}

export async function downloadVolumeBundle(volume: Volume) {
  const blob = await buildVolumeBundleZip(volume);
  saveAs(blob, `vkan_bundle_vol${String(volume.id).padStart(2, "0")}.zip`);
}