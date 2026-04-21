export interface VkanResults {
  fe: number[];
  keyframes: number[];
  labels: string[];
  adjacency: number[][];
  trajectory: [number, number, number][];
  metrics: {
    precision: number;
    recall: number;
    f1: number;
    fe_mean: number;
    fe_std: number;
  };
  best_config: { B: number; agree: number; K: number; buffer: number };
}

export const STAGE_INFO = [
  {
    id: 1,
    name: "Stage 1 — Synthetic Training",
    status: "complete" as const,
    summary:
      "PyTorch training on 7-D synthetic scene state. Variational free energy minimisation with KAN-style basis. Recall 1.00 / Precision 0.20 baseline.",
    artifacts: ["train_synthetic.py", "results.json", "free_energy.png"],
  },
  {
    id: 2,
    name: "Stage 2 — Bagged-NOTEARS + TUM smoke",
    status: "complete" as const,
    summary:
      "Bootstrap-aggregated NOTEARS (B=8, agree=0.7) for causal change detection. End-to-end smoke test on simulated ORB stream (200 frames, 5 keyframes).",
    artifacts: [
      "causal/notears_bagged.py",
      "data/orb_adapter.py",
      "run_tum_smoke.py",
      "tum_smoke_results.json",
      "sweep_mini_results.json",
    ],
  },
  {
    id: 3,
    name: "Stage 3 — Web Demo (this app)",
    status: "active" as const,
    summary:
      "Live dashboard: free-energy curve, causal adjacency heatmap, 3D trajectory, experiment runner and configuration panel.",
    artifacts: ["src/pages/Index.tsx", "src/components/vkan/*"],
  },
  {
    id: 4,
    name: "Stage 4 — Real TUM RGB-D (planned)",
    status: "planned" as const,
    summary:
      "Run the full pipeline on real TUM RGB-D sequences with ORB-SLAM3 front-end. Add ATE / RPE benchmarking against ORB-SLAM3 baseline.",
    artifacts: [],
  },
  {
    id: 5,
    name: "Stage 5 — Online graph debouncing (planned)",
    status: "planned" as const,
    summary:
      "Consecutive-N debouncing on bagged-NOTEARS consensus DAG to push precision up while keeping recall.",
    artifacts: [],
  },
];