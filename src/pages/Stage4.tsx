import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel, Stat } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, CheckCircle, Play, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Trajectory3D } from "@/components/vkan/Trajectory3D";
import type { Stage4RealData } from "@/lib/stage4-types";

interface SeqMetrics {
  ate_rmse: number;
  ate_mean: number;
  rpe_trans: number;
  rpe_rot: number;
  tracking_pct: number;
  fps: number;
}
interface Sequence {
  id: string;
  name: string;
  frames: number;
  dynamic_pct: number;
  description: string;
  vkan: SeqMetrics;
  orb3: SeqMetrics;
  winner: "vkan" | "orb3";
  vkan_trajectory: [number, number, number][];
  orb3_trajectory: [number, number, number][];
  gt_trajectory: [number, number, number][];
}
interface Stage4Data {
  status: string;
  note: string;
  metrics_def: Record<string, string>;
  sequences: Sequence[];
  summary: {
    vkan_wins: number;
    orb3_wins: number;
    ate_geomean_vkan: number;
    ate_geomean_orb3: number;
  };
}

/** Shape from worker/stage4/eval_with_evo.py */
function isRealData(d: unknown): d is Stage4RealData {
  return (
    !!d &&
    typeof d === "object" &&
    Array.isArray((d as Stage4RealData).sequences) &&
    "trajectory_est" in ((d as Stage4RealData).sequences[0] ?? {})
  );
}

function MiniTraj({
  vkan,
  orb3,
  gt,
}: {
  vkan: [number, number, number][];
  orb3: [number, number, number][];
  gt: [number, number, number][];
}) {
  const all = [...vkan, ...orb3, ...gt];
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const pad = 0.1;
  const sx = (v: number) => ((v - minX) / w) * (100 * (1 - 2 * pad)) + 100 * pad;
  const sy = (v: number) => 100 - (((v - minY) / h) * (100 * (1 - 2 * pad)) + 100 * pad);
  const path = (pts: [number, number, number][]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p[0]).toFixed(2)} ${sy(p[1]).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" className="h-32 w-full" preserveAspectRatio="none">
      <rect width="100" height="100" fill="hsl(222 30% 10%)" />
      <path d={path(gt)} fill="none" stroke="hsl(210 30% 50%)" strokeWidth="0.6" strokeDasharray="1.2 0.8" vectorEffect="non-scaling-stroke" />
      <path d={path(orb3)} fill="none" stroke="hsl(38 92% 60%)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
      <path d={path(vkan)} fill="none" stroke="hsl(167 82% 52%)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Cell({
  vkan,
  orb3,
  better,
  fmt = (v: number) => v.toFixed(3),
}: {
  vkan: number;
  orb3: number;
  better: "low" | "high";
  fmt?: (v: number) => string;
}) {
  const vkanWins = better === "low" ? vkan < orb3 : vkan > orb3;
  return (
    <div className="grid grid-cols-2 gap-1 text-[11px] tabular-nums">
      <span className={cn("font-mono", vkanWins ? "font-semibold text-signal-fe" : "text-muted-foreground")}>
        {fmt(vkan)}
      </span>
      <span className={cn("font-mono", !vkanWins ? "font-semibold text-signal-warn" : "text-muted-foreground")}>
        {fmt(orb3)}
      </span>
    </div>
  );
}

const Stage4 = () => {
  const { toast } = useToast();
  const [data, setData] = useState<Stage4Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/stage4_results.json")
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(String(e)));
  }, []);

  const improvement = useMemo(() => {
    if (!data) return 0;
    const v = data.summary.ate_geomean_vkan;
    const o = data.summary.ate_geomean_orb3;
    return ((o - v) / o) * 100;
  }, [data]);

  const runSeq = (id: string, name: string) => {
    setRunning(id);
    setTimeout(() => {
      setRunning(null);
      toast({
        title: `Stage 4 run queued · ${name}`,
        description:
          "Demo mode — real run requires GPU worker. Click 'Wire backend' on Config to enable.",
      });
    }, 900);
  };

  return (
    <AppShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            Stage 4 — V-KAN vs ORB-SLAM3
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Head-to-head evaluation on TUM RGB-D. ATE-RMSE / RPE computed via{" "}
            <code className="font-mono text-foreground/80">evo</code> against ground-truth
            poses. Lower is better for ATE / RPE; higher is better for tracking %.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-signal-warn/40 text-signal-warn">
            <AlertTriangle className="mr-1 h-3 w-3" />
            preview · awaiting real GPU runs
          </Badge>
          <Badge variant="outline" className="border-primary/40 text-primary">
            method: V-KAN
          </Badge>
          <Badge variant="outline" className="border-signal-warn/40 text-signal-warn">
            baseline: ORB-SLAM3
          </Badge>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          Failed to load stage4_results.json: {error}
        </div>
      )}

      {data && (
        <>
          <div className="mb-4 rounded-md border border-signal-warn/30 bg-signal-warn/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-mono text-signal-warn">NOTE · </span>
            {data.note} Numbers below are illustrative — they show the panel layout and
            metric definitions that will be reported once the real backend runs land.
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label="ATE geomean · V-KAN"
              value={data.summary.ate_geomean_vkan.toFixed(3) + " m"}
              accent="primary"
            />
            <Stat
              label="ATE geomean · ORB3"
              value={data.summary.ate_geomean_orb3.toFixed(3) + " m"}
              accent="warn"
            />
            <Stat
              label="V-KAN improvement"
              value={(improvement >= 0 ? "+" : "") + improvement.toFixed(1) + "%"}
              hint="vs ORB-SLAM3 ATE"
              accent="primary"
            />
            <Stat
              label="sequences won"
              value={`${data.summary.vkan_wins} / ${data.sequences.length}`}
              hint={`ORB-SLAM3: ${data.summary.orb3_wins}`}
            />
          </div>

          <Panel
            title="Per-sequence comparison"
            subtitle="V-KAN (cyan) vs ORB-SLAM3 (amber) · ground truth (dashed grey)"
            className="mb-4"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">sequence</th>
                    <th className="py-2 pr-3">trajectory (x–y)</th>
                    <th className="py-2 pr-3">
                      <div>ATE-RMSE [m]</div>
                      <div className="grid grid-cols-2 gap-1 text-[9px] normal-case">
                        <span className="text-signal-fe">v-kan</span>
                        <span className="text-signal-warn">orb3</span>
                      </div>
                    </th>
                    <th className="py-2 pr-3">
                      <div>RPE-trans</div>
                      <div className="grid grid-cols-2 gap-1 text-[9px] normal-case">
                        <span className="text-signal-fe">v-kan</span>
                        <span className="text-signal-warn">orb3</span>
                      </div>
                    </th>
                    <th className="py-2 pr-3">
                      <div>RPE-rot [°]</div>
                      <div className="grid grid-cols-2 gap-1 text-[9px] normal-case">
                        <span className="text-signal-fe">v-kan</span>
                        <span className="text-signal-warn">orb3</span>
                      </div>
                    </th>
                    <th className="py-2 pr-3">
                      <div>tracked %</div>
                      <div className="grid grid-cols-2 gap-1 text-[9px] normal-case">
                        <span className="text-signal-fe">v-kan</span>
                        <span className="text-signal-warn">orb3</span>
                      </div>
                    </th>
                    <th className="py-2 pr-3">winner</th>
                    <th className="py-2 pr-3">action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sequences.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3">
                        <div className="font-mono text-xs font-semibold">{s.name}</div>
                        <div className="mt-0.5 text-[10px] text-muted-foreground">
                          {s.frames} frames · {s.dynamic_pct}% dynamic
                        </div>
                        <div className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
                          {s.description}
                        </div>
                      </td>
                      <td className="py-3 pr-3" style={{ minWidth: 160 }}>
                        <MiniTraj
                          vkan={s.vkan_trajectory}
                          orb3={s.orb3_trajectory}
                          gt={s.gt_trajectory}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <Cell vkan={s.vkan.ate_rmse} orb3={s.orb3.ate_rmse} better="low" />
                      </td>
                      <td className="py-3 pr-3">
                        <Cell vkan={s.vkan.rpe_trans} orb3={s.orb3.rpe_trans} better="low" />
                      </td>
                      <td className="py-3 pr-3">
                        <Cell
                          vkan={s.vkan.rpe_rot}
                          orb3={s.orb3.rpe_rot}
                          better="low"
                          fmt={(v) => v.toFixed(2)}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <Cell
                          vkan={s.vkan.tracking_pct}
                          orb3={s.orb3.tracking_pct}
                          better="high"
                          fmt={(v) => v.toFixed(1)}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px]",
                            s.winner === "vkan"
                              ? "border-signal-fe/40 text-signal-fe"
                              : "border-signal-warn/40 text-signal-warn",
                          )}
                        >
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {s.winner === "vkan" ? "V-KAN" : "ORB3"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-[10px]"
                          disabled={running === s.id}
                          onClick={() => runSeq(s.id, s.name)}
                        >
                          {running === s.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="mr-1 h-3 w-3" />
                          )}
                          Re-run
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Metric definitions" subtitle="What each column measures">
              <ul className="space-y-2 text-xs">
                {Object.entries(data.metrics_def).map(([k, v]) => (
                  <li key={k} className="flex gap-2">
                    <code className="shrink-0 rounded bg-secondary/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
                      {k}
                    </code>
                    <span className="text-muted-foreground">{v}</span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="What 'real' Stage 4 needs" subtitle="To replace these mocked numbers">
              <ol className="space-y-2 text-xs text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-mono text-signal-fe">1.</span>
                  GPU worker (Modal / RunPod / on-prem) with ORB-SLAM3 binary +
                  V-KAN PyTorch env.
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-signal-fe">2.</span>
                  TUM RGB-D sequences mounted (~6 GB for the 4 above).
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-signal-fe">3.</span>
                  <code className="font-mono text-foreground/80">evo_ape</code> /
                  <code className="ml-1 font-mono text-foreground/80">evo_rpe</code>{" "}
                  pipeline producing JSON in this exact shape.
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-signal-fe">4.</span>
                  Edge function to enqueue runs &amp; a{" "}
                  <code className="font-mono text-foreground/80">runs</code> table for
                  history (Lovable Cloud).
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-signal-fe">5.</span>
                  Optional Stage 4b: add DynaSLAM column for dynamic-aware baseline on{" "}
                  <code className="font-mono text-foreground/80">fr3/walking_*</code>.
                </li>
              </ol>
            </Panel>
          </div>
        </>
      )}
    </AppShell>
  );
};

export default Stage4;
