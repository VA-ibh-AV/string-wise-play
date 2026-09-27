import { createBus, type Bus } from '@play/engine';
import type { ModeId } from '../content/modes';
import type { Preset } from '../content/presets';
import type { ScaleId } from '../content/scales';
import { period, sliceLen } from './clock';
import { liveColor, pickLive, type LiveFeed, type LiveInfo } from './live';
import { pickCFS, pickPrio, pickRR } from './schedulers';

export const RINGS = [4.5, 6.5, 8.5, 10.5, 12.5, 14.5];
export const MAX_PLANETS = 8;
export const TASKS: { name: string; color: string }[] = [
  { name: 'nginx', color: '#7FD1B9' }, { name: 'postgres', color: '#6FA8FF' }, { name: 'redis', color: '#FF7A68' },
  { name: 'cron', color: '#C9B8FF' }, { name: 'sshd', color: '#C7A4FF' }, { name: 'node', color: '#B6E07A' },
  { name: 'envoy', color: '#E7B4FF' }, { name: 'backup', color: '#F0C36A' },
];

export interface OrbitPlanet {
  id: number;
  name: string;
  color: string;
  ring: number;
  /** Angle (radians) at the system's current time. */
  angle: number;
  note: number;
  nice: number;
  prio: number;
  moons: number;
  vruntime: number;
  lastPlayed: number;
  bornSlice: number;
  /** Slice numbers it ran in (last 32 kept). */
  hist: number[];
  /** Live mode: the real process behind this planet. */
  live?: LiveInfo;
}

export type OrbitEvent =
  | { type: 'play'; id: number; at: number; cpu: number; note: number; moons: number }
  | { type: 'throttle'; at: number }
  | { type: 'change' };

export interface OrbitSystem {
  planets: OrbitPlanet[];
  nextId: number;
  mode: ModeId;
  /** 1 or 2 in the Sandbox; the host's core count in Live. */
  ncpu: number;
  bpm: number;
  scale: ScaleId;
  rtLimit: boolean;
  /** Sim time events have been generated up to. */
  t: number;
  slice: number;
  nextSliceAt: number;
  rr: number;
  /** Live mode only. */
  live: LiveFeed | null;
  bus: Bus<OrbitEvent>;
}

export function createSystem(): OrbitSystem {
  return { planets: [], nextId: 1, mode: 'cfs', ncpu: 1, bpm: 96, scale: 'majpenta', rtLimit: false, t: 0, slice: 0, nextSliceAt: 0, rr: 0, live: null, bus: createBus() };
}

export const omega = (sys: OrbitSystem, p: OrbitPlanet) => (Math.PI * 2) / period(RINGS[p.ring], sys.bpm);

const changed = (sys: OrbitSystem) => sys.bus.emit({ type: 'change' });

/** Start measuring afresh: after a mode, CPU or planet-set change. */
function resetShares(sys: OrbitSystem) {
  for (const p of sys.planets) {
    p.hist = [];
    p.lastPlayed = sys.slice;
    p.bornSlice = sys.slice;
    p.vruntime = 0;
  }
  sys.rr = 0;
}

export function addPlanet(
  sys: OrbitSystem, ring: number, angle: number, o: Partial<Pick<OrbitPlanet, 'note' | 'nice' | 'prio' | 'moons'>> = {}, named?: { name: string; color?: string },
): OrbitPlanet | null {
  if (sys.planets.length >= MAX_PLANETS) return null;
  const used = new Set(sys.planets.map(p => p.name));
  const pick = TASKS.find(t => !used.has(t.name)) ?? TASKS[sys.nextId % TASKS.length];
  const task = named ? { name: named.name, color: named.color ?? TASKS.find(t => t.name === named.name)?.color ?? liveColor(named.name) } : pick;
  // CFS: a new task starts at the smallest vruntime, so it cannot hog the CPU
  const minV = sys.planets.length ? Math.min(...sys.planets.map(p => p.vruntime)) : 0;
  const p: OrbitPlanet = {
    id: sys.nextId++, name: task.name, color: task.color, ring: Math.max(0, Math.min(RINGS.length - 1, ring)), angle,
    note: o.note ?? 4 + ((ring * 3) % 8), nice: o.nice ?? 0, prio: o.prio ?? 50, moons: o.moons ?? 0,
    vruntime: minV, lastPlayed: sys.slice, bornSlice: sys.slice, hist: [],
  };
  sys.planets.push(p);
  changed(sys);
  return p;
}

export function removePlanet(sys: OrbitSystem, id: number) {
  sys.planets = sys.planets.filter(p => p.id !== id);
  sys.rr = sys.planets.length ? sys.rr % sys.planets.length : 0;
  changed(sys);
}

export function movePlanet(sys: OrbitSystem, id: number, ring: number, angle: number) {
  const p = sys.planets.find(q => q.id === id);
  if (!p) return;
  p.ring = Math.max(0, Math.min(RINGS.length - 1, ring));
  p.angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

export function setMode(sys: OrbitSystem, mode: ModeId) {
  sys.mode = mode;
  resetShares(sys);
  sys.nextSliceAt = sys.t;
  changed(sys);
}

export function setCpus(sys: OrbitSystem, n: 1 | 2) {
  sys.ncpu = n;
  resetShares(sys);
  changed(sys);
}

export function applyPreset(sys: OrbitSystem, pr: Preset) {
  sys.planets = [];
  sys.mode = pr.mode;
  sys.ncpu = pr.ncpu;
  sys.bpm = pr.bpm;
  sys.scale = pr.scale;
  sys.rtLimit = pr.rtLimit ?? false;
  for (const s of pr.planets) addPlanet(sys, s.ring, (s.angle * Math.PI) / 180, s, s.name ? { name: s.name } : undefined);
  resetShares(sys);
  sys.nextSliceAt = sys.t;
  changed(sys);
}

/**
 * Generate every note up to sim time `until`. Callers run this a little ahead
 * of real time (look-ahead) so audio can be scheduled precisely.
 */
export function advance(sys: OrbitSystem, until: number) {
  if (until <= sys.t) return;
  const from = sys.t;
  if (sys.mode === 'free') {
    // a planet plays when its angle crosses 0 (the golden line)
    const plays: { id: number; at: number; note: number; moons: number }[] = [];
    for (const p of sys.planets) {
      const w = omega(sys, p);
      let a = p.angle, t = from;
      for (;;) {
        const toCross = (Math.PI * 2 - a) / w;
        if (t + toCross > until) break;
        t += toCross;
        a = 0;
        plays.push({ id: p.id, at: t, note: p.note, moons: p.moons });
      }
    }
    plays.sort((a, b) => a.at - b.at);
    for (const e of plays) sys.bus.emit({ type: 'play', cpu: 0, ...e });
  } else {
    const len = sliceLen(sys.bpm);
    if (sys.nextSliceAt < from - len) sys.nextSliceAt = from;
    while (sys.nextSliceAt <= until) {
      runSlice(sys, sys.nextSliceAt);
      sys.nextSliceAt += len;
    }
  }
  for (const p of sys.planets) p.angle = (p.angle + omega(sys, p) * (until - from)) % (Math.PI * 2);
  sys.t = until;
}

function runSlice(sys: OrbitSystem, at: number) {
  if (sys.planets.length) {
    let chosen: OrbitPlanet[];
    if (sys.mode === 'live') chosen = pickLive(sys);
    else if (sys.mode === 'rr') chosen = pickRR(sys);
    else if (sys.mode === 'cfs') chosen = pickCFS(sys);
    else {
      const r = pickPrio(sys);
      chosen = r.chosen;
      if (r.throttled) sys.bus.emit({ type: 'throttle', at });
    }
    chosen.forEach((p, cpu) => {
      p.lastPlayed = sys.slice;
      p.hist.push(sys.slice);
      if (p.hist.length > 40) p.hist.shift();
      sys.bus.emit({ type: 'play', id: p.id, at, cpu, note: p.note, moons: p.moons });
    });
  }
  sys.slice++;
}

// ---------- share links: /orbit#<hash> ----------
export function encodeSystem(sys: OrbitSystem): string {
  const data = {
    m: sys.mode, c: sys.ncpu, b: sys.bpm, s: sys.scale, r: sys.rtLimit ? 1 : 0,
    p: sys.planets.map(p => [p.ring, Math.round((p.angle * 180) / Math.PI), p.note, p.nice, p.prio, p.moons, ...(TASKS.some(t => t.name === p.name) ? [] : [p.name])]),
  };
  return btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSystem(hash: string): Preset | null {
  try {
    const d = JSON.parse(atob(hash.replace(/-/g, '+').replace(/_/g, '/')));
    if (!Array.isArray(d.p) || d.p.length > MAX_PLANETS) return null;
    const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === 'number' && v >= lo && v <= hi ? v : dflt);
    return {
      id: 'shared', name: 'Shared', blurb: '', mode: ['free', 'rr', 'cfs', 'prio'].includes(d.m) ? d.m : 'cfs', ncpu: d.c === 2 ? 2 : 1,
      bpm: num(d.b, 50, 160, 96), scale: ['majpenta', 'minpenta', 'hirajoshi', 'lydian'].includes(d.s) ? d.s : 'majpenta', rtLimit: d.r === 1,
      planets: d.p.map((q: unknown[]) => ({
        ring: num(q[0], 0, 5, 0), angle: num(q[1], -720, 720, 0), note: num(q[2], 0, 20, 4), nice: num(q[3], -20, 19, 0), prio: num(q[4], 1, 99, 50), moons: num(q[5], 0, 3, 0),
        name: typeof q[6] === 'string' && /^[\w.:@+-]{1,15}$/.test(q[6]) ? q[6] : undefined,
      })),
    };
  } catch {
    return null;
  }
}
