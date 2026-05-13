import { useRef, useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { CameraPanel, type IngestStat } from "@/components/vkan/agent/CameraPanel";
import { IngestPanel } from "@/components/vkan/agent/IngestPanel";
import { DecisionsPanel } from "@/components/vkan/agent/DecisionsPanel";
import { TokenSchemaPanel } from "@/components/vkan/agent/TokenSchemaPanel";
import { Panel } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import { useAgentDecisions } from "@/hooks/useAgentDecisions";

const PRESETS = [
  "Context: Path clear ahead. Action required:",
  "Context: Red obstacle detected on sensor. Action required:",
  "Context: Target object located on shelf. Action required:",
  "Context: Approaching sorting bin, arm holding cargo. Action required:",
  "Context: Critical error on arm joints. Action required:",
];

export default function Agent() {
  const [stats, setStats] = useState<IngestStat[]>([]);
  const [contextStr, setContextStr] = useState(PRESETS[0]);
  const ctxRef = useRef(contextStr);
  ctxRef.current = contextStr;
  const decisions = useAgentDecisions(30);

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            Micro-ROS Agent · Camera + microAgent
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Browser camera → Lovable Cloud → Fly.io microAgent (tiny transformer + rule
            fallback) → action tokens. The cloud emits decisions; a local
            <code className="mx-1 font-mono text-foreground/80">ros_bridge/nn_agent_node.py</code>
            republishes them on <code className="font-mono text-foreground/80">/cmd_vel</code>
            and <code className="font-mono text-foreground/80">/arm_gripper/command</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
            Stage 5 · Embodied
          </Badge>
          <Badge variant="outline" className="border-signal-causal/40 text-signal-causal">
            ROS-2 bridge ready
          </Badge>
        </div>
      </header>

      <Panel
        title="Perception Context (sent to agent each tick)"
        subtitle="In a real ROS node this string is built from sensor topics; here you pick a preset or type free text."
        className="mb-4"
      >
        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
          <input
            value={contextStr}
            onChange={(e) => setContextStr(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <select
            value={PRESETS.includes(contextStr) ? contextStr : ""}
            onChange={(e) => e.target.value && setContextStr(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="">presets…</option>
            {PRESETS.map((p) => (
              <option key={p} value={p}>
                {p.slice(9, 50)}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CameraPanel
            onIngest={(s) => setStats((prev) => [s, ...prev].slice(0, 50))}
            contextRef={ctxRef}
          />
        </div>
        <IngestPanel stats={stats} />
        <div className="lg:col-span-2">
          <DecisionsPanel decisions={decisions} />
        </div>
        <TokenSchemaPanel />
      </div>
    </AppShell>
  );
}