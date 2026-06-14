import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { ResultCard } from "@/components/results/ResultCard";
import type { ResultsIndex } from "@/types/result";
import { Terminal } from "lucide-react";

async function fetchIndex(): Promise<ResultsIndex> {
  const r = await fetch("/results-index.json", { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

const Results = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["results-index"],
    queryFn: fetchIndex,
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">
              Results
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Auto-discovered from{" "}
              <code className="font-mono text-foreground/80">docs/results/</code>.
              Producer scripts drop a folder with <code>meta.json</code> + PNGs
              and it appears here on next reload — no UI changes needed.
            </p>
          </div>
          {data && (
            <div className="text-right text-[11px] text-muted-foreground">
              <div>{data.runs.length} run{data.runs.length === 1 ? "" : "s"}</div>
              <div>indexed {new Date(data.generatedAt).toLocaleString()}</div>
            </div>
          )}
        </header>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-lg bg-secondary/40" />
            ))}
          </div>
        )}

        {error && (
          <Panel title="Failed to load results-index.json">
            <code className="font-mono text-[12px] text-destructive">
              {String(error)}
            </code>
          </Panel>
        )}

        {data && data.runs.length === 0 && <EmptyState />}

        {data && data.runs.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.runs.map((run) => (
              <ResultCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

function EmptyState() {
  const cmd =
    "python tools/vkan_demo.py --out-run 2026-06-14_synthetic --emit-results";
  return (
    <Panel title="No results yet" subtitle="Run a producer script to populate this page">
      <div className="space-y-3 text-[13px] text-muted-foreground">
        <p>
          Any folder under{" "}
          <code className="font-mono text-foreground/80">docs/results/</code>{" "}
          that contains a valid{" "}
          <code className="font-mono text-foreground/80">meta.json</code> appears
          here automatically.
        </p>
        <div className="flex items-start gap-2 rounded-md border border-border bg-secondary/40 p-3">
          <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <code className="select-all break-all font-mono text-[11px] text-foreground">
            {cmd}
          </code>
        </div>
        <p>
          See{" "}
          <code className="font-mono text-foreground/80">docs/results/README.md</code>{" "}
          for the folder contract and{" "}
          <code className="font-mono text-foreground/80">tools/results_writer.py</code>{" "}
          for the single Python helper every script should use.
        </p>
      </div>
    </Panel>
  );
}

export default Results;