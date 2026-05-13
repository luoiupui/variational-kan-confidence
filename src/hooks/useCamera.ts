import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraOptions {
  width?: number;
  height?: number;
  fps?: number; // capture rate, not stream rate
  quality?: number; // jpeg quality 0..1
}

export function useCamera({ width = 320, height = 240, fps = 2, quality = 0.6 }: CameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width, height, facingMode: "environment" },
        audio: false,
      });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play();
      }
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [width, height]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  /** Grab one JPEG frame as base64 (no data: prefix). */
  const grab = useCallback((): { b64: string; w: number; h: number } | null => {
    const v = videoRef.current;
    if (!v || v.readyState < 2) return null;
    const w = v.videoWidth || width;
    const h = v.videoHeight || height;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const c = canvasRef.current;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, w, h);
    const url = c.toDataURL("image/jpeg", quality);
    return { b64: url.split(",")[1] ?? "", w, h };
  }, [width, height, quality]);

  return { videoRef, active, error, start, stop, grab, fps };
}