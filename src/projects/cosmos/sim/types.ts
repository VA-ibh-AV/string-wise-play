import type { Bus, Rng, SimClock } from '@play/engine';
import type { SyscallName } from '../content/syscalls';
import type { LensId } from '../content/lenses';
import type { MissionId } from '../content/missions';
import type { SimEvent } from './events';

export type PState = 'R' | 'S' | 'D' | 'T' | 'Z';

export interface Proc {
  pid: number;
  ppid: number;
  comm: string;
  user: string;
  color: number;
  about: string;
  kind: 'daemon' | 'app' | 'kernel';
  service?: string;
  main: boolean;
  child: boolean;
  ns?: string;
  nsPid?: number;

  state: PState;
  onCpu: number;
  lastCpu: number;
  policy: 'OTHER' | 'FIFO';
  nice: number;
  weight: number;
  vruntime: number;
  affinity: number | null;
  /** %CPU as an exponential moving average, 0..1. */
  cpu: number;

  threads: number;
  rss: number;
  swapped: number;
  shared: number;
  vsz: number;
  minflt: number;
  majflt: number;
  oomAdj: number;

  syscalls: SyscallName[];
  busy: number;
  fds: string[];
  recent: { name: SyscallName; t: number }[];
  /** Syscall comets still in flight toward this process. */
  inflight: number;

  wakeAt: number;
  lifeEnd: number;
  zombieAt: number;
  /** Waiting for the disk interrupt that completes its I/O. */
  ioIrq: boolean;
  pendingKill: boolean;
  pendingTerm: boolean;
  didStop: boolean;
  exitReason?: string;
  leak: boolean;
  /** Sim time the OOM killer picked it, or null. */
  oomT: number | null;
  /** Drifting toward PID 1 after being orphaned, until this time. */
  adoptUntil: number;
  nextJob?: number;
}

export interface Cpu {
  id: number;
  pid: number | null;
}

export interface CGroup {
  /** CPUs per period, Infinity = no limit. */
  quota: number;
  used: number;
  throttled: boolean;
  nrThrottled: number;
  nrPeriods: number;
  usage: number;
}

export interface World {
  /** 'sim' is the Sandbox simulation; 'live' mirrors a real host and is read-only. */
  mode: 'sim' | 'live';
  seed: number;
  rng: Rng;
  clock: SimClock;
  bus: Bus<SimEvent>;
  procs: Map<number, Proc>;
  nextPid: number;
  nextSyscallId: number;
  cpus: Cpu[];
  /** RAM/swap sizes in MB. `used` is set by live sources; the sim derives it from RSS. */
  mem: { ram: number; swap: number; cache: number; swapUsed: number; hits: number; misses: number; kswapdT: number; used?: number };
  cgroups: Map<string, CGroup>;
  cgTick: number;
  irq: {
    perCpu: { eth: number; nvme: number; loc: number }[];
    netrx: number;
    ksoftirqd: number;
    next: number;
    recent: number[];
  };
  cs: { total: number; sec: number; rate: number; t: number };
  load: [number, number, number];
  sliceT: number;
  dmesg: string[];
  oom: { pid: number; t: number; done: number | null } | null;
  uptimeBase: number;
  popT: Record<string, number>;
  view: { lens: LensId | null; selected: number | null; nsInside: boolean };
  missions: Set<MissionId>;
}

export const NCPU = 4;
export const RAM = 1024;
export const SWAP = 512;
/** One scheduler slice, in sim seconds (shown as "4 ms"). */
export const SLICE = 1.15;
/** cgroup quota period, in slices. */
export const CG_PERIOD = 4;
