import { describe, expect, test } from 'vitest';
import { command, hitProbability, record } from '../sim';
import { cowCopy } from '../sim/memory';
import { fileRead } from '../sim/pagecache';
import { byComm, world } from './helpers';

describe('memory', () => {
  test('OOM killer takes leaky-job after cache and swap are exhausted', () => {
    const w = world(42);
    command(w, { type: 'startLeak' });
    const events = record(w, 60);
    const oom = events.find(e => e.type === 'oom.kill');
    expect(oom && oom.type === 'oom.kill' && oom.comm).toBe('leaky-job');
    const evict = events.findIndex(e => e.type === 'cache.evict');
    const swap = events.findIndex(e => e.type === 'swap.out');
    expect(evict).toBeGreaterThanOrEqual(0);
    expect(evict).toBeLessThan(swap);
    expect(w.dmesg.some(l => l.includes('Out of memory'))).toBe(true);
  });

  test('oom_score_adj −1000 protects a process from swap-out', () => {
    const w = world(3);
    const redis = byComm(w, 'redis-server');
    command(w, { type: 'oomProtect', pid: redis.pid });
    command(w, { type: 'startLeak' });
    const events = record(w, 40);
    expect(events.some(e => e.type === 'swap.out' && e.pid === redis.pid)).toBe(false);
  });

  test('COW: shared goes down and rss goes up by the same amount', () => {
    const w = world();
    const pg = byComm(w, 'postgres');
    const pid = command(w, { type: 'fork', pid: pg.pid }) as number;
    const child = w.procs.get(pid)!;
    expect(child.rss).toBe(1);
    expect(child.shared).toBe(Math.round(pg.rss * 0.8));
    const total = child.rss + child.shared;
    for (let i = 0; i < 5; i++) cowCopy(w, child);
    expect(child.shared).toBe(total - 1 - 20);
    expect(child.rss + child.shared).toBe(total);
  });

  test('page cache hit ratio rises with cache size', () => {
    expect(hitProbability(40)).toBeLessThan(hitProbability(300));
    const ratio = (cache: number) => {
      const w = world(9);
      const be = byComm(w, 'postgres: app checkout SELECT');
      for (let i = 0; i < 400; i++) {
        w.mem.cache = cache;
        fileRead(w, be);
      }
      return w.mem.hits / (w.mem.hits + w.mem.misses);
    };
    expect(ratio(300)).toBeGreaterThan(ratio(40) + 0.4);
  });

  test('drop caches sets the cache to 8 MB', () => {
    const w = world();
    command(w, { type: 'dropCaches' });
    expect(w.mem.cache).toBe(8);
  });
});
