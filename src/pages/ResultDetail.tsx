import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { MetricChips } from "@/components/results/MetricChips";
import { SeriesChart } from "@/components/results/SeriesChart";
import { figureUrl, type ResultsIndex } from "@/types/result";
import { ArrowLeft } from "lucide-react";

async function fetchIndex(): Promise<ResultsIndex> {
  const r = await fetch("/results-index.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const ResultDetail = () => {
  const { runId = "" } = useParams<{ runId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ["results-index"],
    queryFn: fetchIndex,
  });

  const run = data?.runs.find((r) => r.id === runId);

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          to="/results"
          className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> back to results
        </Link>

        {isLoading && (
          <div className="h-32 animate-pulse rounded-lg bg-secondary/40" />
        )}

        {!isLoading && !run && (
          <Panel title="Not found">
            <p className="text-[13px] text-muted-foreground">
              No run with id{" "}
              <code className="font-mono text-foreground/80">{runId}</code> was
              found in <code>/results-index.json</code>.
            </p>
          </Panel>
        )}

        {run && (
          <>
            <header className="space-y-2">
              <h1 className="font-mono text-2xl font-semibold tracking-tight">
                {run.title}
              </h1>
              <div className="text-[12px] text-muted-foreground">
                {[run.date, run.dataset, run.sequence].filter(Boolean).join(" · ")}
              </div>
              {run.description && (
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {run.description}
                </p>
              )}
              <MetricChips metrics={run.metrics} />
            </header>

            {run.series && (
              <Panel title="Series" subtitle={run.series}>
                <SeriesChart runId={run.id} file={run.series} height={280} />
              </Panel>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {run.figures?.map((f) => (
                <Panel key={f.file} title={f.file} subtitle={f.caption}>
                  <img
                    src={figureUrl(run.id, f.file)}
                    alt={f.caption || f.file}
                    className="w-full rounded-md border border-border bg-secondary/30 object-contain"
                  />
                </Panel>
              ))}
            </div>

            <Panel title="Raw meta.json">
              <pre className="overflow-x-auto rounded-md bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed">
                {JSON.stringify(run, null, 2)}
              </pre>
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
};

export default ResultDetail;