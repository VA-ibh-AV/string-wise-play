/**
 * cosmos.live.v1: decoded message shapes for the cosmos-agent stream.
 * The wire uses short keys (see FIELDS.md); `expand()` in wire.ts maps them to these types.
 */
export type LiveMsg = Hello | Key | Delta | Bye;

export interface Host {
  name: string;
  kernel: string;
  arch: string;
  cpus: number;
  memTotalBytes: number;
}

export interface Hello {
  t: 'hello';
  v: 1;
  host: Host;
  caps: Cap[];
  tickMs: number;
}

export type Cap = 'procs' | 'sched' | 'syscalls' | 'signals' | 'oom' | 'memory' | 'pagecache' | 'irq' | 'cgroup' | 'net' | 'ns';

export interface Key {
  t: 'key';
  seq: number;
  ts: number;
  viewers: number;
  load: [number, number, number];
  cpus: Cpu[];
  procs: Proc[];
  other: OtherAgg;
  mem: Mem;
  irq: Irq[];
  cgroups: Cgroup[];
  conns: Conn[];
  events: Ev[];
}

export interface Delta {
  t: 'delta';
  seq: number;
  ts: number;
  viewers: number;
  load: [number, number, number];
  cpus: Cpu[];
  born: Proc[];
  died: number[];
  changed: ProcPatch[];
  other: OtherAgg;
  mem: Mem;
  irq: Irq[];
  cgroups: Cgroup[];
  connsAdded: Conn[];
  connsRemoved: string[];
  events: Ev[];
}

export interface Bye {
  t: 'bye';
  reason: 'shutdown' | 'overloaded' | 'policy';
}

export type PState = 'R' | 'S' | 'D' | 'T' | 'Z';

export interface Proc {
  vpid: number;
  ppid: number;
  name: string;
  kind: 'user' | 'kernel' | 'init';
  state: PState;
  threads: number;
  cpu: number;
  rssBytes: number;
  minflt: number;
  majflt: number;
  ctxVol: number;
  ctxInvol: number;
  sysRate: number;
  topSys: [string, number][];
  cgroup?: string;
  ns?: { pid: number; net: number; mnt: number };
  policy?: 'normal' | 'fifo' | 'rr' | 'batch' | 'idle';
  nice?: number;
  affinity?: number[];
}
export type ProcPatch = Partial<Proc> & { vpid: number };

export interface Cpu {
  id: number;
  busy: number;
  vpid: number | null;
  switches: number;
}
export interface OtherAgg {
  count: number;
  cpu: number;
  rssBytes: number;
}
export interface Mem {
  total: number;
  used: number;
  cached: number;
  dirty: number;
  writeback: number;
  swapUsed: number;
  swapTotal: number;
}
export interface Irq {
  name: string;
  cpu: number;
  rate: number;
}
export interface Cgroup {
  label: string;
  cpuThrottledPct: number;
  memCurrent: number;
  memMax: number | null;
  oomKills: number;
}

export type ConnState =
  | 'LISTEN' | 'SYN_SENT' | 'SYN_RECV' | 'ESTABLISHED' | 'FIN_WAIT1' | 'FIN_WAIT2'
  | 'TIME_WAIT' | 'CLOSE_WAIT' | 'LAST_ACK' | 'CLOSING';

export interface Conn {
  id: string;
  vpid: number | null;
  proto: 'tcp' | 'tcp6';
  state: ConnState;
  localPort: number;
  remote: 'loopback' | 'lan' | 'internet';
  remotePort: number | null;
}

export type Ev =
  | { k: 'fork'; ts: number; parent: number; child: number }
  | { k: 'exec'; ts: number; vpid: number; name: string }
  | { k: 'exit'; ts: number; vpid: number; code: number }
  | { k: 'sys'; ts: number; vpid: number; nr: string }
  | { k: 'signal'; ts: number; sig: string; from: number | null; to: number; delivered: boolean }
  | { k: 'oom'; ts: number; vpid: number }
  | { k: 'conn'; ts: number; id: string; from: ConnState; to: ConnState };
