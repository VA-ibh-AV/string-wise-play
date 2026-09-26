import type { Signal } from './events';
import { exitProc } from './lifecycle';
import { isAlive, minVruntime, noteAt, transition } from './state';
import type { Proc, World } from './types';

export function signal(w: World, p: Proc, sig: Signal) {
  if (p.state === 'Z') return;
  const emit = (result: 'delivered' | 'pending' | 'ignored') => w.bus.emit({ type: 'signal', pid: p.pid, sig, result });
  if (p.kind === 'kernel') {
    noteAt(w, p, 'kernel threads ignore signals', '#B7C4E0');
    return emit('ignored');
  }
  if (p.pid === 1 && sig !== 'CONT') {
    noteAt(w, p, `PID 1 ignores SIG${sig} (no handler)`, '#F0C36A');
    return emit('ignored');
  }
  switch (sig) {
    case 'STOP':
      if (p.state === 'T') return;
      transition(w, p, 'T', 'SIGSTOP');
      p.didStop = true;
      noteAt(w, p, 'SIGSTOP → stopped (T)', '#B7C4E0');
      return emit('delivered');
    case 'CONT':
      if (p.state !== 'T') return;
      transition(w, p, 'R', 'SIGCONT');
      p.vruntime = Math.max(p.vruntime, minVruntime(w));
      noteAt(w, p, 'SIGCONT → running again', '#9EF0B8');
      emit('delivered');
      if (p.pendingTerm) {
        p.pendingTerm = false;
        w.clock.after(0.4, () => isAlive(w, p) && signal(w, p, 'TERM'));
      }
      return;
    case 'TERM':
      if (p.state === 'T') {
        p.pendingTerm = true;
        noteAt(w, p, 'SIGTERM pending: process is stopped', '#B7C4E0');
        return emit('pending');
      }
      noteAt(w, p, 'caught SIGTERM: closing connections…', '#FFE7A8');
      transition(w, p, 'R', 'SIGTERM handler');
      w.clock.after(2.2, () => isAlive(w, p) && exitProc(w, p, 'exit(0) after SIGTERM', true));
      return emit('delivered');
    case 'KILL':
      if (p.state === 'D') {
        p.pendingKill = true;
        noteAt(w, p, 'SIGKILL pending: in D state until I/O returns', '#FFB38A');
        return emit('pending');
      }
      exitProc(w, p, 'killed by SIGKILL', true);
      return emit('delivered');
  }
}
