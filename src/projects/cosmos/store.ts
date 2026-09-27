import { create } from 'zustand';
import type { LensId } from './content/lenses';
import type { Cap, Host } from '@play/protocol';
import type { MissionId } from './content/missions';
import type { LiveConnection } from './data/live-source';

export type CosmosMode = 'live' | 'sandbox';

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
  mode: CosmosMode;
  /** Live mode: no action UI is rendered at all. */
  readOnly: boolean;
  connection: LiveConnection | null;
  host: Host | null;
  caps: Cap[];
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
  mode: 'sandbox',
  readOnly: false,
  connection: null,
  host: null,
  caps: [],
};

export const useCosmos = create<CosmosState>(() => ({ ...initialCosmosState }));
