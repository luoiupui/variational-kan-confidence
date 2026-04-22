import { useMemo } from "react";
import { Panel, Stat } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import { useRuns } from "@/hooks/useRuns";
import { Sigma } from "lucide-react";

/** Geometric mean — robust to outliers, standard for ATE aggregation in SLAM papers. */
function geomean(xs: number[]): number {
  const positive = xs.filter((v) => Number.isFinite(v) && v > 0);
  if (positive.length === 0) return NaN;
  const sumLog = positive.reduce((acc, v) => acc + Math.log(v), 0);
  return Math.exp(sumLog / positive.length);
}

const METHODS = ["vkan", "orb3", "dynaslam"] as const;
type Method = (typeof METHODS)[number];

const METHOD_LABEL: Record<Method, string> = {
  vkan: "V-KAN",
  orb3: "ORB-SLAM3",
  dynaslam: "DynaSLAM",
};

const METHOD_ACCENT: Record<Method, "primary" | "warn" | "accent"> = {
  vkan: "primary",
  orb3: "warn",
  dynaslam: "accent",
};

export function GeomeanPanel() {
  const { runs, loading } = useRuns(200);

  const stats = useMemo(() => {
    // Keep only the most recent successful run per (sequence_id, method).
    const latest = new Map<string, { ate: number; method: Method; sequence: string }>();
    for (const r of runs) {
      if (r.status !== "done") continue;
      const ate = r.metrics?.ate_rmse;
      if (typeof ate !== "number" || !Number.isFinite(ate)) continue;
      if (!METHODS.includes(r.method as Method)) continue;
      const key = `${r.sequence_id}::${r.method}`;
      // runs is already sorted desc by created_at — first hit wins
      if (!latest.has(key)) {
        latest.set(key, { ate, method: r.method as Method, sequence: r.sequence_id });
      }
    }

    // Bucket by method
    const buckets: Record<Method, number[]> = { vkan: [], orb3: [], dynaslam: [] };
    const sequencesByMethod: Record<Method, Set<string>> = {
      vkan: new Set(),
      orb3: new Set(),
      dynaslam: new Set(),
    };
    for (const v of latest.values()) {
      buckets[v.method].push(v.ate);
      sequencesByMethod[v.method].add(v.sequence);
    }

    // Common-sequence subset: only sequences where every method present has a run.
    // For "improvement vs ORB3" we use sequences run by both vkan and orb3.
    const commonVkanOrb3 = [...sequencesByMethod.vkan].filter((s) =>
      sequencesByMethod.orb3.has(s),
    );
    const pairAtes = commonVkanOrb3.map((s) => ({
      vkan: latest.get(`${s}::vkan`)?.ate ?? NaN,
      orb3: latest.get(`${s}::orb3`)?.ate ?? NaN,
    }));
    const vkanCommon = geomean(pairAtes.map((p) => p.vkan));
    const orb3Common = geomean(pairAtes.map((p) => p.orb3));
    const improvement =
      Number.isFinite(vkanCommon) && Number.isFinite(orb3Common) && orb3Common > 0
        ? ((orb3Common - vkanCommon) / orb3Common) * 100
        : NaN;

    return {
      perMethod: METHODS.map((m) => ({
        method: m,
        n: buckets[m].length,
        geomean: geomean(buckets[m]),
      })),
      improvement,
      commonN: commonVkanOrb3.length,
    };
  }, [runs]);

  return (
    <Panel
      title="Stage E · Cross-sequence aggregate"
      subtitle="Geometric mean of ATE-RMSE across all successful runs · live from backend"
      right={
        <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
          <Sigma className="mr-1 h-3 w-3" />
          geomean
        </Badge>
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.perMethod.map((m) => (
          <Stat
            key={m.method}
            label={`${METHOD_LABEL[m.method]} · n=${m.n}`}
            value={
              Number.isFinite(m.geomean) ? `${m.geomean.toFixed(4)} m` : "—"
            }
            accent={METHOD_ACCENT[m.method]}
            hint={m.n === 0 ? "no completed runs yet" : "ATE-RMSE geomean"}
          />
        ))}
        <Stat
          label="V-KAN improvement"
          value={
            Number.isFinite(stats.improvement)
              ? `${stats.improvement >= 0 ? "+" : ""}${stats.improvement.toFixed(1)}%`
              : "—"
          }
          accent="primary"
          hint={
            stats.commonN > 0
              ? `vs ORB-SLAM3 on ${stats.commonN} shared seq${stats.commonN === 1 ? "" : "s"}`
              : "needs ≥1 sequence with both methods"
          }
        />
      </div>
      {!loading && stats.perMethod.every((m) => m.n === 0) && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          No completed runs yet. Trigger a run from the Run Center — the panel updates live
          when the worker reports back.
        </p>
      )}
    </Panel>
  );
}