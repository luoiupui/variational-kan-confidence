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
//   per_run/<run_id>_trajectory.csv — frame, est_x/y/z, gt_x/y/z (chart-ready)
//   per_run/<run_id>_keyframes.csv  — keyframe indices used as markers
//   charts/ate_rmse_bar.csv         — exact data behind the ATE bar chart
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

/** frame, est_x, est_y, est_z, gt_x, gt_y, gt_z — index-aligned, exactly what
 *  the DOCX top-down trajectory chart plots. */
function trajectoryPairedCsv(
  est: [number, number, number][] | null | undefined,
  gt: [number, number, number][] | null | undefined,
): string {
  const n = Math.max(est?.length ?? 0, gt?.length ?? 0);
  const lines = ["frame,est_x,est_y,est_z,gt_x,gt_y,gt_z"];
  for (let i = 0; i < n; i++) {
    const e = est?.[i];
    const g = gt?.[i];
    lines.push([
      i,
      e?.[0] ?? "", e?.[1] ?? "", e?.[2] ?? "",
      g?.[0] ?? "", g?.[1] ?? "", g?.[2] ?? "",
    ].join(","));
  }
  return lines.join("\n") + "\n";
}

function keyframesCsv(keyframes: number[]): string {
  const lines = ["keyframe_index"];
  for (const k of keyframes) lines.push(String(k));
  return lines.join("\n") + "\n";
}

/** Mirrors the DOCX bar chart: one row per (sequence, method) with ATE-RMSE. */
function ateBarCsv(runs: RunEntry[]): string {
  const done = runs.filter(
    (r) => r.status === "done" && r.metrics?.ate_rmse != null,
  );
  const lines = ["sequence_name,method,ate_rmse,run_id"];
  for (const r of done) {
    lines.push([
      csvEscape(r.sequence_name),
      r.method,
      r.metrics?.ate_rmse ?? "",
      r.run_id,
    ].join(","));
  }
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
    `  per_run/<run_id>_trajectory.csv Index-aligned est+gt xyz — the exact data`,
    `                                  plotted in the DOCX top-down trajectory chart.`,
    `  per_run/<run_id>_keyframes.csv  Keyframe indices used as markers on the`,
    `                                  trajectory and free-energy charts.`,
    `  charts/ate_rmse_bar.csv         Exact data behind the DOCX ATE bar chart`,
    `                                  (one row per sequence × method).`,
    ``,
    `To reproduce ATE/RPE with evo:`,
    `  evo_ape tum <run_id>_gt.tum <run_id>_est.tum -va --plot`,
    ``,
    `To redraw the DOCX charts in matplotlib/Excel/gnuplot:`,
    `  - ATE bar chart    -> charts/ate_rmse_bar.csv`,
    `  - Trajectory chart -> per_run/<run_id>_trajectory.csv (+ _keyframes.csv)`,
    `  - Free-energy line -> per_frame/<run_id>_fe.csv      (+ _keyframes.csv)`,
    `  - Per-frame ATE    -> per_frame/<run_id>_ate.csv`,
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
  zip.folder("charts")!.file("ate_rmse_bar.csv", ateBarCsv(runs));

  const trajDir = zip.folder("trajectories")!;
  const pfDir = zip.folder("per_frame")!;
  const prDir = zip.folder("per_run")!;

  for (const r of runs) {
    if (r.trajectory_est?.length) {
      trajDir.file(`${r.run_id}_est.tum`, trajectoryTum(r.trajectory_est));
    }
    if (r.trajectory_gt?.length) {
      trajDir.file(`${r.run_id}_gt.tum`, trajectoryTum(r.trajectory_gt));
    }
    if (r.trajectory_est?.length || r.trajectory_gt?.length) {
      prDir.file(
        `${r.run_id}_trajectory.csv`,
        trajectoryPairedCsv(r.trajectory_est, r.trajectory_gt),
      );
    }
    if (r.keyframes?.length) {
      prDir.file(`${r.run_id}_keyframes.csv`, keyframesCsv(r.keyframes));
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