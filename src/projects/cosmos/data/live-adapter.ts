import type { Cap, Cgroup, Conn, Delta, Ev, Hello, Host, Irq, Key, OtherAgg, Proc as LiveProc, ProcPatch } from '@play/protocol';
import type { SyscallName } from '../content/syscalls';
import { PROCESSES } from '../content/processes';
import { createEmptyWorld, type World } from '../sim';
import { note, removeProc } from '../sim/state';
import type { Proc } from '../sim/types';

const MiB = 1024 * 1024;
/** Synthetic planet for everything outside the visible set. */
export const OTHER_VPID = -1;
const COMET_FLIGHT = 1.2;

export interface LiveState {
  host: Host | null;
  caps: Set<Cap>;
  tickMs: number;
  seq: number;
  viewers: number;
  conns: Map<string, Conn>;
  cgroups: Cgroup[];
  irq: Irq[];
  other: OtherAgg;
  mem: { dirty: number; writeback: number };
  /** Raw live process records by vpid (for the card: rates, topSys, affinity). */
  raw: Map<number, LiveProc>;
  hostPidNs: number | null;
}

const PALETTE = [...new Set(PROCESSES.map(p => p.color))];
function colorFor(name: string) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return PALETTE[(h >>> 0) % PALETTE.length];
}

function aboutFor(p: LiveProc, host: string) {
  if (p.vpid === OTHER_VPID) return `Every process on ${host} that is not busy enough to get its own planet, gathered into one. Its size is their combined memory.`;
  if (p.kind === 'kernel') return 'Kernel threads, gathered into one planet. They run kernel work such as flushing pages and handling softirqs, and have no user-space memory.';
  if (p.kind === 'init') return `PID 1 on ${host}: the init system. It starts services and adopts orphans.`;
  return `A real process on ${host}. Its name comes from the kernel's 15-character comm field, mapped through an allowlist. Arguments, environment, users and addresses are never sent.`;
}

/**
 * Turns cosmos.live.v1 frames into the same World the view renders for the
 * Sandbox, and replays frame events as sim events spread over the tick.
 */
export class LiveAdapter {
  readonly world: World = createEmptyWorld({ mode: 'live' });
  readonly state: LiveState = {
    host: null, caps: new Set(), tickMs: 1000, seq: -1, viewers: 0, conns: new Map(), cgroups: [], irq: [],
    other: { count: 0, cpu: 0, rssBytes: 0 }, mem: { dirty: 0, writeback: 0 }, raw: new Map(), hostPidNs: null,
  };
  private seenKey = false;

  constructor() {
    this.world.mem.cache = 0;
  }

  hello(h: Hello) {
    const s = this.state;
    s.host = h.host;
    s.caps = new Set(h.caps);
    s.tickMs = h.tickMs || 1000;
    this.world.mem.ram = h.host.memTotalBytes / MiB;
    this.world.uptimeBase = 0;
  }

  key(k: Key) {
    const w = this.world;
    const init = k.procs.find(p => p.kind === 'init');
    if (init?.ns) this.state.hostPidNs = init.ns.pid;
    const incoming = new Set(k.procs.map(p => p.vpid));
    for (const pid of [...w.procs.keys()]) if (pid !== OTHER_VPID && !incoming.has(pid)) this.hidden(pid);
    for (const p of k.procs) {
      if (w.procs.has(p.vpid)) this.patch(p);
      else this.born(p, this.seenKey);
    }
    this.state.conns = new Map(k.conns.map(c => [c.id, c]));
    this.common(k);
    this.seenKey = true;
  }

  delta(d: Delta) {
    // "died" means "left the visible set"; only an exit event means the process ended
    const exited = new Set(d.events.flatMap(e => (e.k === 'exit' ? [e.vpid] : [])));
    for (const p of d.born) this.born(p, true);
    for (const pid of d.died) {
      if (exited.has(pid)) this.died(pid);
      else this.hidden(pid);
    }
    for (const p of d.changed) this.patch(p);
    for (const id of d.connsRemoved) this.state.conns.delete(id);
    for (const c of d.connsAdded) this.state.conns.set(c.id, c);
    this.common(d);
  }

  step(dt: number) {
    const w = this.world;
    w.clock.advance(dt);
    if (w.oom && w.oom.done !== null && w.clock.t - w.oom.done > 2.5) w.oom = null;
  }

  private common(f: Key | Delta) {
    const w = this.world, s = this.state;
    s.seq = f.seq;
    s.viewers = f.viewers;
    s.cgroups = f.cgroups;
    s.irq = f.irq;
    s.other = f.other;
    s.mem = { dirty: f.mem.dirty, writeback: f.mem.writeback };
    w.load = f.load;
    w.mem.ram = f.mem.total / MiB || w.mem.ram;
    w.mem.used = f.mem.used / MiB;
    w.mem.cache = f.mem.cached / MiB;
    w.mem.swap = f.mem.swapTotal / MiB;
    w.mem.swapUsed = f.mem.swapUsed / MiB;

    w.cgroups.clear();
    for (const cg of f.cgroups) {
      w.cgroups.set(cg.label, { quota: Infinity, used: 0, throttled: cg.cpuThrottledPct > 1, nrThrottled: 0, nrPeriods: 0, usage: 0 });
    }

    // CPU beams: who owns each core this tick
    for (const p of w.procs.values()) p.onCpu = -1;
    w.cpus = f.cpus.map(c => {
      const prev = w.cpus[c.id]?.pid ?? null;
      const owner = c.vpid !== null ? w.procs.get(c.vpid) : undefined;
      if (owner) {
        owner.onCpu = c.id;
        owner.lastCpu = c.id;
        if (prev !== owner.pid) w.bus.emit({ type: 'cs', cpu: c.id, pid: owner.pid });
      }
      return { id: c.id, pid: owner ? owner.pid : null };
    });
    w.cs.rate = f.cpus.reduce((a, c) => a + c.switches, 0);

    this.syncOther(f.other);
    this.schedule(f.events, f.ts);
  }

  private syncOther(o: OtherAgg) {
    const w = this.world;
    if (o.count <= 0) {
      const p = w.procs.get(OTHER_VPID);
      if (p) removeProc(w, p);
      this.state.raw.delete(OTHER_VPID);
      return;
    }
    const lp: LiveProc = {
      vpid: OTHER_VPID, ppid: 0, name: `other · ${o.count} procs`, kind: 'kernel', state: 'S', threads: 1, cpu: o.cpu,
      rssBytes: o.rssBytes, minflt: 0, majflt: 0, ctxVol: 0, ctxInvol: 0, sysRate: 0, topSys: [],
    };
    if (w.procs.has(OTHER_VPID)) this.patch(lp);
    else this.born(lp, false);
  }

  private toSim(l: LiveProc, into?: Proc): Proc {
    const host = this.state.host?.name ?? 'the live host';
    const hostNs = this.state.hostPidNs;
    const inPod = l.ns && hostNs !== null && l.ns.pid !== hostNs;
    const fields = {
      pid: l.vpid, ppid: l.ppid, comm: l.name, user: '—', color: colorFor(l.name), about: aboutFor(l, host),
      kind: (l.kind === 'kernel' ? 'kernel' : 'daemon') as Proc['kind'],
      service: l.cgroup, ns: inPod ? `pidns:${l.ns!.pid}` : undefined, nsPid: undefined,
      state: l.state, policy: (l.policy === 'fifo' || l.policy === 'rr' ? 'FIFO' : 'OTHER') as Proc['policy'],
      nice: l.nice ?? 0, affinity: l.affinity && l.affinity.length === 1 ? l.affinity[0] : null,
      cpu: l.cpu, threads: Math.max(1, l.threads), rss: l.rssBytes / MiB, minflt: Math.round(l.minflt), majflt: Math.round(l.majflt),
    };
    if (into) return Object.assign(into, fields);
    return {
      ...fields, main: false, child: false, onCpu: -1, lastCpu: -1, weight: 1024, vruntime: 0,
      swapped: 0, shared: 0, vsz: 0, oomAdj: 0, syscalls: [], busy: 0, fds: [], recent: [], inflight: 0,
      wakeAt: Infinity, lifeEnd: Infinity, zombieAt: 0, ioIrq: false, pendingKill: false, pendingTerm: false,
      didStop: false, leak: false, oomT: null, adoptUntil: 0,
    };
  }

  private born(l: LiveProc, grow: boolean) {
    const w = this.world;
    this.state.raw.set(l.vpid, l);
    const p = this.toSim(l);
    w.procs.set(p.pid, p);
    w.bus.emit({ type: 'proc.spawn', pid: p.pid, near: w.procs.has(l.ppid) ? l.ppid : undefined, grow });
  }

  private patch(patch: ProcPatch) {
    const raw = this.state.raw.get(patch.vpid);
    const p = this.world.procs.get(patch.vpid);
    if (!raw || !p) return;
    Object.assign(raw, patch);
    if (p.state === 'Z') return; // already collapsing
    this.toSim(raw, p);
  }

  private died(pid: number) {
    const w = this.world;
    const p = w.procs.get(pid);
    if (!p || p.state === 'Z') return;
    p.state = 'Z';
    p.onCpu = -1;
    p.zombieAt = w.clock.t;
    if (w.oom && w.oom.pid === pid) w.oom.done = w.clock.t;
    // collapse for one tick so its exit event can still find it, then remove
    w.clock.after(this.state.tickMs / 1000, () => {
      const q = w.procs.get(pid);
      if (q === p) removeProc(w, p, true);
      this.state.raw.delete(pid);
    });
  }

  /** Still running, just no longer busy enough for its own planet: fold it into "other". */
  private hidden(pid: number) {
    const w = this.world;
    const p = w.procs.get(pid);
    if (!p || p.state === 'Z') return;
    const other = w.procs.get(OTHER_VPID);
    if (other) w.bus.emit({ type: 'conn.send', from: pid, to: OTHER_VPID, dur: 0.8 });
    removeProc(w, p, false);
    this.state.raw.delete(pid);
  }

  /** Events happened during the previous tick; replay them spread over this one. */
  private schedule(events: Ev[], frameTs: number) {
    const tick = this.state.tickMs;
    for (const e of events) {
      const delay = Math.min(tick, Math.max(0, e.ts - (frameTs - tick))) / 1000;
      this.world.clock.after(delay, () => this.replay(e));
    }
  }

  private replay(e: Ev) {
    const w = this.world;
    switch (e.k) {
      case 'fork':
        if (w.procs.has(e.parent)) {
          w.bus.emit({ type: 'proc.fork', parent: e.parent, child: e.child, byUser: false });
          note(w, { pid: e.parent }, `fork() → ${e.child}`, '#E4F4F2');
        }
        return;
      case 'exec': {
        const p = w.procs.get(e.vpid);
        if (p) p.comm = e.name;
        note(w, { pid: e.vpid }, `exec → ${e.name}`, '#E4F4F2');
        return;
      }
      case 'exit':
        note(w, { pid: e.vpid }, e.code >= 0 ? `exit(${e.code}) · <defunct>` : 'exited · <defunct>', '#C9C2D6', 1.3);
        return;
      case 'sys': {
        const p = w.procs.get(e.vpid);
        if (!p || p.state === 'Z') return;
        const id = w.nextSyscallId++;
        const name = e.nr as SyscallName;
        w.bus.emit({ type: 'syscall.issue', id, pid: p.pid, name, dur: COMET_FLIGHT });
        w.clock.after(COMET_FLIGHT, () => {
          const alive = w.procs.get(p.pid) === p;
          w.bus.emit({ type: 'syscall.land', id, pid: p.pid, name, hit: alive });
          if (alive) {
            p.recent.unshift({ name, t: w.clock.t });
            if (p.recent.length > 6) p.recent.pop();
            note(w, { pid: p.pid }, e.nr + '()', '#FFE7A8', 1.2);
          }
        });
        return;
      }
      case 'signal':
        note(w, { pid: e.to }, `SIG${e.sig}${e.delivered ? '' : ' (pending)'}`, e.sig === 'KILL' ? '#FF8A7A' : '#B7C4E0');
        return;
      case 'oom': {
        const p = w.procs.get(e.vpid);
        if (!p) return;
        p.oomT = w.clock.t;
        w.oom = { pid: p.pid, t: w.clock.t, done: null };
        note(w, { pid: p.pid }, `OOM killer chose ${p.comm}`, '#FFB38A', 2);
        return;
      }
      case 'conn':
        note(w, { place: 'nic' }, `TCP ${e.from} → ${e.to}`, '#7FF0FF', undefined, 1.4);
        return;
    }
  }
}
