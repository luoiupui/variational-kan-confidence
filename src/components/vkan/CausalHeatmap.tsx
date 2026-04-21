interface Props {
  adjacency: number[][];
  labels: string[];
}

export function CausalHeatmap({ adjacency, labels }: Props) {
  const n = labels.length;
  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-[2px]"
        style={{ gridTemplateColumns: `auto repeat(${n}, minmax(28px, 1fr))` }}
      >
        <div />
        {labels.map((l) => (
          <div
            key={`col-${l}`}
            className="text-center font-mono text-[10px] text-muted-foreground"
          >
            {l}
          </div>
        ))}
        {adjacency.map((row, i) => (
          <div key={`r-${i}`} className="contents">
            <div className="pr-2 text-right font-mono text-[10px] text-muted-foreground">
              {labels[i]}
            </div>
            {row.map((v, j) => (
              <div
                key={`c-${i}-${j}`}
                className="aspect-square rounded-[3px] border border-border/40"
                style={{
                  background:
                    i === j
                      ? "hsl(var(--muted))"
                      : v
                        ? `hsl(var(--signal-causal) / ${0.35 + v * 0.55})`
                        : "hsl(var(--secondary))",
                }}
                title={`${labels[i]} → ${labels[j]} : ${v}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>weak</span>
        <div className="h-2 w-32 rounded bg-gradient-to-r from-secondary to-signal-causal" />
        <span>strong</span>
      </div>
    </div>
  );
}