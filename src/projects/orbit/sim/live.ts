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
  /** Error-diffusion accumulator per core: a 25%-busy core plays every 4th slice. */
  acc: number[];
  /** Smoothed CPU (cores) per vpid, so rankings don't jump every second. */
  smooth: Map<number, number>;
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
const MIN_SHARE = 0.003;

export const createFeed = (): LiveFeed => ({ host: null, procs: new Map(), cpus: [], viewers: 0, acc: [], smooth: new Map() });

function smoothAll(f: LiveFeed) {
  for (const id of [...f.smooth.keys()]) if (!f.procs.has(id)) f.smooth.delete(id);
  for (const p of f.procs.values()) {
    const s = f.smooth.get(p.vpid);
    f.smooth.set(p.vpid, s === undefined ? p.cpu : s * 0.5 + p.cpu * 0.5);
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
 * "proc". Tell those apart by their (virtual) id so each gets its own note.
 */
export const liveName = (p: Proc) => (!p.name || p.name === 'proc' ? `proc-${p.vpid}` : p.name);

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
  for (const vpid of want) {
    const src = f.procs.get(vpid)!;
    let p = sys.planets.find(q => q.live!.vpid === vpid);
    if (!p) {
      const name = liveName(src);
      const np = addPlanet(sys, 0, (hash(name + vpid) % 360) * (Math.PI / 180), { note: liveNote(name) }, { name, color: liveColor(name) });
      if (!np) continue;
      p = np;
      born.push(name);
    }
    p.live = {
      vpid, cpu: cpuOf(f, vpid), policy: src.policy ?? 'normal', state: src.state, threads: src.threads,
    };
    p.nice = src.nice ?? 0;
    p.prio = src.policy === 'fifo' || src.policy === 'rr' ? 90 : 50;
    p.moons = Math.max(0, Math.min(3, src.threads - 1));
    p.ring = ringFor(ranked.indexOf(vpid), ranked.length);
  }
  return { born, gone };
}

/**
 * One slice of live music. Each core plays in proportion to how busy it is
 * (scaled down by the CPU that belongs to processes without a planet); the
 * planet that plays is picked by stride scheduling over real CPU shares.
 */
export function pickLive(sys: OrbitSystem): OrbitPlanet[] {
  const f = sys.live;
  const ps = sys.planets;
  if (!f || !ps.length) return [];
  const visible = ps.reduce((s, p) => s + (p.live?.cpu ?? 0), 0);
  const total = f.cpus.reduce((s, c) => s + c.busy, 0);
  const frac = total > 0 ? Math.min(1, visible / total) : 0;
  let voices = 0;
  f.cpus.forEach((c, i) => {
    f.acc[i] = (f.acc[i] ?? 0) + c.busy * frac;
    if (f.acc[i] >= 1) {
      f.acc[i] -= 1;
      voices++;
    }
  });
  const chosen: OrbitPlanet[] = [];
  for (let v = 0; v < Math.min(voices, ps.length); v++) {
    let best: OrbitPlanet | null = null;
    for (const p of ps) if (!chosen.includes(p) && (!best || p.vruntime < best.vruntime || (p.vruntime === best.vruntime && p.id < best.id))) best = p;
    if (!best) break;
    best.vruntime += 1 / Math.max(MIN_SHARE, best.live?.cpu ?? 0);
    chosen.push(best);
  }
  return chosen;
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
