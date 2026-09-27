import { create } from 'zustand';
import type { MissionId } from './content/missions';
import type { NodeType } from './content/kinds';
import type { Selection } from './view';
import type { JourneyState } from './journey';

export type Tool = 'select' | NodeType | 'lane' | 'sever' | 'remove';

export interface Toast {
  id: number;
  msg: string;
  tone: '' | 'warn' | 'good';
}

export interface GardenState {
  tick: number;
  tool: Tool;
  sel: Selection | null;
  speed: number;
  sound: boolean;
  done: MissionId[];
  toasts: Toast[];
  sheet: boolean;
  announce: string;
  mode: 'watch' | 'build';
  tab: 'journeys' | 'inspect' | 'sky';
  journey: JourneyState | null;
  /** Narration of the request being followed. */
  trace: string | null;
  intro: boolean;
  hover: { text: string; x: number; y: number } | null;
}

export const initialGardenState: GardenState = {
  tick: 0, tool: 'select', sel: null, speed: 1, sound: false, done: [], toasts: [], sheet: false, announce: '',
  mode: 'watch', tab: 'journeys', journey: null, trace: null, intro: false, hover: null,
};

export const useGarden = create<GardenState>(() => ({ ...initialGardenState }));
