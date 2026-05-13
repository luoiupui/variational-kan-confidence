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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      return cams;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
  }, [refreshDevices]);

  const start = useCallback(async (preferredId?: string) => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not expose camera APIs. Use Chrome/Edge over https:// or http://localhost.");
      return;
    }
    if (!window.isSecureContext) {
      setError("Camera requires a secure context (https:// or localhost). Current origin is not secure.");
      return;
    }
    // Permissions probe (Chromium only). Don't fail on unsupported browsers.
    try {
      // @ts-expect-error - "camera" is valid in Chromium
      const status = await navigator.permissions?.query?.({ name: "camera" });
      if (status?.state === "denied") {
        setError("Camera permission is blocked for this site. Click the lock icon in the address bar → allow Camera, then retry.");
        return;
      }
    } catch { /* ignore */ }

    const tryGet = (constraints: MediaStreamConstraints) =>
      navigator.mediaDevices.getUserMedia(constraints);
    let s: MediaStream | null = null;
    const id = preferredId ?? deviceId ?? undefined;
    try {
      // 1) Preferred: explicit deviceId if we have one, else just any video.
      //    Avoid `facingMode: environment` on desktop — it filters out USB
      //    webcams that don't advertise a facing mode and yields NotFoundError.
      s = await tryGet({
        video: id
          ? { deviceId: { exact: id }, width: { ideal: width }, height: { ideal: height } }
          : { width: { ideal: width }, height: { ideal: height } },
        audio: false,
      });
    } catch (e1) {
      try {
        // 2) Last-resort fallback: any camera, any resolution.
        s = await tryGet({ video: true, audio: false });
      } catch (e2) {
        const err = e2 instanceof Error ? e2 : new Error(String(e2));
        let msg = err.message || String(err);
        if (err.name === "NotAllowedError")
          msg = "Camera permission denied. Click the lock icon in the address bar → allow Camera, then retry.";
        else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError")
          msg =
            "No camera detected by the browser. On Windows 11: Settings → Privacy & security → Camera → enable 'Camera access' and 'Let apps access your camera' and 'Let desktop apps access your camera'. Then unplug/replug the USB camera and reload this page.";
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
    // Now that the user has granted permission, device labels become readable.
    const cams = await refreshDevices();
    const activeId = s?.getVideoTracks?.()[0]?.getSettings?.().deviceId;
    if (activeId) setDeviceId(activeId);
    else if (cams[0]) setDeviceId(cams[0].deviceId);
    setActive(true);
  }, [width, height, deviceId, refreshDevices]);

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

  return { videoRef, active, error, start, stop, grab, fps, devices, deviceId, setDeviceId, refreshDevices };
}