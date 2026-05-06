import { useEffect, useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Trash2, Loader2 } from "lucide-react";
import {
  clearLog,
  getVolumes,
  VOLUME_LIMIT,
  type Volume,
} from "@/lib/reportLog";
import { downloadVolume } from "@/lib/reportDocx";
import { useToast } from "@/hooks/use-toast";
import { useAutoReport } from "@/hooks/useAutoReport";

const Reports = () => {
  useAutoReport();
  const { toast } = useToast();
  const [volumes, setVolumes] = useState<Volume[]>(() => getVolumes());
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => setVolumes(getVolumes());
    window.addEventListener("vkan-report-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("vkan-report-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

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
            Every completed run is appended automatically · rollover at {VOLUME_LIMIT} entries ·
            download any volume as DOCX with run history, comparison tables, strength/weakness analysis, and embedded ATE chart.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {volumes.length} volume{volumes.length !== 1 && "s"} · {total} entries
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Clear all logged volumes? This cannot be undone.")) {
                clearLog();
                setVolumes(getVolumes());
              }
            }}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Reset log
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