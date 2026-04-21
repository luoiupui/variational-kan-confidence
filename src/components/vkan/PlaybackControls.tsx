import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Props {
  playing: boolean;
  frame: number;
  total: number;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (n: number) => void;
  onSpeed: (s: number) => void;
  isKeyframe?: boolean;
}

export function PlaybackControls({
  playing,
  frame,
  total,
  speed,
  onPlay,
  onPause,
  onReset,
  onSeek,
  onSpeed,
  isKeyframe,
}: Props) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={playing ? onPause : onPlay}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-8 p-0"
          onClick={onReset}
          aria-label="Reset"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1">
          <Slider
            value={[frame]}
            min={0}
            max={total - 1}
            step={1}
            onValueChange={(v) => onSeek(v[0])}
          />
        </div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {String(frame).padStart(3, "0")}/{total - 1}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {[0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => onSpeed(s)}
              className={`rounded px-2 py-0.5 font-mono text-[10px] transition-colors ${
                speed === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {isKeyframe && (
            <span className="rounded bg-signal-causal/20 px-2 py-0.5 font-mono text-signal-causal">
              ⚡ keyframe trigger
            </span>
          )}
          <span className="rounded border border-border px-2 py-0.5 font-mono">
            simulation · client-side replay
          </span>
        </div>
      </div>
    </div>
  );
}