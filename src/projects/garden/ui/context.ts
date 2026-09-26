import { createContext, useContext } from 'react';
import type { GardenController } from '../controller';
import { useGarden } from '../store';

export const GardenCtx = createContext<GardenController | null>(null);

export function useCtl() {
  const c = useContext(GardenCtx);
  if (!c) throw new Error('useCtl outside GardenCtx');
  return c;
}

/** Re-render on the 250 ms UI tick and return the live world. */
export function useLiveWorld() {
  useGarden(s => s.tick);
  return useCtl().world;
}

export const fmtS = (s: number) => (s < 1 ? Math.round(s * 1000) + 'ms' : s.toFixed(1) + 's');
export const pct = (v: number) => Math.round(v * 100) + '%';
