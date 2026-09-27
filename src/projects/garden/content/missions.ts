import type { SeedKey } from './seeds';

export type MissionId = 'bloom' | 'rings' | 'snip' | 'around' | 'share' | 'sick' | 'deep' | 'stampede' | 'hash';

export interface Mission {
  id: MissionId;
  title: string;
  how: string;
  seed?: SeedKey;
}

export const MISSIONS: Mission[] = [
  { id: 'bloom', title: 'Follow a request', how: 'Send one request from a probe and watch it travel there and back.' },
  { id: 'rings', title: 'Read the star chart', how: 'Tap a relay to open its routing table: for every body, which neighbour it would hand a packet to, and at what cost.' },
  { id: 'snip', title: 'Before anyone noticed', how: 'Sever a busy lane. Packets already heading into it are lost until the relays at each end notice it is gone.', seed: 'ring' },
  { id: 'around', title: 'Route around it', how: 'After severing a busy lane, let the sky converge and get 20 more answers home on the new path.', seed: 'ring' },
  { id: 'share', title: 'Share the load', how: 'A pulsar in front of 3 or more planets, serving at least 6 answers/s at 99% success for 10s.', seed: 'planets' },
  { id: 'sick', title: 'One sick planet', how: 'Set a planet to Slow or Down, then hold 98% success for 20s. Least-conn, two choices or health checks will help.', seed: 'planets' },
  { id: 'deep', title: 'Deep nebula', how: 'Reach a 70% hit ratio at the nebula. A bigger nebula, or crystals that keep longer, hold more of the popular keys.', seed: 'nebula' },
  { id: 'stampede', title: 'Tame the stampede', how: 'Turn on request coalescing, start a solar flare, then drain the nebula. Only one fetch per crystal should reach the planets.', seed: 'nebula' },
  { id: 'hash', title: 'Keys stay home', how: 'Switch a pulsar to consistent hashing, then remove a planet (or set it Down with health checks on). Count how few keys move.', seed: 'planets' },
];
