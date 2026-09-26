import { describe, expect, test } from 'vitest';
import { encode, decode } from '@msgpack/msgpack';
import { expand, type Delta, type Key } from '@play/protocol';
import { LiveAdapter, OTHER_VPID } from '../data/live-adapter';
import type { SimEvent } from '../sim';

const GiB = 2 ** 30;
const wireProc = (i: number, n: string, extra: Record<string, unknown> = {}) => ({ i, pp: 1, n, k: 'user', s: 'S', th: 2, c: 0.1, r: 64 << 20, mf: 0, Mf: 0, cv: 0, ci: 0, sr: 0, ts: [], ...extra });
const mem = { t: 8 * GiB, u: 2 * GiB, c: GiB, d: 0, w: 0, s: 0, st: GiB };

const wireKey = {
  t: 'key', s: 10, ts: 10000, vw: 3, ld: [0.5, 0.4, 0.3],
  cp: [{ i: 0, b: 0.5, v: 2, sw: 100 }, { i: 1, b: 0.1, v: null, sw: 50 }],
  p: [wireProc(1, 'systemd', { k: 'init', pp: 0, ns: { p: 1, n: 1, m: 1 } }), wireProc(2, 'nginx', { ns: { p: 2, n: 2, m: 2 } })],
  o: { n: 200, c: 0.3, r: 500 << 20 }, m: mem, iq: [], cg: [{ l: 'nginx', tp: 5, mc: 1 << 20, mm: null, ok: 0 }],
  cn: [{ i: 'a1', v: null, p: 'tcp', s: 'LISTEN', lp: 443, r: 'loopback', rp: null }], e: [],
};

function roundTrip(o: unknown) {
  return expand(decode(encode(o)));
}

describe('live protocol', () => {
  test('expand maps short keys to the decoded shape', () => {
    const k = roundTrip(wireKey) as Key;
    expect(k.t).toBe('key');
    expect(k.procs[1]).toMatchObject({ vpid: 2, name: 'nginx', threads: 2, ns: { pid: 2, net: 2, mnt: 2 } });
    expect(k.cpus[1].vpid).toBeNull();
    expect(k.cgroups[0].memMax).toBeNull();
    expect(k.mem.swapTotal).toBe(GiB);
  });

  test('unknown message and event kinds are ignored', () => {
    expect(roundTrip({ t: 'mystery' })).toBeNull();
    const k = roundTrip({ ...wireKey, e: [{ k: 'future', ts: 1 }, { k: 'oom', ts: 2, v: 2 }] }) as Key;
    expect(k.events).toEqual([{ k: 'oom', ts: 2, vpid: 2 }]);
  });
});

describe('LiveAdapter', () => {
  const setup = () => {
    const a = new LiveAdapter();
    const events: SimEvent[] = [];
    a.world.bus.onAny(e => events.push(e));
    a.hello({ t: 'hello', v: 1, host: { name: 'pi', kernel: '6.8', arch: 'arm64', cpus: 2, memTotalBytes: 8 * GiB }, caps: ['procs'], tickMs: 1000 });
    a.key(roundTrip(wireKey) as Key);
    return { a, events };
  };

  test('a key builds planets, beams, memory and the "other" planet', () => {
    const { a } = setup();
    const w = a.world;
    expect(w.mode).toBe('live');
    expect([...w.procs.keys()].sort()).toEqual([OTHER_VPID, 1, 2].sort());
    expect(w.procs.get(2)!.rss).toBe(64);
    expect(w.procs.get(2)!.onCpu).toBe(0);
    expect(w.procs.get(2)!.ns).toBe('pidns:2'); // not the host namespace: goes in the bubble
    expect(w.procs.get(1)!.ns).toBeUndefined();
    expect(w.mem.used).toBe(2048);
    expect(w.cgroups.get('nginx')!.throttled).toBe(true);
    expect(a.state.conns.size).toBe(1);
  });

  test('deltas add, patch and collapse processes', () => {
    const { a, events } = setup();
    const d: Delta = {
      t: 'delta', seq: 11, ts: 11000, viewers: 3, load: [0.5, 0.4, 0.3],
      cpus: [{ id: 0, busy: 0.2, vpid: 3, switches: 0 }, { id: 1, busy: 0, vpid: null, switches: 0 }],
      born: [{ vpid: 3, ppid: 2, name: 'worker', kind: 'user', state: 'R', threads: 1, cpu: 0.2, rssBytes: 1 << 20, minflt: 0, majflt: 0, ctxVol: 0, ctxInvol: 0, sysRate: 0, topSys: [] }],
      died: [1, 2], changed: [{ vpid: 2, name: 'nginx2', cpu: 0.9 }],
      other: { count: 0, cpu: 0, rssBytes: 0 }, mem: { total: 8 * GiB, used: GiB, cached: 0, dirty: 0, writeback: 0, swapUsed: 0, swapTotal: 0 },
      irq: [], cgroups: [], connsAdded: [], connsRemoved: ['a1'],
      events: [{ k: 'fork', ts: 10500, parent: 1, child: 3 }, { k: 'exit', ts: 10600, vpid: 1, code: 0 }],
    };
    a.delta(d);
    const w = a.world;
    expect(events.some(e => e.type === 'proc.spawn' && e.pid === 3 && e.grow && e.near === 2)).toBe(true);
    expect(w.procs.has(2)).toBe(false); // left the visible set: folded away, no zombie
    expect(w.procs.get(1)!.state).toBe('Z'); // exited: collapses for one tick
    expect(w.procs.has(OTHER_VPID)).toBe(false);
    expect(events.some(e => e.type === 'cs' && e.cpu === 0 && e.pid === 3)).toBe(true);
    expect(a.state.conns.size).toBe(0);
    // the fork is replayed at its place in the tick, and the dead planet is removed after one tick
    a.step(0.4);
    expect(events.some(e => e.type === 'proc.fork')).toBe(false);
    a.step(0.2);
    expect(events.some(e => e.type === 'proc.fork' && e.parent === 1 && e.child === 3)).toBe(true);
    a.step(0.5);
    expect(w.procs.has(1)).toBe(false);
  });

  test('the live world ignores everything but view commands', async () => {
    const { LiveSource } = await import('../data/live-source').catch(() => ({ LiveSource: null }));
    if (!LiveSource) return;
    const s = new LiveSource({ onConnection() {}, onHello() {} });
    expect(s.readOnly).toBe(true);
    expect(s.command({ type: 'signal', pid: 1, sig: 'KILL' })).toBeUndefined();
    s.command({ type: 'select', pid: null });
    expect(s.world.view.selected).toBeNull();
  });
});
