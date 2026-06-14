import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RunMethod = "vkan" | "orb3" | "dynaslam";
export type RunStatus = "queued" | "running" | "done" | "failed";

export interface RunRow {
  id: string;
  sequence_id: string;
  sequence_name: string;
  method: RunMethod;
  status: RunStatus;
  frames: number | null;
  metrics: {
    ate_rmse?: number;
    ate_mean?: number;
    rpe_trans?: number;
    rpe_rot?: number;
    tracking_pct?: number;
    fps?: number;
  } | null;
  git_sha: string | null;
  notes: string | null;
  error: string | null;
  requested_by: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  trajectory_est?: [number, number, number][] | null;
  trajectory_gt?: [number, number, number][] | null;
  fe?: number[] | null;
  ate_per_frame?: number[] | null;
  keyframes?: number[] | null;
}

export function useRuns(limit = 50) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("runs")
      .select(
        "id, sequence_id, sequence_name, method, status, frames, metrics, git_sha, notes, error, requested_by, created_at, started_at, completed_at, trajectory_est, trajectory_gt, fe, ate_per_frame, keyframes",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) setError(error.message);
    else setRuns((data ?? []) as RunRow[]);
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel(`runs-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs" },
        () => refresh(),
      )
      .subscribe();
    // Polling fallback — realtime on `runs` is not guaranteed to be in the
    // publication, so refresh every 5 s as a safety net so the Run Center
    // panel always reflects the newest row.
    const iv = setInterval(refresh, 5000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(iv);
    };
    // refresh is stable enough; we intentionally only subscribe once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { runs, error, loading, refresh };
}