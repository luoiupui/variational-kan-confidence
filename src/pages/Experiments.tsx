import { useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel, Stat } from "@/components/vkan/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVkanResults } from "@/hooks/useVkanResults";
import { Play, CheckCircle2, Hourglass } from "lucide-react";

interface ExpRow {
  id: string;
  stage: number;
  name: string;
  status: "complete" | "queued" | "running";
  metric: string;
  config: string;
}

const SEED: ExpRow[] = [
  { id: "s1-base", stage: 1, name: "Synthetic baseline (T=300)", status: "complete", metric: "P=0.20 R=1.00", config: "B=8 a=0.7 K=20 buf=30" },
  { id: "s2-mini-a", stage: 2, name: "Mini-sweep · cfg-A", status: "complete", metric: "P=0.20 R=1.00 F1=0.333", config: "B=8 a=0.7 K=20 buf=30" },
  { id: "s2-mini-b", stage: 2, name: "Mini-sweep · cfg-B", status: "complete", metric: "P=0.20 R=1.00 F1=0.333", config: "B=12 a=0.8 K=20 buf=30" },
  { id: "s2-mini-c", stage: 2, name: "Mini-sweep · cfg-C", status: "complete", metric: "P=0.00 R=0.00 F1=0.000", config: "B=8 a=0.7 K=30 buf=40" },
  { id: "s2-tum",   stage: 2, name: "TUM smoke (simulated ORB)", status: "complete", metric: "5 keyframes · FE 97.3±12", config: "B=8 a=0.8 K=20 buf=30" },
  { id: "s4-tum-real", stage: 4, name: "TUM RGB-D fr1/desk", status: "queued", metric: "—", config: "B=8 a=0.7 K=20 buf=30" },
  { id: "s5-debounce", stage: 5, name: "Consecutive-N debounce", status: "queued", metric: "—", config: "N=2 over consensus" },
];

const Experiments = () => {
  const { data } = useVkanResults();
  const [rows, setRows] = useState(SEED);

  const launch = (id: string) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "running" } : r)));
    setTimeout(() => {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: "complete", metric: "simulated · pending real run" } : r)));
    }, 1200);
  };

  const counts = {
    complete: rows.filter((r) => r.status === "complete").length,
    queued: rows.filter((r) => r.status === "queued").length,
    running: rows.filter((r) => r.status === "running").length,
  };

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">Experiments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Experiment registry across all stages. Completed runs are read from the on-disk
          artifacts; queued runs can be simulated here while the offline pipeline executes.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <Stat label="complete" value={counts.complete} accent="primary" />
        <Stat label="running" value={counts.running} accent="accent" />
        <Stat label="queued" value={counts.queued} accent="warn" />
      </div>

      <Panel title="Runs" subtitle="Click ▶ on a queued row to simulate dispatch">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3">Stage</th>
                <th className="py-2 pr-3">Run</th>
                <th className="py-2 pr-3">Configuration</th>
                <th className="py-2 pr-3">Metric</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/40">
                  <td className="py-2 pr-3 font-mono text-xs">S{r.stage}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{r.config}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{r.metric}</td>
                  <td className="py-2 pr-3">
                    {r.status === "complete" && (
                      <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        complete
                      </Badge>
                    )}
                    {r.status === "queued" && (
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        <Hourglass className="mr-1 h-3 w-3" />
                        queued
                      </Badge>
                    )}
                    {r.status === "running" && (
                      <Badge variant="outline" className="border-signal-causal/40 text-signal-causal">
                        running…
                      </Badge>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {r.status === "queued" && (
                      <Button size="sm" variant="outline" onClick={() => launch(r.id)}>
                        <Play className="mr-1 h-3 w-3" /> Run
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {data && (
        <Panel
          title="Best configuration (auto-loaded)"
          subtitle="Picked from sweep_mini_results.json · best.json"
          className="mt-4"
        >
          <pre className="overflow-x-auto rounded bg-secondary/40 p-3 font-mono text-xs">
{JSON.stringify({ best_config: data.best_config, metrics: data.metrics }, null, 2)}
          </pre>
        </Panel>
      )}
    </AppShell>
  );
};

export default Experiments;