import { create } from 'zustand';
import type { Host, LiveConnection } from '@play/protocol';

export type OrbitSource = 'live' | 'sandbox';

export interface OrbitState {
  tick: number;
  sel: number | null;
  playing: boolean;
  sound: boolean;
  intro: boolean;
  hoverRing: number | null;
  found: string[];
  toast: { id: number; title: string; text: string } | null;
  copied: boolean;
  sheet: boolean;
  infoOpen: boolean;
  source: OrbitSource;
  connection: LiveConnection | null;
  host: Host | null;
}

export const initialOrbit: OrbitState = {
  tick: 0, sel: null, playing: true, sound: false, intro: true, hoverRing: null, found: [], toast: null, copied: false, sheet: false, infoOpen: true,
  source: 'sandbox', connection: null, host: null,
};

export const useOrbit = create<OrbitState>(() => ({ ...initialOrbit }));
