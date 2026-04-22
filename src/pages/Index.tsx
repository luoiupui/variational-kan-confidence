import { AppShell } from "@/components/vkan/AppShell";
import { Panel, Stat } from "@/components/vkan/Panel";
import { FreeEnergyChart } from "@/components/vkan/FreeEnergyChart";
import { CausalHeatmap } from "@/components/vkan/CausalHeatmap";
import { Trajectory3D } from "@/components/vkan/Trajectory3D";
import { Minimap2D } from "@/components/vkan/Minimap2D";
import { StageList } from "@/components/vkan/StageList";
import { PlaybackControls } from "@/components/vkan/PlaybackControls";
import { RunCenter } from "@/components/vkan/RunCenter";
import { useVkanResults } from "@/hooks/useVkanResults";
import { usePlayhead } from "@/hooks/usePlayhead";
import { Badge } from "@/components/ui/badge";

const Index = () => {
  const { data, error } = useVkanResults();
  const total = data?.fe.length ?? 1;
  const ph = usePlayhead(total, 1);
  const isKf =
    data?.keyframes.some((k) => Math.abs(k - ph.frame) < 3) ?? false;

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
          <Badge variant="outline" className="border-primary/40 text-primary">
            V-KAN only · ORB-SLAM3 cmp @ stage 4
          </Badge>
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
              subtitle="Variational FE per frame · purple = keyframes · cyan = playhead"
              className="lg:col-span-2"
            >
              <FreeEnergyChart fe={data.fe} keyframes={data.keyframes} cursor={ph.frame} />
            </Panel>

            <Panel title="Pipeline Stages" subtitle="Click Restart/Start to re-run any stage with the current config">
              <StageList showRestart />
            </Panel>

            <RunCenter />

            <Panel
              title="3D Trajectory · Live Replay"
              subtitle="Cone = current pose · trail grows as time advances · keyframes pop on crossing"
              className="lg:col-span-3"
            >
              <Trajectory3D
                trajectory={data.trajectory}
                keyframes={data.keyframes}
                currentFrame={ph.frame}
                showViewToggle
              />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    top-down (x–y) · spot lateral drift
                  </div>
                  <Minimap2D
                    trajectory={data.trajectory}
                    keyframes={data.keyframes}
                    currentFrame={ph.frame}
                    plane="xy"
                  />
                </div>
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    side (x–z) · spot z-axis ambiguity
                  </div>
                  <Minimap2D
                    trajectory={data.trajectory}
                    keyframes={data.keyframes}
                    currentFrame={ph.frame}
                    plane="xz"
                  />
                </div>
              </div>
              <PlaybackControls
                playing={ph.playing}
                frame={ph.frame}
                total={total}
                speed={ph.speed}
                onPlay={ph.play}
                onPause={ph.pause}
                onReset={ph.reset}
                onSeek={ph.setFrame}
                onSpeed={ph.setSpeed}
                isKeyframe={isKf}
              />
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
