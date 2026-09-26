import { cgroupTick, isThrottled } from './cgroups';
import { cowCopy, majorFault } from './memory';
import { block, cgOf, procList } from './state';
import { issueSyscall } from './syscalls';
import { NCPU, type Proc, type World } from './types';

const ALL_CPUS = Array.from({ length: NCPU }, (_, i) => i);

export const isEligible = (w: World, p: Proc) => p.state === 'R' && p.oomT === null && !isThrottled(w, p.service);

/** Pick up to NCPU tasks: SCHED_FIFO first (the running one keeps its CPU), then CFS by smallest vruntime. */
export function pickNext(w: World): (Proc | null)[] {
  const all = procList(w);
  const rt = all
    .filter(p => isEligible(w, p) && p.policy === 'FIFO')
    .sort((a, b) => Number(b.onCpu >= 0) - Number(a.onCpu >= 0));
  const cfs = all.filter(p => isEligible(w, p) && p.policy !== 'FIFO').sort((a, b) => a.vruntime - b.vruntime);
  const next: (Proc | null)[] = new Array(NCPU).fill(null);
  for (const p of [...rt, ...cfs]) {
    const allowed = p.affinity === null ? ALL_CPUS : [p.affinity];
    // prefer the CPU it ran on last (cache warmth)
    let slot = allowed.find(i => i === p.lastCpu && !next[i]);
    if (slot === undefined) slot = allowed.find(i => !next[i]);
    if (slot !== undefined) next[slot] = p;
    if (next.every(Boolean)) break;
  }
  return next;
}

/** One scheduler slice. */
export function schedTick(w: World) {
  // charge the slice that just ended
  for (const c of w.cpus) {
    const p = c.pid !== null ? w.procs.get(c.pid) : undefined;
    if (!p || p.state !== 'R') continue;
    p.vruntime += (4 * 1024) / p.weight;
    const cg = cgOf(w, p);
    if (cg) cg.used++;
    w.irq.perCpu[c.id].loc++;
  }
  cgroupTick(w);

  const next = pickNext(w);
  for (const c of w.cpus) {
    const n = next[c.id];
    if (n && n.pid !== c.pid) {
      w.cs.total++;
      w.cs.sec++;
      w.bus.emit({ type: 'cs', cpu: c.id, pid: n.pid });
    }
    c.pid = n ? n.pid : null;
  }
  for (const p of w.procs.values()) p.onCpu = -1;
  for (const c of w.cpus) {
    const p = c.pid !== null ? w.procs.get(c.pid) : undefined;
    if (p) {
      p.onCpu = c.id;
      p.lastCpu = c.id;
    }
  }
  for (const p of w.procs.values()) p.cpu = p.cpu * 0.86 + (p.onCpu >= 0 ? 0.14 : 0);

  const r = w.rng;
  for (const c of w.cpus) {
    const p = c.pid !== null ? w.procs.get(c.pid) : undefined;
    if (!p) continue;
    // running code makes syscalls; some tasks simply finish their burst and sleep
    const chance = p.policy === 'FIFO' ? 0.1 : 0.18 + p.busy * 0.25;
    if (r.chance(chance) && p.inflight === 0) issueSyscall(w, p, r.pick(p.syscalls));
    else if (p.policy !== 'FIFO' && !p.leak && r.chance(0.3 * (1.1 - p.busy))) {
      block(w, p, 'S', r.range(4, 10), 'burst finished');
      continue;
    }
    // touching memory
    if (p.swapped > 0 && r.chance(0.4)) majorFault(w, p);
    else if (r.chance(0.5)) p.minflt += Math.floor(r.range(1, 30));
    if (p.shared > 0 && r.chance(0.5)) cowCopy(w, p);
  }

  // load average counts R and D, as on Linux
  const nr = procList(w).filter(p => p.state === 'R' || p.state === 'D').length;
  const [l1, l5, l15] = w.load;
  w.load = [l1 * 0.92 + nr * 0.08, l5 * 0.985 + nr * 0.015, l15 * 0.995 + nr * 0.005];
}
