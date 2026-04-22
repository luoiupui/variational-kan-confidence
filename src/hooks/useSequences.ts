import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SequenceRow {
  id: string;
  name: string;
  family: string;
  dynamic_pct: number;
  description: string | null;
  enabled: boolean;
}

export function useSequences() {
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    supabase
      .from("sequences")
      .select("id, name, family, dynamic_pct, description, enabled")
      .eq("enabled", true)
      .order("dynamic_pct", { ascending: true })
      .then(({ data, error }) => {
        if (aborted) return;
        if (error) setError(error.message);
        else setSequences((data ?? []) as SequenceRow[]);
      });
    return () => {
      aborted = true;
    };
  }, []);

  return { sequences, error };
}