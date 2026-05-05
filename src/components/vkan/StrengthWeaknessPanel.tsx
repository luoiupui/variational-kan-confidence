import { useMemo } from "react";
import { Panel } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import { useRuns, type RunMethod } from "@/hooks/useRuns";
import { useSequences } from "@/hooks/useSequences";
import { Activity, ThumbsUp, ThumbsDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

function geomean(xs: number[]): number {
  const xs2 = xs.filter((v) => Number.isFinite(v) && v > 0);
  if (!xs2.length) return NaN;
  return Math.exp(xs2.reduce((a, b) => a + Math.log(b), 0) / xs2.length);
}

const METHODS: RunMethod[] = ["vkan", "orb3", "dynaslam"];
const METHOD_LABEL: Record<RunMethod, string> = {
  vkan: "V-KAN",
  orb3: "ORB-SLAM3",
  dynaslam: "DynaSLAM",
};

interface Bucket {
  key: "low" | "med" | "high";
  label: string;
  hint: string;
  range: [number, number];
}

const BUCKETS: Bucket[] = [
  { key: "low", label: "Low dynamic", hint: "0–10% moving pixels", range: [0, 10] },
  { key: "med", label: "Medium dynamic", hint: "10–50% moving pixels", range: [10, 50] },
  { key: "high", label: "High dynamic", hint: "50–100% moving pixels", range: [50, 101] },
];

function pctDelta(reference: number, candidate: number): number {
  if (!Number.isFinite(reference) || !Number.isFinite(candidate) || reference <= 0) return NaN;
  return ((reference - candidate) / reference) * 100;
}

export function StrengthWeaknessPanel() {
  const { runs } = useRuns(200);
  const { sequences } = useSequences();

  const seqDyn = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sequences) m.set(s.id, s.dynamic_pct);
    return m;
  }, [sequences]);

  const analysis = useMemo(() => {
    // Latest successful ATE per (seq, method)
    const latest = new Map<string, { ate: number; method: RunMethod; sequence: string }>();
    for (const r of runs) {
      if (r.status !== "done") continue;
      const ate = r.metrics?.ate_rmse;
      if (typeof ate !== "number" || !Number.isFinite(ate)) continue;
      if (!METHODS.includes(r.method)) continue;
      const k = `${r.sequence_id}::${r.method}`;
      if (!latest.has(k)) latest.set(k, { ate, method: r.method, sequence: r.sequence_id });
    }

    const buckets = BUCKETS.map((b) => {
      const seqsInBucket = sequences.filter(
        (s) => s.dynamic_pct >= b.range[0] && s.dynamic_pct < b.range[1],
      );
      const perMethod: Record<RunMethod, number[]> = { vkan: [], orb3: [], dynaslam: [] };
      for (const s of seqsInBucket) {
        for (const m of METHODS) {
          const e = latest.get(`${s.id}::${m}`);
          if (e) perMethod[m].push(e.ate);
        }
      }
      const gm = {
        vkan: geomean(perMethod.vkan),
        orb3: geomean(perMethod.orb3),
        dynaslam: geomean(perMethod.dynaslam),
      };
      const counts = {
        vkan: perMethod.vkan.length,
        orb3: perMethod.orb3.length,
        dynaslam: perMethod.dynaslam.length,
      };
      const dDyna = pctDelta(gm.dynaslam, gm.vkan);
      const dOrb3 = pctDelta(gm.orb3, gm.vkan);
      return { ...b, gm, counts, dDyna, dOrb3, total: seqsInBucket.length };
    });

    // Per-sequence ranking where all 3 methods are present
    const ranking = sequences
      .map((s) => {
        const v = latest.get(`${s.id}::vkan`)?.ate;
        const o = latest.get(`${s.id}::orb3`)?.ate;
        const d = latest.get(`${s.id}::dynaslam`)?.ate;
        if (v == null || o == null || d == null) return null;
        return {
          id: s.id,
          name: s.name,
          dyn: s.dynamic_pct,
          vkan: v,
          orb3: o,
          dynaslam: d,
          dDyna: pctDelta(d, v),
          dOrb3: pctDelta(o, v),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.dDyna - a.dDyna);

    return { buckets, ranking };
  }, [runs, sequences, seqDyn]);

  const verdict = (dDyna: number, dOrb3: number, n: { vkan: number; orb3: number; dynaslam: number }) => {
    if (n.vkan === 0) return { tone: "muted", icon: Minus, text: "No V-KAN runs in this bucket yet" };
    if (n.dynaslam === 0 && n.orb3 === 0)
      return { tone: "muted", icon: Minus, text: "Need at least one baseline run to compare" };
    const parts: string[] = [];
    if (Number.isFinite(dDyna))
      parts.push(`${dDyna >= 0 ? "−" : "+"}${Math.abs(dDyna).toFixed(1)}% vs DynaSLAM`);
    if (Number.isFinite(dOrb3))
      parts.push(`${dOrb3 >= 0 ? "−" : "+"}${Math.abs(dOrb3).toFixed(1)}% vs ORB-3`);
    const headline = (Number.isFinite(dDyna) ? dDyna : dOrb3) >= 0;
    return {
      tone: headline ? "good" : "bad",
      icon: headline ? ThumbsUp : ThumbsDown,
      text: parts.join(" · ") || "—",
    };
  };

  return (
    <Panel
      title="Stage E · Strength / Weakness analysis"
      subtitle="Where V-KAN beats (or loses to) ORB-SLAM3 and DynaSLAM, bucketed by dynamic-content level"
      right={
        <Badge variant="outline" className="border-accent/40 text-accent">
          <Activity className="mr-1 h-3 w-3" />
          dynamic SLAM compare
        </Badge>
      }
    >
      <div className="grid gap-3 md:grid-cols-3">
        {analysis.buckets.map((b) => {
          const v = verdict(b.dDyna, b.dOrb3, b.counts);
          const Icon = v.icon;
          return (
            <div
              key={b.key}
              className="rounded-md border border-border/60 bg-secondary/20 p-3"
            >
              <div className="flex items-baseline justify-between">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-wider">
                  {b.label}
                </div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {b.total} seq
                </div>
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">{b.hint}</div>

              <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                {METHODS.map((m) => (
                  <div key={m} className="flex flex-col">
                    <span
                      className={cn(
                        "font-mono uppercase",
                        m === "vkan" && "text-signal-fe",
                        m === "orb3" && "text-signal-warn",
                        m === "dynaslam" && "text-accent",
                      )}
                    >
                      {METHOD_LABEL[m]}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {Number.isFinite(b.gm[m]) ? b.gm[m].toFixed(4) : "—"}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      n={b.counts[m]}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={cn(
                  "mt-2 flex items-start gap-1.5 rounded border px-2 py-1 text-[10px] leading-snug",
                  v.tone === "good" && "border-signal-fe/30 bg-signal-fe/5 text-signal-fe",
                  v.tone === "bad" && "border-destructive/30 bg-destructive/5 text-destructive",
                  v.tone === "muted" &&
                    "border-border bg-secondary/40 text-muted-foreground",
                )}
              >
                <Icon className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{v.text}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Per-sequence ranking (sequences with all 3 methods)
        </div>
        {analysis.ranking.length === 0 ? (
          <div className="rounded border border-dashed border-border/60 p-3 text-[11px] text-muted-foreground">
            No sequence yet has runs from all three methods. Use{" "}
            <span className="font-mono text-foreground">Run all 3</span> in the Run
            Center to backfill paired comparisons.
          </div>
        ) : (
          <div className="space-y-1.5">
            {analysis.ranking.map((r) => {
              const max = Math.max(
                ...analysis.ranking.map((x) => Math.abs(x.dDyna)),
                10,
              );
              const w = Math.min(100, (Math.abs(r.dDyna) / max) * 100);
              const positive = r.dDyna >= 0;
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-[1fr_auto_120px_auto] items-center gap-2 text-[11px]"
                >
                  <div className="truncate font-mono">
                    {r.name}{" "}
                    <span className="text-[9px] text-muted-foreground">
                      · {r.dyn}% dyn
                    </span>
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {r.vkan.toFixed(3)} / {r.orb3.toFixed(3)} / {r.dynaslam.toFixed(3)}
                  </div>
                  <div className="relative h-2 rounded bg-secondary/40">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-border" />
                    <div
                      className={cn(
                        "absolute top-0 h-full",
                        positive ? "bg-signal-fe/70 left-1/2" : "bg-destructive/70 right-1/2",
                      )}
                      style={{ width: `${w / 2}%` }}
                    />
                  </div>
                  <div
                    className={cn(
                      "w-16 text-right font-mono text-[10px] tabular-nums",
                      positive ? "text-signal-fe" : "text-destructive",
                    )}
                  >
                    {positive ? "−" : "+"}
                    {Math.abs(r.dDyna).toFixed(1)}%
                  </div>
                </div>
              );
            })}
            <div className="pt-1 text-[9px] text-muted-foreground">
              Bar shows V-KAN ATE delta vs DynaSLAM (left = worse, right = better).
              Triple is V-KAN / ORB-3 / DynaSLAM ATE-RMSE.
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
