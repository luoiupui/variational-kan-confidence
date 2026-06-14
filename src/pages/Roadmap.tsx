import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { CheckCircle2, Circle, Clock } from "lucide-react";

type Status = "done" | "in-progress" | "planned";

const STATUS: Record<Status, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  done: { label: "Done", cls: "text-emerald-500", Icon: CheckCircle2 },
  "in-progress": { label: "In progress", cls: "text-amber-500", Icon: Clock },
  planned: { label: "Planned", cls: "text-muted-foreground", Icon: Circle },
};

const STAGES: Array<{
  id: string;
  title: string;
  status: Status;
  goal: string;
  outputs: string[];
  files: string[];
}> = [
  {
    id: "S0",
    title: "Stage 0 · Static web demo",
    status: "done",
    goal: "Visualise pre-computed JSON results from the offline V-KAN training run.",
    outputs: ["Dashboard charts", "Trajectory 3D viewer", "Free-energy + causal-graph panels"],
    files: [
      "src/pages/Index.tsx — landing dashboard",
      "src/components/vkan/* — all chart and panel components",
      "public/tum_smoke_results.json — bundled offline results",
    ],
  },
  {
    id: "S1",
    title: "Stage 1 · Sweep explorer",
    status: "done",
    goal: "Interactive comparison across hyper-parameter sweeps (λ, KAN-rank, NOTEARS bags).",
    outputs: ["Sweep table", "ATE / RPE vs param charts"],
    files: ["src/pages/Experiments.tsx", "public/sweep_mini_results.json"],
  },
  {
    id: "S2",
    title: "Stage 2 · Cloud backend",
    status: "done",
    goal: "Replace static JSON with a live database so runs accumulate over time.",
    outputs: ["Postgres schema", "RLS policies", "6 edge functions"],
    files: [
      "supabase/migrations/*.sql — tables: runs, frames, sequences, agent_decisions, worker_heartbeats",
      "supabase/functions/{enqueue-run,claim-run,ingest-run,ingest-frame,worker-health,agent-tick}",
      "src/integrations/supabase/client.ts — auto-generated client",
    ],
  },
  {
    id: "S3",
    title: "Stage 3 · Configuration & Agent",
    status: "done",
    goal: "Wire the Micro-ROS bridge so a robot can both feed frames in and read agent decisions.",
    outputs: ["Config page", "Agent decision log", "Frame ingest endpoint"],
    files: [
      "src/pages/Config.tsx, src/pages/Agent.tsx",
      "worker/agent/**, worker/ros_bridge/**",
      "supabase/functions/agent-tick, ingest-frame",
    ],
  },
  {
    id: "S4",
    title: "Stage 4 · Real worker + baselines",
    status: "in-progress",
    goal: "Run V-KAN, ORB-SLAM3, DynaSLAM on real TUM sequences and compare them in the UI.",
    outputs: [
      "Fly.io GPU worker (V-KAN) — running",
      "ORB-SLAM3 baseline — pending GPU",
      "DynaSLAM baseline — Path D, local PC",
      "Research bundle ZIP — done",
    ],
    files: [
      "worker/stage4/poller.py — claims a queued run and dispatches",
      "worker/stage4/run_vkan_real.py — V-KAN runner",
      "worker/stage4/run_{orb3,dynaslam}_baseline.sh — baseline wrappers",
      "worker/stage4/eval_with_evo.py, tum_adapter.py — Umeyama + ATE/RPE",
      "tools/ingest_external_run.py — push local DynaSLAM/ORB-SLAM3 results",
      "src/pages/Stage4.tsx, src/pages/Reports.tsx, src/lib/researchBundle.ts",
    ],
  },
  {
    id: "S5",
    title: "Stage 5 · Local-first deployment",
    status: "planned",
    goal: "Replace Lovable Cloud + Fly.io with a fully local Docker-Compose stack for thesis runs.",
    outputs: ["docker-compose.yml", "LOCAL.md", "supabase start workflow"],
    files: ["See .lovable/plan.md — section 'Migrating the V-KAN project to a fully local PC deployment'"],
  },
];

const FILE_MAP: Array<{ group: string; items: Array<[string, string]> }> = [
  {
    group: "Frontend (React + Vite)",
    items: [
      ["src/pages/", "One file per route. Index = dashboard, Stage4 = run center, Reports = research export."],
      ["src/components/vkan/", "Domain components: charts, trajectory viewer, panels, run-center widgets."],
      ["src/components/ui/", "shadcn primitives. Re-skinned via design tokens in index.css — don't hardcode colors."],
      ["src/lib/", "Pure helpers. researchBundle.ts builds the ZIP; reportLog.ts tracks per-volume runs."],
      ["src/integrations/supabase/", "Auto-generated client and types. Never hand-edit."],
    ],
  },
  {
    group: "Backend (Supabase / Lovable Cloud)",
    items: [
      ["supabase/migrations/", "Append-only SQL. Every CREATE TABLE here also issues GRANT + RLS."],
      ["supabase/functions/enqueue-run/", "Public POST → inserts a row in runs with status='queued'."],
      ["supabase/functions/claim-run/", "Worker pulls oldest queued row and marks it 'running'."],
      ["supabase/functions/ingest-run/", "Worker posts final metrics + trajectories; sets status='done'."],
      ["supabase/functions/ingest-frame/", "Robot/agent uploads RGB-D frames into the agent-frames bucket."],
      ["supabase/functions/worker-health/", "Heartbeat ping → updates worker_heartbeats."],
      ["supabase/functions/agent-tick/", "AI gateway call: scene state → nav/arm command."],
    ],
  },
  {
    group: "Worker (Python, GPU)",
    items: [
      ["worker/stage4/poller.py", "Long-running loop. Calls claim-run, dispatches to method runner, posts ingest-run."],
      ["worker/stage4/run_vkan_real.py", "Wraps the V-KAN PyTorch checkpoint over a TUM sequence."],
      ["worker/stage4/run_orb3_baseline.sh", "Runs ORB-SLAM3 RGB-D binary; emits CameraTrajectory.txt."],
      ["worker/stage4/run_dynaslam_baseline.sh", "Same but DynaSLAM (Mask-RCNN dynamic-object masking)."],
      ["worker/stage4/eval_with_evo.py", "Umeyama alignment + ATE/RPE using evo, returns scalar metrics."],
      ["worker/stage4/tum_adapter.py", "Parses TUM associate-format groundtruth + RGB-D timestamps."],
      ["worker/agent/, worker/ros_bridge/", "Optional Micro-ROS bridge for live robot demos."],
      ["worker/Dockerfile + fly.toml", "Cloud deploy. Replaced by docker-compose.yml in local mode."],
    ],
  },
  {
    group: "Tools & docs",
    items: [
      ["tools/ingest_external_run.py", "Push results from a locally-run SLAM (DynaSLAM on your PC) into the DB."],
      ["tools/README.md, worker/stage4/INGEST.md", "How to format trajectories and call ingest-run."],
      [".lovable/plan.md", "Current approved plan (right now: local-deployment migration)."],
    ],
  },
];

const GLOSSARY: Array<{ term: string; body: string }> = [
  {
    term: "SLAM (Simultaneous Localisation And Mapping)",
    body:
      "A robot moves through an unknown environment and must, at the same time, (a) estimate its own 6-DoF pose and (b) build a map of landmarks. RGB-D SLAM uses a depth camera so the map is metric (real centimetres), not just up-to-scale.",
  },
  {
    term: "Keyframe",
    body:
      "Not every camera frame is kept. The system selects a sparse subset — keyframes — at moments when the view changes enough to add new information. Bundle adjustment then optimises only over keyframes, which keeps SLAM real-time.",
  },
  {
    term: "ATE / RPE",
    body:
      "Absolute Trajectory Error: RMSE between the estimated trajectory and groundtruth after rigid alignment (Umeyama). Relative Pose Error: drift accumulated per second. These are the two numbers a SLAM paper lives or dies by.",
  },
  {
    term: "Umeyama alignment",
    body:
      "Closed-form similarity transform (rotation + translation + optional scale) that best maps one point cloud onto another in a least-squares sense. We apply it before ATE so two trajectories are compared in the same frame.",
  },
  {
    term: "ORB-SLAM3 (baseline)",
    body:
      "Feature-based SLAM that tracks ORB keypoints. State of the art on static scenes, but fails when many of those keypoints sit on a moving person — typical for TUM fr3/walking sequences.",
  },
  {
    term: "DynaSLAM (baseline)",
    body:
      "Adds a Mask-RCNN segmentation pass that masks pixels belonging to a-priori dynamic classes (people, cars). ORB features inside those masks are dropped before pose estimation. Robust but heavy: needs a GPU per frame.",
  },
  {
    term: "V-KAN (ours)",
    body:
      "A variational encoder built from Kolmogorov–Arnold layers produces a low-dimensional scene state. Instead of segmenting pixels, we detect when the causal graph between scene variables changes — that change is the trigger for a new keyframe and for down-weighting unreliable features.",
  },
  {
    term: "Free-energy signal",
    body:
      "The variational lower bound (ELBO) reinterpreted as 'surprise'. A spike means the current frame is poorly explained by the previous keyframe → likely a dynamic event → emit a new keyframe.",
  },
  {
    term: "Bagged NOTEARS",
    body:
      "NOTEARS learns a DAG over scene variables by minimising an acyclicity-constrained loss. We bag it over short temporal windows and watch for edges that flip on/off — those are the causal changes that gate keyframe selection.",
  },
  {
    term: "TUM RGB-D benchmark",
    body:
      "Standard dataset (TU Munich) with synchronised RGB + depth + millimetre-accurate motion-capture groundtruth. The fr3/walking_* sequences contain two people walking and are the canonical stress test for dynamic SLAM.",
  },
];

function StatusBadge({ status }: { status: Status }) {
  const { label, cls, Icon } = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${cls}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

const Roadmap = () => {
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          Project roadmap & tutorial
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A guided tour for new collaborators. Start at Stage&nbsp;0, follow the file map, and use
          the glossary at the bottom to decode any SLAM-specific jargon you hit in the codebase or
          the research bundle.
        </p>
      </header>

      <div className="grid gap-4">
        <Panel title="1 · Stages" subtitle="Each stage is a self-contained milestone">
          <ol className="space-y-3">
            {STAGES.map((s) => (
              <li
                key={s.id}
                className="rounded-md border border-border bg-secondary/30 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-sm font-semibold">{s.title}</div>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{s.goal}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Outputs
                    </div>
                    <ul className="mt-1 list-disc pl-4 text-xs">
                      {s.outputs.map((o) => (
                        <li key={o}>{o}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Key files
                    </div>
                    <ul className="mt-1 list-disc pl-4 font-mono text-[11px]">
                      {s.files.map((f) => (
                        <li key={f}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel
          title="2 · File organisation"
          subtitle="Where to look when you need to change something"
        >
          <div className="grid gap-4 md:grid-cols-2">
            {FILE_MAP.map((g) => (
              <div key={g.group}>
                <div className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">
                  {g.group}
                </div>
                <ul className="space-y-1.5 text-xs">
                  {g.items.map(([path, desc]) => (
                    <li key={path} className="leading-relaxed">
                      <code className="font-mono text-foreground/90">{path}</code>
                      <span className="text-muted-foreground"> — {desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="3 · End-to-end run, step by step"
          subtitle="What happens when you click Enqueue in the Run Center"
        >
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-relaxed">
            <li>
              UI calls <code className="font-mono">enqueue-run</code> with{" "}
              <code className="font-mono">{`{ sequence_id, method }`}</code>. A row appears in{" "}
              <code className="font-mono">runs</code> with{" "}
              <code className="font-mono">status='queued'</code>.
            </li>
            <li>
              The worker poller (Fly machine or local Python) hits{" "}
              <code className="font-mono">claim-run</code> every few seconds. The oldest queued row
              is atomically flipped to <code className="font-mono">running</code> and returned to
              that worker only.
            </li>
            <li>
              Poller dispatches by method:{" "}
              <code className="font-mono">run_vkan_real.py</code>,{" "}
              <code className="font-mono">run_orb3_baseline.sh</code>, or{" "}
              <code className="font-mono">run_dynaslam_baseline.sh</code>. Each emits a TUM-format
              trajectory file plus per-frame logs.
            </li>
            <li>
              <code className="font-mono">eval_with_evo.py</code> reads groundtruth, runs Umeyama
              alignment, and computes ATE-RMSE, RPE, drift-per-sec, plus per-frame ATE and
              free-energy series.
            </li>
            <li>
              Poller POSTs everything to <code className="font-mono">ingest-run</code> (signed with{" "}
              <code className="font-mono">WORKER_INGEST_SECRET</code>), which updates the row to{" "}
              <code className="font-mono">status='done'</code> with all metrics + arrays inline.
            </li>
            <li>
              UI subscribes to the <code className="font-mono">runs</code> table; the Run Center,
              Stage 4 comparison, and Reports page all re-render automatically.
            </li>
            <li>
              From <em>Reports</em> you download a per-volume{" "}
              <strong>research bundle ZIP</strong> containing CSVs, TUM trajectories, raw chart
              data, and a DOCX report — suitable as a thesis appendix.
            </li>
          </ol>
        </Panel>

        <Panel
          title="4 · SLAM concepts referenced in this project"
          subtitle="Glossary for non-SLAM readers"
        >
          <dl className="grid gap-3 md:grid-cols-2">
            {GLOSSARY.map((g) => (
              <div
                key={g.term}
                className="rounded-md border border-border bg-secondary/20 p-3"
              >
                <dt className="font-mono text-xs font-semibold">{g.term}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{g.body}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="5 · Where to go next" subtitle="Pointers for common tasks">
          <ul className="space-y-1.5 text-xs leading-relaxed">
            <li>
              <strong>Add a new SLAM method:</strong> create{" "}
              <code className="font-mono">worker/stage4/run_&lt;method&gt;_baseline.sh</code>,
              register it in <code className="font-mono">poller.py</code>'s dispatch table, then
              add the option in the Run Center dropdown.
            </li>
            <li>
              <strong>Add a new sequence:</strong> insert a row into{" "}
              <code className="font-mono">public.sequences</code> via a migration; it appears
              automatically in the UI.
            </li>
            <li>
              <strong>Run fully offline:</strong> follow{" "}
              <code className="font-mono">.lovable/plan.md</code> — Supabase CLI + local GPU.
            </li>
            <li>
              <strong>Push DynaSLAM results from your PC:</strong> see{" "}
              <code className="font-mono">tools/ingest_external_run.py</code> and{" "}
              <code className="font-mono">tools/README.md</code>.
            </li>
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
};

export default Roadmap;