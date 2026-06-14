import { Link } from "react-router-dom";
import { Panel } from "@/components/vkan/Panel";
import { MetricChips } from "./MetricChips";
import { figureUrl, type ResultRun } from "@/types/result";
import { AlertTriangle, ArrowRight } from "lucide-react";

export function ResultCard({ run }: { run: ResultRun }) {
  if (run.error) {
    return (
      <Panel
        title={run.id}
        subtitle="invalid meta.json"
        className="border-amber-500/50"
      >
        <div className="flex items-start gap-2 text-[12px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <code className="font-mono">{run.error}</code>
        </div>
      </Panel>
    );
  }

  const cover = run.figures?.[0];
  const extra = (run.figures?.length ?? 0) - 1;

  return (
    <Panel
      title={run.title}
      subtitle={[run.date, run.dataset, run.sequence].filter(Boolean).join(" · ")}
      right={
        <Link
          to={`/results/${encodeURIComponent(run.id)}`}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          open <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="space-y-3">
        {cover && (
          <Link to={`/results/${encodeURIComponent(run.id)}`} className="block">
            <img
              src={figureUrl(run.id, cover.file)}
              alt={cover.caption || cover.file}
              className="w-full rounded-md border border-border bg-secondary/30 object-contain"
              loading="lazy"
            />
          </Link>
        )}
        {run.description && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            {run.description}
          </p>
        )}
        <MetricChips metrics={run.metrics} />
        {(run.tags?.length || extra > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {run.tags?.map((t) => (
              <span
                key={t}
                className="rounded-full border border-border px-2 py-0.5 font-mono"
              >
                #{t}
              </span>
            ))}
            {extra > 0 && <span>+{extra} more figure{extra === 1 ? "" : "s"}</span>}
          </div>
        )}
      </div>
    </Panel>
  );
}