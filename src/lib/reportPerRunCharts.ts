// Per-run canvas chart renderers used to embed thumbnails in the DOCX:
//   - renderTrajectoryPng(): top-down 2D projection (X vs Y) of V-KAN estimate
//     vs ground-truth, with keyframe ticks
//   - renderFePng(): free-energy time series with keyframe markers

function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error("toBlob failed"));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, "image/png");
  });
}

export async function renderTrajectoryPng(
  est: [number, number, number][] | null | undefined,
  gt: [number, number, number][] | null | undefined,
  keyframes: number[] | null | undefined,
  title: string,
): Promise<Uint8Array> {
  const W = 640, H = 360;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(title, 12, 20);

  const all = [...(est ?? []), ...(gt ?? [])];
  if (all.length < 2) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px sans-serif";
    ctx.fillText("No trajectory data recorded.", 12, 44);
    return canvasToPng(canvas);
  }

  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const padL = 40, padR = 16, padT = 32, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const sc = Math.min(plotW / spanX, plotH / spanY);
  const ox = padL + (plotW - sc * spanX) / 2;
  const oy = padT + (plotH - sc * spanY) / 2;
  const px = (p: [number, number, number]) => ox + (p[0] - minX) * sc;
  const py = (p: [number, number, number]) => padT + plotH - ((p[1] - minY) * sc + (plotH - sc * spanY) / 2);

  ctx.strokeStyle = "#e2e8f0";
  ctx.strokeRect(padL, padT, plotW, plotH);

  const drawLine = (pts: [number, number, number][], color: string, dash: number[]) => {
    if (pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(px(pts[0]), py(pts[0]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i]), py(pts[i]));
    ctx.stroke();
    ctx.restore();
  };

  if (gt && gt.length > 1) drawLine(gt, "#94a3b8", [4, 3]);
  if (est && est.length > 1) drawLine(est, "#22c55e", []);

  if (est && keyframes && keyframes.length) {
    ctx.fillStyle = "#a855f7";
    for (const k of keyframes) {
      const p = est[k];
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(px(p), py(p), 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = "10px sans-serif";
  ctx.fillText("V-KAN", padL, H - 10);
  ctx.fillStyle = "#22c55e";
  ctx.fillRect(padL + 36, H - 18, 12, 3);
  ctx.fillStyle = "#0f172a";
  ctx.fillText("GT", padL + 60, H - 10);
  ctx.fillStyle = "#94a3b8";
  ctx.fillRect(padL + 76, H - 18, 12, 3);
  ctx.fillStyle = "#0f172a";
  ctx.fillText("KF", padL + 100, H - 10);
  ctx.fillStyle = "#a855f7";
  ctx.beginPath(); ctx.arc(padL + 120, H - 14, 3, 0, Math.PI * 2); ctx.fill();

  return canvasToPng(canvas);
}

export async function renderFePng(
  fe: number[] | null | undefined,
  keyframes: number[] | null | undefined,
  title: string,
): Promise<Uint8Array> {
  const W = 640, H = 220;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText(title, 12, 20);

  if (!fe || fe.length < 2) {
    ctx.fillStyle = "#64748b"; ctx.font = "12px sans-serif";
    ctx.fillText("No FE series recorded.", 12, 44);
    return canvasToPng(canvas);
  }

  const padL = 44, padR = 12, padT = 30, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const minV = Math.min(...fe), maxV = Math.max(...fe);
  const span = maxV - minV || 1;

  ctx.strokeStyle = "#e2e8f0";
  ctx.strokeRect(padL, padT, plotW, plotH);

  ctx.fillStyle = "#475569"; ctx.font = "10px sans-serif";
  ctx.fillText(maxV.toFixed(2), 6, padT + 8);
  ctx.fillText(minV.toFixed(2), 6, padT + plotH);

  if (keyframes && keyframes.length) {
    ctx.strokeStyle = "#a855f7";
    ctx.setLineDash([3, 3]);
    for (const k of keyframes) {
      const x = padL + (k / (fe.length - 1)) * plotW;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  fe.forEach((v, i) => {
    const x = padL + (i / (fe.length - 1)) * plotW;
    const y = padT + plotH - ((v - minV) / span) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  return canvasToPng(canvas);
}