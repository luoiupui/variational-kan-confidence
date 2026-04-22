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
}

export function useRuns(limit = 50) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from("runs")
      .select(
        "id, sequence_id, sequence_name, method, status, frames, metrics, git_sha, notes, error, requested_by, created_at, started_at, completed_at",
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
      .channel("runs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runs" },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  return { runs, error, loading, refresh };
}