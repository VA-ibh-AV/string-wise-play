import type { ProjectManifest } from '../types';

export const orbit: ProjectManifest = {
  id: 'orbit',
  title: 'Orbit Synth',
  tagline: 'A music box that is secretly a CPU scheduler.',
  route: '/orbit',
  status: 'beta',
  topics: ['CFS', 'round robin', 'nice', 'SCHED_FIFO', 'starvation'],
  minutes: 5,
  thumbnail: '/og/orbit.svg',
  accent: '#FFE7A8',
  missions: 5,
  relatedPosts: [{ title: 'string-wise.com', url: 'https://string-wise.com' }],
  load: () => import('./index'),
};
