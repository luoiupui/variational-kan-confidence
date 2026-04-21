import { useEffect, useRef, useState } from "react";

export function usePlayhead(total: number, defaultSpeed = 1) {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(defaultSpeed);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  useEffect(() => {
    if (!playing) return;
    const tick = (t: number) => {
      if (!last.current) last.current = t;
      const dt = t - last.current;
      last.current = t;
      // ~30 frames/sec at speed=1
      setFrame((f) => {
        const next = f + (dt / 1000) * 30 * speed;
        if (next >= total - 1) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      last.current = 0;
    };
  }, [playing, speed, total]);

  const reset = () => {
    setFrame(0);
    setPlaying(false);
  };

  return {
    frame: Math.floor(frame),
    frameFloat: frame,
    playing,
    speed,
    setSpeed,
    setFrame: (n: number) => setFrame(Math.max(0, Math.min(total - 1, n))),
    play: () => {
      if (frame >= total - 1) setFrame(0);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    reset,
    toggle: () => (playing ? setPlaying(false) : setPlaying(true)),
  };
}