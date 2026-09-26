import { create } from 'zustand';
import { START_HEADER, zoneAt, type Hop, type PacketHeader } from './content/route';
import type { Pass } from './sim/flight';

export type Phase = 'title' | 'flying' | 'paused' | 'summary';

export interface Best {
  t: number;
  clean: number;
}

export interface DriftState {
  phase: Phase;
  tick: number;
  header: PacketHeader;
  /** Header fields that just changed, and when (ms), so they can flash. */
  changed: { keys: (keyof PacketHeader)[]; at: number };
  /** The hop just passed, shown bottom-centre. */
  last: { hop: Hop; pass: Pass; index: number } | null;
  next: number;
  zone: string;
  log: string[];
  passes: Pass[];
  t: number;
  ms: number;
  speed: number;
  sound: boolean;
  best: Best | null;
  badges: string[];
  /** Result of the flight that just finished. */
  result: { t: number; clean: number; ms: number; newBest: boolean } | null;
}

export const initialDrift: DriftState = {
  phase: 'title', tick: 0, header: { ...START_HEADER }, changed: { keys: [], at: 0 }, last: null, next: 0, zone: zoneAt(0).name,
  log: [], passes: [], t: 0, ms: 0, speed: 58, sound: false, best: null, badges: [], result: null,
};

export const useDrift = create<DriftState>(() => ({ ...initialDrift }));
