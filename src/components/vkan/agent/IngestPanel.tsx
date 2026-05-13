import { Panel, Stat } from "@/components/vkan/Panel";
import type { IngestStat } from "./CameraPanel";

export function IngestPanel({ stats }: { stats: IngestStat[] }) {
  const ok = stats.filter((s) => s.ok);
  const drop = stats.length ? Math.round(((stats.length - ok.length) / stats.length) * 100) : 0;
  const avgLat = ok.length ? Math.round(ok.reduce((a, b) => a + b.latency, 0) / ok.length) : 0;
  const last10 = stats.slice(0, 10);
  return (
    <Panel title="Frame Ingestion" subtitle="last 10 thumbnails · upload latency · drop rate">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="frames" value={stats.length} />
        <Stat label="avg latency" value={`${avgLat} ms`} accent="primary" />
        <Stat label="drop %" value={`${drop}`} accent={drop > 10 ? "warn" : undefined} />
      </div>
      <div className="grid grid-cols-5 gap-1">
        {last10.map((s) => (
          <div
            key={s.ts}
            className="aspect-square overflow-hidden rounded border border-border bg-secondary/40"
            title={new Date(s.ts).toLocaleTimeString()}
          >
            {s.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.thumb} alt="frame" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-[10px] text-muted-foreground">
                {s.ok ? "no thumb" : "fail"}
              </div>
            )}
          </div>
        ))}
        {Array.from({ length: Math.max(0, 10 - last10.length) }).map((_, i) => (
          <div key={`ph-${i}`} className="aspect-square rounded border border-dashed border-border/40" />
        ))}
      </div>
    </Panel>
  );
}