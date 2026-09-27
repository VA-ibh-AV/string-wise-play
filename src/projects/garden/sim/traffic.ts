import { alive, at, dirFrom, linkLat, nodeName, toast } from './core';
import type { CacheNode, ClientNode, DropReason, GNode, LbNode, Link, Packet, ServerNode, Where, World } from './types';
import { D2, D5, DIRS, DT, HC_EVERY, HC_FALL, K, TIMEOUT } from './types';
import { applyEntries, flood, recompute } from './routing';

// ---------- keys: Zipf popularity, a few crystals are hot ----------
const zcdf: number[] = [];
{
  let sum = 0, c = 0;
  const wts: number[] = [];
  for (let i = 1; i <= K; i++) {
    const x = 1 / Math.pow(i, 1.05);
    wts.push(x);
    sum += x;
  }
  for (const x of wts) zcdf.push((c += x / sum));
}
function zipf(w: World) {
  const u = w.rng.next();
  let lo = 0, hi = K - 1;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (zcdf[m] < u) lo = m + 1;
    else hi = m;
  }
  return lo;
}
const expo = (w: World, mean: number) => -Math.log(1 - w.rng.next()) * mean;

export function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // murmur3 finalizer: plain FNV barely spreads strings that differ only in the last character
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// ---------- data plane ----------
type NewPacket = Omit<Packet, 'id' | 'src' | 'ttl'> & Partial<Pick<Packet, 'ttl'>>;

export function send(w: World, n: GNode, p: NewPacket) {
  const full = p as Packet;
  full.src = n.id;
  full.ttl = w.cfg.ttl;
  full.id = w.pid++;
  forward(w, n, full);
}

export function forward(w: World, n: GNode, p: Packet) {
  if (p.dst === n.id) return deliver(w, n, p);
  const lid = n.nh.get(p.dst);
  const L = lid != null ? w.links.get(lid) : undefined;
  if (!L || L.removed) return dropAt(w, p, { node: n.id }, 'noroute');
  if (--p.ttl <= 0) return dropAt(w, p, { node: n.id }, 'ttl');
  const d = dirFrom(L, n.id);
  if (L.q[d].length >= w.cfg.qcap) return dropAt(w, p, { node: n.id }, 'queue');
  if (p.trace) w.bus.emit({ type: 'trace', what: 'hop', node: n.id, next: d === 'ab' ? L.b : L.a, dst: p.dst, kind: p.kind });
  L.q[d].push(p);
}

export function launch(w: World, L: Link, fromId: number, p: Packet, ctrl: boolean) {
  const d = dirFrom(L, fromId);
  w.flights.push({ p, L, d, t0: w.t, t1: w.t + linkLat(w, L) });
  if (!ctrl) L.util[d] += 1;
}

export function serviceLinks(w: World) {
  for (const L of w.links.values()) {
    if (L.removed) continue;
    for (const d of DIRS) {
      const qd = L.q[d];
      if (!qd.length || w.t < L.nextTx[d]) continue;
      const p = qd.shift()!;
      L.nextTx[d] = Math.max(L.nextTx[d], w.t - DT) + 1 / L.bw;
      const fromId = d === 'ab' ? L.a : L.b;
      if (!L.up) {
        dropAt(w, p, { node: fromId }, 'cut');
        continue;
      }
      launch(w, L, fromId, p, false);
    }
  }
}

export function advance(w: World) {
  const arr = w.flights;
  if (!arr.length) return;
  w.flights = [];
  for (const f of arr) {
    if (w.t >= f.t1) arrive(w, f.L, f.d, f.p);
    else w.flights.push(f);
  }
}

function arrive(w: World, L: Link, d: 'ab' | 'ba', p: Packet) {
  const n = w.nodes.get(d === 'ab' ? L.b : L.a);
  if (!n || L.removed || !L.up) return;
  if (p.kind === 'lsa') {
    const ch = applyEntries(n, p.entries!);
    if (ch.length) {
      w.bus.emit({ type: 'lsa', node: n.id });
      recompute(w, n);
      flood(w, n, ch, L.id);
    }
    return;
  }
  forward(w, n, p);
}

export function dropAt(w: World, p: Packet, where: Where, reason: DropReason) {
  if (p.kind === 'req' || p.kind === 'res') {
    w.drops[reason] = (w.drops[reason] || 0) + 1;
    w.dropTotal++;
    w.dropsLog.push(w.t);
    if (reason === 'cut') w.flags.cutDrops++;
  }
  if (p.kind !== 'lsa') w.bus.emit({ type: 'drop', reason, at: where });
  if (p.trace) {
    w.bus.emit({ type: 'trace', what: 'lost', node: 'node' in where ? where.node : p.src, reason, kind: p.kind });
    w.traceNext = null;
  }
}

function deliver(w: World, n: GNode, p: Packet) {
  switch (p.kind) {
    case 'req':
      if (n.type === 'server') return serverReq(w, n, p);
      if (n.type === 'cache') return cacheReq(w, n, p);
      if (n.type === 'lb') return lbReq(w, n, p);
      return dropAt(w, p, { node: n.id }, 'noroute');
    case 'res':
      if (n.type === 'client') return clientRes(w, n, p);
      if (n.type === 'cache') return finishFetch(w, n, p.ctx.fid, !!p.ok);
      if (n.type === 'lb') return lbRes(w, n, p);
      return;
    case 'hc':
      if (n.type === 'server' && n.mode !== 'down') send(w, n, { kind: 'hcr', dst: p.src, key: 0, ctx: p.ctx, born: w.t });
      return;
    case 'hcr':
      if (n.type === 'lb') lbHcr(w, n, p);
      return;
  }
}

/** Anycast-style steering: the nearest body of the first type that is reachable. */
export function entryFor(w: World, n: GNode, prefs: GNode['type'][]): GNode | null {
  for (const type of prefs) {
    let best: GNode | null = null, bd = Infinity;
    for (const m of w.nodes.values()) {
      if (m.type !== type || m.id === n.id) continue;
      const d = n.dist.get(m.id);
      if (d != null && d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best) return best;
  }
  return null;
}

const reply = (w: World, n: GNode, p: Packet, ok: boolean, hit = false) =>
  send(w, n, { kind: 'res', dst: p.src, key: p.key, ctx: p.ctx, ok, hit, born: p.born, trace: p.trace });

// ---------- probes (clients) ----------
export function clientTick(w: World, n: ClientNode) {
  const rate = n.rate * w.cfg.traffic * (w.t < w.flash ? 4 : 1);
  if (rate <= 0.01) {
    n.nextAt = w.t + 0.5;
    return;
  }
  if (n.nextAt > w.t + 3) n.nextAt = w.t + expo(w, 1 / rate);
  while (w.t >= n.nextAt) {
    n.nextAt += expo(w, 1 / rate);
    issue(w, n);
  }
}

function issue(w: World, n: ClientNode) {
  w.issued.push(w.t);
  const key = w.t < w.flash && w.rng.next() < 0.75 ? Math.floor(w.rng.next() * 2) : zipf(w);
  const tgt = entryFor(w, n, ['cache', 'lb', 'server']);
  if (!tgt) {
    n.noroute = w.t;
    result(w, n, false, 0, false);
    return;
  }
  const rid = w.pid++;
  const trace = w.traceNext === n.id;
  if (trace) w.traceNext = null;
  n.pending.set(rid, { born: w.t, key, trace });
  n.sent++;
  at(w, w.t + TIMEOUT.client, () => {
    if (n.pending.delete(rid)) {
      if (trace) w.bus.emit({ type: 'trace', what: 'lost', node: n.id, reason: 'noroute' });
      result(w, n, false, 0, false);
    }
  });
  if (trace) w.bus.emit({ type: 'trace', what: 'ask', node: n.id, dst: tgt.id });
  send(w, n, { kind: 'req', dst: tgt.id, key, ctx: { rid }, born: w.t, trace });
}

function clientRes(w: World, n: ClientNode, p: Packet) {
  const pd = n.pending.get(p.ctx.rid);
  if (!pd) return;
  n.pending.delete(p.ctx.rid);
  if (pd.trace) {
    w.bus.emit({ type: 'trace', what: 'answer', node: n.id, ok: !!p.ok, hit: !!p.hit, lat: w.t - pd.born });
    if (p.ok) w.flags.tracedDone = true;
  }
  result(w, n, !!p.ok, w.t - pd.born, !!p.hit, pd.key);
}

function result(w: World, n: ClientNode, ok: boolean, lat: number, hit: boolean, key = 0) {
  if (!alive(w, n)) return;
  w.res.push({ t: w.t, ok, lat, hit });
  n.recent.push({ ok, lat });
  if (n.recent.length > 30) n.recent.shift();
  if (ok) {
    w.okTotal++;
    n.ok++;
    w.bus.emit({ type: 'answer', node: n.id, key, hit });
  } else {
    w.failTotal++;
    n.fail++;
    w.bus.emit({ type: 'fail', node: n.id });
  }
}

// ---------- planets (servers) ----------
function serverReq(w: World, n: ServerNode, p: Packet) {
  w.origin.push(w.t);
  if (n.mode === 'down') {
    // the process is gone; the request just vanishes
    if (p.trace) w.bus.emit({ type: 'trace', what: 'lost', node: n.id, reason: 'noroute', kind: p.kind });
    return;
  }
  if (p.trace) w.bus.emit({ type: 'trace', what: n.busy.length < n.conc ? 'serve' : 'queue', node: n.id });
  if (n.busy.length < n.conc) startJob(w, n, p);
  else if (n.queue.length < n.qcap) n.queue.push(p);
  else {
    n.rejects++;
    reply(w, n, p, false);
  }
}
function startJob(w: World, n: ServerNode, p: Packet) {
  const slow = n.mode === 'slow' ? 6 : 1;
  n.busy.push({ p, done: w.t + n.svc * slow * (0.5 + w.rng.next()) });
}
export function serverTick(w: World, n: ServerNode) {
  n.servedEW *= D2;
  for (let i = n.busy.length - 1; i >= 0; i--) {
    const j = n.busy[i];
    if (w.t >= j.done) {
      n.busy.splice(i, 1);
      n.servedEW += 1;
      reply(w, n, j.p, true);
    }
  }
  while (n.busy.length < n.conc && n.queue.length) startJob(w, n, n.queue.shift()!);
}

// ---------- pulsars (load balancers) ----------
export function lbCands(w: World, n: LbNode): ServerNode[] {
  const out: ServerNode[] = [];
  for (const s of w.nodes.values()) {
    if (s.type !== 'server' || !n.dist.has(s.id)) continue;
    if (n.hc) {
      const h = n.health.get(s.id);
      if (h && !h.up) continue;
    }
    out.push(s);
  }
  return out.sort((a, b) => a.id - b.id);
}

export function ringPick(w: World, c: ServerNode[], key: number): ServerNode {
  const sig = c.map(s => s.name).join(',');
  let pts = w.rings.get(sig);
  if (!pts) {
    pts = [];
    for (const s of c) for (let v = 0; v < 64; v++) pts.push({ h: fnv(s.name + '#' + v), s });
    pts.sort((a, b) => a.h - b.h);
    w.rings.set(sig, pts);
  }
  const h = fnv('key:' + key);
  let lo = 0, hi = pts.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (pts[m].h < h) lo = m + 1;
    else hi = m;
  }
  return pts[lo % pts.length].s;
}

function lbPick(w: World, n: LbNode, c: ServerNode[], key: number): ServerNode {
  const inf = (s: ServerNode) => n.inflight.get(s.id) || 0;
  switch (n.algo) {
    case 'rr':
      return c[n.rr++ % c.length];
    case 'random':
      return c[Math.floor(w.rng.next() * c.length)];
    case 'least': {
      const start = n.rr++ % c.length;
      let best = c[0], bv = Infinity;
      for (let i = 0; i < c.length; i++) {
        const s = c[(start + i) % c.length];
        if (inf(s) < bv) {
          bv = inf(s);
          best = s;
        }
      }
      return best;
    }
    case 'p2c': {
      if (c.length === 1) return c[0];
      const i = Math.floor(w.rng.next() * c.length);
      let j = Math.floor(w.rng.next() * (c.length - 1));
      if (j >= i) j++;
      return inf(c[i]) <= inf(c[j]) ? c[i] : c[j];
    }
    case 'hash':
      return ringPick(w, c, key);
  }
}

const decIn = (n: LbNode, id: number) => n.inflight.set(id, Math.max(0, (n.inflight.get(id) || 0) - 1));

function lbReq(w: World, n: LbNode, p: Packet) {
  const c = n.candList;
  if (!c.length) return reply(w, n, p, false);
  const s = lbPick(w, n, c, p.key);
  const pid = w.pid++;
  n.proxies.set(pid, { to: p.src, ctx: p.ctx, key: p.key, born: p.born, srv: s.id, trace: p.trace });
  if (p.trace) w.bus.emit({ type: 'trace', what: 'pick', node: n.id, next: s.id });
  n.inflight.set(s.id, (n.inflight.get(s.id) || 0) + 1);
  n.share.set(s.id, (n.share.get(s.id) || 0) + 1);
  n.lastPick = s.id;
  n.lastPickT = w.t;
  w.bus.emit({ type: 'lb.pick', node: n.id, server: s.id });
  at(w, w.t + TIMEOUT.lb, () => {
    const pr = n.proxies.get(pid);
    if (!pr || !alive(w, n)) return;
    n.proxies.delete(pid);
    decIn(n, pr.srv);
    send(w, n, { kind: 'res', dst: pr.to, key: pr.key, ctx: pr.ctx, ok: false, born: pr.born });
  });
  send(w, n, { kind: 'req', dst: s.id, key: p.key, ctx: { pid }, born: p.born, trace: p.trace });
}

function lbRes(w: World, n: LbNode, p: Packet) {
  const pr = n.proxies.get(p.ctx.pid);
  if (!pr) return;
  n.proxies.delete(p.ctx.pid);
  decIn(n, pr.srv);
  send(w, n, { kind: 'res', dst: pr.to, key: pr.key, ctx: pr.ctx, ok: p.ok, born: pr.born, trace: pr.trace });
}

export function lbTick(w: World, n: LbNode) {
  for (const [k, v] of n.share) n.share.set(k, v * D5);
  const c = lbCands(w, n);
  const sig = c.map(s => s.id).join(',');
  if (n.candSig !== undefined && sig !== n.candSig) onRotation(w, n, n.candList, c);
  n.candSig = sig;
  n.candList = c;
  if (!n.hc || w.t < n.nextHc) return;
  n.nextHc = w.t + HC_EVERY;
  for (const s of w.nodes.values()) {
    if (s.type !== 'server' || !n.dist.has(s.id)) continue;
    let h = n.health.get(s.id);
    if (!h) n.health.set(s.id, (h = { up: true, fails: 0, wait: new Set() }));
    const hid = w.pid++;
    h.wait.add(hid);
    const hh = h;
    at(w, w.t + TIMEOUT.hc, () => {
      if (!hh.wait.delete(hid) || !alive(w, n) || !alive(w, s)) return;
      hh.fails++;
      if (hh.up && hh.fails >= HC_FALL) {
        hh.up = false;
        toast(w, `${n.name}: ${s.name} missed ${HC_FALL} health checks and is out of rotation.`, 'warn');
      }
    });
    send(w, n, { kind: 'hc', dst: s.id, key: 0, ctx: { hid }, born: w.t });
  }
}

function lbHcr(w: World, n: LbNode, p: Packet) {
  const h = n.health.get(p.src);
  if (!h || !h.wait.delete(p.ctx.hid)) return;
  h.fails = 0;
  if (!h.up) {
    h.up = true;
    toast(w, `${n.name}: ${nodeName(w, p.src)} passed a health check and is back in rotation.`);
  }
}

function onRotation(w: World, n: LbNode, before: ServerNode[], after: ServerNode[]) {
  if (n.algo !== 'hash' || !before.length || !after.length) return;
  let moved = 0, modMoved = 0;
  for (let k = 0; k < K; k++) {
    if (ringPick(w, before, k).name !== ringPick(w, after, k).name) moved++;
    const h = fnv('key:' + k);
    if (before[h % before.length].name !== after[h % after.length].name) modMoved++;
  }
  n.lastMove = { moved, modMoved, from: before.length, to: after.length };
  toast(w, `${n.name} · consistent hash: ${moved} of ${K} crystals moved to a new planet (${Math.round((moved / K) * 100)}%). Plain hash mod N would have moved ${modMoved}.`);
  if (after.length < before.length && moved / K <= 0.5) w.flags.hashMoveOk = true;
}

// ---------- nebulae (caches) ----------
function evictLRU(n: CacheNode) {
  while (n.store.size > n.cap) {
    let lk: number | null = null, lt = Infinity;
    for (const [k, e] of n.store) if (e.last < lt) { lt = e.last; lk = k; }
    n.store.delete(lk!);
    n.evictions++;
  }
}

function cacheReq(w: World, n: CacheNode, p: Packet) {
  const e = n.store.get(p.key);
  if (e && e.exp > w.t) {
    n.hits++;
    e.last = w.t;
    w.lookups.push({ t: w.t, hit: true });
    n.look.push({ t: w.t, hit: true });
    w.bus.emit({ type: 'cache.hit', node: n.id });
    if (p.trace) w.bus.emit({ type: 'trace', what: 'hit', node: n.id });
    return reply(w, n, p, true, true);
  }
  if (e) n.store.delete(p.key);
  n.misses++;
  w.lookups.push({ t: w.t, hit: false });
  n.look.push({ t: w.t, hit: false });
  const wt = { src: p.src, ctx: p.ctx, born: p.born, trace: p.trace };
  if (n.coalesce && n.byKey.has(p.key)) {
    if (p.trace) w.bus.emit({ type: 'trace', what: 'wait', node: n.id });
    n.fetches.get(n.byKey.get(p.key)!)!.waiters.push(wt);
    return;
  }
  const up = entryFor(w, n, ['lb', 'server']);
  if (!up) return reply(w, n, p, false);
  const fid = w.pid++;
  n.fetches.set(fid, { key: p.key, waiters: [wt] });
  n.byKey.set(p.key, fid);
  const c = (n.keyN.get(p.key) || 0) + 1;
  n.keyN.set(p.key, c);
  if (c > n.maxSame) n.maxSame = c;
  if (c >= 5 && w.t - n.lastStampede > 8) {
    n.lastStampede = w.t;
    toast(w, `Stampede at ${n.name}: ${c} fetches for crystal #${p.key} are in flight at once, and every one hits the planets. Try request coalescing.`, 'warn');
  }
  n.fetchEW += 1;
  at(w, w.t + TIMEOUT.fetch, () => finishFetch(w, n, fid, false));
  if (p.trace) w.bus.emit({ type: 'trace', what: 'miss', node: n.id, dst: up.id });
  send(w, n, { kind: 'req', dst: up.id, key: p.key, ctx: { fid }, born: w.t, trace: p.trace });
}

function finishFetch(w: World, n: CacheNode, fid: number, ok: boolean) {
  const f = n.fetches.get(fid);
  if (!f || !alive(w, n)) return;
  n.fetches.delete(fid);
  if (n.byKey.get(f.key) === fid) n.byKey.delete(f.key);
  const c = (n.keyN.get(f.key) || 1) - 1;
  if (c <= 0) n.keyN.delete(f.key);
  else n.keyN.set(f.key, c);
  if (ok) {
    n.store.set(f.key, { exp: w.t + n.ttl, last: w.t });
    evictLRU(n);
  }
  for (const wt of f.waiters) send(w, n, { kind: 'res', dst: wt.src, key: f.key, ctx: wt.ctx, ok, hit: false, born: wt.born, trace: wt.trace });
}

export function cacheTick(w: World, n: CacheNode) {
  n.fetchEW *= D2;
  if (++n.gc % 12) return;
  for (const [k, e] of n.store) if (e.exp <= w.t) n.store.delete(k);
  while (n.look.length && n.look[0].t < w.t - 10) n.look.shift();
  evictLRU(n);
}
