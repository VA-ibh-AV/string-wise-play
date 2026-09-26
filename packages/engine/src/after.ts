/**
 * Sim clock with a scheduler. Delayed effects (grace periods, restarts, travel
 * time of an interrupt) run on sim time, never on setTimeout.
 */
export interface SimClock {
  readonly t: number;
  after(sec: number, fn: () => void): void;
  advance(dt: number): void;
  pending(): number;
}

export function createClock(): SimClock {
  let t = 0;
  let seq = 0;
  // kept sorted by (at, seq) so timers due at the same instant run in order
  const timers: { at: number; seq: number; fn: () => void }[] = [];
  return {
    get t() {
      return t;
    },
    after(sec, fn) {
      const timer = { at: t + Math.max(0, sec), seq: seq++, fn };
      let i = timers.length;
      while (i > 0 && (timers[i - 1].at > timer.at || (timers[i - 1].at === timer.at && timers[i - 1].seq > timer.seq))) i--;
      timers.splice(i, 0, timer);
    },
    advance(dt) {
      t += dt;
      while (timers.length && timers[0].at <= t) timers.shift()!.fn();
    },
    pending: () => timers.length,
  };
}

export const after = (world: { clock: SimClock }, sec: number, fn: () => void) => world.clock.after(sec, fn);
