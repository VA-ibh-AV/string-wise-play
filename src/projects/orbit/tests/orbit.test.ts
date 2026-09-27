import { describe, expect, test } from 'vitest';
import type { Key, Proc } from '@play/protocol';
import { applyDelta, applyKey, createFeed, pickVisible, remixPreset, syncPlanets } from '../sim/live';
import { PRESETS } from '../content/presets';
import { sliceLen } from '../sim/clock';
import { measured, promised, starved } from '../sim/shares';
import { addPlanet, advance, applyPreset, createSystem, decodeSystem, encodeSystem, setCpus, setMode, type OrbitEvent, type OrbitSystem } from '../sim/system';

const preset = (id: string) => {
  const sys = createSystem();
  applyPreset(sys, PRESETS.find(p => p.id === id)!);
  return sys;
};
/** Run n slices and count plays per planet. */
function run(sys: OrbitSystem, slices: number) {
  const counts = new Map<number, number>();
  const off = sys.bus.on('play', e => counts.set(e.id, (counts.get(e.id) ?? 0) + 1));
  advance(sys, sys.t + slices * sliceLen(sys.bpm) - 1e-9);
  off();
  return counts;
}
const share = (sys: OrbitSystem, counts: Map<number, number>, slices: number) => sys.planets.map(p => (counts.get(p.id) ?? 0) / slices);

describe('round robin', () => {
  test('exactly 1/N after N·k slices', () => {
    const sys = preset('fair');
    setMode(sys, 'rr');
    const n = sys.planets.length, slices = n * 40;
    const counts = run(sys, slices);
    for (const s of share(sys, counts, slices)) expect(s).toBeCloseTo(1 / n, 10);
  });
});

describe('CFS', () => {
  test('equal nice: equal shares', () => {
    const sys = preset('fair');
    const s = share(sys, run(sys, 400), 400);
    for (const x of s) expect(x).toBeCloseTo(0.2, 1);
  });

  test('measured share within ±8% of the promise after 400 slices', () => {
    const sys = preset('important');
    const counts = run(sys, 400);
    sys.planets.forEach((p, i) => {
      const got = share(sys, counts, 400)[i];
      expect(Math.abs(got - promised(sys, p)!)).toBeLessThan(0.08);
    });
    const fav = sys.planets.find(p => p.nice === -8)!;
    expect(promised(sys, fav)!).toBeCloseTo(0.64, 1);
  });

  test('a new task starts at the smallest vruntime and does not hog the CPU', () => {
    const sys = preset('fair');
    run(sys, 200);
    const p = addPlanet(sys, 5, 0)!;
    const counts = run(sys, 60);
    expect((counts.get(p.id) ?? 0) / 60).toBeLessThan(0.3);
  });
});

describe('priority', () => {
  test('without the RT limit, lower priorities starve', () => {
    const sys = preset('starve');
    const counts = run(sys, 200);
    const top = sys.planets.find(p => p.prio === 90)!;
    expect(counts.get(top.id)).toBe(200);
    for (const p of sys.planets.filter(q => q.prio < 90)) {
      expect(counts.get(p.id) ?? 0).toBe(0);
      expect(starved(sys, p)).toBe(true);
    }
  });

  test('RT throttling lets starved tasks sneak in', () => {
    const sys = preset('starve');
    sys.rtLimit = true;
    const events: OrbitEvent[] = [];
    sys.bus.onAny(e => events.push(e));
    const counts = run(sys, 400);
    for (const p of sys.planets.filter(q => q.prio < 90)) expect(counts.get(p.id) ?? 0).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'throttle')).toBe(true);
    const top = sys.planets.find(p => p.prio === 90)!;
    expect((counts.get(top.id) ?? 0) / 400).toBeCloseTo(0.95, 1);
  });
});

describe('SMP', () => {
  test('two cores, six tasks: about a third each, two notes per slice', () => {
    const sys = preset('smp');
    const counts = run(sys, 300);
    for (const s of share(sys, counts, 300)) expect(s).toBeCloseTo(1 / 3, 1);
    expect(sys.planets.every(p => Math.abs(promised(sys, p)! - 1 / 3) < 1e-9)).toBe(true);
  });

  test('switching to 2 CPUs doubles the notes per slice', () => {
    const sys = preset('fair');
    setMode(sys, 'rr');
    const one = [...run(sys, 50).values()].reduce((a, b) => a + b, 0);
    setCpus(sys, 2);
    const two = [...run(sys, 50).values()].reduce((a, b) => a + b, 0);
    expect(two).toBe(one * 2);
  });
});

describe('free orbits and shares', () => {
  test('inner planets play more often (Kepler), and no shares are measured', () => {
    const sys = preset('lullaby');
    const counts = new Map<number, number>();
    sys.bus.on('play', e => counts.set(e.id, (counts.get(e.id) ?? 0) + 1));
    advance(sys, 60);
    const inner = sys.planets.find(p => p.ring === 0)!, outer = sys.planets.find(p => p.ring === 5)!;
    expect(counts.get(inner.id)!).toBeGreaterThan(counts.get(outer.id)! * 4); // (14.5 / 4.5)^1.5 ≈ 5.8
    expect(measured(sys, inner)).toBeNull();
    expect(promised(sys, inner)).toBeNull();
  });

  test('measured share over the last 32 slices', () => {
    const sys = preset('fair');
    setMode(sys, 'rr');
    run(sys, 64);
    for (const p of sys.planets) expect(measured(sys, p)).toBeCloseTo(0.2, 1);
  });

  test('a system survives a share link round trip', () => {
    const sys = preset('important');
    const back = decodeSystem(encodeSystem(sys))!;
    expect(back.mode).toBe('cfs');
    expect(back.planets.map(p => p.nice)).toEqual(sys.planets.map(p => p.nice));
    expect(decodeSystem('not-base64!!')).toBeNull();
  });
});

// ---------- live mode ----------
const proc = (vpid: number, name: string, cpu: number, o: Partial<Proc> = {}): Proc => ({
  vpid, ppid: 1, name, kind: 'user', state: 'S', threads: 1, cpu, rssBytes: 0, minflt: 0, majflt: 0, ctxVol: 0, ctxInvol: 0, sysRate: 0, topSys: [], ...o,
});
const key = (procs: Proc[], busy: number[], seq = 1): Key => ({
  t: 'key', seq, ts: 0, viewers: 2, load: [0, 0, 0], cpus: busy.map((b, i) => ({ id: i, busy: b, vpid: null, switches: 0 })),
  procs, other: { count: 0, cpu: 0, rssBytes: 0 }, mem: { total: 0, used: 0, cached: 0, dirty: 0, writeback: 0, swapUsed: 0, swapTotal: 0 },
  irq: [], cgroups: [], conns: [], events: [],
});
function liveSystem(procs: Proc[], busy: number[]) {
  const sys = createSystem();
  sys.mode = 'live';
  sys.live = createFeed();
  applyKey(sys.live, key(procs, busy));
  syncPlanets(sys, sys.live);
  return sys;
}

describe('live', () => {
  test('calm by design: never more than one note per slice, sparse when idle', () => {
    const idle = liveSystem([proc(10, 'nginx', 0), proc(11, 'redis', 0)], [0, 0, 0, 0]);
    const n = [...run(idle, 100).values()].reduce((a, b) => a + b, 0);
    expect(n).toBeGreaterThanOrEqual(20); // never silent
    expect(n).toBeLessThanOrEqual(24);
    const busy = liveSystem([proc(1, 'a', 3.5), proc(2, 'b', 0.5)], [1, 1, 1, 1]);
    const events: OrbitEvent[] = [];
    busy.bus.on('play', e => events.push(e));
    run(busy, 100);
    const perSlice = new Map<number, number>();
    for (const e of events) if (e.type === 'play') perSlice.set(e.at, (perSlice.get(e.at) ?? 0) + 1);
    expect(Math.max(...perSlice.values())).toBe(1);
    expect(events.length).toBeGreaterThanOrEqual(78);
    expect(events.length).toBeLessThanOrEqual(81);
  });

  test('share of the notes follows share of the CPU', () => {
    const sys = liveSystem([proc(1, 'a', 0.9), proc(2, 'b', 0.6), proc(3, 'c', 0.3), proc(4, 'd', 0.2)], [1, 1]);
    expect(sys.ncpu).toBe(2);
    const counts = run(sys, 600);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    for (const p of sys.planets) {
      expect(Math.abs((counts.get(p.id) ?? 0) / total - p.live!.cpu / 2)).toBeLessThan(0.05);
      expect(Math.abs(measured(sys, p)! - promised(sys, p)!)).toBeLessThan(0.1);
      expect(starved(sys, p)).toBe(false);
    }
    // busier processes orbit closer to the star, and notes are distinct
    const byName = (n: string) => sys.planets.find(p => p.name === n)!;
    expect(byName('a').ring).toBeLessThan(byName('d').ring);
    expect(new Set(sys.planets.map(p => p.note)).size).toBe(4);
  });

  test('hidden names become hidden-1, hidden-2', () => {
    const sys = liveSystem([proc(7, 'proc', 0.2), proc(9, 'proc', 0.1), proc(3, 'nginx', 0.1)], [1]);
    expect(sys.planets.map(p => p.name).sort()).toEqual(['hidden-1', 'hidden-2', 'nginx']);
    const dup = liveSystem([proc(1, 'chromium', 0.3), proc(2, 'chromium', 0.2)], [1]);
    expect(dup.planets.map(p => p.name).sort()).toEqual(['chromium', 'chromium-2']);
    expect(new Set(dup.planets.map(p => p.color)).size).toBe(2);
  });

  test('at most 8 planets, and newcomers need to be clearly busier', () => {
    const procs = Array.from({ length: 12 }, (_, i) => proc(i + 1, `p${i + 1}`, 0.1 + i * 0.01));
    const f = createFeed();
    applyKey(f, key(procs, [1]));
    const first = pickVisible(f, []);
    expect(first).toHaveLength(8);
    expect(first).not.toContain(1);
    // p1 gets a little busier than the quietest planet: no swap
    applyKey(f, key(procs.map(p => (p.vpid === 1 ? { ...p, cpu: 0.2 } : p)), [1]));
    expect(pickVisible(f, first)).toEqual(first);
    // p1 becomes far busier: it replaces the quietest planet
    for (let i = 0; i < 4; i++) applyKey(f, key(procs.map(p => (p.vpid === 1 ? { ...p, cpu: 0.9 } : p)), [1]));
    expect(pickVisible(f, first)).toContain(1);
  });

  test('born and died processes add and remove planets', () => {
    const sys = liveSystem([proc(1, 'a', 0.3), proc(2, 'b', 0.2)], [0.5]);
    applyDelta(sys.live!, {
      t: 'delta', seq: 2, ts: 0, viewers: 1, load: [0, 0, 0], cpus: [{ id: 0, busy: 0.5, vpid: null, switches: 0 }],
      born: [proc(3, 'c', 0.1, { policy: 'fifo', nice: -5, threads: 4 })], died: [1], changed: [{ vpid: 2, cpu: 0.4 }],
      other: { count: 0, cpu: 0, rssBytes: 0 }, mem: { total: 0, used: 0, cached: 0, dirty: 0, writeback: 0, swapUsed: 0, swapTotal: 0 },
      irq: [], cgroups: [], connsAdded: [], connsRemoved: [], events: [],
    });
    const { born, gone } = syncPlanets(sys, sys.live!);
    expect(born).toEqual(['c']);
    expect(gone).toEqual(['a']);
    const c = sys.planets.find(p => p.name === 'c')!;
    expect(c.live!.policy).toBe('fifo');
    expect(c.nice).toBe(-5);
    expect(c.moons).toBe(3);
  });

  test('a remix is a valid Sandbox system that keeps the real names', () => {
    const sys = liveSystem([proc(1, 'nginx', 0.3), proc(2, 'kworker/0:1', 0.2, { nice: 5 })], [1, 1, 1, 1]);
    const pr = remixPreset(sys);
    expect(pr.mode).toBe('cfs');
    expect(pr.ncpu).toBe(2);
    const back = decodeSystem(encodeSystem((() => {
      const s = createSystem();
      applyPreset(s, pr);
      return s;
    })()))!;
    expect(back.planets.map(p => p.nice).sort()).toEqual([0, 5]);
    // names that are safe survive the link; others fall back to a default task name
    expect(back.planets.some(p => p.name === 'kworker/0:1')).toBe(false);
    const s2 = createSystem();
    applyPreset(s2, back);
    expect(s2.planets.map(p => p.name)).toContain('nginx');
  });
});
