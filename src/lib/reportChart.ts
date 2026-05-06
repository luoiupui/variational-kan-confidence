// Renders a simple ATE-RMSE bar chart per method into a PNG ArrayBuffer
// for embedding in the DOCX report. Pure canvas, no dependencies.

import type { LogEntry } from "./reportLog";

const COLORS: Record<string, string> = {
  vkan: "#22c55e",
  orb3: "#f59e0b",
  dynaslam: "#a855f7",
};

export async function renderAteChartPng(entries: LogEntry[]): Promise<Uint8Array> {
  const runs = entries.filter(
    (e): e is Extract<LogEntry, { kind: "run" }> =>
      e.kind === "run" && e.status === "done" && !!e.metrics?.ate_rmse,
  );
  // group by sequence then method
  const seqs = Array.from(new Set(runs.map((r) => r.sequence_name))).sort();
  const methods = ["vkan", "orb3", "dynaslam"];

  const W = 1000;
  const H = 500;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText("ATE-RMSE per sequence (lower is better)", 20, 28);

  if (seqs.length === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "14px sans-serif";
    ctx.fillText("No completed runs yet.", 20, 60);
    return canvasToPng(canvas);
  }

  // axes
  const padL = 60, padR = 20, padT = 50, padB = 80;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let maxV = 0;
  for (const r of runs) maxV = Math.max(maxV, r.metrics?.ate_rmse ?? 0);
  maxV = maxV > 0 ? maxV * 1.15 : 1;

  // y axis
  ctx.strokeStyle = "#cbd5e1";
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  ctx.fillStyle = "#475569";
  ctx.font = "11px sans-serif";
  for (let i = 0; i <= 4; i++) {
    const v = (maxV * i) / 4;
    const y = padT + plotH - (plotH * i) / 4;
    ctx.fillText(v.toFixed(3), 8, y + 4);
    ctx.strokeStyle = "#e2e8f0";
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  const groupW = plotW / seqs.length;
  const barW = Math.min(28, (groupW - 12) / methods.length);

  seqs.forEach((seq, gi) => {
    const gx = padL + gi * groupW + (groupW - barW * methods.length) / 2;
    methods.forEach((m, mi) => {
      const r = runs.find((x) => x.sequence_name === seq && x.method === m);
      const v = r?.metrics?.ate_rmse;
      if (v == null) return;
      const h = (v / maxV) * plotH;
      const x = gx + mi * barW;
      const y = padT + plotH - h;
      ctx.fillStyle = COLORS[m] ?? "#64748b";
      ctx.fillRect(x, y, barW - 2, h);
    });
    ctx.save();
    ctx.fillStyle = "#0f172a";
    ctx.font = "10px monospace";
    ctx.translate(padL + gi * groupW + groupW / 2, padT + plotH + 8);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "right";
    ctx.fillText(seq, 0, 8);
    ctx.restore();
  });

  // legend
  let lx = padL;
  const ly = H - 20;
  methods.forEach((m) => {
    ctx.fillStyle = COLORS[m];
    ctx.fillRect(lx, ly - 10, 12, 12);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px sans-serif";
    ctx.fillText(m.toUpperCase(), lx + 18, ly);
    lx += 110;
  });

  return canvasToPng(canvas);
}

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}