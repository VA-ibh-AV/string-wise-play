import type { Soundscape } from '@play/audio';
import { SYSCALL_NAMES } from '../content/syscalls';
import type { World } from '../sim';

/** Maps sim events to sounds. Returns an unsubscribe function. */
export function attachCosmosSound(w: World, s: Soundscape): () => void {
  const b = w.bus;
  const offs = [
    b.on('syscall', e => s.plink(SYSCALL_NAMES.indexOf(e.name))),
    b.on('signal', e => e.result !== 'ignored' && s.plink(e.sig === 'KILL' ? 0 : e.sig === 'TERM' ? 3 : 6)),
    b.on('sched.nice', e => s.plink(e.nice > 0 ? 2 : 9)),
    b.on('proc.fork', () => {
      s.bubble();
      window.setTimeout(() => s.bubble(), 120);
    }),
    b.on('proc.reap', () => s.chime()),
    b.on('mission.complete', () => s.chime()),
    b.on('ui.select', e => e.pid !== null && s.chime()),
    b.on('cow.copy', () => s.tick()),
    b.on('cache.drop', () => s.tick()),
    b.on('irq.nic', () => s.zap()),
    b.on('irq.disk', () => s.zap(0.7)),
    b.on('oom.select', () => s.thud()),
  ];
  return () => offs.forEach(off => off());
}
