import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WorkerHealth = {
  health: "healthy" | "stale" | "down";
  last_ingest_at: string | null;
  last_run_id: string | null;
  last_method: string | null;
  last_status: string | null;
  seconds_since_ingest: number | null;
  queued: number;
  running: number;
  done_24h: number;
  failed_24h: number;
  oldest_queued_age_s: number | null;
};

/** Polls the worker-health edge function every 10 s. */
export function useWorkerHealth(intervalMs = 10000) {
  const [data, setData] = useState<WorkerHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const { data: res, error: err } = await supabase.functions.invoke("worker-health");
      if (cancelled) return;
      if (err) setError(err.message);
      else {
        setError(null);
        setData(res as WorkerHealth);
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { health: data, error };
}