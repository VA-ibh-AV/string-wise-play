import { createBus, createRng, type Bus } from '@play/engine';
import { HOPS, START_HEADER, trackPoints, zoneAt, type Hop, type PacketHeader } from '../content/route';
import { Track } from './track';

/** Tube radius, clean-pass radius, cruise and boost speeds (units/s). */
export const R = 6;
export const GATE_R = 2.3;
export const BASE = 58;
export const BOOST = 96;
const LIMIT = R - 0.8;

export interface Input {
  /** Steering target, -1..1 on each axis (right, up). */
  tx: number;
  ty: number;
  boost: boolean;
}

export interface Gate {
  hop: Hop;
  index: number;
  /** Lateral offset of the ring's centre from the tube axis. */
  x: number;
  y: number;
}

export type Pass = 'clean' | 'wide';

export type FlightEvent =
  | { type: 'gate'; index: number; pass: Pass; hop: Hop; changed: (keyof PacketHeader)[] }
  | { type: 'zone'; id: string; name: string }
  | { type: 'arrive'; t: number; clean: number; ms: number };

export interface Flight {
  track: Track;
  gates: Gate[];
  bus: Bus<FlightEvent>;
  u: number;
  speed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  boostT: number;
  slowT: number;
  next: number;
  passes: Pass[];
  header: PacketHeader;
  ms: number;
  color: number;
  log: string[];
  zone: string;
  done: boolean;
}

let sharedTrack: Track | null = null;
/** The track is the same for every flight; build its arc-length table once. */
export const getTrack = () => (sharedTrack ??= new Track(trackPoints()));

export function createFlight(seed = 1): Flight {
  const rng = createRng(seed);
  const gates = HOPS.map((hop, index) => {
    const r = rng.range(1.6, 3.2), a = rng.range(0, Math.PI * 2);
    return { hop, index, x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
  return {
    track: getTrack(), gates, bus: createBus<FlightEvent>(), u: 0, speed: BASE, x: 0, y: 0, vx: 0, vy: 0, t: 0, boostT: 0, slowT: 0,
    next: 0, passes: [], header: { ...START_HEADER }, ms: 0, color: 0x7ff0d0, log: [], zone: zoneAt(0).id, done: false,
  };
}

/** Advance the flight. The packet drifts towards the target on a damped spring and cannot crash. */
export function stepFlight(f: Flight, dt: number, input: Input) {
  if (f.done) return;
  f.t += dt;
  // steering target inside the tube
  let tx = Math.max(-1, Math.min(1, input.tx)) * LIMIT, ty = Math.max(-1, Math.min(1, input.ty)) * LIMIT;
  const tl = Math.hypot(tx, ty);
  if (tl > LIMIT) {
    tx *= LIMIT / tl;
    ty *= LIMIT / tl;
  }
  f.vx += ((tx - f.x) * 7 - f.vx * 3.2) * dt;
  f.vy += ((ty - f.y) * 7 - f.vy * 3.2) * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;
  const l = Math.hypot(f.x, f.y);
  if (l > LIMIT) {
    f.x *= LIMIT / l;
    f.y *= LIMIT / l;
  }

  f.boostT = Math.max(0, f.boostT - dt);
  f.slowT = Math.max(0, f.slowT - dt);
  let goal = input.boost || f.boostT > 0 ? BOOST : BASE;
  if (f.slowT > 0) goal *= 0.72;
  f.speed += (goal - f.speed) * Math.min(1, dt * 2.5);

  const prev = f.u;
  f.u = Math.min(1, f.u + (f.speed * dt) / f.track.length);

  while (f.next < f.gates.length && prev < f.gates[f.next].hop.u && f.gates[f.next].hop.u <= f.u) pass(f, f.gates[f.next]);

  const z = zoneAt(f.u);
  if (z.id !== f.zone) {
    f.zone = z.id;
    f.bus.emit({ type: 'zone', id: z.id, name: z.name });
  }
  if (f.u >= 1) {
    f.done = true;
    f.bus.emit({ type: 'arrive', t: f.t, clean: f.passes.filter(p => p === 'clean').length, ms: f.ms });
  }
}

function pass(f: Flight, g: Gate) {
  const clean = Math.hypot(f.x - g.x, f.y - g.y) <= GATE_R;
  const p: Pass = clean ? 'clean' : 'wide';
  if (clean) f.boostT = 1.1;
  else f.slowT = 0.9;
  const changed = (Object.keys(g.hop.set) as (keyof PacketHeader)[]).filter(k => f.header[k] !== g.hop.set[k]);
  f.header = { ...f.header, ...g.hop.set };
  f.ms += g.hop.ms;
  if (g.hop.color) f.color = g.hop.color;
  f.log.unshift(g.hop.log);
  if (f.log.length > 8) f.log.pop();
  f.passes.push(p);
  f.next++;
  f.bus.emit({ type: 'gate', index: g.index, pass: p, hop: g.hop, changed });
}

/** Steering that flies through the middle of the next ring (tests, demo). */
export function autopilot(f: Flight): Input {
  const g = f.gates[f.next];
  if (!g) return { tx: 0, ty: 0, boost: false };
  return { tx: g.x / LIMIT, ty: g.y / LIMIT, boost: false };
}
