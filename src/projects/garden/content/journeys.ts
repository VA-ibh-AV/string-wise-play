import type { GardenEvent, GNode, Link, World } from '../sim/types';
import { drain, followRequest, removeBody, setLinkUp, solarFlare } from '../sim/world';
import type { MissionId } from './missions';
import type { SeedKey } from './seeds';

/** Things the visitor did in the UI, fed to journey steps alongside sim events. */
export type JourneyEvent = GardenEvent | { type: 'select'; kind: 'node' | 'link'; id: number };

export interface StepCtx {
  w: World;
  ev: JourneyEvent | null;
  /** Seconds (real time) since the step started. */
  since: number;
}

export interface Step {
  /** One plain sentence: what to do or what to watch. */
  say: string;
  /** Body name ("p2") or lane ("r2-r4") to highlight and turn the camera towards. */
  target?: string;
  /** Tool to switch to while this step is open. */
  tool?: 'sever' | 'remove';
  /** A shortcut button on the coach card that does the step's action for you. */
  action?: { label: string; run: (w: World) => void };
  /** Reading step: the visitor presses Next. */
  next?: boolean;
  done?: (c: StepCtx) => boolean;
  /** What just happened, shown when the step completes. */
  then?: string;
}

export interface Journey {
  id: MissionId;
  title: string;
  blurb: string;
  layout: SeedKey;
  steps: Step[];
}

export const byName = (w: World, name: string): GNode | undefined => [...w.nodes.values()].find(n => n.name === name);
export function laneBetween(w: World, a: string, b: string): Link | undefined {
  const A = byName(w, a), B = byName(w, b);
  if (!A || !B) return undefined;
  return [...w.links.values()].find(L => !L.removed && ((L.a === A.id && L.b === B.id) || (L.a === B.id && L.b === A.id)));
}
const selected = (c: StepCtx, name: string) => {
  const n = byName(c.w, name);
  return !!n && c.ev?.type === 'select' && c.ev.kind === 'node' && c.ev.id === n.id;
};
const mission = (id: MissionId) => (c: StepCtx) => c.w.missions.has(id) || (c.ev?.type === 'mission' && c.ev.id === id);
const lb = (w: World) => byName(w, 'lb1') as Extract<GNode, { type: 'lb' }> | undefined;

export const JOURNEYS: Journey[] = [
  {
    id: 'bloom', title: 'Follow a request', layout: 'sky',
    blurb: 'Send one request and watch it travel there and back.',
    steps: [
      { say: 'This pink satellite is a Probe: a client that asks for crystals (think: a browser asking for a web page). Tap it.', target: 'p2', done: c => selected(c, 'p2') },
      {
        say: 'Send one request from it, and the camera will follow it.', target: 'p2',
        action: { label: 'Send a request', run: w => { const p = byName(w, 'p2'); if (p) followRequest(w, p.id); } },
        done: c => c.ev?.type === 'trace' && c.ev.what === 'ask',
        then: 'The request is on its way. It is the big glowing comet.',
      },
      {
        say: 'Watch it hop from relay to relay. Each relay looks up its star chart to choose the next lane.',
        done: c => c.ev?.type === 'trace' && c.ev.what === 'answer',
        then: 'There and back: the probe asked, relays passed it along, and the answer came home the same way.',
      },
    ],
  },
  {
    id: 'rings', title: 'Read the star chart', layout: 'sky',
    blurb: 'See how a relay decides where to send each packet.',
    steps: [
      { say: 'The warm stars are Relays: routers. Tap relay r1.', target: 'r1', done: c => selected(c, 'r1') },
      {
        say: 'Its star chart (routing table) is in the panel: for every body, which neighbour to hand a packet to, and the total cost.', next: true,
        then: 'Every relay builds this table itself, from news the others flood across the sky.',
      },
    ],
  },
  {
    id: 'snip', title: 'Cut a busy lane', layout: 'ring',
    blurb: 'Break a link and see what happens to packets already on it.',
    steps: [
      { say: 'Requests from the probes flow over the top: r1 → r2 → r4 → r6 → the planet. Watch the lane between r2 and r4.', target: 'r2-r4', next: true },
      {
        say: 'Cut it: tap the lane between r2 and r4.', target: 'r2-r4', tool: 'sever',
        action: { label: 'Cut it for me', run: w => { const L = laneBetween(w, 'r2', 'r4'); if (L) setLinkUp(w, L, false); } },
        done: c => c.ev?.type === 'cut' && !c.ev.up,
      },
      {
        say: 'Packets already heading into the gap are lost (red sparks). The relays do not know yet.',
        done: mission('snip'),
        then: 'Until the dead interval passes, relays keep sending into the gap. Real networks shrink that window with BFD.',
      },
    ],
  },
  {
    id: 'around', title: 'Route around it', layout: 'ring',
    blurb: 'Watch the network heal itself after a cut.',
    steps: [
      {
        say: 'Cut the lane between r2 and r4 again.', target: 'r2-r4', tool: 'sever',
        action: { label: 'Cut it for me', run: w => { const L = laneBetween(w, 'r2', 'r4'); if (L) setLinkUp(w, L, false); } },
        done: c => c.ev?.type === 'cut' && !c.ev.up,
      },
      {
        say: 'Watch the violet rings: news about the cut spreading. Each relay rebuilds its star chart when the news reaches it.',
        done: c => c.w.flags.convergedAfterCut,
        then: 'Converged: every relay agrees the lane is gone.',
      },
      { say: 'Requests now take the long way round, along the bottom. Wait for 20 answers on the new path.', target: 'r3-r5', done: mission('around'), then: 'Routing healed the network without anyone touching it.' },
    ],
  },
  {
    id: 'share', title: 'Share the load', layout: 'planets',
    blurb: 'A load balancer spreads work across servers.',
    steps: [
      { say: 'The green star with beams is a Pulsar: a load balancer. Tap it.', target: 'lb1', done: c => selected(c, 'lb1') },
      { say: 'It hands each request to one of four Planets (servers). The table shows each planet’s share: round robin gives each a turn.', next: true },
      { say: 'Let it serve steady traffic for a little while.', done: mission('share'), then: 'Four planets together answer far more than one could.' },
    ],
  },
  {
    id: 'sick', title: 'One sick planet', layout: 'planets',
    blurb: 'When one server slows down, how you balance matters.',
    steps: [
      { say: 'Tap planet s1.', target: 's1', done: c => selected(c, 's1') },
      { say: 'Make it sick: choose Slow in its card.', target: 's1', done: c => (byName(c.w, 's1') as { mode?: string } | undefined)?.mode === 'slow' },
      {
        say: 'Round robin still sends it a quarter of the work, so answers get slow. Tap the Pulsar and choose Least conn.', target: 'lb1',
        done: c => ['least', 'p2c'].includes(lb(c.w)?.algo ?? ''),
        then: 'Least conn sees the slow planet holding its requests longer and sends it fewer.',
      },
      { say: 'Hold 98% success for 20 seconds.', done: mission('sick') },
    ],
  },
  {
    id: 'deep', title: 'Deep nebula', layout: 'nebula',
    blurb: 'A cache answers popular requests without asking the servers.',
    steps: [
      { say: 'The blue cloud is a Nebula: a cache. Tap it.', target: 'n1', done: c => selected(c, 'n1') },
      {
        say: 'It is small and forgets fast, so many requests miss. Raise Size to 20+ and TTL to 15+ in its card.', target: 'n1',
        done: c => { const n = byName(c.w, 'n1') as { cap?: number; ttl?: number } | undefined; return (n?.cap ?? 0) >= 20 && (n?.ttl ?? 0) >= 15; },
      },
      { say: 'Wait for a 70% hit ratio. Green answers came straight from the nebula.', done: mission('deep'), then: 'A few crystals are far more popular than the rest, so a modest cache answers most requests.' },
    ],
  },
  {
    id: 'stampede', title: 'Tame the stampede', layout: 'nebula',
    blurb: 'Stop a crowd of misses from flattening the servers.',
    steps: [
      { say: 'Tap the Nebula and turn on Request coalescing.', target: 'n1', done: c => !!(byName(c.w, 'n1') as { coalesce?: boolean } | undefined)?.coalesce },
      { say: 'Start a solar flare: 4× traffic, mostly for the same two crystals.', action: { label: 'Start the flare', run: w => solarFlare(w) }, done: c => c.w.t < c.w.flash },
      {
        say: 'Now empty the nebula in the middle of it.', target: 'n1',
        action: { label: 'Drain the nebula', run: w => { const n = byName(w, 'n1'); if (n?.type === 'cache') drain(w, n); } },
        done: c => c.w.flags.purge !== null || c.w.missions.has('stampede'),
      },
      { say: 'Watch: one fetch per crystal reaches the planets, and everyone else waits for it.', done: mission('stampede'), then: 'That is proxy_cache_lock in nginx.' },
    ],
  },
  {
    id: 'hash', title: 'Keys stay home', layout: 'planets',
    blurb: 'Consistent hashing moves few keys when a server leaves.',
    steps: [
      { say: 'Tap the Pulsar and choose Consistent hash.', target: 'lb1', done: c => lb(c.w)?.algo === 'hash' },
      {
        say: 'Now remove a planet.', target: 's4', tool: 'remove',
        action: { label: 'Remove s4', run: w => { const n = byName(w, 's4'); if (n) removeBody(w, n); } },
        done: mission('hash'), then: 'Only the removed planet’s crystals moved. With plain hash mod N, most would have.',
      },
    ],
  },
];

export const journeyOf = (id: MissionId) => JOURNEYS.find(j => j.id === id);
