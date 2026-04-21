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
    </AppShell>
  );
};

export default About;