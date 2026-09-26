import { createBus, createClock, createRng } from '@play/engine';
import { PROCESSES } from '../content/processes';
import type { LensId } from '../content/lenses';
import type { MissionId } from '../content/missions';
import { CHECKOUT, setQuota } from './cgroups';
import type { Signal, SimEvent } from './events';
import { diskInterrupt, stepInterrupts, trafficBurst } from './interrupts';
import { exitProc, forkProc, reap, startLeak } from './lifecycle';
import { dropCaches, kswapd, refillCache, stepOom } from './memory';
import { attachMissions } from './missions';
import { schedTick } from './scheduler';
import { signal } from './signals';
import { block, byPid, isAlive, noteAt, now, procList, spawnProc, wake, weightFor } from './state';
import { dropSyscalls, issueSyscall } from './syscalls';
import { NCPU, RAM, SLICE, SWAP, type World } from './types';

export interface WorldOptions {
  seed?: number;
  /** Missions already completed (from saved progress). */
  done?: Iterable<MissionId>;
}

export function createWorld({ seed = 1, done = [] }: WorldOptions = {}): World {
  const w: World = {
    seed,
    rng: createRng(seed),
    clock: createClock(),
    bus: createBus<SimEvent>(),
    procs: new Map(),
    nextPid: 3100,
    nextSyscallId: 1,
    cpus: Array.from({ length: NCPU }, (_, id) => ({ id, pid: null })),
    mem: { ram: RAM, swap: SWAP, cache: 170, swapUsed: 0, hits: 0, misses: 0, kswapdT: 0 },
    cgroups: new Map(),
    cgTick: 0,
    irq: { perCpu: Array.from({ length: NCPU }, () => ({ eth: 0, nvme: 0, loc: 0 })), netrx: 0, ksoftirqd: 0, next: 2, recent: [] },
    cs: { total: 0, sec: 0, rate: 0, t: 0 },
    load: [1.1, 0.96, 0.88],
    sliceT: 0,
    dmesg: [],
    oom: null,
    uptimeBase: 41 * 86400 + 3 * 3600 + 12 * 60,
    popT: {},
    view: { lens: null, selected: null, nsInside: false },
    missions: new Set(done),
  };
  attachMissions(w);
  PROCESSES.forEach((d, i) => spawnProc(w, d, { state: i % 3 === 0 ? 'R' : 'S' }));
  schedTick(w);
  return w;
}

/** Advance the world by dt sim seconds. Pure: no DOM, no three.js, no wall clock. */
export function step(w: World, dt: number) {
  w.clock.advance(dt);
  const t = now(w);
  const r = w.rng;

  for (const p of procList(w)) {
    if (!isAlive(w, p) || p.oomT !== null) continue;
    if (p.state === 'Z') {
      const parent = byPid(w, p.ppid);
      if (t >= p.zombieAt + (parent ? 7 : 3)) reap(w, p);
      continue;
    }
    if (p.state === 'T') continue;
    if (t >= p.lifeEnd) {
      exitProc(w, p, 'exit(0)', false);
      continue;
    }
    if (p.state === 'S' && t >= p.wakeAt) wake(w, p, 'timeout or event');
    if (p.state === 'D' && t >= p.wakeAt && !p.ioIrq) diskInterrupt(w, p);
    if (p.state === 'R' && p.onCpu < 0 && p.policy !== 'FIFO' && r.chance(dt * 0.3 * (1.2 - p.busy))) block(w, p, 'S', r.range(4, 12), 'waiting for work');
    if (p.leak) {
      const g = 32 * dt;
      p.rss += g;
      p.vsz += g * 1.2;
    }
    if (p.adoptUntil && t > p.adoptUntil) p.adoptUntil = 0;
  }
  stepOom(w);

  if (r.chance(dt * 0.3)) {
    const sleeping = procList(w).filter(p => p.state === 'S');
    if (sleeping.length) wake(w, r.pick(sleeping), 'event');
  }

  // cron forks backup.sh every 35 s
  const cron = procList(w).find(p => p.comm === 'cron' && p.state !== 'Z');
  if (cron && t > (cron.nextJob ?? 12)) {
    cron.nextJob = t + 35;
    if (cron.state === 'S') wake(w, cron, 'timer');
    if (cron.state === 'R') issueSyscall(w, cron, 'clone');
  }

  w.mem.kswapdT += dt;
  if (w.mem.kswapdT > 0.5) {
    w.mem.kswapdT = 0;
    kswapd(w);
  }
  refillCache(w, dt);
  stepInterrupts(w, dt);

  w.sliceT += dt;
  if (w.sliceT >= SLICE) {
    w.sliceT = 0;
    schedTick(w);
  }
  w.cs.t += dt;
  if (w.cs.t >= 1) {
    w.cs.rate = w.cs.rate * 0.5 + (w.cs.sec / w.cs.t) * 0.5;
    w.cs.sec = 0;
    w.cs.t = 0;
  }
}

export type Command =
  | { type: 'select'; pid: number | null }
  | { type: 'lens'; lens: LensId | null }
  | { type: 'nsView'; inside: boolean }
  | { type: 'fork'; pid: number }
  | { type: 'nice'; pid: number; delta: number }
  | { type: 'signal'; pid: number; sig: Signal }
  | { type: 'fifo'; pid: number }
  | { type: 'pin'; pid: number }
  | { type: 'oomProtect'; pid: number }
  | { type: 'reap'; pid: number }
  | { type: 'startLeak' }
  | { type: 'dropCaches' }
  | { type: 'trafficBurst' }
  | { type: 'setQuota'; name: string; quota: number }
  | { type: 'toggleCheckoutLimit' }
  | { type: 'dropSyscalls' };

/** The only way the outside world changes the sim. Returns a new pid for fork. */
export function command(w: World, cmd: Command): number | void {
  switch (cmd.type) {
    case 'select':
      w.view.selected = cmd.pid !== null && w.procs.has(cmd.pid) ? cmd.pid : null;
      w.bus.emit({ type: 'ui.select', pid: w.view.selected });
      return;
    case 'lens':
      w.view.lens = cmd.lens;
      if (cmd.lens !== 'namespaces' && w.view.nsInside) {
        w.view.nsInside = false;
        w.bus.emit({ type: 'ns.view', inside: false });
      }
      w.bus.emit({ type: 'ui.lens', lens: cmd.lens });
      return;
    case 'nsView':
      w.view.nsInside = cmd.inside;
      w.bus.emit({ type: 'ns.view', inside: cmd.inside });
      return;
    case 'startLeak':
      return startLeak(w);
    case 'dropCaches':
      return dropCaches(w);
    case 'trafficBurst':
      return trafficBurst(w);
    case 'setQuota':
      return setQuota(w, cmd.name, cmd.quota);
    case 'toggleCheckoutLimit': {
      const cg = w.cgroups.get(CHECKOUT);
      return setQuota(w, CHECKOUT, cg && cg.quota !== Infinity ? Infinity : 0.5);
    }
    case 'dropSyscalls':
      return dropSyscalls(w);
  }

  const p = w.procs.get(cmd.pid);
  if (!p) return;
  if (cmd.type === 'reap') return reap(w, p, true);
  if (p.state === 'Z') return;
  switch (cmd.type) {
    case 'fork':
      return forkProc(w, p, {}, undefined, true).pid;
    case 'nice':
      p.nice = Math.max(-20, Math.min(19, p.nice + cmd.delta));
      p.weight = weightFor(p.nice);
      w.bus.emit({ type: 'sched.nice', pid: p.pid, nice: p.nice });
      noteAt(w, p, `nice ${p.nice} · weight ${Math.round(p.weight)}`, '#FFE7A8');
      return;
    case 'signal':
      return signal(w, p, cmd.sig);
    case 'fifo':
      p.policy = p.policy === 'FIFO' ? 'OTHER' : 'FIFO';
      w.bus.emit({ type: 'sched.policy', pid: p.pid, policy: p.policy });
      noteAt(w, p, p.policy === 'FIFO' ? 'SCHED_FIFO priority 50: runs before all normal tasks' : 'SCHED_OTHER (CFS)', '#FF8A7A');
      if (p.policy === 'FIFO' && p.state === 'S') wake(w, p, 'SCHED_FIFO');
      return;
    case 'pin':
      p.affinity = p.affinity === null ? 0 : null;
      w.bus.emit({ type: 'sched.affinity', pid: p.pid, cpu: p.affinity });
      noteAt(w, p, p.affinity === null ? 'affinity: CPUs 0-3' : 'affinity: CPU0 only', '#FFE7A8');
      return;
    case 'oomProtect':
      p.oomAdj = p.oomAdj <= -1000 ? 0 : -1000;
      w.bus.emit({ type: 'oom.adj', pid: p.pid, adj: p.oomAdj });
      noteAt(w, p, `oom_score_adj ${p.oomAdj}`, '#FFB38A');
      return;
  }
}

/** Step `sec` sim seconds and return every event emitted (for tests and fast-forward). */
export function record(w: World, sec: number, dt = 0.02): SimEvent[] {
  const events: SimEvent[] = [];
  const off = w.bus.onAny(e => events.push(e));
  const n = Math.round(sec / dt);
  for (let i = 0; i < n; i++) step(w, dt);
  off();
  return events;
}
