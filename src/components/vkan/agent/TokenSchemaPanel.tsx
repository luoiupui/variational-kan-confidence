import { useEffect, useState } from "react";
import { Panel } from "@/components/vkan/Panel";

const WORKER_BASE =
  (import.meta.env.VITE_WORKER_AGENT_URL as string | undefined) ??
  "https://worker-misty-butterfly-4770.fly.dev";

export function TokenSchemaPanel() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${WORKER_BASE}/agent/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch((e) => setErr(String(e)));
  }, []);
  return (
    <Panel title="Action Token Protocol" subtitle="microAgent vocabulary + worker status">
      <div className="space-y-3 text-xs">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            grammar
          </div>
          <pre className="overflow-x-auto rounded bg-secondary/40 p-2 font-mono text-[11px] leading-relaxed">
{`[NAV] (FORWARD|STOP|GOTO) <speed>
[ARM] (GRASP|RELEASE|HOME) [TARGET] <ID>

e.g.  [NAV] FORWARD 0.5
      [NAV] GOTO 1.0 0.5 [ARM] GRASP [TARGET] OBJ_B`}
          </pre>
        </div>
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            worker /agent/status
          </div>
          {err ? (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
              {err}
            </div>
          ) : (
            <pre className="overflow-x-auto rounded bg-secondary/40 p-2 font-mono text-[11px]">
              {JSON.stringify(status, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </Panel>
  );
}