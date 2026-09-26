import { describe, expect, test } from 'vitest';
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
