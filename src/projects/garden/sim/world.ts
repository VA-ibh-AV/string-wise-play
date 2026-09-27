import { createBus, createRng } from '@play/engine';
import type { Algo } from '../content/algos';
import type { NodeType } from '../content/kinds';
import { MISSIONS, type MissionId } from '../content/missions';
import { SEEDS, type NodeOpts, type SeedKey } from '../content/seeds';
import { addLink, addNode, alive, at, autoCost, dropInFlight, lname, removeLink, toast } from './core';
import { Heap } from './heap';
import { component, detect, scheduleDetect, syncAll } from './routing';
import { advance, cacheTick, clientTick, lbCands, lbTick, serverTick, serviceLinks } from './traffic';
import type { CacheNode, GardenEvent, GNode, Link, LbNode, ServerNode, World } from './types';
import { D1, DT, K } from './types';

export function createWorld(opts: { seed?: SeedKey; rngSeed?: number; done?: Iterable<MissionId> } = {}): World {
  const w: World = {
    t: 0, rng: createRng(opts.rngSeed ?? 11), bus: createBus<GardenEvent>(), heap: new Heap(),
    nodes: new Map(), links: new Map(), flights: [], nid: 1, lid: 1, pid: 1, names: {},
    cfg: { detect: 0.8, ttl: 12, qcap: 24, traffic: 1 },
    flash: 0, changes: [], res: [], issued: [], lookups: [], origin: [], dropsLog: [], drops: {},
    dropTotal: 0, okTotal: 0, failTotal: 0, hist: [], nextHist: 0, nextConv: 0,
    flags: { sawTable: false, cutDrops: 0, cutAt: null, okAtCut: 0, convergedAfterCut: false, purge: null, stampedeTamed: false, hashMoveOk: false, tracedDone: false },
    traceNext: null, holds: {}, seed: 'sky', rings: new Map(),
    m: { rps: 0, okRate: 0, success: null, p50: 0, p95: 0, hit: null, lookups: 0, origin: 0 },
    missions: new Set(opts.done ?? []),
  };
  plantSeed(w, opts.seed ?? 'sky', opts.rngSeed ?? 11);
  return w;
}

/** Replace the sky with a seed layout. Missions and the event bus survive. */
export function plantSeed(w: World, key: SeedKey, rngSeed = 11) {
  if (!SEEDS[key]) key = 'sky';
  Object.assign(w, {
    t: 0, rng: createRng(rngSeed), heap: new Heap(), nodes: new Map(), links: new Map(), flights: [], nid: 1, lid: 1, pid: 1, names: {},
    flash: 0, changes: [], res: [], issued: [], lookups: [], origin: [], dropsLog: [], drops: {}, dropTotal: 0, okTotal: 0, failTotal: 0,
    hist: [], nextHist: 0, nextConv: 0, holds: {}, rings: new Map(), seed: key,
  });
  w.flags = { sawTable: w.flags.sawTable, cutDrops: 0, cutAt: null, okAtCut: 0, convergedAfterCut: false, purge: null, stampedeTamed: false, hashMoveOk: false, tracedDone: false };
  w.traceNext = null;
  w.cfg.traffic = 1;
  SEEDS[key].build(
    (t, x, y, o) => addNode(w, t, x, y, o),
    (a, b, o) => {
      const A = w.nodes.get(a.id)!, B = w.nodes.get(b.id)!;
      addLink(w, a.id, b.id, { instant: true, cost: autoCost(A, B) + (o?.costAdd ?? 0) });
    },
  );
  syncAll(w);
  for (const n of w.nodes.values())
    if (n.type === 'lb') {
      n.candList = lbCands(w, n);
      n.candSig = n.candList.map(s => s.id).join(',');
    }
  w.bus.emit({ type: 'seed', key });
  if (key === 'empty') toast(w, 'Empty space. Place a probe and a planet, then join them with a lane.');
}

// ---------- metrics ----------
const q = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
function trim<T>(arr: T[], cutoff: number, get: (x: T) => number) {
  let i = 0;
  while (i < arr.length && get(arr[i]) < cutoff) i++;
  if (i) arr.splice(0, i);
}
export function computeMetrics(w: World) {
  const t = w.t, win = Math.min(10, Math.max(t, 0.5)), m = w.m;
  trim(w.res, t - 10, r => r.t);
  trim(w.issued, t - 10, x => x);
  trim(w.lookups, t - 10, r => r.t);
  trim(w.origin, t - 10, x => x);
  trim(w.dropsLog, t - 10, x => x);
  m.rps = w.issued.length / win;
  let ok = 0, fail = 0;
  const lats: number[] = [];
  for (const r of w.res) {
    if (r.ok) {
      ok++;
      lats.push(r.lat);
    } else fail++;
  }
  m.okRate = ok / win;
  m.success = ok + fail ? ok / (ok + fail) : null;
  lats.sort((a, b) => a - b);
  m.p50 = q(lats, 0.5);
  m.p95 = q(lats, 0.95);
  let lh = 0;
  for (const l of w.lookups) if (l.hit) lh++;
  m.lookups = w.lookups.length;
  m.hit = m.lookups ? lh / m.lookups : null;
  m.origin = w.origin.length / win;
}
export const pctl = q;

// ---------- convergence ----------
function checkConvergence(w: World) {
  if (!w.changes.length) return;
  for (const ch of w.changes) {
    const L = w.links.get(ch.lid);
    if (!L || L.ver !== ch.ver) {
      ch.done = true;
      continue;
    }
    let ok = true;
    for (const id of component(w, [L.a, L.b])) {
      const e = w.nodes.get(id)!.lsdb.get(ch.lid);
      if (!e || e.ver < ch.ver) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    ch.done = true;
    if (ch.kind === 'cut' && w.flags.cutAt != null && ch.t0 >= w.flags.cutAt - 1e-6) w.flags.convergedAfterCut = true;
    if (ch.silent) continue;
    const msg = {
      cut: `every relay now knows ${lname(w, L)} is severed`,
      regrow: `every relay knows ${lname(w, L)} is back`,
      cost: `every relay agrees ${lname(w, L)} costs ${L.cost}`,
      new: `every relay knows about the new lane ${lname(w, L)}`,
    }[ch.kind];
    toast(w, `Converged in ${(w.t - ch.t0).toFixed(1)}s: ${msg}.`, '', 'conv');
  }
  w.changes = w.changes.filter(c => !c.done);
}

// ---------- missions ----------
function hold(w: World, id: string, cond: boolean, secs: number) {
  if (!cond) {
    delete w.holds[id];
    return false;
  }
  if (w.holds[id] == null) w.holds[id] = w.t;
  return w.t - w.holds[id] >= secs;
}
const lbWith = (w: World, k: number) => [...w.nodes.values()].some(n => n.type === 'lb' && n.candList.length >= k);
const anySick = (w: World) =>
  [...w.nodes.values()].some(s => s.type === 'server' && s.mode !== 'ok' && [...w.nodes.values()].some(l => l.type === 'lb' && l.dist.has(s.id)));

const CHECKS: Record<MissionId, (w: World) => boolean> = {
  bloom: w => w.flags.tracedDone,
  rings: w => w.flags.sawTable,
  snip: w => w.flags.cutDrops >= 3,
  around: w => w.flags.convergedAfterCut && w.okTotal - w.flags.okAtCut >= 20,
  share: w => hold(w, 'share', lbWith(w, 3) && w.m.okRate >= 6 && (w.m.success ?? 0) >= 0.99, 10),
  sick: w => hold(w, 'sick', anySick(w) && w.m.okRate >= 3 && (w.m.success ?? 0) >= 0.98, 20),
  deep: w => hold(w, 'deep', w.m.hit != null && w.m.hit >= 0.7 && w.m.lookups >= 40, 5),
  stampede: w => w.flags.stampedeTamed,
  hash: w => w.flags.hashMoveOk,
};

function checkMissions(w: World) {
  const pg = w.flags.purge;
  if (pg && w.t - pg.t > 6) {
    const c = w.nodes.get(pg.id);
    if (c && c.type === 'cache' && pg.co && c.coalesce && c.hits - pg.hits >= 15 && c.maxSame <= 1) w.flags.stampedeTamed = true;
    w.flags.purge = null;
  }
  for (const m of MISSIONS) {
    if (w.missions.has(m.id)) continue;
    if (CHECKS[m.id](w)) {
      w.missions.add(m.id);
      w.bus.emit({ type: 'mission', id: m.id });
      toast(w, m.title, 'good');
    }
  }
}

// ---------- step ----------
export function step(w: World) {
  w.t += DT;
  while (w.heap.size && w.heap.peekAt() <= w.t) w.heap.pop()();
  for (const n of w.nodes.values()) {
    if (n.type === 'client') clientTick(w, n);
    else if (n.type === 'server') serverTick(w, n);
    else if (n.type === 'lb') lbTick(w, n);
    else if (n.type === 'cache') cacheTick(w, n);
  }
  serviceLinks(w);
  advance(w);
  for (const L of w.links.values()) {
    L.util.ab *= D1;
    L.util.ba *= D1;
  }
  if (w.t >= w.nextConv) {
    w.nextConv = w.t + 0.1;
    checkConvergence(w);
  }
  if (w.t >= w.nextHist) {
    w.nextHist = w.t + 0.5;
    computeMetrics(w);
    w.hist.push({ ok: w.m.okRate, p95: w.m.p95, origin: w.m.origin });
    if (w.hist.length > 120) w.hist.shift();
    checkMissions(w);
  }
}

/** Fast-forward `sec` sim seconds (tests and the dev hook). */
export function run(w: World, sec: number) {
  const n = Math.round(sec / DT);
  for (let i = 0; i < n; i++) step(w);
  computeMetrics(w);
  return w.m;
}

// ---------- things a person can do ----------
export function plant(w: World, type: NodeType, x: number, y: number, o?: NodeOpts) {
  const n = addNode(w, type, x, y, o);
  syncOne(n);
  return n;
}
/** A new body knows nothing until a lane connects it. */
function syncOne(n: GNode) {
  n.dist = new Map([[n.id, 0]]);
  n.nh = new Map();
}

export function makeLane(w: World, a: number, b: number) {
  const L = addLink(w, a, b);
  if (!L) {
    toast(w, 'Those two are already joined by a lane.');
    return null;
  }
  toast(w, `New lane ${lname(w, L)}. Once both ends hear each other, they swap what they know and spread the news.`, '', 'newlane');
  return L;
}

export function setLinkUp(w: World, L: Link, up: boolean) {
  if (L.removed || L.up === up) return;
  const busy = L.util.ab + L.util.ba > 1.5;
  L.up = up;
  L.ver++;
  if (!up) {
    L.cutAt = w.t;
    dropInFlight(w, L);
  }
  w.changes.push({ lid: L.id, ver: L.ver, t0: w.t, kind: up ? 'regrow' : 'cut' });
  scheduleDetect(w, L, w.cfg.detect);
  w.bus.emit({ type: 'cut', link: L.id, up });
  if (!up) {
    toast(w, `Severed ${lname(w, L)}. The relays at each end notice after the ${w.cfg.detect.toFixed(1)}s dead interval, then tell everyone.`);
    if (busy) {
      w.flags.cutAt = w.t;
      w.flags.okAtCut = w.okTotal;
      w.flags.convergedAfterCut = false;
    }
  } else toast(w, `${lname(w, L)} is reconnecting. Both ends swap what they know once they hear each other.`);
}

export function setCost(w: World, L: Link, c: number) {
  if (L.cost === c || L.removed) return;
  L.cost = c;
  L.ver++;
  w.changes.push({ lid: L.id, ver: L.ver, t0: w.t, kind: 'cost' });
  scheduleDetect(w, L, 0.05);
}

export function removeLane(w: World, L: Link) {
  toast(w, `Removed the lane ${lname(w, L)}.`);
  removeLink(w, L);
}

export function removeBody(w: World, n: GNode) {
  for (const L of [...w.links.values()]) if (!L.removed && (L.a === n.id || L.b === n.id)) removeLink(w, L, true);
  w.nodes.delete(n.id);
  toast(w, `Removed ${n.name}.`);
}

export function moveBody(n: GNode, x: number, y: number) {
  n.x = Math.min(0.99, Math.max(0.01, x));
  n.y = Math.min(0.99, Math.max(0.01, y));
}

export function setMode(w: World, n: ServerNode, mode: ServerNode['mode']) {
  if (n.mode === mode) return;
  n.mode = mode;
  if (mode === 'down') {
    n.busy = [];
    n.queue = [];
    toast(w, `${n.name} is down. Requests sent to it vanish until something notices.`, 'warn');
  } else if (mode === 'slow') toast(w, `${n.name} is slow: every request now takes 6× longer. It still answers health checks.`, 'warn');
  else toast(w, `${n.name} is healthy again.`);
}

export function setAlgo(n: LbNode, algo: Algo) {
  n.algo = algo;
}
export function setHealthChecks(w: World, n: LbNode, on: boolean) {
  n.hc = on;
  if (on) n.nextHc = w.t;
}

export function drain(w: World, n: CacheNode) {
  n.store.clear();
  n.maxSame = 0;
  n.keyN.forEach(v => (n.maxSame = Math.max(n.maxSame, v)));
  const during = w.t < w.flash;
  toast(w, during ? `Drained ${n.name} in the middle of a solar flare. Watch the planets.` : `Drained ${n.name}. Every crystal is a miss until it is fetched again.`);
  if (during) w.flags.purge = { t: w.t, id: n.id, co: n.coalesce, hits: n.hits };
}

export function solarFlare(w: World) {
  if (w.t < w.flash) return;
  w.flash = w.t + 10;
  toast(w, 'Solar flare: 4× the requests for 10s, and most of them want the same two crystals.', 'warn');
}

/** The probe's next request is traced hop by hop. */
export function followRequest(w: World, probeId: number) {
  const n = w.nodes.get(probeId);
  if (n?.type !== 'client') return false;
  w.traceNext = probeId;
  // don't make the visitor wait for the next random arrival
  n.nextAt = Math.min(n.nextAt, w.t);
  return true;
}

export function sawTable(w: World) {
  w.flags.sawTable = true;
}

export { alive, at, detect, K };
