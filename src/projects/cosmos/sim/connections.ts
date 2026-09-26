import { CONNECTIONS } from '../content/connections';
import { isAlive, noteAt, procList, wake } from './state';
import type { Proc, World } from './types';

export function peersOf(w: World, p: Proc): Proc[] {
  const out: Proc[] = [];
  const all = procList(w);
  for (const [a, b] of CONNECTIONS) {
    if (p.comm === a) out.push(...all.filter(q => q.comm === b && q.state !== 'Z'));
    if (p.comm === b) out.push(...all.filter(q => q.comm === a && q.state !== 'Z'));
  }
  return out;
}

/** Unique live connection pairs, for the Connections lens and lines. */
export function connectionPairs(w: World): [Proc, Proc][] {
  const seen = new Set<string>();
  const pairs: [Proc, Proc][] = [];
  for (const p of procList(w)) {
    if (p.state === 'Z') continue;
    for (const q of peersOf(w, p)) {
      const k = p.pid < q.pid ? `${p.pid}:${q.pid}` : `${q.pid}:${p.pid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([p, q]);
    }
  }
  return pairs;
}

/** Data travels to a peer; if the peer sleeps waiting for it, the kernel wakes it. */
export function sendToPeer(w: World, p: Proc) {
  const peers = peersOf(w, p);
  if (!peers.length) return;
  const q = w.rng.pick(peers);
  const dur = 0.8;
  w.bus.emit({ type: 'conn.send', from: p.pid, to: q.pid, dur });
  w.clock.after(dur, () => {
    if (!isAlive(w, q) || q.state !== 'S') return;
    wake(w, q, 'data arrived on socket');
    w.bus.emit({ type: 'conn.wake', pid: q.pid });
    if (w.view.lens === 'connections') noteAt(w, q, 'data ready → woken', '#7FF0FF', 1);
  });
}
