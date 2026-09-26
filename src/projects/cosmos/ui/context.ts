import { createContext, useContext } from 'react';
import type { CosmosController } from '../controller';
import { useCosmos } from '../store';

export const CtlContext = createContext<CosmosController | null>(null);

export function useCtl(): CosmosController {
  const c = useContext(CtlContext);
  if (!c) throw new Error('useCtl outside CtlContext');
  return c;
}

/** Re-render on the 300 ms UI tick and return the live world. */
export function useLiveWorld() {
  useCosmos(s => s.tick);
  return useCtl().world;
}

export const STATE_TXT = {
  R: ['R', 'running or runnable', 'var(--run)'],
  S: ['S', 'sleeping, waiting for an event', 'var(--sleep)'],
  D: ['D', 'waiting on disk, cannot be interrupted', 'var(--disk)'],
  Z: ['Z', 'zombie: exited, waiting for its parent', 'var(--zombie)'],
  T: ['T', 'stopped by a signal', 'var(--stop)'],
} as const;

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
