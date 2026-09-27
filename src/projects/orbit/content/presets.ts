import type { ModeId } from './modes';
import type { ScaleId } from './scales';

export interface PlanetSeed {
  ring: number;
  angle: number; // degrees
  note: number;
  nice?: number;
  prio?: number;
  moons?: number;
  /** Task name; a remix of the live host keeps real process names. */
  name?: string;
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  mode: ModeId;
  ncpu: 1 | 2;
  bpm: number;
  scale: ScaleId;
  rtLimit?: boolean;
  planets: PlanetSeed[];
}

export const PRESETS: Preset[] = [
  {
    id: 'lullaby', name: 'Lullaby', blurb: 'Free orbits, slow and soft', mode: 'free', ncpu: 1, bpm: 72, scale: 'majpenta',
    planets: [
      { ring: 0, angle: 20, note: 5 }, { ring: 1, angle: 140, note: 7, moons: 1 }, { ring: 2, angle: 250, note: 4 },
      { ring: 3, angle: 60, note: 9, moons: 2 }, { ring: 5, angle: 300, note: 2 },
    ],
  },
  {
    id: 'fair', name: 'Fair share', blurb: 'CFS, five equal tasks', mode: 'cfs', ncpu: 1, bpm: 96, scale: 'majpenta',
    planets: [0, 1, 2, 3, 4].map(i => ({ ring: i, angle: i * 72, note: [5, 7, 9, 4, 2][i], nice: 0 })),
  },
  {
    id: 'important', name: 'One important task', blurb: 'CFS, one task at nice −8', mode: 'cfs', ncpu: 1, bpm: 96, scale: 'lydian',
    planets: [
      { ring: 1, angle: 0, note: 7, nice: -8, moons: 1 }, { ring: 2, angle: 90, note: 4, nice: 0 }, { ring: 3, angle: 180, note: 9, nice: 0 },
      { ring: 4, angle: 270, note: 2, nice: 0 }, { ring: 5, angle: 45, note: 11, nice: 5 },
    ],
  },
  {
    id: 'starve', name: 'Starvation', blurb: 'Priority 90 against 10s', mode: 'prio', ncpu: 1, bpm: 96, scale: 'minpenta', rtLimit: false,
    planets: [
      { ring: 0, angle: 0, note: 7, prio: 90 }, { ring: 2, angle: 100, note: 4, prio: 10 }, { ring: 3, angle: 200, note: 9, prio: 10 },
      { ring: 4, angle: 300, note: 2, prio: 10 },
    ],
  },
  {
    id: 'smp', name: 'Two cores', blurb: 'CFS on 2 CPUs, six tasks', mode: 'cfs', ncpu: 2, bpm: 90, scale: 'hirajoshi',
    planets: [0, 1, 2, 3, 4, 5].map(i => ({ ring: i, angle: i * 60 + 15, note: [4, 7, 9, 5, 11, 2][i], nice: 0 })),
  },
];
