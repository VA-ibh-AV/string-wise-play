import { KINDS, type NodeType } from '../content/kinds';
import type { NodeOpts } from '../content/seeds';
import { detect } from './routing';
import { dropAt } from './traffic';
import type { GNode, Link, World } from './types';
import { DIRS } from './types';

export const at = (w: World, t: number, fn: () => void) => w.heap.push(t, fn);
export const alive = (w: World, n: GNode) => w.nodes.get(n.id) === n;
export const other = (L: Link, id: number) => (L.a === id ? L.b : L.a);
export const dirFrom = (L: Link, id: number) => (L.a === id ? 'ab' : 'ba') as 'ab' | 'ba';
export const nodeName = (w: World, id: number) => w.nodes.get(id)?.name ?? '?';
export const ndist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
export const lname = (w: World, L: Link) => `${nodeName(w, L.a)} ↔ ${nodeName(w, L.b)}`;
export const autoCost = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(1, Math.round(ndist(a, b) * 30));

/** One-way delay of a lane: longer lanes take longer. */
export function linkLat(w: World, L: Link) {
  const a = w.nodes.get(L.a), b = w.nodes.get(L.b);
  return a && b ? 0.1 + ndist(a, b) * 1.0 : 0.3;
}

export function toast(w: World, msg: string, tone: '' | 'warn' | 'good' = '', key?: string) {
  w.bus.emit({ type: 'toast', msg, tone, key });
}

function nextName(w: World, type: NodeType) {
  const p = KINDS[type].prefix;
  w.names[p] = (w.names[p] || 0) + 1;
  return p + w.names[p];
}

export function addNode(w: World, type: NodeType, x: number, y: number, o: NodeOpts = {}): GNode {
  const id = w.nid++;
  const base = { id, x, y, name: nextName(w, type), lsdb: new Map(), nh: new Map(), dist: new Map([[id, 0]]) };
  let n: GNode;
  switch (type) {
    case 'client':
      n = { ...base, type, rate: o.rate ?? 1.5, pending: new Map(), nextAt: w.t + w.rng.next() * 0.8, sent: 0, ok: 0, fail: 0, recent: [], noroute: -9 };
      break;
    case 'router':
      n = { ...base, type };
      break;
    case 'lb':
      n = {
        ...base, type, algo: o.algo || 'least', hc: o.hc ?? true, rr: 0, inflight: new Map(), health: new Map(), proxies: new Map(),
        nextHc: w.t + 0.3 + w.rng.next() * 0.5, share: new Map(), lastPick: null, lastPickT: -9, candSig: undefined, candList: [], lastMove: null,
      };
      break;
    case 'server':
      n = { ...base, type, mode: 'ok', conc: o.conc ?? 4, svc: o.svc ?? 0.35, busy: [], queue: [], qcap: 10, servedEW: 0, rejects: 0 };
      break;
    case 'cache':
      n = {
        ...base, type, cap: o.cap ?? 16, ttl: o.ttl ?? 10, coalesce: o.coalesce ?? false, store: new Map(), fetches: new Map(), byKey: new Map(),
        keyN: new Map(), maxSame: 0, hits: 0, misses: 0, evictions: 0, fetchEW: 0, look: [], lastStampede: -99, gc: 0,
      };
      break;
  }
  w.nodes.set(id, n);
  return n;
}

export function findLink(w: World, a: number, b: number) {
  for (const L of w.links.values()) if (!L.removed && ((L.a === a && L.b === b) || (L.a === b && L.b === a))) return L;
  return null;
}

export function addLink(w: World, aId: number, bId: number, o: { cost?: number; bw?: number; instant?: boolean } = {}): Link | null {
  if (aId === bId || findLink(w, aId, bId)) return null;
  const a = w.nodes.get(aId), b = w.nodes.get(bId);
  if (!a || !b) return null;
  const id = w.lid++;
  const L: Link = {
    id, a: aId, b: bId, up: true, removed: false, ver: 1, cost: o.cost ?? autoCost(a, b), bw: o.bw ?? 50,
    q: { ab: [], ba: [] }, nextTx: { ab: 0, ba: 0 }, util: { ab: 0, ba: 0 }, curve: (((id * 37) % 7) - 3) * 0.035, cutAt: -9,
  };
  w.links.set(id, L);
  if (!o.instant) {
    w.changes.push({ lid: id, ver: L.ver, t0: w.t, kind: 'new' });
    const v = L.ver;
    at(w, w.t + w.cfg.detect, () => L.ver === v && detect(w, L));
  }
  return L;
}

export function dropInFlight(w: World, L: Link) {
  w.flights = w.flights.filter(f => {
    if (f.L !== L) return true;
    if (f.p.kind !== 'lsa') dropAt(w, f.p, { link: L.id, d: f.d, prog: Math.min(1, Math.max(0, (w.t - f.t0) / (f.t1 - f.t0))) }, 'cut');
    return false;
  });
}

export function removeLink(w: World, L: Link, silent = false) {
  if (L.removed) return;
  dropInFlight(w, L);
  for (const d of DIRS) {
    const from = d === 'ab' ? L.a : L.b;
    for (const p of L.q[d]) dropAt(w, p, { node: from }, 'cut');
    L.q[d] = [];
  }
  L.removed = true;
  L.up = false;
  L.ver++;
  w.changes.push({ lid: L.id, ver: L.ver, t0: w.t, kind: 'cut', silent });
  const v = L.ver;
  at(w, w.t + w.cfg.detect, () => L.ver === v && detect(w, L));
}
