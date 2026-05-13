import { Panel } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import type { AgentDecision } from "@/hooks/useAgentDecisions";

export function DecisionsPanel({ decisions }: { decisions: AgentDecision[] }) {
  return (
    <Panel
      title="Agent Decisions · Live"
      subtitle="streamed from agent_decisions via realtime"
    >
      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
        {decisions.length === 0 && (
          <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No decisions yet. Start streaming a camera or POST to <code>/agent-tick</code>.
          </div>
        )}
        {decisions.map((d) => (
          <div key={d.id} className="rounded-md border border-border bg-secondary/30 p-2 text-xs">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              <span>{new Date(d.ts).toLocaleTimeString()}</span>
              <span>{d.model_version} · {d.latency_ms ?? "?"}ms</span>
            </div>
            <div className="mb-1 truncate font-mono text-foreground">{d.raw_output}</div>
            <div className="flex flex-wrap gap-1">
              {d.nav_cmd && (
                <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
                  NAV · {d.nav_cmd}
                </Badge>
              )}
              {d.arm_cmd && (
                <Badge variant="outline" className="border-signal-causal/40 text-signal-causal">
                  ARM · {d.arm_cmd}
                </Badge>
              )}
              {d.target_id && (
                <Badge variant="outline" className="border-signal-warn/40 text-signal-warn">
                  TARGET · {d.target_id}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}