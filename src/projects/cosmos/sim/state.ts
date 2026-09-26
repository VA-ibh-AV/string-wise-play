import type { ProcDef } from '../content/processes';
import type { Anchor } from './events';
import { exitProc } from './lifecycle';
import type { CGroup, Proc, PState, World } from './types';

export const now = (w: World) => w.clock.t;

export function note(w: World, at: Anchor, text: string, color: string, up?: number, life?: number) {
  w.bus.emit({ type: 'note', text, color, at, up, life });
}
export const noteAt = (w: World, p: Proc, text: string, color: string, up = 1.4) => note(w, { pid: p.pid }, text, color, up);

export function dmesg(w: World, text: string) {
  const line = `[${(w.uptimeBase + now(w)).toFixed(3)}] ${text}`;
  w.dmesg.unshift(line);
  if (w.dmesg.length > 6) w.dmesg.pop();
  w.bus.emit({ type: 'dmesg', line });
}

/** Run fn at most once per `gap` sim seconds for a given key (keeps labels readable). */
export function throttle(w: World, key: string, fn: () => void, gap = 2.5) {
  if ((w.popT[key] ?? -99) + gap > now(w)) return;
  w.popT[key] = now(w);
  fn();
}

export const byPid = (w: World, pid: number) => w.procs.get(pid);
export const procList = (w: World) => [...w.procs.values()];
export const isAlive = (w: World, p: Proc) => w.procs.get(p.pid) === p;

/** The one place a process changes state, so every change is an event. */
export function transition(w: World, p: Proc, to: PState, reason: string) {
  const from = p.state;
  if (from === to) return;
  p.state = to;
  if (to !== 'R') p.onCpu = -1;
  w.bus.emit({ type: 'proc.state', pid: p.pid, from, to, reason });
}

export function minVruntime(w: World) {
  let m = Infinity;
  for (const p of w.procs.values()) if (p.state === 'R' && p.vruntime < m) m = p.vruntime;
  return m === Infinity ? 0 : m;
}

export function wake(w: World, p: Proc, reason = 'woken') {
  if (p.state !== 'S' && p.state !== 'D') return;
  if (p.state === 'D' && p.pendingKill) {
    exitProc(w, p, 'killed by SIGKILL (after its I/O finished)', true);
    return;
  }
  transition(w, p, 'R', reason);
  // CFS: a woken task gets no more than a small bonus over the current minimum
  p.vruntime = Math.max(p.vruntime, minVruntime(w) - 6);
}

export function block(w: World, p: Proc, st: 'S' | 'D', dur: number, reason: string) {
  transition(w, p, st, reason);
  p.wakeAt = now(w) + dur;
  p.ioIrq = false;
  p.onCpu = -1;
}

export function cgOf(w: World, p: { service?: string }): CGroup | null {
  if (!p.service) return null;
  let cg = w.cgroups.get(p.service);
  if (!cg) {
    cg = { quota: Infinity, used: 0, throttled: false, nrThrottled: 0, nrPeriods: 0, usage: 0 };
    w.cgroups.set(p.service, cg);
  }
  return cg;
}

export const weightFor = (nice: number) => 1024 / Math.pow(1.25, nice);

export function spawnProc(w: World, def: ProcDef, opts: { near?: number; grow?: boolean; state?: PState } = {}): Proc {
  const r = w.rng;
  const nice = def.nice ?? 0;
  const p: Proc = {
    pid: def.pid, ppid: def.ppid, comm: def.comm, user: def.user, color: def.color, about: def.about,
    kind: def.kind, service: def.service, main: !!def.main, child: !!def.child, ns: def.ns, nsPid: def.nsPid,
    state: opts.state ?? 'S', onCpu: -1, lastCpu: -1, policy: 'OTHER', nice, weight: weightFor(nice),
    vruntime: r.range(0, 40), affinity: null, cpu: 0,
    threads: def.threads, rss: def.rss, swapped: 0, shared: def.shared ?? 0, vsz: def.vsz,
    minflt: Math.floor(r.range(200, 3000)), majflt: Math.floor(r.range(0, 20)), oomAdj: 0,
    syscalls: [...def.syscalls], busy: def.busy, fds: [...def.fds], recent: [], inflight: 0,
    wakeAt: now(w) + r.range(0.5, 5), lifeEnd: Infinity, zombieAt: 0, ioIrq: false,
    pendingKill: false, pendingTerm: false, didStop: false, leak: false, oomT: null, adoptUntil: 0,
  };
  w.procs.set(p.pid, p);
  w.bus.emit({ type: 'proc.spawn', pid: p.pid, near: opts.near, grow: !!opts.grow });
  return p;
}

export function removeProc(w: World, p: Proc, burst = false) {
  if (!isAlive(w, p)) return;
  w.procs.delete(p.pid);
  for (const c of w.cpus) if (c.pid === p.pid) c.pid = null;
  w.bus.emit({ type: 'proc.remove', pid: p.pid, burst });
  if (w.view.selected === p.pid) {
    w.view.selected = null;
    w.bus.emit({ type: 'ui.select', pid: null });
  }
}

export function pushRecent(w: World, p: Proc, name: Proc['recent'][number]['name']) {
  p.recent.unshift({ name, t: now(w) });
  if (p.recent.length > 6) p.recent.pop();
}
