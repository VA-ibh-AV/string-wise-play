import type { Cpu, Delta, Host, Key, Proc } from '@play/protocol';
import type { Preset } from '../content/presets';
import { addPlanet, MAX_PLANETS, RINGS, removePlanet, type OrbitPlanet, type OrbitSystem } from './system';

/**
 * Live mode: planets are the busiest real processes on the host, and the
 * melody is replayed from real CPU use. The agent samples once per second
 * (real time slices are milliseconds), so this is a sonification of the
 * measured shares, not the kernel's exact run queue.
 */
export interface LiveFeed {
  host: Host | null;
  procs: Map<number, Proc>;
  cpus: Cpu[];
  viewers: number;
  /** Error-diffusion accumulator for the note density. */
  acc: number;
  /** Smoothed CPU (cores) per vpid, so rankings don't jump every second. */
  smooth: Map<number, number>;
  /** Stable short numbers for processes whose name the agent hides. */
  hidden: Map<number, number>;
  /** Feed updates since the rings were last re-sorted. */
  sinceRings: number;
}

export interface LiveInfo {
  vpid: number;
  cpu: number;
  policy: NonNullable<Proc['policy']>;
  state: Proc['state'];
  threads: number;
}

/** A newcomer replaces the quietest planet only when it is this much busier. */
export const SWAP_RATIO = 1.5;
/** Smallest share used for stride scheduling, so idle planets still sing now and then. */
const MIN_SHARE = 0.01;
/** Notes per slice on an idle machine and on a fully busy one: always calm, never silent. */
export const DENSITY_IDLE = 0.22;
export const DENSITY_BUSY = 0.8;
/** Live plays slower than the Sandbox. */
export const LIVE_BPM = 64;
/** Rings are re-sorted only this often (feed updates, about seconds), so planets rarely move. */
const RING_EVERY = 6;
/** Scale steps handed out to new planets: low and consonant first. */
const NOTE_SLOTS = [2, 4, 0, 5, 3, 7, 1, 6, 8, 9];

export const createFeed = (): LiveFeed => ({
  host: null, procs: new Map(), cpus: [], viewers: 0, acc: 0, smooth: new Map(), hidden: new Map(), sinceRings: RING_EVERY,
});

function smoothAll(f: LiveFeed) {
  for (const id of [...f.smooth.keys()]) if (!f.procs.has(id)) f.smooth.delete(id);
  for (const p of f.procs.values()) {
    const s = f.smooth.get(p.vpid);
    // slow average (about 5 s): a short burst doesn't reshuffle the sky
    f.smooth.set(p.vpid, s === undefined ? p.cpu : s * 0.8 + p.cpu * 0.2);
  }
}

export function applyKey(f: LiveFeed, k: Key) {
  f.procs = new Map(k.procs.map(p => [p.vpid, p]));
  f.cpus = k.cpus;
  f.viewers = k.viewers;
  smoothAll(f);
}

export function applyDelta(f: LiveFeed, d: Delta) {
  for (const id of d.died) f.procs.delete(id);
  for (const p of d.born) f.procs.set(p.vpid, p);
  for (const c of d.changed) {
    const p = f.procs.get(c.vpid);
    if (p) f.procs.set(c.vpid, { ...p, ...c });
  }
  f.cpus = d.cpus;
  f.viewers = d.viewers;
  smoothAll(f);
}

const cpuOf = (f: LiveFeed, vpid: number) => f.smooth.get(vpid) ?? f.procs.get(vpid)?.cpu ?? 0;

/** Which vpids get a planet: the busiest, with hysteresis against the current set. */
export function pickVisible(f: LiveFeed, current: number[], max = MAX_PLANETS): number[] {
  const alive = [...f.procs.values()].filter(p => p.state !== 'Z');
  const ids = new Set(alive.map(p => p.vpid));
  const keep = current.filter(id => ids.has(id));
  const outsiders = alive.filter(p => !keep.includes(p.vpid)).sort((a, b) => cpuOf(f, b.vpid) - cpuOf(f, a.vpid) || a.vpid - b.vpid);
  while (keep.length < max && outsiders.length) keep.push(outsiders.shift()!.vpid);
  for (;;) {
    const best = outsiders[0];
    if (!best || !keep.length) break;
    let weakest = 0;
    keep.forEach((id, i) => cpuOf(f, id) < cpuOf(f, keep[weakest]) && (weakest = i));
    const w = cpuOf(f, keep[weakest]);
    if (cpuOf(f, best.vpid) <= w * SWAP_RATIO + 0.01) break;
    outsiders.shift();
    keep[weakest] = best.vpid;
  }
  return keep;
}

const PALETTE = ['#7FD1B9', '#6FA8FF', '#FF7A68', '#C9B8FF', '#C7A4FF', '#B6E07A', '#E7B4FF', '#F0C36A', '#8FE3F0', '#FFB38A'];
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const liveColor = (name: string) => PALETTE[hash(name) % PALETTE.length];
export const liveNote = (name: string) => 2 + (hash(name + '♪') % 10);

/**
 * The agent sends only allowlisted comm names; everything else arrives as
 * "proc". Those become hidden-1, hidden-2… so each still gets its own planet.
 */
export function liveName(f: LiveFeed, p: Proc) {
  if (p.name && p.name !== 'proc') return p.name;
  let n = f.hidden.get(p.vpid);
  if (n === undefined) f.hidden.set(p.vpid, (n = f.hidden.size + 1));
  return `hidden-${n}`;
}
export const isHidden = (name: string) => /^hidden-\d+$/.test(name);

/** Busier processes orbit closer to the star. */
function ringFor(rank: number, n: number) {
  return Math.min(RINGS.length - 1, Math.floor((rank * RINGS.length) / Math.max(1, n)));
}

/**
 * Make the planets match the live feed. Returns the names that were born and
 * that left, for a chime.
 */
export function syncPlanets(sys: OrbitSystem, f: LiveFeed): { born: string[]; gone: string[] } {
  sys.ncpu = Math.max(1, f.cpus.length || f.host?.cpus || 1);
  const current = sys.planets.map(p => p.live!.vpid);
  const want = pickVisible(f, current);
  const born: string[] = [], gone: string[] = [];
  for (const p of [...sys.planets]) {
    if (!want.includes(p.live!.vpid)) {
      gone.push(p.name);
      removePlanet(sys, p.id);
    }
  }
  const ranked = [...want].sort((a, b) => cpuOf(f, b) - cpuOf(f, a) || a - b);
  const resort = ++f.sinceRings >= RING_EVERY;
  if (resort) f.sinceRings = 0;
  for (const vpid of want) {
    const src = f.procs.get(vpid)!;
    let p = sys.planets.find(q => q.live!.vpid === vpid);
    if (!p) {
      // several processes can share a name (chromium, nginx workers): number them
      const base = liveName(f, src), names = new Set(sys.planets.map(q => q.name));
      let name = base;
      for (let i = 2; names.has(name); i++) name = `${base}-${i}`;
      // a distinct, consonant note and a distinct colour that stay with the planet for its whole life
      const used = new Set(sys.planets.map(q => q.note));
      const note = NOTE_SLOTS.find(n => !used.has(n)) ?? liveNote(name);
      const colors = new Set(sys.planets.map(q => q.color));
      const color = colors.has(liveColor(base)) ? PALETTE.find(c => !colors.has(c)) ?? liveColor(name) : liveColor(base);
      const np = addPlanet(sys, 0, (hash(name + vpid) % 360) * (Math.PI / 180), { note }, { name, color });
      if (!np) continue;
      p = np;
      p.ring = ringFor(ranked.indexOf(vpid), ranked.length);
      born.push(name);
    }
    p.live = {
      vpid, cpu: cpuOf(f, vpid), policy: src.policy ?? 'normal', state: src.state, threads: src.threads,
    };
    p.nice = src.nice ?? 0;
    p.prio = src.policy === 'fifo' || src.policy === 'rr' ? 90 : 50;
    p.moons = Math.max(0, Math.min(3, src.threads - 1));
    if (resort) p.ring = ringFor(ranked.indexOf(vpid), ranked.length);
  }
  return { born, gone };
}

/**
 * One slice of live music, kept calm on purpose: at most one note per slice.
 * How often a note plays follows how busy the machine is (sparse when idle,
 * never silent); which planet plays follows real CPU shares, by stride
 * scheduling, so over time each planet's share of the notes matches its
 * share of the CPU.
 */
export function pickLive(sys: OrbitSystem): OrbitPlanet[] {
  const f = sys.live;
  const ps = sys.planets;
  if (!f || !ps.length) return [];
  f.acc += density(f);
  if (f.acc < 1) return [];
  f.acc -= 1;
  let best = ps[0];
  for (const p of ps) if (p.vruntime < best.vruntime || (p.vruntime === best.vruntime && p.id < best.id)) best = p;
  best.vruntime += 1 / Math.max(MIN_SHARE, best.live?.cpu ?? 0);
  return [best];
}

/** Notes per slice: from DENSITY_IDLE (idle host) to DENSITY_BUSY (half the cores busy or more). */
export function density(f: LiveFeed) {
  const n = Math.max(1, f.cpus.length);
  const busy = f.cpus.reduce((s, c) => s + c.busy, 0) / n;
  return DENSITY_IDLE + (DENSITY_BUSY - DENSITY_IDLE) * Math.min(1, busy * 2);
}

/** A planet's share of the visible CPU: what its share of the notes tends to. */
export function liveShare(sys: OrbitSystem, p: OrbitPlanet) {
  const floor = (q: OrbitPlanet) => Math.max(MIN_SHARE, q.live?.cpu ?? 0);
  return floor(p) / sys.planets.reduce((s, q) => s + floor(q), 0);
}

/** A Sandbox preset built from what the live host is doing now, so you can ask "what if". */
export function remixPreset(sys: OrbitSystem): Preset {
  return {
    id: 'remix', name: 'Remix', blurb: '', mode: 'cfs', ncpu: sys.ncpu >= 2 ? 2 : 1, bpm: sys.bpm, scale: sys.scale,
    planets: sys.planets.map(p => ({
      ring: p.ring, angle: Math.round((p.angle * 180) / Math.PI), note: p.note, nice: Math.max(-20, Math.min(19, p.nice)), moons: p.moons, name: p.name,
    })),
  };
}
