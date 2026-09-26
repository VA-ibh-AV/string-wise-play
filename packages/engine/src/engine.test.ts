import { describe, expect, test } from 'vitest';
import { createClock, createRng } from './index';

describe('engine', () => {
  test('rng is deterministic per seed', () => {
    const a = createRng(7), b = createRng(7);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });
  test('clock runs timers in order on sim time', () => {
    const c = createClock();
    const seen: string[] = [];
    c.after(1, () => seen.push('b'));
    c.after(0.5, () => seen.push('a'));
    c.after(1, () => seen.push('c'));
    c.advance(0.6);
    expect(seen).toEqual(['a']);
    c.advance(0.5);
    expect(seen).toEqual(['a', 'b', 'c']);
  });
});
