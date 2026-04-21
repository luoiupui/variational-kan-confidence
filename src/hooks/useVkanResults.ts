import { useEffect, useState } from "react";
import type { VkanResults } from "@/lib/vkan-types";

export function useVkanResults() {
  const [data, setData] = useState<VkanResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    fetch("/data/vkan_results.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j) => !aborted && setData(j as VkanResults))
      .catch((e) => !aborted && setError(String(e)));
    return () => {
      aborted = true;
    };
  }, []);

  return { data, error };
}