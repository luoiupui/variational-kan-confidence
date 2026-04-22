import { cn } from "@/lib/utils";

export function CompletenessBar({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const tone =
    v === 100
      ? "bg-signal-fe"
      : v >= 60
        ? "bg-signal-causal"
        : v > 0
          ? "bg-signal-warn"
          : "bg-border";
  return (
    <div
      className={cn(
        "relative h-1 w-full overflow-hidden rounded bg-secondary/50",
        className,
      )}
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("absolute inset-y-0 left-0 transition-all", tone)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}