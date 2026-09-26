import { useEffect, useRef } from 'react';

/** A slow 2D canvas starfield for the hub header (no three.js on the hub). */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d');
    if (!g) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const stars = Array.from({ length: 220 }, () => ({
      x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 6.28,
      hue: ['255,255,255', '207,216,255', '255,231,196', '185,200,255'][Math.floor(Math.random() * 4)],
    }));
    let raf = 0, w = 0, h = 0, last = performance.now();
    const resize = () => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      g.clearRect(0, 0, w, h);
      for (const s of stars) {
        if (!reduced) {
          s.x -= dt * 0.004 * s.z;
          if (s.x < 0) s.x += 1;
          s.tw += dt * (0.6 + s.z);
        }
        const a = 0.35 + 0.45 * s.z * (0.75 + 0.25 * Math.sin(s.tw));
        g.fillStyle = `rgba(${s.hue},${a})`;
        g.beginPath();
        g.arc(s.x * w, s.y * h, 0.5 + s.z * 1.1, 0, 6.28);
        g.fill();
      }
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const onVis = () => {
      if (!document.hidden && !reduced) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}
