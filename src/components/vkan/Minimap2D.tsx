import { useMemo } from "react";

interface Props {
  trajectory: [number, number, number][];
  keyframes: number[];
  currentFrame: number;
  /** "xy" = top-down (default), "xz" = side view */
  plane?: "xy" | "xz";
}

/**
 * Top-down 2D projection of the camera path.
 * Drawn as inline SVG so it stays crisp at any zoom and avoids a 2nd canvas.
 */
export function Minimap2D({ trajectory, keyframes, currentFrame, plane = "xy" }: Props) {
  const { d, dGhost, kfPts, cursor, bounds, axisLabels } = useMemo(() => {
    const a = plane === "xy" ? 0 : 0;
    const b = plane === "xy" ? 1 : 2;
    const xs = trajectory.map((p) => p[a]);
    const ys = trajectory.map((p) => p[b]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 0.08;
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const W = 100;
    const H = 100;
    const sx = (v: number) =>
      ((v - minX) / w) * (W * (1 - 2 * pad)) + W * pad;
    const sy = (v: number) =>
      H - (((v - minY) / h) * (H * (1 - 2 * pad)) + H * pad);

    const idx = Math.max(0, Math.min(trajectory.length - 1, currentFrame));
    const past = trajectory.slice(0, idx + 1);
    const future = trajectory.slice(idx);

    const toPath = (pts: [number, number, number][]) =>
      pts.length === 0
        ? ""
        : pts
            .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p[a]).toFixed(2)} ${sy(p[b]).toFixed(2)}`)
            .join(" ");

    return {
      d: toPath(past),
      dGhost: toPath(future),
      kfPts: keyframes
        .filter((k) => k < trajectory.length)
        .map((k) => ({
          k,
          x: sx(trajectory[k][a]),
          y: sy(trajectory[k][b]),
          past: k <= idx,
        })),
      cursor: trajectory[idx]
        ? { x: sx(trajectory[idx][a]), y: sy(trajectory[idx][b]) }
        : null,
      bounds: { minX, maxX, minY, maxY },
      axisLabels: plane === "xy" ? { h: "x", v: "y" } : { h: "x", v: "z" },
    };
  }, [trajectory, keyframes, currentFrame, plane]);

  return (
    <div className="relative h-44 w-full overflow-hidden rounded-md border border-border bg-secondary/30">
      <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
        {/* grid */}
        <defs>
          <pattern id="mm-grid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="hsl(222 30% 22%)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#mm-grid)" />

        {/* upcoming path */}
        {dGhost && (
          <path
            d={dGhost}
            fill="none"
            stroke="hsl(222 30% 40%)"
            strokeWidth="0.5"
            strokeDasharray="1 0.8"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {/* past trail */}
        {d && (
          <path
            d={d}
            fill="none"
            stroke="hsl(167 82% 52%)"
            strokeWidth="0.9"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* keyframes */}
        {kfPts.map((p) => (
          <circle
            key={p.k}
            cx={p.x}
            cy={p.y}
            r={p.past ? 1.4 : 0.9}
            fill={p.past ? "hsl(280 80% 65%)" : "hsl(280 30% 45%)"}
            stroke="hsl(280 90% 75%)"
            strokeWidth={p.past ? 0.3 : 0.15}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* cursor */}
        {cursor && (
          <>
            <circle
              cx={cursor.x}
              cy={cursor.y}
              r="2.2"
              fill="hsl(167 82% 52%)"
              opacity="0.25"
            />
            <circle
              cx={cursor.x}
              cy={cursor.y}
              r="1"
              fill="hsl(167 82% 52%)"
              stroke="hsl(167 82% 75%)"
              strokeWidth="0.3"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>

      {/* axis labels */}
      <div className="pointer-events-none absolute left-1.5 top-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        {plane === "xy" ? "top-down · " : "side · "}
        {axisLabels.h}–{axisLabels.v}
      </div>
      <div className="pointer-events-none absolute bottom-1 right-1.5 font-mono text-[9px] tabular-nums text-muted-foreground">
        {axisLabels.h}: [{bounds.minX.toFixed(1)}, {bounds.maxX.toFixed(1)}] ·{" "}
        {axisLabels.v}: [{bounds.minY.toFixed(1)}, {bounds.maxY.toFixed(1)}]
      </div>
    </div>
  );
}
