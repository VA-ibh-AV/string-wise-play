import { liveShare } from './live';
import { weight } from './schedulers';
import type { OrbitPlanet, OrbitSystem } from './system';

export const WINDOW = 32;
export const STARVE_AFTER = 16;

export const scheduled = (sys: OrbitSystem) => sys.mode !== 'free';

/** Share of the last 32 slices this planet actually ran in (null in free orbits). */
export function measured(sys: OrbitSystem, p: OrbitPlanet): number | null {
  if (!scheduled(sys)) return null;
  if (sys.mode === 'live') {
    // live plays at most one note per slice: share of the notes, not of the slices
    const since = sys.slice - WINDOW * 2;
    const all = sys.planets.reduce((s, q) => s + q.hist.filter(x => x >= since).length, 0);
    return all ? p.hist.filter(x => x >= since).length / all : 0;
  }
  const since = sys.slice - WINDOW;
  const n = p.hist.filter(s => s >= since).length;
  const span = Math.min(WINDOW, Math.max(1, sys.slice - Math.max(p.bornSlice, since)));
  return Math.min(1, n / span);
}

/** What the scheduler promises this planet (the dashed line). */
export function promised(sys: OrbitSystem, p: OrbitPlanet): number | null {
  const ps = sys.planets, N = ps.length, c = sys.ncpu;
  if (!N) return null;
  switch (sys.mode) {
    case 'free':
      return null;
    case 'live':
      // its share of the CPU used by all the planets (the agent's 1 s samples)
      return p.live ? liveShare(sys, p) : null;
    case 'rr':
      return Math.min(1, c / N);
    case 'cfs': {
      const total = ps.reduce((s, q) => s + weight(q.nice), 0);
      return Math.min(1, (c * weight(p.nice)) / total);
    }
    case 'prio': {
      const prios = [...new Set(ps.map(q => q.prio))].sort((a, b) => b - a);
      // walk down the priority levels until the CPUs are used up
      let left = c, share = 0;
      for (const level of prios) {
        const at = ps.filter(q => q.prio === level);
        if (left <= 0) {
          share = p.prio === level ? 0 : share;
          continue;
        }
        const each = Math.min(1, left / at.length);
        if (p.prio === level) share = each;
        left -= at.length;
      }
      if (sys.rtLimit && prios.length > 1) {
        const top = prios[0];
        if (p.prio === top) return share * 0.95;
        const belowCount = ps.filter(q => q.prio < top).length;
        return share + (0.05 * c) / Math.max(1, belowCount) * (share === 0 ? 1 : 0);
      }
      return share;
    }
  }
}

export function starved(sys: OrbitSystem, p: OrbitPlanet) {
  // live processes that barely use the CPU are idle, not starved
  return scheduled(sys) && sys.mode !== 'live' && sys.slice - Math.max(p.lastPlayed, p.bornSlice) >= STARVE_AFTER;
}
