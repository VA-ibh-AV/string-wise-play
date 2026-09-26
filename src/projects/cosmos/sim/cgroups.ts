import { cgOf, noteAt, procList } from './state';
import { CG_PERIOD, type World } from './types';

export const CHECKOUT = 'kubepods/checkout';

/** After charging a slice: throttle any group that used up quota × period, and roll periods. */
export function cgroupTick(w: World) {
  for (const cg of w.cgroups.values()) cg.usage *= 0.8;
  for (const c of w.cpus) {
    const p = c.pid !== null ? w.procs.get(c.pid) : undefined;
    const cg = p && cgOf(w, p);
    if (cg) cg.usage += 0.2;
  }
  w.cgTick++;
  for (const [name, cg] of w.cgroups) {
    if (cg.quota !== Infinity && !cg.throttled && cg.used >= cg.quota * CG_PERIOD) {
      cg.throttled = true;
      cg.nrThrottled++;
      const all = procList(w);
      const m = all.find(q => q.service === name && q.state === 'R') ?? all.find(q => q.service === name);
      if (m) noteAt(w, m, 'cpu.max quota used up: throttled', '#FF8A7A');
      w.bus.emit({ type: 'cgroup.throttle', name, quota: cg.quota });
    }
  }
  if (w.cgTick >= CG_PERIOD) {
    w.cgTick = 0;
    for (const cg of w.cgroups.values()) {
      cg.used = 0;
      cg.throttled = false;
      cg.nrPeriods++;
    }
  }
}

export function setQuota(w: World, name: string, quota: number) {
  const cg = cgOf(w, { service: name })!;
  cg.quota = quota;
  cg.used = 0;
  cg.throttled = false;
  w.bus.emit({ type: 'cgroup.limit', name, quota });
  const m = procList(w).find(p => p.service === name);
  if (m) noteAt(w, m, quota === Infinity ? 'cpu.max: max' : `cpu.max: ${quota * 100000} 100000 (${quota} CPU)`, '#FFE7A8');
}

export const isThrottled = (w: World, service?: string) => !!(service && w.cgroups.get(service)?.throttled);
