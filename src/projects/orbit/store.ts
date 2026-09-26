import { create } from 'zustand';

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
}

export const initialOrbit: OrbitState = {
  tick: 0, sel: null, playing: true, sound: false, intro: true, hoverRing: null, found: [], toast: null, copied: false, sheet: false, infoOpen: true,
};

export const useOrbit = create<OrbitState>(() => ({ ...initialOrbit }));
