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
    const tryGet = (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);
    let s: MediaStream | null = null;
    try {
      // 1) Preferred: rear camera at target resolution, but use `ideal` so
      //    the browser doesn't stall when the exact combo isn't available.
      s = await tryGet({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });
    } catch (e1) {
      try {
        // 2) Fallback: any camera, any resolution. Fixes laptops with only a
        //    front webcam where `environment` causes "Timeout starting video source".
        s = await tryGet({ video: true, audio: false });
      } catch (e2) {
        const err = e2 instanceof Error ? e2 : new Error(String(e2));
        let msg = err.message || String(err);
        if (err.name === "NotAllowedError")
          msg = "Camera permission denied. Allow camera access in your browser settings.";
        else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
          msg = "No camera found on this device.";
        else if (err.name === "NotReadableError" || /timeout/i.test(msg))
          msg = "Camera is busy or unreachable. Close other apps using the camera (Zoom, Teams, OBS) and retry.";
        setError(msg);
        return;
      }
    }
    streamRef.current = s;
    if (videoRef.current && s) {
      videoRef.current.srcObject = s;
      try { await videoRef.current.play(); } catch { /* autoplay race; ignore */ }
    }
    setActive(true);
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