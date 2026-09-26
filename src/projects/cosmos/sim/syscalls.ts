import { SYSCALLS, type SyscallName } from '../content/syscalls';
import { BACKUP_JOB } from '../content/processes';
import { sendToPeer } from './connections';
import { forkProc } from './lifecycle';
import { fileRead } from './pagecache';
import { block, isAlive, noteAt, pushRecent, wake } from './state';
import type { Proc, World } from './types';

/**
 * A syscall comet is launched toward a process. It lands after `dur` sim seconds
 * and runs only if the process is still runnable then.
 */
export function issueSyscall(w: World, p: Proc, name: SyscallName, fromFeed = false) {
  const id = w.nextSyscallId++;
  const dur = w.rng.range(1.8, 3.0);
  p.inflight++;
  w.bus.emit({ type: 'syscall.issue', id, pid: p.pid, name, dur });
  if (fromFeed && p.state === 'S') wake(w, p, 'syscall dropped in');
  w.clock.after(dur, () => {
    p.inflight = Math.max(0, p.inflight - 1);
    const hit = isAlive(w, p) && p.state === 'R' && p.oomT === null;
    w.bus.emit({ type: 'syscall.land', id, pid: p.pid, name, hit });
    if (hit) doSyscall(w, p, name);
  });
}

export function doSyscall(w: World, p: Proc, name: SyscallName) {
  const def = SYSCALLS[name];
  pushRecent(w, p, name);
  noteAt(w, p, name + '()', def.block === 'D' ? '#FFB38A' : def.block === 'S' ? '#8FC3FF' : '#FFE7A8', 1.2);
  if (name === 'clone' && p.comm === 'cron') {
    w.bus.emit({ type: 'syscall', pid: p.pid, name, blocked: null });
    forkProc(w, p, BACKUP_JOB);
    return;
  }
  if (name === 'pread64') {
    fileRead(w, p);
    w.bus.emit({ type: 'syscall', pid: p.pid, name, blocked: p.state === 'D' ? 'D' : null });
    return;
  }
  if ((name === 'sendto' || name === 'write') && w.rng.chance(0.7)) sendToPeer(w, p);
  if (name === 'mmap' && p.comm !== 'leaky-job') p.minflt += 12;
  if (def.block && def.dur) block(w, p, def.block, w.rng.range(def.dur[0], def.dur[1]), name + '()');
  w.bus.emit({ type: 'syscall', pid: p.pid, name, blocked: def.block ?? null });
}

/** "Drop syscalls": six comets toward random user processes, waking sleepers. */
export function dropSyscalls(w: World) {
  const live = [...w.procs.values()].filter(p => p.state !== 'Z' && p.state !== 'T' && p.kind !== 'kernel' && p.oomT === null);
  if (!live.length) return;
  for (let i = 0; i < 6; i++) {
    const p = w.rng.pick(live);
    issueSyscall(w, p, w.rng.pick([...p.syscalls.filter(s => s !== 'clone'), 'read'] as SyscallName[]), true);
  }
}
