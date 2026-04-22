/**
 * Stage-4 result schema (real TUM RGB-D evaluation).
 * Emitted by worker/stage4/eval_with_evo.py and consumed by /stage4 page.
 */

export interface RealSequenceResult {
  /** TUM sequence id, e.g. "fr1/xyz" */
  id: string;
  name: string;
  frames: number;
  /** Estimated trajectory in evo-aligned frame: [x, y, z] per frame. */
  trajectory_est: [number, number, number][];
  /** Ground truth trajectory (already time-synced with est). */
  trajectory_gt: [number, number, number][];
  /** Optional ORB-SLAM3 baseline trajectory (Step B). */
  trajectory_orb3?: [number, number, number][];
  /** Optional DynaSLAM baseline trajectory (Step F). */
  trajectory_dynaslam?: [number, number, number][];
  /** Optional ORB-SLAM3 sparse map points (Step B). */
  map_points?: { pos: [number, number, number]; weight?: number }[];
  /** Per-frame absolute trajectory error (m). Same length as trajectory_est. */
  ate_per_frame?: number[];
  /** V-KAN free energy per frame. */
  fe?: number[];
  /** Keyframe frame indices. */
  keyframes: number[];
  metrics: {
    vkan: SeqMetrics;
    orb3?: SeqMetrics;
    dynaslam?: SeqMetrics;
  };
}

export interface SeqMetrics {
  ate_rmse: number;
  ate_mean: number;
  ate_max: number;
  rpe_trans: number;
  rpe_rot: number;
  tracking_pct: number;
  fps?: number;
}

export interface Stage4RealData {
  status: "preview" | "live";
  generated_at?: string;
  sequences: RealSequenceResult[];
}
