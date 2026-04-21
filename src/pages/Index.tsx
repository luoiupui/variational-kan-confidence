import { AppShell } from "@/components/vkan/AppShell";
import { Panel, Stat } from "@/components/vkan/Panel";
import { FreeEnergyChart } from "@/components/vkan/FreeEnergyChart";
import { CausalHeatmap } from "@/components/vkan/CausalHeatmap";
import { Trajectory3D } from "@/components/vkan/Trajectory3D";
import { StageList } from "@/components/vkan/StageList";
import { useVkanResults } from "@/hooks/useVkanResults";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const { data, error } = useVkanResults();

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            V-KAN Dynamic SLAM Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Live results from the Stage-2 bagged-NOTEARS pipeline applied to a 200-frame
            simulated ORB stream. Free energy, causal structure and 3-D trajectory are
            shown side-by-side.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
            stage 2 ✓
          </Badge>
          <Badge variant="outline" className="border-signal-causal/40 text-signal-causal">
            stage 3 active
          </Badge>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Failed to load results: {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="precision" value={data.metrics.precision.toFixed(2)} accent="primary" />
            <Stat label="recall" value={data.metrics.recall.toFixed(2)} accent="primary" />
            <Stat label="F1" value={data.metrics.f1.toFixed(3)} />
            <Stat label="FE mean" value={data.metrics.fe_mean.toFixed(1)} accent="accent" />
            <Stat label="FE std" value={data.metrics.fe_std.toFixed(1)} hint="lower = stabler" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel
              title="Free Energy"
              subtitle="Variational FE per frame · purple lines = detected keyframes"
              className="lg:col-span-2"
            >
              <FreeEnergyChart fe={data.fe} keyframes={data.keyframes} />
            </Panel>

            <Panel title="Pipeline Stages" subtitle="Click Restart/Start to re-run any stage with the current config">
              <StageList showRestart />
            </Panel>

            <Panel
              title="3D Trajectory"
              subtitle="Camera path · spheres = keyframes · cone = current pose"
              className="lg:col-span-2"
            >
              <Trajectory3D trajectory={data.trajectory} keyframes={data.keyframes} />
            </Panel>

            <Panel
              title="Causal Adjacency"
              subtitle={`Bagged-NOTEARS consensus (B=${data.best_config.B}, agree=${data.best_config.agree})`}
            >
              <CausalHeatmap adjacency={data.adjacency} labels={data.labels} />
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
};

export default Index;
