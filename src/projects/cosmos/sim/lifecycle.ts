import { FORK_ABOUT, LEAKY_JOB, NGINX_WORKER, PROCESSES, type ProcDef } from '../content/processes';
import type { Proc, World } from './types';
import { byPid, dmesg, isAlive, minVruntime, note, noteAt, now, procList, pushRecent, removeProc, spawnProc, transition } from './state';

/** fork(): the child shares 80% of the parent's RSS copy-on-write and owns 1 MB. */
export function forkProc(w: World, parent: Proc, over: Partial<ProcDef> = {}, life?: number, byUser = false): Proc {
  const def: ProcDef = {
    pid: w.nextPid++, ppid: parent.pid, comm: parent.comm, user: parent.user, color: parent.color,
    rss: 1, shared: Math.round(parent.rss * 0.8), vsz: parent.vsz, threads: 1, kind: parent.kind,
    service: parent.service, syscalls: parent.syscalls, busy: parent.busy, ns: parent.ns, nice: parent.nice,
    nsPid: parent.ns ? 20 + w.rng.int(1, 39) : undefined,
    fds: parent.fds.slice(0, 2).map(f => f + ' (inherited)'),
    about: FORK_ABOUT, child: true, main: false,
    ...over,
  };
  const c = spawnProc(w, def, { near: parent.pid, grow: true, state: 'R' });
  c.vruntime = minVruntime(w);
  c.lifeEnd = life === undefined ? now(w) + w.rng.range(16, 24) : life;
  w.bus.emit({ type: 'proc.fork', parent: parent.pid, child: c.pid, byUser });
  noteAt(w, parent, 'fork() → ' + c.pid, '#E4F4F2');
  return c;
}

export function exitProc(w: World, p: Proc, reason: string, killed: boolean) {
  if (p.state === 'Z' || !isAlive(w, p)) return;
  transition(w, p, 'Z', reason);
  p.zombieAt = now(w);
  p.exitReason = reason;
  p.pendingKill = false;
  p.pendingTerm = false;
  w.mem.swapUsed = Math.max(0, w.mem.swapUsed - p.swapped);
  p.rss = 0;
  p.swapped = 0;
  p.shared = 0;
  w.bus.emit({ type: 'proc.exit', pid: p.pid, reason, killed });
  noteAt(w, p, reason + ' · <defunct>', '#C9C2D6', 1.3);

  // orphans are adopted by PID 1
  for (const k of procList(w)) {
    if (k.ppid !== p.pid || k === p) continue;
    k.ppid = 1;
    k.adoptUntil = now(w) + 7;
    noteAt(w, k, 'orphan → adopted by PID 1', '#F0C36A', 1);
    w.bus.emit({ type: 'proc.orphaned', pid: k.pid, oldPpid: p.pid });
  }

  // supervisors react
  const parent = byPid(w, p.ppid);
  if (p.comm === 'nginx: worker' && parent && parent.state !== 'Z' && killed) {
    w.clock.after(2.5, () => {
      if (!isAlive(w, parent) || parent.state === 'Z') return;
      forkProc(w, parent, { ...NGINX_WORKER, rss: 2, shared: 8, child: false, fds: parent.fds.slice(0, 1).map(f => f + ' (inherited)') }, Infinity);
      noteAt(w, parent, 'master: worker died, forking a new one', '#7FD1B9');
    });
  }
  if (p.main && p.service && p.service !== 'init.scope' && killed) {
    const service = p.service;
    w.clock.after(8, () => restartService(w, service));
    noteAt(w, p, `systemd: ${service} will restart in 8 s`, '#F0C36A', 2.2);
  }
}

export function reap(w: World, z: Proc, manual = false) {
  if (z.state !== 'Z' || !isAlive(w, z)) return;
  const parent = byPid(w, z.ppid);
  noteAt(w, z, `wait4() reaped ${z.pid}`, '#C9C2D6', 1.2);
  if (parent) pushRecent(w, parent, 'wait4');
  w.bus.emit({ type: 'proc.reap', pid: z.pid, ppid: z.ppid, manual });
  removeProc(w, z, true);
}

/** systemd stops whatever is left in the cgroup, then starts the unit again with new PIDs. */
export function restartService(w: World, name: string) {
  const left = procList(w).filter(q => q.service === name && q.state !== 'Z');
  for (const q of left) removeProc(w, q, true);
  if (left.length) dmesg(w, `systemd[1]: ${name}: killing ${left.length} leftover process(es) in control group`);
  const defs = PROCESSES.filter(d => d.service === name);
  const map = new Map<number, number>();
  for (const d of defs) map.set(d.pid, w.nextPid++);
  for (const d of defs) {
    spawnProc(w, { ...d, pid: map.get(d.pid)!, ppid: map.get(d.ppid) ?? d.ppid }, { near: 1, grow: true, state: 'R' });
  }
  w.bus.emit({ type: 'service.restart', name });
  note(w, { pid: 1 }, `systemd: started ${name}`, '#F0C36A');
  dmesg(w, `systemd[1]: Started ${name}.`);
}

export function startLeak(w: World) {
  if (procList(w).some(q => q.comm === 'leaky-job' && q.state !== 'Z')) return;
  const q = spawnProc(w, { ...LEAKY_JOB, pid: w.nextPid++ }, { near: 412, grow: true, state: 'R' });
  q.leak = true;
  w.bus.emit({ type: 'leak.start', pid: q.pid });
  noteAt(w, q, 'started leaky-job', '#E86A9A');
}

export const hasLeak = (w: World) => procList(w).some(q => q.comm === 'leaky-job' && q.state !== 'Z');
