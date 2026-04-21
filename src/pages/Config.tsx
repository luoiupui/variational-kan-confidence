import { useState } from "react";
import { AppShell } from "@/components/vkan/AppShell";
import { Panel } from "@/components/vkan/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const Config = () => {
  const { toast } = useToast();
  const [cfg, setCfg] = useState({
    B: 8,
    agree: 0.7,
    K: 20,
    buffer: 30,
    fe_threshold: 110,
    seed: 42,
    dataset: "simulated_orb",
  });

  const update = (k: string, v: string) =>
    setCfg((c) => ({ ...c, [k]: isNaN(Number(v)) ? v : Number(v) }));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vkan_config.json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Config exported", description: "vkan_config.json downloaded." });
  };

  const fields: { key: keyof typeof cfg; label: string; hint: string }[] = [
    { key: "B", label: "B (bootstrap refits)", hint: "How many NOTEARS refits per window." },
    { key: "agree", label: "agree (consensus fraction)", hint: "Edge fires only if ≥ this fraction of refits agree." },
    { key: "K", label: "K (window size)", hint: "Frames per causal window." },
    { key: "buffer", label: "buffer (debounce frames)", hint: "Min frames between two consecutive triggers." },
    { key: "fe_threshold", label: "FE threshold", hint: "Override threshold for FE-based trigger." },
    { key: "seed", label: "random seed", hint: "Seeds NOTEARS bootstrap & sim ORB stream." },
    { key: "dataset", label: "dataset id", hint: "simulated_orb · tum_fr1_desk · …" },
  ];

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Project-wide hyper-parameters for the V-KAN pipeline. Export and drop into{" "}
          <code className="font-mono text-foreground/80">/mnt/documents/vkan_slam/</code>{" "}
          to override defaults on the next run.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Pipeline parameters" subtitle="Bagged-NOTEARS + FE trigger">
          <div className="grid gap-3">
            {fields.map((f) => (
              <div key={f.key} className="grid gap-1">
                <Label htmlFor={f.key} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={f.key}
                  value={String(cfg[f.key])}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="font-mono"
                />
                <p className="text-[10px] text-muted-foreground">{f.hint}</p>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setCfg({ B: 8, agree: 0.7, K: 20, buffer: 30, fe_threshold: 110, seed: 42, dataset: "simulated_orb" })}>
                Reset
              </Button>
              <Button onClick={exportJson}>Export JSON</Button>
            </div>
          </div>
        </Panel>

        <Panel title="Live preview" subtitle="Will be passed to the next run">
          <pre className="overflow-x-auto rounded bg-secondary/40 p-3 font-mono text-xs">
{JSON.stringify(cfg, null, 2)}
          </pre>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Configuration is client-side only in this demo — the offline pipeline reads it via{" "}
            <code className="font-mono">vkan_config.json</code>.
          </p>
        </Panel>
      </div>
    </AppShell>
  );
};

export default Config;