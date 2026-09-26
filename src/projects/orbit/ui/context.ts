import { createContext, useContext } from 'react';
import type { OrbitController } from '../controller';
import { useOrbit } from '../store';

export const OrbitCtx = createContext<OrbitController | null>(null);
export function useCtl() {
  const c = useContext(OrbitCtx);
  if (!c) throw new Error('useCtl outside OrbitCtx');
  return c;
}
/** Re-render on the UI tick and return the live system. */
export function useSys() {
  useOrbit(s => s.tick);
  return useCtl().sys;
}
export const pct = (v: number) => Math.round(v * 100) + '%';
