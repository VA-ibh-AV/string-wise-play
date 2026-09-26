import type { Bus, Rng } from '@play/engine';
import type { Algo } from '../content/algos';
import type { NodeType } from '../content/kinds';
import type { MissionId } from '../content/missions';
import type { SeedKey } from '../content/seeds';
import type { Heap } from './heap';

export type Dir = 'ab' | 'ba';
export type DropReason = 'noroute' | 'ttl' | 'queue' | 'cut';

export interface LinkEntry {
  up: boolean;
  ver: number;
  cost: number;
}

export interface Packet {
  kind: 'req' | 'res' | 'lsa' | 'hc' | 'hcr';
  id: number;
  src: number;
  dst: number;
  ttl: number;
  key: number;
  ctx: Record<string, number>;
  born: number;
  ok?: boolean;
  hit?: boolean;
  entries?: ({ lid: number } & LinkEntry)[];
  /** The one request being followed hop by hop (and everything derived from it). */
  trace?: boolean;
}

export type TraceWhat = 'ask' | 'hop' | 'queue' | 'pick' | 'hit' | 'miss' | 'wait' | 'fetch' | 'serve' | 'answer' | 'lost';
export interface TraceEvent {
  type: 'trace';
  what: TraceWhat;
  node: number;
  /** hop: the neighbour it goes to; pick: the planet; ask/fetch: the destination */
  next?: number;
  dst?: number;
  kind?: Packet['kind'];
  ok?: boolean;
  hit?: boolean;
  reason?: DropReason;
  lat?: number;
}

interface Base {
  id: number;
  type: NodeType;
  x: number; // 0..1 across the sky
  y: number; // 0..1 down the sky
  name: string;
  lsdb: Map<number, LinkEntry>;
  nh: Map<number, number>; // destination node -> first link
  dist: Map<number, number>;
}

export interface ClientNode extends Base {
  type: 'client';
  rate: number;
  pending: Map<number, { born: number; key: number; trace?: boolean }>;
  nextAt: number;
  sent: number;
  ok: number;
  fail: number;
  recent: { ok: boolean; lat: number }[];
  noroute: number;
}
export interface RouterNode extends Base {
  type: 'router';
}
export interface Health {
  up: boolean;
  fails: number;
  wait: Set<number>;
}
export interface LbNode extends Base {
  type: 'lb';
  algo: Algo;
  hc: boolean;
  rr: number;
  inflight: Map<number, number>;
  health: Map<number, Health>;
  proxies: Map<number, { to: number; ctx: Record<string, number>; key: number; born: number; srv: number; trace?: boolean }>;
  nextHc: number;
  share: Map<number, number>;
  lastPick: number | null;
  lastPickT: number;
  candSig: string | undefined;
  candList: ServerNode[];
  lastMove: { moved: number; modMoved: number; from: number; to: number } | null;
}
export interface ServerNode extends Base {
  type: 'server';
  mode: 'ok' | 'slow' | 'down';
  conc: number;
  svc: number;
  busy: { p: Packet; done: number }[];
  queue: Packet[];
  qcap: number;
  servedEW: number;
  rejects: number;
}
export interface CacheNode extends Base {
  type: 'cache';
  cap: number;
  ttl: number;
  coalesce: boolean;
  store: Map<number, { exp: number; last: number }>;
  fetches: Map<number, { key: number; waiters: { src: number; ctx: Record<string, number>; born: number; trace?: boolean }[] }>;
  byKey: Map<number, number>;
  keyN: Map<number, number>;
  maxSame: number;
  hits: number;
  misses: number;
  evictions: number;
  fetchEW: number;
  look: { t: number; hit: boolean }[];
  lastStampede: number;
  gc: number;
}
export type GNode = ClientNode | RouterNode | LbNode | ServerNode | CacheNode;

export interface Link {
  id: number;
  a: number;
  b: number;
  up: boolean;
  removed: boolean;
  ver: number;
  cost: number;
  bw: number;
  q: Record<Dir, Packet[]>;
  nextTx: Record<Dir, number>;
  util: Record<Dir, number>;
  curve: number;
  cutAt: number;
}

export interface Flight {
  p: Packet;
  L: Link;
  d: Dir;
  t0: number;
  t1: number;
}

export type Where = { node: number } | { link: number; d: Dir; prog: number };

export type GardenEvent =
  | { type: 'toast'; msg: string; tone: '' | 'warn' | 'good'; key?: string }
  | { type: 'lsa'; node: number }
  | { type: 'answer'; node: number; key: number; hit: boolean }
  | { type: 'fail'; node: number }
  | { type: 'drop'; reason: DropReason; at: Where }
  | { type: 'cache.hit'; node: number }
  | { type: 'lb.pick'; node: number; server: number }
  | { type: 'cut'; link: number; up: boolean }
  | { type: 'mission'; id: MissionId }
  | { type: 'seed'; key: SeedKey }
  | TraceEvent;

export interface Metrics {
  rps: number;
  okRate: number;
  success: number | null;
  p50: number;
  p95: number;
  hit: number | null;
  lookups: number;
  origin: number;
}

export interface Change {
  lid: number;
  ver: number;
  t0: number;
  kind: 'new' | 'cut' | 'regrow' | 'cost';
  silent?: boolean;
  done?: boolean;
}

export interface World {
  t: number;
  rng: Rng;
  bus: Bus<GardenEvent>;
  heap: Heap;
  nodes: Map<number, GNode>;
  links: Map<number, Link>;
  flights: Flight[];
  nid: number;
  lid: number;
  pid: number;
  names: Record<string, number>;
  cfg: { detect: number; ttl: number; qcap: number; traffic: number };
  flash: number;
  changes: Change[];
  res: { t: number; ok: boolean; lat: number; hit: boolean }[];
  issued: number[];
  lookups: { t: number; hit: boolean }[];
  origin: number[];
  dropsLog: number[];
  drops: Partial<Record<DropReason, number>>;
  dropTotal: number;
  okTotal: number;
  failTotal: number;
  hist: { ok: number; p95: number; origin: number }[];
  nextHist: number;
  nextConv: number;
  flags: {
    sawTable: boolean;
    cutDrops: number;
    cutAt: number | null;
    okAtCut: number;
    convergedAfterCut: boolean;
    purge: { t: number; id: number; co: boolean; hits: number } | null;
    stampedeTamed: boolean;
    hashMoveOk: boolean;
    tracedDone: boolean;
  };
  /** A probe asked to send its next request traced (null: nobody). */
  traceNext: number | null;
  holds: Record<string, number>;
  seed: SeedKey;
  rings: Map<string, { h: number; s: ServerNode }[]>;
  m: Metrics;
  missions: Set<MissionId>;
}

/** Sim step: 120 Hz, as in the prototype. */
export const DT = 1 / 120;
export const DIRS: Dir[] = ['ab', 'ba'];
/** Number of distinct crystals (keys). */
export const K = 40;
export const TIMEOUT = { client: 14, lb: 8, fetch: 10, hc: 2.5 };
export const HC_EVERY = 1;
export const HC_FALL = 2;
export const D1 = Math.exp(-DT / 1);
export const D2 = Math.exp(-DT / 2);
export const D5 = Math.exp(-DT / 5);
