import type { ProjectManifest } from '../types';

export const garden: ProjectManifest = {
  id: 'garden',
  title: 'Packet Garden',
  tagline: 'Grow a constellation, watch it route.',
  route: '/garden',
  status: 'beta',
  topics: ['routing', 'OSPF', 'load balancing', 'caching', 'convergence'],
  minutes: 5,
  thumbnail: '/og/garden.svg',
  accent: '#9EF0B8',
  missions: 9,
  relatedPosts: [{ title: 'string-wise.com', url: 'https://string-wise.com' }],
  load: () => import('./index'),
};
