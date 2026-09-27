import { at, other, dirFrom } from './core';
import { forward, launch } from './traffic';
import type { GNode, Link, LinkEntry, World } from './types';

type Entry = { lid: number } & LinkEntry;

/** Newer versions win; returns what changed so it can be flooded on. */
export function applyEntries(n: GNode, entries: Entry[]): Entry[] {
  const changed: Entry[] = [];
  for (const e of entries) {
    const cur = n.lsdb.get(e.lid);
    if (!cur || e.ver > cur.ver) {
      n.lsdb.set(e.lid, { up: e.up, ver: e.ver, cost: e.cost });
      changed.push({ lid: e.lid, up: e.up, ver: e.ver, cost: e.cost });
    }
  }
  return changed;
}

/** Dijkstra over this node's own view of the sky. */
export function recompute(w: World, n: GNode) {
  const adj = new Map<number, { to: number; lid: number; c: number }[]>();
  const push = (k: number, v: { to: number; lid: number; c: number }) => {
    let a = adj.get(k);
    if (!a) adj.set(k, (a = []));
    a.push(v);
  };
  for (const [lid, e] of n.lsdb) {
    if (!e.up) continue;
    const L = w.links.get(lid);
    if (!L) continue;
    push(L.a, { to: L.b, lid, c: e.cost });
    push(L.b, { to: L.a, lid, c: e.cost });
  }
  const dist = new Map([[n.id, 0]]), first = new Map<number, number>(), done = new Set<number>();
  for (;;) {
    let best: number | null = null, bd = Infinity;
    for (const [v, d] of dist) if (!done.has(v) && d < bd) { bd = d; best = v; }
    if (best === null) break;
    done.add(best);
    for (const e of adj.get(best) || []) {
      const nd = bd + e.c;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        first.set(e.to, best === n.id ? e.lid : first.get(best)!);
      }
    }
  }
  n.dist = dist;
  n.nh = first;
}

export function flood(w: World, n: GNode, entries: Entry[], exceptLid: number | null) {
  for (const L of w.links.values()) {
    if (L.removed || !L.up || L.id === exceptLid || (L.a !== n.id && L.b !== n.id)) continue;
    launch(w, L, n.id, { kind: 'lsa', entries, id: w.pid++, src: n.id, dst: -1, ttl: 0, key: 0, ctx: {}, born: w.t }, true);
  }
}

/** Relays at each end notice a change after the dead interval, then flood the news.
 *  When a lane comes up they also swap their whole database. */
export function detect(w: World, L: Link) {
  const upNow = L.up && !L.removed;
  for (const id of [L.a, L.b]) {
    const n = w.nodes.get(id);
    if (!n) continue;
    const changed = applyEntries(n, [{ lid: L.id, up: upNow, ver: L.ver, cost: L.cost }]);
    if (upNow) {
      const o = w.nodes.get(other(L, id));
      if (o) for (const [lid, e] of o.lsdb) changed.push(...applyEntries(n, [{ lid, ...e }]));
    }
    if (changed.length) {
      w.bus.emit({ type: 'lsa', node: n.id });
      recompute(w, n);
      flood(w, n, changed, upNow ? null : L.id);
    }
    if (!upNow && !L.removed) {
      const d = dirFrom(L, n.id);
      const qd = L.q[d];
      L.q[d] = [];
      for (const p of qd) {
        p.ttl++;
        forward(w, n, p);
      }
    }
  }
}

/** Everyone learns the truth at once (used when a seed is planted). */
export function syncAll(w: World) {
  const truth: Entry[] = [];
  for (const L of w.links.values()) if (!L.removed) truth.push({ lid: L.id, up: L.up, ver: L.ver, cost: L.cost });
  for (const n of w.nodes.values()) {
    n.lsdb = new Map();
    applyEntries(n, truth);
    recompute(w, n);
  }
}

/** Follow each relay's own next hop, the way a packet would. */
export function tracePath(w: World, fromId: number, dstId: number) {
  const hops = [fromId], lids: number[] = [], seen = new Set([fromId]);
  let cur = fromId;
  for (let i = 0; i < 24; i++) {
    if (cur === dstId) return { hops, lids, ok: true, why: '' };
    const n = w.nodes.get(cur);
    const lid = n?.nh.get(dstId);
    if (lid == null) return { hops, lids, ok: false, why: 'no route' };
    const L = w.links.get(lid)!;
    const nx = other(L, cur);
    lids.push(lid);
    hops.push(nx);
    if (!L.up || L.removed) return { hops, lids, ok: false, why: 'severed lane' };
    if (seen.has(nx)) return { hops, lids, ok: false, why: 'loop' };
    seen.add(nx);
    cur = nx;
  }
  return { hops, lids, ok: false, why: 'too long' };
}

/** Component reachable over live lanes. */
export function component(w: World, seeds: number[]) {
  const seen = new Set(seeds.filter(id => w.nodes.has(id)));
  const st = [...seen];
  while (st.length) {
    const id = st.pop()!;
    for (const L of w.links.values()) {
      if (L.removed || !L.up) continue;
      const o = L.a === id ? L.b : L.b === id ? L.a : null;
      if (o != null && !seen.has(o) && w.nodes.has(o)) {
        seen.add(o);
        st.push(o);
      }
    }
  }
  return seen;
}

/** How many lanes this node has old news about. */
export function staleCount(w: World, n: GNode) {
  const comp = component(w, [n.id]);
  let k = 0;
  for (const L of w.links.values()) {
    if (!comp.has(L.a) && !comp.has(L.b)) continue;
    const e = n.lsdb.get(L.id);
    if (!e) {
      if (!L.removed) k++;
    } else if (e.ver < L.ver) k++;
  }
  return k;
}

export const scheduleDetect = (w: World, L: Link, delay: number) => {
  const v = L.ver;
  at(w, w.t + delay, () => L.ver === v && detect(w, L));
};
