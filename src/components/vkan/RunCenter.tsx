import { useMemo, useState } from "react";
import { Panel } from "@/components/vkan/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Download,
  History,
  XCircle,
  AlertTriangle,
  Layers,
} from "lucide-react";
import { useRuns, type RunMethod, type RunStatus } from "@/hooks/useRuns";
import { useSequences } from "@/hooks/useSequences";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const METHODS: { id: RunMethod; label: string; cls: string }[] = [
  { id: "vkan", label: "V-KAN", cls: "border-signal-fe/40 text-signal-fe" },
  { id: "orb3", label: "ORB-SLAM3", cls: "border-signal-warn/40 text-signal-warn" },
  {
    id: "dynaslam",
    label: "DynaSLAM",
    cls: "border-accent/40 text-accent",
  },
];

const statusBadge = (s: RunStatus) => {
  const map: Record<RunStatus, { cls: string; icon: typeof Clock; label: string }> = {
    queued: { cls: "border-border text-muted-foreground", icon: Clock, label: "queued" },
    running: {
      cls: "border-signal-causal/40 text-signal-causal",
      icon: Loader2,
      label: "running",
    },
    done: { cls: "border-signal-fe/40 text-signal-fe", icon: CheckCircle2, label: "done" },
    failed: {
      cls: "border-destructive/40 text-destructive",
      icon: XCircle,
      label: "failed",
    },
  };
  return map[s];
};

function toCsv(runs: ReturnType<typeof useRuns>["runs"]): string {
  const cols = [
    "id",
    "created_at",
    "sequence_id",
    "sequence_name",
    "method",
    "status",
    "frames",
    "ate_rmse",
    "rpe_trans",
    "rpe_rot",
    "tracking_pct",
    "fps",
    "git_sha",
  ];
  const lines = [cols.join(",")];
  for (const r of runs) {
    const m = r.metrics ?? {};
    lines.push(
      [
        r.id,
        r.created_at,
        r.sequence_id,
        r.sequence_name,
        r.method,
        r.status,
        r.frames ?? "",
        m.ate_rmse ?? "",
        m.rpe_trans ?? "",
        m.rpe_rot ?? "",
        m.tracking_pct ?? "",
        m.fps ?? "",
        r.git_sha ?? "",
      ]
        .map((v) => String(v).replace(/,/g, ";"))
        .join(","),
    );
  }
  return lines.join("\n");
}

function toLatex(runs: ReturnType<typeof useRuns>["runs"]): string {
  const done = runs.filter((r) => r.status === "done" && r.metrics);
  const head =
    "\\begin{tabular}{llrrrr}\n\\toprule\nSequence & Method & ATE-RMSE [m] & RPE-trans & RPE-rot [°] & Tracked \\% \\\\\n\\midrule";
  const body = done
    .map((r) => {
      const m = r.metrics!;
      return `${r.sequence_name} & ${r.method} & ${(m.ate_rmse ?? 0).toFixed(4)} & ${(m.rpe_trans ?? 0).toFixed(4)} & ${(m.rpe_rot ?? 0).toFixed(2)} & ${(m.tracking_pct ?? 0).toFixed(1)} \\\\`;
    })
    .join("\n");
  return `${head}\n${body}\n\\bottomrule\n\\end{tabular}`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function RunCenter() {
  const { sequences, error: seqError } = useSequences();
  const { runs, error: runsError, loading } = useRuns(50);
  const { toast } = useToast();

  const [seqId, setSeqId] = useState<string>("");
  const [method, setMethod] = useState<RunMethod>("vkan");
  const [busy, setBusy] = useState(false);
  const [methodFilter, setMethodFilter] = useState<RunMethod | "all">("all");

  const filtered = useMemo(
    () => (methodFilter === "all" ? runs : runs.filter((r) => r.method === methodFilter)),
    [runs, methodFilter],
  );

  const trigger = async () => {
    const seq = sequences.find((s) => s.id === seqId);
    if (!seq) {
      toast({ title: "Pick a sequence first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("enqueue-run", {
        body: {
          sequence_id: seq.id,
          sequence_name: seq.name,
          method,
          requested_by: "ui",
        },
      });
      if (error) throw error;
      toast({
        title: `Queued · ${seq.name}`,
        description: `${method.toUpperCase()} run id ${(data as { id: string }).id.slice(0, 8)}…`,
      });
    } catch (e) {
      toast({
        title: "Enqueue failed",
        description: String((e as Error).message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const enqueueMany = async (
    items: { sequence_id: string; sequence_name: string; method: RunMethod }[],
  ) => {
    const results = await Promise.allSettled(
      items.map((it) =>
        supabase.functions.invoke("enqueue-run", {
          body: { ...it, requested_by: "ui-batch" },
        }),
      ),
    );
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.length - ok;
    return { ok, fail };
  };

  const triggerAllThree = async () => {
    const seq = sequences.find((s) => s.id === seqId);
    if (!seq) {
      toast({ title: "Pick a sequence first", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { ok, fail } = await enqueueMany(
        (["vkan", "orb3", "dynaslam"] as RunMethod[]).map((m) => ({
          sequence_id: seq.id,
          sequence_name: seq.name,
          method: m,
        })),
      );
      toast({
        title: `Queued ${ok}/3 methods · ${seq.name}`,
        description: fail ? `${fail} failed — see console` : "vkan + orb3 + dynaslam enqueued",
        variant: fail ? "destructive" : "default",
      });
    } finally {
      setBusy(false);
    }
  };

  const backfillAll = async () => {
    // Skip (sequence, method) pairs that already have a 'done' or in-flight run.
    const have = new Set<string>();
    for (const r of runs) {
      if (r.status === "done" || r.status === "running" || r.status === "queued") {
        have.add(`${r.sequence_id}::${r.method}`);
      }
    }
    const items: { sequence_id: string; sequence_name: string; method: RunMethod }[] = [];
    for (const s of sequences) {
      for (const m of ["vkan", "orb3", "dynaslam"] as RunMethod[]) {
        if (have.has(`${s.id}::${m}`)) continue;
        items.push({ sequence_id: s.id, sequence_name: s.name, method: m });
      }
    }
    if (items.length === 0) {
      toast({ title: "Nothing to backfill", description: "All (sequence × method) pairs already have a run." });
      return;
    }
    if (!confirm(`Enqueue ${items.length} runs to fill the comparison matrix (${sequences.length} sequences × 3 methods)?`)) return;
    setBusy(true);
    try {
      const { ok, fail } = await enqueueMany(items);
      toast({
        title: `Backfill: queued ${ok}/${items.length}`,
        description: fail ? `${fail} failed — see console` : "Comparison matrix is filling up",
        variant: fail ? "destructive" : "default",
      });
    } finally {
      setBusy(false);
    }
  };

  const counts = useMemo(() => {
    const c = { queued: 0, running: 0, done: 0, failed: 0 };
    for (const r of runs) c[r.status]++;
    return c;
  }, [runs]);

  return (
    <Panel
      title="Run Center · Cloud"
      subtitle="Enqueue a worker run · live status from Lovable Cloud"
    >
      {(seqError || runsError) && (
        <div className="mb-2 rounded border border-signal-warn/30 bg-signal-warn/5 p-2 text-[10px] text-signal-warn">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {seqError ?? runsError}
        </div>
      )}

      <div className="space-y-3">
        <div className="grid gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            sequence
          </label>
          <Select value={seqId} onValueChange={setSeqId}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="pick a TUM sequence…" />
            </SelectTrigger>
            <SelectContent>
              {sequences.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  <span className="font-mono">{s.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    · {s.dynamic_pct}% dyn
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            method
          </label>
          <div className="flex gap-1">
            {METHODS.map((m) => (
              <Button
                key={m.id}
                size="sm"
                variant={method === m.id ? "default" : "outline"}
                className="h-7 flex-1 px-2 text-[11px]"
                onClick={() => setMethod(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={trigger} disabled={busy || !seqId} size="sm">
            {busy ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Play className="mr-1 h-3 w-3" />
            )}
            Enqueue run
          </Button>
          <Button
            onClick={triggerAllThree}
            disabled={busy || !seqId}
            size="sm"
            variant="outline"
            title="Queue V-KAN + ORB-SLAM3 + DynaSLAM on this sequence"
          >
            <Layers className="mr-1 h-3 w-3" />
            Run all 3
          </Button>
        </div>
        <Button
          onClick={backfillAll}
          disabled={busy || sequences.length === 0}
          size="sm"
          variant="ghost"
          className="w-full text-[11px]"
          title="Enqueue every (sequence × method) pair that has no recent run"
        >
          Backfill comparison matrix · {sequences.length} seq × 3
        </Button>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-1 text-[10px]">
            <Badge variant="outline" className="border-border text-muted-foreground">
              <Clock className="mr-1 h-3 w-3" /> {counts.queued}
            </Badge>
            <Badge variant="outline" className="border-signal-causal/40 text-signal-causal">
              <Loader2 className="mr-1 h-3 w-3" /> {counts.running}
            </Badge>
            <Badge variant="outline" className="border-signal-fe/40 text-signal-fe">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {counts.done}
            </Badge>
            {counts.failed > 0 && (
              <Badge variant="outline" className="border-destructive/40 text-destructive">
                <XCircle className="mr-1 h-3 w-3" /> {counts.failed}
              </Badge>
            )}
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]">
                <History className="mr-1 h-3 w-3" />
                History ({runs.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle className="font-mono text-sm">
                  Run History · last {runs.length}
                </DialogTitle>
              </DialogHeader>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(["all", "vkan", "orb3", "dynaslam"] as const).map((m) => (
                    <Button
                      key={m}
                      size="sm"
                      variant={methodFilter === m ? "default" : "outline"}
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setMethodFilter(m)}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => download("runs.csv", toCsv(filtered), "text/csv")}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[10px]"
                    onClick={() =>
                      download("runs.tex", toLatex(filtered), "application/x-latex")
                    }
                  >
                    <Download className="mr-1 h-3 w-3" />
                    LaTeX
                  </Button>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">when</TableHead>
                      <TableHead className="text-[10px]">sequence</TableHead>
                      <TableHead className="text-[10px]">method</TableHead>
                      <TableHead className="text-[10px]">status</TableHead>
                      <TableHead className="text-right text-[10px]">ATE-RMSE</TableHead>
                      <TableHead className="text-right text-[10px]">RPE-t</TableHead>
                      <TableHead className="text-right text-[10px]">tracked %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                          loading…
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-xs text-muted-foreground">
                          no runs yet — enqueue one above
                        </TableCell>
                      </TableRow>
                    )}
                    {filtered.map((r) => {
                      const sb = statusBadge(r.status);
                      const Icon = sb.icon;
                      const m = r.metrics ?? {};
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-[10px] text-muted-foreground">
                            {new Date(r.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-[10px]">
                            {r.sequence_name}
                          </TableCell>
                          <TableCell className="font-mono text-[10px] uppercase">
                            {r.method}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", sb.cls)}>
                              <Icon
                                className={cn(
                                  "mr-1 h-3 w-3",
                                  r.status === "running" && "animate-spin",
                                )}
                              />
                              {sb.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-[10px] tabular-nums">
                            {m.ate_rmse?.toFixed(4) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[10px] tabular-nums">
                            {m.rpe_trans?.toFixed(4) ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-[10px] tabular-nums">
                            {m.tracking_pct?.toFixed(1) ?? "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </Panel>
  );
}