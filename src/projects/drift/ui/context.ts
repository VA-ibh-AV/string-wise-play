import { createContext, useContext } from 'react';
import type { DriftController } from '../controller';

export const DriftCtx = createContext<DriftController | null>(null);
export function useCtl() {
  const c = useContext(DriftCtx);
  if (!c) throw new Error('useCtl outside DriftCtx');
  return c;
}
export const fmtMs = (ms: number) => (ms < 1 ? ms.toFixed(2) : ms < 10 ? ms.toFixed(1) : Math.round(ms).toString()) + ' ms';
