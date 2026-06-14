export function MetricChips({ metrics }: { metrics?: Record<string, number> }) {
  if (!metrics) return null;
  const entries = Object.entries(metrics);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([k, v]) => (
        <span
          key={k}
          className="inline-flex items-baseline gap-1 rounded-md border border-border bg-secondary/40 px-2 py-0.5 font-mono text-[10px] text-foreground"
        >
          <span className="text-muted-foreground">{k}</span>
          <span className="font-semibold">
            {typeof v === "number" ? formatNum(v) : String(v)}
          </span>
        </span>
      ))}
    </div>
  );
}

function formatNum(v: number): string {
  if (!isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (v !== 0 && Math.abs(v) < 0.01)) {
    return v.toExponential(2);
  }
  return v.toFixed(Math.abs(v) >= 10 ? 1 : 3);
}