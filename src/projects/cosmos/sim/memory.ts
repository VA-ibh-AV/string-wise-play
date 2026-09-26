import { exitProc, reap } from './lifecycle';
import { block, dmesg, note, noteAt, now, procList, throttle, transition } from './state';
import { RAM, SWAP, type Proc, type World } from './types';

/** Shared COW pages are counted once, in the parent, so only rss is summed. */
export const memUsed = (w: World) => w.mem.used ?? procList(w).reduce((s, p) => s + (p.state === 'Z' ? 0 : p.rss), 0);
export const freeMem = (w: World) => w.mem.ram - memUsed(w) - w.mem.cache;

export function oomScore(p: Proc) {
  if (p.oomAdj <= -1000 || p.kind === 'kernel' || p.pid === 1) return 0;
  return Math.max(0, Math.min(1000, Math.round(((p.rss + p.swapped) / (RAM + SWAP)) * 1000) + p.oomAdj));
}

/** kswapd: evict page cache first, then swap out idle pages from the largest tasks. */
export function kswapd(w: World) {
  if (freeMem(w) >= 48) return;
  const m = w.mem;
  if (m.cache > 24) {
    const drop = Math.min(m.cache - 24, 48 - freeMem(w) + 16);
    m.cache -= drop;
    w.bus.emit({ type: 'cache.evict', mb: drop });
    throttle(w, 'evict', () => note(w, { place: 'cache' }, `kswapd: evicted ${Math.round(drop)}M of page cache`, '#8FB8FF'));
    if (freeMem(w) >= 48) return;
  }
  for (let n = 0; n < 6 && freeMem(w) < 48 && m.swapUsed < SWAP - 1; n++) {
    const cands = procList(w).filter(
      q => (q.state === 'S' || q.state === 'T' || (q.state === 'R' && q.onCpu < 0 && !q.leak)) &&
        q.kind !== 'kernel' && q.rss > 12 && q.oomAdj > -1000 && q.oomT === null,
    );
    if (!cands.length) break;
    const v = cands.sort((a, b) => b.rss - a.rss)[0];
    const out = Math.min(16, v.rss - 8, SWAP - m.swapUsed);
    v.rss -= out;
    v.swapped += out;
    m.swapUsed += out;
    w.bus.emit({ type: 'swap.out', pid: v.pid, mb: out, visual: n < 2 });
    throttle(w, 'swap' + v.pid, () => noteAt(w, v, `swapped out ${Math.round(out)}M`, '#B7B0C8', 1));
    throttle(w, 'dm-swap', () => dmesg(w, `kswapd0: reclaiming, swapped out pages of ${v.comm}[${v.pid}]`), 3);
  }
  if (freeMem(w) < 10 && !w.oom) oomKill(w);
}

export function oomKill(w: World) {
  const cands = procList(w).filter(q => q.state !== 'Z' && oomScore(q) > 0);
  if (!cands.length) return;
  const v = cands.sort((a, b) => oomScore(b) - oomScore(a))[0];
  const score = oomScore(v);
  w.oom = { pid: v.pid, t: now(w), done: null };
  v.oomT = now(w);
  transition(w, v, 'R', 'chosen by OOM killer');
  v.onCpu = -1;
  dmesg(w, `Out of memory: Killed process ${v.pid} (${v.comm}) total-vm:${Math.round(v.vsz)}M, anon-rss:${Math.round(v.rss)}M, oom_score:${score}`);
  w.bus.emit({ type: 'oom.select', pid: v.pid, score });
  noteAt(w, v, `OOM killer chose ${v.comm} (oom_score ${score})`, '#FFB38A', 2);
}

/** Called every step: the victim is swallowed 2.6 s after being chosen. */
export function stepOom(w: World) {
  const o = w.oom;
  if (!o) return;
  const v = w.procs.get(o.pid);
  if (o.done === null && v && v.oomT !== null && now(w) - v.oomT > 2.6) {
    exitProc(w, v, 'OOM-killed (SIGKILL)', false);
    w.bus.emit({ type: 'oom.kill', pid: v.pid, comm: v.comm });
    reap(w, v);
    o.done = now(w);
  } else if (o.done === null && !v) {
    o.done = now(w);
  }
  if (o.done !== null && now(w) - o.done > 2.5) w.oom = null;
}

export function majorFault(w: World, p: Proc) {
  const amt = Math.min(8, p.swapped);
  // under heavy pressure the fault waits for reclaim
  if (freeMem(w) < 48 && w.mem.swapUsed > SWAP * 0.5) return;
  p.swapped -= amt;
  w.mem.swapUsed = Math.max(0, w.mem.swapUsed - amt);
  p.rss += amt;
  p.majflt++;
  block(w, p, 'D', w.rng.range(0.8, 1.4), 'major page fault');
  w.bus.emit({ type: 'fault.major', pid: p.pid, mb: amt });
  noteAt(w, p, 'major page fault: swap-in from disk', '#FFB38A', 1);
}

export function cowCopy(w: World, p: Proc) {
  const amt = Math.min(4, p.shared);
  p.shared -= amt;
  p.rss += amt;
  p.minflt++;
  w.bus.emit({ type: 'cow.copy', pid: p.pid, mb: amt });
  noteAt(w, p, 'write → copy-on-write page copy', '#FFFFFF', 0.9);
}

export function dropCaches(w: World) {
  const d = w.mem.cache - 8;
  w.mem.cache = 8;
  w.bus.emit({ type: 'cache.drop', mb: d });
  note(w, { place: 'cache' }, `dropped ${Math.round(Math.max(0, d))}M of clean page cache`, '#8FB8FF');
}

/** File reads slowly refill the cache while there is room. */
export function refillCache(w: World, dt: number) {
  if (freeMem(w) > 120 && w.mem.cache < 170) w.mem.cache += 3 * dt;
}
