import { useMemo, useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { buildVolumesFromRuns, VOLUME_LIMIT, type Volume } from "@/lib/reportLog";
import { downloadVolume } from "@/lib/reportDocx";
import { useToast } from "@/hooks/use-toast";
import { useRuns } from "@/hooks/useRuns";

const Reports = () => {
  const { toast } = useToast();
  const { runs, loading, refresh } = useRuns(500);
  const volumes = useMemo<Volume[]>(() => buildVolumesFromRuns(runs), [runs]);
  const [busy, setBusy] = useState<number | null>(null);

  const handleDownload = async (v: Volume) => {
    setBusy(v.id);
    try {
      await downloadVolume(v);
      toast({ title: `Volume ${v.id} downloaded`, description: `${v.entries.length} entries` });
    } catch (e) {
      toast({
        title: "Download failed",
        description: String((e as Error).message ?? e),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const total = volumes.reduce((s, v) => s + v.entries.length, 0);

  return (
    <AppShell>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            Technical Reports · Auto-log
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sourced directly from the <span className="font-mono">runs</span> table in Lovable Cloud —
            survives browser clears and is identical on every machine. Rollover at {VOLUME_LIMIT} entries.
            Each DOCX includes run history, V-KAN vs baseline comparison, strength/weakness analysis,
            ATE chart, and per-run trajectory + free-energy snapshots.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {volumes.length} volume{volumes.length !== 1 && "s"} · {total} entries
          </Badge>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <div className="grid gap-3">
        {volumes.map((v) => {
          const runs = v.entries.filter((e) => e.kind === "run").length;
          return (
            <Panel
              key={v.id}
              title={`Volume ${String(v.id).padStart(2, "0")}`}
              subtitle={`started ${new Date(v.started_at).toLocaleString()} · ${v.entries.length}/${VOLUME_LIMIT} entries · ${runs} runs`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  vkan_report_vol{String(v.id).padStart(2, "0")}.docx
                </div>
                <Button
                  size="sm"
                  onClick={() => handleDownload(v)}
                  disabled={busy === v.id || v.entries.length === 0}
                >
                  {busy === v.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="mr-1 h-3 w-3" />
                  )}
                  Download
                </Button>
              </div>
              {v.entries.length === 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Empty — finish a run on the Stage 4 Run Center to start populating this volume.
                </p>
              )}
            </Panel>
          );
        })}
      </div>
    </AppShell>
  );
};

export default Reports;