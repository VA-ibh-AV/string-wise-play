/**
 * Fixed-step loop. The sim steps at `hz`; `render` gets the interpolation alpha,
 * the real frame delta and the scaled (sim-speed) delta.
 */
export interface LoopOptions {
  step: (dt: number) => void;
  render: (alpha: number, realDt: number, simDt: number) => void;
  hz?: number;
}

export interface Loop {
  start(): void;
  stop(): void;
  setSpeed(speed: number): void;
  readonly speed: number;
  readonly dt: number;
}

export function createLoop({ step, render, hz = 50 }: LoopOptions): Loop {
  const dt = 1 / hz;
  let acc = 0;
  let last = 0;
  let raf = 0;
  let running = false;
  let speed = 1;

  const frame = (now: number) => {
    const real = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += real * speed;
    const cap = Math.ceil(8 * Math.max(1, speed));
    let n = 0;
    while (acc >= dt && n < cap) {
      step(dt);
      acc -= dt;
      n++;
    }
    if (n >= cap) acc = 0; // fell behind: drop time rather than spiral
    render(acc / dt, real, real * speed);
    raf = requestAnimationFrame(frame);
  };

  const resume = () => {
    if (!running || raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };
  const halt = () => {
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = () => (document.hidden ? halt() : resume());

  return {
    start() {
      if (running) return;
      running = true;
      document.addEventListener('visibilitychange', onVisibility);
      if (!document.hidden) resume();
    },
    stop() {
      running = false;
      halt();
      document.removeEventListener('visibilitychange', onVisibility);
    },
    setSpeed(s) {
      speed = Math.max(0, s);
    },
    get speed() {
      return speed;
    },
    dt,
  };
}
