import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgentDecision {
  id: string;
  ts: string;
  frame_id: string | null;
  context: string | null;
  raw_output: string | null;
  nav_cmd: string | null;
  arm_cmd: string | null;
  target_id: string | null;
  model_version: string | null;
  latency_ms: number | null;
}

export function useAgentDecisions(limit = 30) {
  const [items, setItems] = useState<AgentDecision[]>([]);

  useEffect(() => {
    let mounted = true;
    supabase
      .from("agent_decisions")
      .select("*")
      .order("ts", { ascending: false })
      .limit(limit)
      .then(({ data }) => {
        if (mounted && data) setItems(data as AgentDecision[]);
      });
    const ch = supabase
      .channel(`agent-decisions-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_decisions" },
        (payload) => {
          setItems((prev) => [payload.new as AgentDecision, ...prev].slice(0, limit));
        },
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
  }, [limit]);

  return items;
}