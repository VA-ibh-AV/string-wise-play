import { freeMem } from './memory';
import { block, noteAt } from './state';
import type { Proc, World } from './types';

/** Hit ratio grows with cache size: 5% at empty, up to 92%. */
export const hitProbability = (cacheMb: number) => Math.max(0.05, Math.min(0.92, cacheMb / 380));

export function fileRead(w: World, p: Proc) {
  const m = w.mem;
  if (w.rng.chance(hitProbability(m.cache))) {
    m.hits++;
    p.minflt++;
    w.bus.emit({ type: 'cache.hit', pid: p.pid });
    noteAt(w, p, 'page cache hit', '#8FB8FF', 1);
  } else {
    m.misses++;
    if (freeMem(w) > 16) m.cache += 8;
    block(w, p, 'D', w.rng.range(1.4, 2.6), 'page cache miss');
    w.bus.emit({ type: 'cache.miss', pid: p.pid });
    noteAt(w, p, 'cache miss → disk read', '#FFB38A', 1);
  }
}
