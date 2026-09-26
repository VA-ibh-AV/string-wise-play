import { describe, expect, test } from 'vitest';
import { command } from '../sim';
import { pickNext, schedTick } from '../sim/scheduler';
import { byComm, cpuBound, isolate, world } from './helpers';

describe('scheduler', () => {
  test('CFS picks the smallest vruntime', () => {
    const w = world();
    const ps = ['sshd', 'redis-server', 'envoy', 'cron', 'containerd'].map(c => byComm(w, c));
    isolate(w, ps);
    ps.forEach((p, i) => {
      p.state = 'R';
      p.vruntime = [50, 10, 40, 30, 20][i];
    });
    const next = pickNext(w).map(p => p?.comm);
    expect(next).toHaveLength(4);
    expect(next).not.toContain('sshd'); // largest vruntime waits
    expect(next).toContain('redis-server');
  });

  test('nice −5 gets more CPU than nice +5 over 100 slices', () => {
    const w = world(7);
    const a = byComm(w, 'redis-server'), b = byComm(w, 'envoy');
    isolate(w, [a, b]);
    for (const p of [a, b]) {
      cpuBound(p);
      p.affinity = 0; // compete for one CPU
      p.vruntime = 0;
    }
    command(w, { type: 'nice', pid: a.pid, delta: -5 });
    command(w, { type: 'nice', pid: b.pid, delta: +5 });
    let ra = 0, rb = 0;
    for (let i = 0; i < 100; i++) {
      schedTick(w);
      a.inflight = b.inflight = 1; // no comets for this test
      if (a.onCpu === 0) ra++;
      if (b.onCpu === 0) rb++;
    }
    expect(ra + rb).toBe(100);
    expect(ra).toBeGreaterThan(rb * 3);
  });

  test('SCHED_FIFO always runs first', () => {
    const w = world();
    const all = [...w.procs.values()].filter(p => p.kind !== 'kernel').slice(0, 8);
    isolate(w, all);
    all.forEach((p, i) => {
      cpuBound(p);
      p.vruntime = i;
    });
    const rt = all[7]; // the largest vruntime
    command(w, { type: 'fifo', pid: rt.pid });
    for (let i = 0; i < 20; i++) {
      schedTick(w);
      expect(rt.onCpu).toBeGreaterThanOrEqual(0);
    }
  });

  test('affinity is respected', () => {
    const w = world();
    const p = byComm(w, 'redis-server');
    const others = [...w.procs.values()].filter(q => q.kind !== 'kernel' && q !== p).slice(0, 5);
    isolate(w, [p, ...others]);
    [p, ...others].forEach(cpuBound);
    command(w, { type: 'pin', pid: p.pid });
    for (let i = 0; i < 50; i++) {
      schedTick(w);
      p.inflight = 1;
      expect([-1, 0]).toContain(p.onCpu);
    }
  });

  test('a cgroup at 0.5 CPU never exceeds 2 slices per 4-slice period', () => {
    const w = world();
    const api = byComm(w, 'checkout-api');
    isolate(w, [api]);
    cpuBound(api);
    command(w, { type: 'setQuota', name: 'kubepods/checkout', quota: 0.5 });
    const cg = w.cgroups.get('kubepods/checkout')!;
    const perPeriod = new Map<number, number>();
    for (let i = 0; i < 60; i++) {
      const period = cg.nrPeriods;
      const before = api.vruntime;
      schedTick(w);
      api.inflight = 1;
      if (api.vruntime > before) perPeriod.set(period, (perPeriod.get(period) ?? 0) + 1);
    }
    expect(cg.nrThrottled).toBeGreaterThan(5);
    expect(Math.max(...perPeriod.values())).toBeLessThanOrEqual(2);
  });
});
