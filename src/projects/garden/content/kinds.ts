export type NodeType = 'client' | 'router' | 'lb' | 'server' | 'cache';

/** The garden in space: every network role is a celestial body. */
export const KINDS: Record<NodeType, { label: string; role: string; prefix: string; r: number; color: string; blurb: string }> = {
  client: {
    label: 'Probe', role: 'client · asks for crystals', prefix: 'p', r: 0.55, color: '#F5A8C3',
    blurb: 'Sends requests for crystals. Each one heads for the nearest nebula, else the nearest pulsar, else the nearest planet, the way DNS or anycast steers you to the closest edge.',
  },
  router: {
    label: 'Relay', role: 'router', prefix: 'r', r: 0.6, color: '#FFE7A8',
    blurb: 'Relays pass packets along. Each one tells the whole sky about its own lanes (link-state flooding: the violet rings), then runs Dijkstra to find the cheapest path to everything.',
  },
  lb: {
    label: 'Pulsar', role: 'load balancer', prefix: 'lb', r: 0.8, color: '#9FF0D0',
    blurb: 'Takes each request, hands it to one planet and relays the answer back. How it chooses matters most when the planets are not equal.',
  },
  server: {
    label: 'Planet', role: 'origin server', prefix: 's', r: 0.95, color: '#6FA8FF',
    blurb: 'Makes the crystals. Each request takes a worker moon for a while (the lit moons). When every moon is busy, requests wait in the queue beside it. When the queue is full, they are turned away with a 503.',
  },
  cache: {
    label: 'Nebula', role: 'cache', prefix: 'n', r: 0.85, color: '#8FB8FF',
    blurb: 'Keeps recently fetched crystals close to the probes. A few crystals are far more popular than the rest, so a small nebula answers most requests. The motes orbiting it are what it holds, and they fade as their TTL runs out.',
  },
};

export const NODE_TYPES = Object.keys(KINDS) as NodeType[];
