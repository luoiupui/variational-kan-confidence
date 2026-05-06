import { useEffect } from "react";
import { useRuns } from "@/hooks/useRuns";
import { ingestRuns } from "@/lib/reportLog";

/** Mount once at app root. Subscribes to runs and appends finished ones to the log. */
export function useAutoReport() {
  const { runs } = useRuns(200);
  useEffect(() => {
    if (runs.length) ingestRuns(runs);
  }, [runs]);
}