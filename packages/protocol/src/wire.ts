import type { Cgroup, Conn, Cpu, Delta, Ev, Hello, Irq, Key, LiveMsg, Mem, OtherAgg, Proc, ProcPatch } from './live';

/** Short-key wire object as decoded from MessagePack or snapshot JSON. */
type W = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === 'number' ? v : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const arr = (v: unknown): W[] => (Array.isArray(v) ? (v as W[]) : []);
const nullableNum = (v: unknown) => (typeof v === 'number' ? v : null);

const PROC_KEYS: [string, keyof Proc][] = [
  ['i', 'vpid'], ['pp', 'ppid'], ['n', 'name'], ['k', 'kind'], ['s', 'state'], ['th', 'threads'],
  ['c', 'cpu'], ['r', 'rssBytes'], ['mf', 'minflt'], ['Mf', 'majflt'], ['cv', 'ctxVol'], ['ci', 'ctxInvol'],
  ['sr', 'sysRate'], ['ts', 'topSys'], ['g', 'cgroup'], ['po', 'policy'], ['ni', 'nice'], ['af', 'affinity'],
];

function patch(w: W): ProcPatch {
  const out: Record<string, unknown> = {};
  for (const [s, l] of PROC_KEYS) if (w[s] !== undefined) out[l] = w[s];
  if (w.ns && typeof w.ns === 'object') {
    const n = w.ns as W;
    out.ns = { pid: num(n.p), net: num(n.n), mnt: num(n.m) };
  }
  out.vpid = num(w.i);
  return out as ProcPatch;
}

function proc(w: W): Proc {
  const p = patch(w);
  return {
    ppid: 0, name: 'proc', kind: 'user', state: 'S', threads: 1, cpu: 0, rssBytes: 0, minflt: 0, majflt: 0,
    ctxVol: 0, ctxInvol: 0, sysRate: 0, topSys: [], ...p,
  } as Proc;
}

const cpu = (w: W): Cpu => ({ id: num(w.i), busy: num(w.b), vpid: nullableNum(w.v), switches: num(w.sw) });
const other = (w: unknown): OtherAgg => {
  const o = (w ?? {}) as W;
  return { count: num(o.n), cpu: num(o.c), rssBytes: num(o.r) };
};
const mem = (w: unknown): Mem => {
  const m = (w ?? {}) as W;
  return { total: num(m.t), used: num(m.u), cached: num(m.c), dirty: num(m.d), writeback: num(m.w), swapUsed: num(m.s), swapTotal: num(m.st) };
};
const irq = (w: W): Irq => ({ name: str(w.n), cpu: num(w.c), rate: num(w.r) });
const cgroup = (w: W): Cgroup => ({ label: str(w.l), cpuThrottledPct: num(w.tp), memCurrent: num(w.mc), memMax: nullableNum(w.mm), oomKills: num(w.ok) });
const conn = (w: W): Conn => ({
  id: str(w.i), vpid: nullableNum(w.v), proto: str(w.p, 'tcp') as Conn['proto'], state: str(w.s, 'ESTABLISHED') as Conn['state'],
  localPort: num(w.lp), remote: str(w.r, 'internet') as Conn['remote'], remotePort: nullableNum(w.rp),
});
const load = (v: unknown): [number, number, number] => {
  const a = Array.isArray(v) ? v : [];
  return [num(a[0]), num(a[1]), num(a[2])];
};

function ev(w: W | null): Ev | null {
  if (!w || typeof w !== 'object') return null;
  const ts = num(w.ts);
  switch (w.k) {
    case 'fork': return { k: 'fork', ts, parent: num(w.pa), child: num(w.c) };
    case 'exec': return { k: 'exec', ts, vpid: num(w.v), name: str(w.n) };
    case 'exit': return { k: 'exit', ts, vpid: num(w.v), code: num(w.x) };
    case 'sys': return { k: 'sys', ts, vpid: num(w.v), nr: str(w.nr) };
    case 'signal': return { k: 'signal', ts, sig: str(w.sig), from: nullableNum(w.f), to: num(w.to), delivered: !!w.dl };
    case 'oom': return { k: 'oom', ts, vpid: num(w.v) };
    case 'conn': return { k: 'conn', ts, id: str(w.i), from: str(w.f) as Conn['state'], to: str(w.to) as Conn['state'] };
    default: return null; // unknown event kinds from a newer agent are ignored
  }
}
const events = (v: unknown) => arr(v).map(ev).filter((e): e is Ev => e !== null);

/** Map a short-key wire message to its decoded shape. Returns null for unknown types. */
export function expand(raw: unknown): LiveMsg | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as W;
  switch (w.t) {
    case 'hello': {
      const h = (w.h ?? {}) as W;
      const msg: Hello = {
        t: 'hello', v: 1,
        host: { name: str(h.n, 'live host'), kernel: str(h.k), arch: str(h.a), cpus: num(h.c), memTotalBytes: num(h.m) },
        caps: (Array.isArray(w.c) ? w.c : []).filter((c): c is Hello['caps'][number] => typeof c === 'string'),
        tickMs: num(w.tk, 1000),
      };
      return msg;
    }
    case 'key': {
      const msg: Key = {
        t: 'key', seq: num(w.s), ts: num(w.ts), viewers: num(w.vw), load: load(w.ld),
        cpus: arr(w.cp).map(cpu), procs: arr(w.p).map(proc), other: other(w.o), mem: mem(w.m),
        irq: arr(w.iq).map(irq), cgroups: arr(w.cg).map(cgroup), conns: arr(w.cn).map(conn), events: events(w.e),
      };
      return msg;
    }
    case 'delta': {
      const msg: Delta = {
        t: 'delta', seq: num(w.s), ts: num(w.ts), viewers: num(w.vw), load: load(w.ld),
        cpus: arr(w.cp).map(cpu), born: arr(w.b).map(proc), died: (Array.isArray(w.d) ? w.d : []).map(x => num(x)),
        changed: arr(w.ch).map(patch), other: other(w.o), mem: mem(w.m), irq: arr(w.iq).map(irq),
        cgroups: arr(w.cg).map(cgroup), connsAdded: arr(w.ca).map(conn),
        connsRemoved: (Array.isArray(w.cr) ? w.cr : []).map(x => str(x)), events: events(w.e),
      };
      return msg;
    }
    case 'bye':
      return { t: 'bye', reason: str(w.r, 'shutdown') as 'shutdown' };
    default:
      return null;
  }
}
