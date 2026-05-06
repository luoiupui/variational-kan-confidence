// Builds a DOCX volume from a Volume of LogEntry. Includes:
// - Fixed front-matter (V-KAN architecture + workflow)
// - Run history table (timestamped)
// - V-KAN vs ORB-SLAM3 vs DynaSLAM comparison table
// - Strength/Weakness analysis by dynamic_pct bucket
// - Embedded ATE bar chart PNG

import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { saveAs } from "file-saver";
import type { LogEntry, Volume } from "./reportLog";
import { renderAteChartPng } from "./reportChart";

const FRONT_MATTER_VERSION = "1.0";

function p(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new Paragraph({
    children: [new TextRun({ text, bold: opts.bold, size: opts.size })],
  });
}
function h(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ text, heading: level });
}
function cell(text: string, opts: { bold?: boolean } = {}) {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: opts.bold, size: 18 })],
      }),
    ],
    width: { size: 1500, type: WidthType.DXA },
  });
}

function frontMatter(): Paragraph[] {
  return [
    h("V-KAN Dynamic SLAM — Technical Report", HeadingLevel.TITLE),
    p(`Auto-generated • Front-matter v${FRONT_MATTER_VERSION}`, { size: 18 }),
    h("1. System Architecture", HeadingLevel.HEADING_1),
    p(
      "V-KAN is a dynamic-aware SLAM front-end that fuses bagged NOTEARS causal " +
        "discovery with a free-energy (FE) trigger. Visual features feed a per-window " +
        "structure-learning bootstrap (B refits, agree=consensus fraction) producing a " +
        "causal graph over scene actors. The FE trigger fires when the variational " +
        "free-energy of the current window exceeds the threshold, switching the SLAM " +
        "back-end into dynamic-rejection mode.",
    ),
    h("2. Workflow (Loops A→C→B and D→E→F)", HeadingLevel.HEADING_1),
    p(
      "Loop A→C→B: V-KAN inference (A) → evo evaluation (C) → ORB-SLAM3 baseline (B). " +
        "Loop D→E→F: DynaSLAM baseline (D) → paired-metric merge (E) → cross-method " +
        "geomean + strength/weakness analysis (F). Both loops run on the Fly.io GPU worker; " +
        "each completion ingests into the runs table and triggers this auto-report.",
    ),
    h("3. Run Log", HeadingLevel.HEADING_1),
  ];
}

function runHistoryTable(entries: LogEntry[]) {
  const runs = entries.filter(
    (e): e is Extract<LogEntry, { kind: "run" }> => e.kind === "run",
  );
  const header = new TableRow({
    children: ["timestamp", "sequence", "method", "status", "ATE-RMSE", "RPE-t", "track%", "fps", "git"].map(
      (t) => cell(t, { bold: true }),
    ),
  });
  const rows = runs.map((r) => {
    const m = r.metrics ?? {};
    return new TableRow({
      children: [
        cell(new Date(r.ts).toISOString().replace("T", " ").slice(0, 19)),
        cell(r.sequence_name),
        cell(r.method),
        cell(r.status),
        cell(m.ate_rmse?.toFixed(4) ?? "—"),
        cell(m.rpe_trans?.toFixed(4) ?? "—"),
        cell(m.tracking_pct?.toFixed(1) ?? "—"),
        cell(m.fps?.toFixed(1) ?? "—"),
        cell((r.git_sha ?? "—").slice(0, 8)),
      ],
    });
  });
  return new Table({
    rows: [header, ...rows],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function comparisonTable(entries: LogEntry[]) {
  const runs = entries.filter(
    (e): e is Extract<LogEntry, { kind: "run" }> =>
      e.kind === "run" && e.status === "done" && !!e.metrics?.ate_rmse,
  );
  const seqs = Array.from(new Set(runs.map((r) => r.sequence_name))).sort();
  const methods = ["vkan", "orb3", "dynaslam"];
  const header = new TableRow({
    children: [cell("sequence", { bold: true }), ...methods.map((m) => cell(m.toUpperCase(), { bold: true }))],
  });
  const rows = seqs.map((seq) => {
    return new TableRow({
      children: [
        cell(seq),
        ...methods.map((m) => {
          const latest = runs
            .filter((r) => r.sequence_name === seq && r.method === m)
            .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))[0];
          return cell(latest?.metrics?.ate_rmse?.toFixed(4) ?? "—");
        }),
      ],
    });
  });
  // geomean row
  const geo = methods.map((m) => {
    const vals = runs.filter((r) => r.method === m).map((r) => r.metrics!.ate_rmse!);
    if (!vals.length) return "—";
    const g = Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length);
    return g.toFixed(4);
  });
  rows.push(
    new TableRow({
      children: [cell("GEOMEAN", { bold: true }), ...geo.map((v) => cell(v, { bold: true }))],
    }),
  );
  return new Table({ rows: [header, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } });
}

function strengthWeaknessParagraphs(entries: LogEntry[]): Paragraph[] {
  const runs = entries.filter(
    (e): e is Extract<LogEntry, { kind: "run" }> =>
      e.kind === "run" && e.status === "done" && !!e.metrics?.ate_rmse,
  );
  // We don't have dynamic_pct in the log; bucket heuristically on sequence name.
  const bucketOf = (name: string): "Low" | "Med" | "High" => {
    const n = name.toLowerCase();
    if (n.includes("walking") || n.includes("dynamic")) return "High";
    if (n.includes("sitting") || n.includes("halfsphere")) return "Med";
    return "Low";
  };
  const out: Paragraph[] = [];
  for (const bucket of ["Low", "Med", "High"] as const) {
    const sub = runs.filter((r) => bucketOf(r.sequence_name) === bucket);
    const byM = (m: string) => {
      const vals = sub.filter((r) => r.method === m).map((r) => r.metrics!.ate_rmse!);
      if (!vals.length) return null;
      return Math.exp(vals.reduce((s, v) => s + Math.log(v), 0) / vals.length);
    };
    const v = byM("vkan"), o = byM("orb3"), d = byM("dynaslam");
    if (v == null) continue;
    const lines = [`${bucket}-dynamic geomean (n=${sub.length})  V-KAN ${v.toFixed(4)} m`];
    if (o != null) lines.push(`  vs ORB-SLAM3   ${o.toFixed(4)} m   Δ ${(((v - o) / o) * 100).toFixed(1)}%`);
    if (d != null) lines.push(`  vs DynaSLAM    ${d.toFixed(4)} m   Δ ${(((v - d) / d) * 100).toFixed(1)}%`);
    lines.forEach((t) => out.push(p(t, { size: 20 })));
    out.push(p(""));
  }
  if (out.length === 0) out.push(p("Not enough completed runs to bucket.", { size: 20 }));
  return out;
}

export async function buildVolumeDocx(volume: Volume): Promise<Blob> {
  const chartPng = await renderAteChartPng(volume.entries);

  const children: (Paragraph | Table)[] = [
    ...frontMatter(),
    p(
      `Volume ${volume.id} • started ${new Date(volume.started_at).toISOString()} • ` +
        `${volume.entries.length} entries`,
      { size: 18 },
    ),
    runHistoryTable(volume.entries),
    h("4. V-KAN vs ORB-SLAM3 vs DynaSLAM (latest per sequence)", HeadingLevel.HEADING_1),
    comparisonTable(volume.entries),
    h("5. Strength / Weakness Analysis (by dynamic load)", HeadingLevel.HEADING_1),
    ...strengthWeaknessParagraphs(volume.entries),
    h("6. ATE-RMSE Chart", HeadingLevel.HEADING_1),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data: chartPng,
          transformation: { width: 600, height: 300 },
        }),
      ],
    }),
    p(
      `Report generated ${new Date().toISOString()} • V-KAN auto-logger v1`,
      { size: 16 },
    ),
  ];

  const doc = new Document({
    creator: "V-KAN Auto-Logger",
    title: `V-KAN Report Volume ${volume.id}`,
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  return blob;
}

export async function downloadVolume(volume: Volume) {
  const blob = await buildVolumeDocx(volume);
  saveAs(blob, `vkan_report_vol${String(volume.id).padStart(2, "0")}.docx`);
}