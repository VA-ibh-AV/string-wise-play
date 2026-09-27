import type { Algo } from './algos';
import type { NodeType } from './kinds';

export type SeedKey = 'sky' | 'ring' | 'planets' | 'nebula' | 'empty';

export interface NodeOpts {
  rate?: number;
  algo?: Algo;
  hc?: boolean;
  conc?: number;
  svc?: number;
  cap?: number;
  ttl?: number;
  coalesce?: boolean;
}

type Build = (
  N: (t: NodeType, x: number, y: number, o?: NodeOpts) => { id: number },
  V: (a: { id: number }, b: { id: number }, o?: { costAdd?: number }) => void,
) => void;

export const SEEDS: Record<SeedKey, { name: string; blurb: string; build: Build }> = {
  sky: {
    name: 'Full sky', blurb: 'Probes, a mesh of relays, a nebula, a pulsar, three planets',
    build(N, V) {
      const c1 = N('client', 0.05, 0.2), c2 = N('client', 0.04, 0.52), c3 = N('client', 0.06, 0.84);
      const r1 = N('router', 0.22, 0.32), r2 = N('router', 0.24, 0.7), r3 = N('router', 0.42, 0.16), r4 = N('router', 0.44, 0.5), r5 = N('router', 0.42, 0.86);
      const w1 = N('cache', 0.61, 0.5, { cap: 12, ttl: 8 });
      const lb = N('lb', 0.76, 0.5, { algo: 'least' });
      const s1 = N('server', 0.93, 0.2), s2 = N('server', 0.96, 0.5), s3 = N('server', 0.93, 0.8);
      ([[c1, r1], [c2, r1], [c2, r2], [c3, r2], [r1, r3], [r1, r4], [r2, r4], [r2, r5], [r3, r4], [r4, r5], [r3, w1], [r4, w1], [r5, w1], [w1, lb], [lb, s1], [lb, s2], [lb, s3]] as const).forEach(([a, b]) => V(a, b));
    },
  },
  ring: {
    name: 'Ring', blurb: 'Routing: a ring of relays with a shortcut. Sever a lane',
    build(N, V) {
      const c1 = N('client', 0.05, 0.3, { rate: 2 }), c2 = N('client', 0.05, 0.72, { rate: 2 });
      const r1 = N('router', 0.2, 0.5), r2 = N('router', 0.4, 0.2), r3 = N('router', 0.4, 0.8), r4 = N('router', 0.62, 0.2), r5 = N('router', 0.62, 0.8), r6 = N('router', 0.8, 0.5);
      const s1 = N('server', 0.95, 0.5, { conc: 8 });
      ([[c1, r1], [c2, r1], [r1, r2], [r1, r3], [r2, r4], [r4, r6], [r5, r6], [r2, r3], [r6, s1]] as const).forEach(([a, b]) => V(a, b));
      V(r3, r5, { costAdd: 8 });
    },
  },
  planets: {
    name: 'Planets', blurb: 'Load balancing: one pulsar, four planets',
    build(N, V) {
      const cs = [N('client', 0.05, 0.2, { rate: 2.5 }), N('client', 0.05, 0.5, { rate: 2.5 }), N('client', 0.05, 0.8, { rate: 2.5 })];
      const r1 = N('router', 0.25, 0.34), r2 = N('router', 0.25, 0.68);
      const lb = N('lb', 0.52, 0.5, { algo: 'rr', hc: false });
      const ss = [N('server', 0.84, 0.12, { conc: 3, svc: 0.4 }), N('server', 0.93, 0.38, { conc: 3, svc: 0.4 }), N('server', 0.93, 0.64, { conc: 3, svc: 0.4 }), N('server', 0.84, 0.9, { conc: 3, svc: 0.4 })];
      V(cs[0], r1); V(cs[1], r1); V(cs[1], r2); V(cs[2], r2); V(r1, r2); V(r1, lb); V(r2, lb);
      for (const s of ss) V(lb, s);
    },
  },
  nebula: {
    name: 'Nebula', blurb: 'Caching: a small nebula in front of slow planets',
    build(N, V) {
      const cs = [N('client', 0.05, 0.24, { rate: 2 }), N('client', 0.05, 0.5, { rate: 2 }), N('client', 0.05, 0.76, { rate: 2 })];
      const r1 = N('router', 0.25, 0.5);
      const w1 = N('cache', 0.47, 0.5, { cap: 8, ttl: 5 });
      const lb = N('lb', 0.68, 0.5, { algo: 'least' });
      const s1 = N('server', 0.9, 0.28, { svc: 0.8 }), s2 = N('server', 0.9, 0.72, { svc: 0.8 });
      for (const c of cs) V(c, r1);
      V(r1, w1); V(w1, lb); V(lb, s1); V(lb, s2);
    },
  },
  empty: { name: 'Empty space', blurb: 'Start from nothing', build() {} },
};

export const SEED_KEYS = Object.keys(SEEDS) as SeedKey[];
