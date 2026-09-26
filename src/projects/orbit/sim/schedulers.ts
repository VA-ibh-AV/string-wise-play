import type { OrbitPlanet, OrbitSystem } from './system';

export const weight = (nice: number) => 1024 / Math.pow(1.25, nice);

export function pickRR(sys: OrbitSystem): OrbitPlanet[] {
  const ps = sys.planets, n = Math.min(sys.ncpu, ps.length);
  const chosen: OrbitPlanet[] = [];
  for (let i = 0; i < n; i++) chosen.push(ps[(sys.rr + i) % ps.length]);
  sys.rr = (sys.rr + n) % ps.length;
  return chosen;
}

export function pickCFS(sys: OrbitSystem): OrbitPlanet[] {
  const chosen = [...sys.planets].sort((a, b) => a.vruntime - b.vruntime || a.id - b.id).slice(0, sys.ncpu);
  for (const c of chosen) c.vruntime += 1024 / weight(c.nice);
  return chosen;
}

/** SCHED_FIFO-like: highest priority wins; ties take turns by who played longest ago. */
export function pickPrio(sys: OrbitSystem): { chosen: OrbitPlanet[]; throttled: boolean } {
  const ps = sys.planets;
  const top = Math.max(...ps.map(p => p.prio));
  const below = ps.filter(p => p.prio < top);
  // RT throttling: one slice in 20 (5%) goes to tasks below the top priority
  const throttled = sys.rtLimit && sys.slice % 20 === 0 && below.length > 0;
  const pool = throttled ? below : ps;
  const chosen = [...pool].sort((a, b) => b.prio - a.prio || a.lastPlayed - b.lastPlayed || a.id - b.id).slice(0, sys.ncpu);
  return { chosen, throttled };
}
