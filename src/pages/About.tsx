import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { StageList } from "@/components/vkan/StageList";

const About = () => {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">About this demo</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          V-KAN Dynamic SLAM is a research prototype combining a KAN-style variational
          encoder with bagged-NOTEARS causal-graph change detection to drive keyframe
          selection in dynamic scenes.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pipeline stages" subtitle="From training → web demo → planned work">
          <StageList />
        </Panel>
        <Panel title="How the panels connect" subtitle="Data flow diagram">
          <pre className="overflow-x-auto rounded bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed">
{`ORB tracks ─┐
            ▼
   data/orb_adapter.py
            │  (7-D scene state)
            ▼
   slam/free_energy ─────► FreeEnergyChart
            │
            ▼
   causal/notears_bagged ─► CausalHeatmap
            │
            ▼
   keyframe trigger ──────► Trajectory3D (kf spheres)
            │
            ▼
   tum_smoke_results.json ─► Dashboard / Experiments
`}
          </pre>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          title="Methodology"
          subtitle="Proposed method, baselines, and evaluation protocol"
        >
          <div className="grid gap-4 text-sm md:grid-cols-3">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-signal-fe">
                proposed
              </div>
              <div className="font-mono text-sm font-semibold">V-KAN Dynamic SLAM</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                KAN-style variational free-energy encoder + bagged-NOTEARS causal change
                detection driving keyframe selection. The full system under test in
                Stages 1–3.
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                baseline · stage 4
              </div>
              <div className="font-mono text-sm font-semibold">ORB-SLAM3</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                The classical SOTA visual-SLAM baseline. Compared head-to-head on TUM
                RGB-D using <code className="font-mono text-foreground/80">evo</code> for
                ATE-RMSE, RPE-translation and RPE-rotation.
              </p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 p-3">
              <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                optional · stage 4b
              </div>
              <div className="font-mono text-sm font-semibold">DynaSLAM</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Dynamic-scene baseline (Mask R-CNN + multi-view geometry). Included only
                if Stage 4 results warrant a dynamic-aware comparison on the
                <code className="ml-1 font-mono text-foreground/80">fr3/walking_*</code>{" "}
                sequences.
              </p>
            </div>
          </div>
          <div className="mt-3 rounded border border-border bg-background/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-foreground/80">Evaluation:</span> TUM RGB-D · ATE-RMSE
            (m), RPE-trans (m/s), RPE-rot (°/s), tracked-frames (%) — computed with
            <code className="mx-1 text-foreground/80">evo_ape</code>/
            <code className="text-foreground/80">evo_rpe</code> against ground-truth
            poses. Each method run 5× per sequence, median reported.
          </div>
        </Panel>
      </div>
    </AppShell>
  );
};

export default About;