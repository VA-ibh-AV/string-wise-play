import { describe, expect, test } from 'vitest';
import { FINAL_HEADER, HOPS } from '../content/route';
import { autopilot, createFlight, GATE_R, R, stepFlight, type FlightEvent } from '../sim/flight';

const fly = (seed: number, steer: (f: ReturnType<typeof createFlight>) => { tx: number; ty: number; boost: boolean }) => {
  const f = createFlight(seed);
  const events: FlightEvent[] = [];
  f.bus.onAny(e => events.push(e));
  for (let i = 0; i < 60 * 120 && !f.done; i++) stepFlight(f, 1 / 60, steer(f));
  return { f, events };
};

describe('track', () => {
  test('is about 2,700 units long and positions are continuous', () => {
    const f = createFlight();
    expect(f.track.length).toBeGreaterThan(2400);
    expect(f.track.length).toBeLessThan(3200);
    const a = f.track.pointAt(0.5), b = f.track.pointAt(0.5 + 1 / f.track.length);
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeCloseTo(1, 1);
  });
});

describe('gates', () => {
  test('every hop fires exactly once, in order', () => {
    const { events } = fly(3, () => ({ tx: 0, ty: 0, boost: false }));
    const gates = events.filter(e => e.type === 'gate').map(e => (e.type === 'gate' ? e.index : -1));
    expect(gates).toEqual(HOPS.map((_, i) => i));
    expect(events.at(-1)?.type).toBe('arrive');
  });

  test('the final header matches the route', () => {
    const { f } = fly(9, () => ({ tx: 0.3, ty: -0.2, boost: true }));
    expect(f.header).toEqual(FINAL_HEADER);
    expect(f.header.dst).toBe('10.1.2.7');
    expect(f.header.src).toBe('198.51.100.7');
    expect(f.header.ttl).toBe(60);
  });

  test('steering through the middle gives clean passes and a faster flight', () => {
    const pilot = fly(5, autopilot);
    const idle = fly(5, () => ({ tx: -1, ty: -1, boost: false })); // hugging a wall misses most rings
    expect(pilot.f.passes.every(p => p === 'clean')).toBe(true);
    expect(idle.f.passes.filter(p => p === 'wide').length).toBeGreaterThan(5);
    expect(pilot.f.t).toBeLessThan(idle.f.t);
  });

  test('rings sit off-centre but within reach; the packet stays inside the tube', () => {
    const f = createFlight(11);
    for (const g of f.gates) {
      const r = Math.hypot(g.x, g.y);
      expect(r).toBeGreaterThanOrEqual(1.6 - 1e-9);
      expect(r).toBeLessThanOrEqual(3.2 + 1e-9);
      expect(r + GATE_R).toBeGreaterThan(0);
    }
    const { f: g } = fly(11, () => ({ tx: 5, ty: 5, boost: true }));
    expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(R - 0.8 + 1e-6);
  });

  test('latency adds up to three round trips plus the path', () => {
    const { f } = fly(1, autopilot);
    expect(f.ms).toBeCloseTo(HOPS.reduce((s, h) => s + h.ms, 0), 5);
    expect(f.t).toBeGreaterThan(25);
    expect(f.t).toBeLessThan(55);
  });
});
