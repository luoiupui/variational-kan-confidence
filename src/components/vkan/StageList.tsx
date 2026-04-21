import { STAGE_INFO } from "@/lib/vkan-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Hourglass, RotateCw, Play } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const statusConfig = {
  complete: { icon: CheckCircle2, label: "complete", className: "border-signal-fe/40 text-signal-fe" },
  active: { icon: Loader2, label: "active", className: "border-signal-causal/40 text-signal-causal" },
  planned: { icon: Hourglass, label: "planned", className: "border-border text-muted-foreground" },
} as const;

export function StageList({ showRestart = false }: { showRestart?: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);

  const restart = (id: number, name: string) => {
    setBusy(id);
    setTimeout(() => {
      setBusy(null);
      toast({
        title: `Stage ${id} re-queued`,
        description: `${name} will re-run with the current configuration.`,
      });
    }, 700);
  };

  return (
    <ol className="space-y-3">
      {STAGE_INFO.map((s) => {
        const cfg = statusConfig[s.status];
        const Icon = cfg.icon;
        return (
          <li
            key={s.id}
            className="rounded-md border border-border bg-secondary/30 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon className={`h-3.5 w-3.5 ${cfg.className.split(" ").pop()}`} />
                <span className="font-mono text-sm">{s.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={cfg.className}>
                  {cfg.label}
                </Badge>
                {showRestart && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-[11px]"
                    disabled={busy === s.id}
                    onClick={() => restart(s.id, s.name)}
                  >
                    {busy === s.id ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : s.status === "planned" ? (
                      <Play className="mr-1 h-3 w-3" />
                    ) : (
                      <RotateCw className="mr-1 h-3 w-3" />
                    )}
                    {s.status === "planned" ? "Start" : "Restart"}
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{s.summary}</p>
            {s.artifacts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {s.artifacts.map((a) => (
                  <code
                    key={a}
                    className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/70"
                  >
                    {a}
                  </code>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}