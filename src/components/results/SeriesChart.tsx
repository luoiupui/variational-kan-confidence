import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { seriesUrl } from "@/types/result";

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4"];

export function SeriesChart({
  runId,
  file,
  height = 220,
}: {
  runId: string;
  file: string;
  height?: number;
}) {
  const [data, setData] = useState<Record<string, number[]> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(seriesUrl(runId, file))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => !cancelled && setData(j))
      .catch((e) => !cancelled && setErr(String(e)));
    return () => {
      cancelled = true;
    };
  }, [runId, file]);

  if (err) {
    return (
      <div className="rounded-md border border-border bg-secondary/30 p-3 text-[11px] text-muted-foreground">
        Could not load series: {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="h-[220px] animate-pulse rounded-md bg-secondary/40" />
    );
  }

  const keys = Object.keys(data);
  const n = Math.max(...keys.map((k) => data[k]?.length ?? 0));
  const rows = Array.from({ length: n }, (_, i) => {
    const row: Record<string, number> = { i };
    for (const k of keys) row[k] = data[k]?.[i] ?? NaN;
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeOpacity={0.15} />
        <XAxis dataKey="i" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            fontSize: 11,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={PALETTE[i % PALETTE.length]}
            dot={false}
            strokeWidth={1.5}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}