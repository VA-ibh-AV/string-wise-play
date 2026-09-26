import { create } from 'zustand';
import type { LensId } from './content/lenses';
import type { MissionId } from './content/missions';

export interface CosmosState {
  /** Bumped every 300 ms so live panels re-read the world. */
  tick: number;
  ready: boolean;
  lens: LensId | null;
  selected: number | null;
  nsInside: boolean;
  missionsOpen: boolean;
  sound: boolean;
  speed: number;
  done: MissionId[];
  toast: { id: number; title: string; body: string } | null;
  hover: { text: string; x: number; y: number } | null;
  announce: string;
  error: string | null;
}

export const initialCosmosState: CosmosState = {
  tick: 0,
  ready: false,
  lens: null,
  selected: null,
  nsInside: false,
  missionsOpen: false,
  sound: false,
  speed: 1,
  done: [],
  toast: null,
  hover: null,
  announce: '',
  error: null,
};

export const useCosmos = create<CosmosState>(() => ({ ...initialCosmosState }));
