import type { ProjectManifest } from '../types';

export const cosmos: ProjectManifest = {
  id: 'cosmos',
  title: 'Kernel Cosmos',
  tagline: 'Every planet is a Linux process.',
  route: '/cosmos',
  status: 'beta',
  topics: ['processes', 'scheduler', 'memory', 'page cache', 'interrupts', 'cgroups', 'namespaces', 'signals'],
  minutes: 5,
  thumbnail: '/og/cosmos.svg',
  accent: '#FFE7A8',
  missions: 16,
  relatedPosts: [{ title: 'string-wise.com', url: 'https://string-wise.com' }],
  load: () => import('./index'),
};
