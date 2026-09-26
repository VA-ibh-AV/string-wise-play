import type { MissionId } from '../content/missions';
import type { World } from './types';

export function completeMission(w: World, id: MissionId) {
  if (w.missions.has(id)) return;
  w.missions.add(id);
  w.bus.emit({ type: 'mission.complete', id });
}

/** Missions complete from sim events, never from UI clicks, so every one is testable. */
export function attachMissions(w: World) {
  const { bus } = w;
  const done = (id: MissionId) => completeMission(w, id);
  bus.on('ui.select', e => e.pid !== null && done('inspect'));
  bus.on('syscall', e => e.blocked === 'S' && e.pid === w.view.selected && done('sleep'));
  bus.on('proc.fork', e => e.byUser && done('fork'));
  bus.on('cow.copy', () => done('cow'));
  bus.on('proc.reap', e => e.manual && done('reap'));
  bus.on('signal', e => {
    if (e.sig === 'CONT' && e.result === 'delivered' && w.procs.get(e.pid)?.didStop) done('stopcont');
    if (e.sig === 'KILL' && e.result !== 'ignored') done('kill');
  });
  bus.on('proc.orphaned', () => done('orphan'));
  bus.on('sched.policy', e => e.policy === 'FIFO' && done('fifo'));
  bus.on('sched.affinity', e => e.cpu !== null && done('pin'));
  bus.on('cgroup.throttle', e => e.quota !== Infinity && done('throttle'));
  bus.on('cache.miss', () => w.view.lens === 'pagecache' && done('cachemiss'));
  bus.on('fault.major', () => done('majfault'));
  bus.on('oom.kill', () => done('oom'));
  bus.on('packet.wake', () => w.view.lens === 'interrupts' && done('irq'));
  bus.on('ns.view', e => e.inside && done('ns'));
}
