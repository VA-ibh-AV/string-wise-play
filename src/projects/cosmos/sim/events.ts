import type { MissionId } from '../content/missions';
import type { SyscallName } from '../content/syscalls';
import type { LensId } from '../content/lenses';
import type { PState } from './types';

/** Where a floating label should appear in the view. */
export type Anchor = { pid: number } | { place: 'cache' | 'disk' | 'nic' } | { cpu: number };

export type Signal = 'TERM' | 'STOP' | 'CONT' | 'KILL';

/** Everything the sim tells the outside world. The view, sound and missions only ever listen. */
export type SimEvent =
  | { type: 'note'; text: string; color: string; at: Anchor; up?: number; life?: number }
  | { type: 'dmesg'; line: string }
  | { type: 'proc.spawn'; pid: number; near?: number; grow: boolean }
  | { type: 'proc.fork'; parent: number; child: number; byUser: boolean }
  | { type: 'proc.state'; pid: number; from: PState; to: PState; reason: string }
  | { type: 'proc.exit'; pid: number; reason: string; killed: boolean }
  | { type: 'proc.orphaned'; pid: number; oldPpid: number }
  | { type: 'proc.reap'; pid: number; ppid: number; manual: boolean }
  | { type: 'proc.remove'; pid: number; burst: boolean }
  | { type: 'syscall.issue'; id: number; pid: number; name: SyscallName; dur: number }
  | { type: 'syscall.land'; id: number; pid: number; name: SyscallName; hit: boolean }
  | { type: 'syscall'; pid: number; name: SyscallName; blocked: 'S' | 'D' | null }
  | { type: 'cache.hit'; pid: number }
  | { type: 'cache.miss'; pid: number }
  | { type: 'cache.evict'; mb: number }
  | { type: 'cache.drop'; mb: number }
  | { type: 'swap.out'; pid: number; mb: number; visual: boolean }
  | { type: 'fault.major'; pid: number; mb: number }
  | { type: 'cow.copy'; pid: number; mb: number }
  | { type: 'oom.select'; pid: number; score: number }
  | { type: 'oom.kill'; pid: number; comm: string }
  | { type: 'irq.nic.raise'; cpu: number; dur: number }
  | { type: 'irq.nic'; cpu: number; flood: boolean }
  | { type: 'packet.deliver'; cpu: number; pid: number; dur: number }
  | { type: 'packet.wake'; pid: number }
  | { type: 'ksoftirqd.wake'; pid: number }
  | { type: 'irq.disk.raise'; pid: number; cpu: number; dur: number }
  | { type: 'irq.disk'; pid: number; cpu: number }
  | { type: 'conn.send'; from: number; to: number; dur: number }
  | { type: 'conn.wake'; pid: number }
  | { type: 'cs'; cpu: number; pid: number }
  | { type: 'signal'; pid: number; sig: Signal; result: 'delivered' | 'pending' | 'ignored' }
  | { type: 'sched.nice'; pid: number; nice: number }
  | { type: 'sched.policy'; pid: number; policy: 'OTHER' | 'FIFO' }
  | { type: 'sched.affinity'; pid: number; cpu: number | null }
  | { type: 'oom.adj'; pid: number; adj: number }
  | { type: 'cgroup.throttle'; name: string; quota: number }
  | { type: 'cgroup.limit'; name: string; quota: number }
  | { type: 'service.restart'; name: string }
  | { type: 'leak.start'; pid: number }
  | { type: 'ui.select'; pid: number | null }
  | { type: 'ui.lens'; lens: LensId | null }
  | { type: 'ns.view'; inside: boolean }
  | { type: 'mission.complete'; id: MissionId };

export type SimEventType = SimEvent['type'];
