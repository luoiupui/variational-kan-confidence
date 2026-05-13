import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/vkan/Panel";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { supabase } from "@/integrations/supabase/client";

export interface IngestStat {
  ts: number;
  ok: boolean;
  latency: number;
  thumb?: string;
  raw?: string;
}

export function CameraPanel({
  onIngest,
  contextRef,
}: {
  onIngest: (s: IngestStat) => void;
  contextRef: React.MutableRefObject<string>;
}) {
  const cam = useCamera({ width: 320, height: 240, fps: 2, quality: 0.6 });
  const [fps, setFps] = useState(2);
  const [streaming, setStreaming] = useState(false);
  const [tickAgent, setTickAgent] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!streaming || !cam.active) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }
    timerRef.current = window.setInterval(async () => {
      const f = cam.grab();
      if (!f) return;
      const t0 = performance.now();
      try {
        const { data, error } = await supabase.functions.invoke("ingest-frame", {
          body: {
            image_b64: f.b64,
            width: f.w,
            height: f.h,
            tick: tickAgent,
            context: contextRef.current,
          },
        });
        const latency = Math.round(performance.now() - t0);
        if (error) onIngest({ ts: Date.now(), ok: false, latency, raw: error.message });
        else
          onIngest({
            ts: Date.now(),
            ok: true,
            latency,
            thumb: (data as any)?.signed_url ?? undefined,
            raw: (data as any)?.decision?.decision?.raw_output,
          });
      } catch (e) {
        onIngest({ ts: Date.now(), ok: false, latency: -1, raw: String(e) });
      }
    }, Math.max(200, 1000 / fps));
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [streaming, cam.active, fps, tickAgent, cam, contextRef, onIngest]);

  return (
    <Panel
      title="Camera Capture"
      subtitle="getUserMedia → JPEG → Lovable Cloud (agent-frames bucket)"
      right={
        <div className="flex items-center gap-2">
          {!cam.active ? (
            <Button size="sm" onClick={() => cam.start()}>Enable camera</Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => { setStreaming(false); cam.stop(); }}>
              Disable
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="overflow-hidden rounded-md border border-border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            ref={cam.videoRef}
            playsInline
            muted
            className="aspect-[4/3] w-full object-cover"
          />
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted-foreground">device</span>
            <select
              className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1"
              value={cam.deviceId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                cam.setDeviceId(id);
                if (cam.active) {
                  cam.stop();
                  if (id) cam.start(id);
                }
              }}
            >
              {cam.devices.length === 0 && <option value="">(no cameras detected)</option>}
              {cam.devices.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => cam.refreshDevices()}>↻</Button>
          </label>
          <label className="flex items-center gap-2">
            <span className="w-16 text-muted-foreground">rate</span>
            <select
              className="rounded border border-border bg-background px-2 py-1"
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value))}
            >
              <option value={1}>1 fps</option>
              <option value={2}>2 fps</option>
              <option value={5}>5 fps</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tickAgent} onChange={(e) => setTickAgent(e.target.checked)} />
            <span>tick microAgent</span>
          </label>
          <Button
            size="sm"
            disabled={!cam.active}
            variant={streaming ? "destructive" : "default"}
            onClick={() => setStreaming((v) => !v)}
          >
            {streaming ? "Stop streaming" : "Start streaming"}
          </Button>
          {cam.error && (
            <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-[10px] text-destructive">
              {cam.error}
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}