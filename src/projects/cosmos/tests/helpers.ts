import { createWorld, record, step, type World } from '../sim';
import type { Proc } from '../sim/types';

export const world = (seed = 42) => createWorld({ seed });

export const byComm = (w: World, comm: string) => [...w.procs.values()].find(p => p.comm === comm)!;

/** Step until pred is true or maxSec passes. Returns sim seconds taken, or -1. */
export function until(w: World, pred: () => boolean, maxSec = 60, dt = 0.02): number {
  const start = w.clock.t;
  for (let i = 0; i < maxSec / dt; i++) {
    if (pred()) return w.clock.t - start;
    step(w, dt);
  }
  return pred() ? w.clock.t - start : -1;
}

/** Freeze every process except `keep` in T so it cannot interfere. */
export function isolate(w: World, keep: Proc[]) {
  for (const p of w.procs.values()) {
    if (keep.includes(p)) continue;
    p.state = 'T';
    p.onCpu = -1;
  }
  for (const c of w.cpus) c.pid = null;
}

/** Make a task CPU-bound: never blocks, only issues non-blocking syscalls. */
export function cpuBound(p: Proc) {
  p.state = 'R';
  p.busy = 1.2;
  p.syscalls = ['clock_gettime'];
}

export { record };
