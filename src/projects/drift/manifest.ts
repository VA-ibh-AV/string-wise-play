import type { ProjectManifest } from '../types';

export const drift: ProjectManifest = {
  id: 'drift',
  title: 'Packet Drift',
  tagline: 'Fly one HTTPS request across the internet.',
  route: '/drift',
  status: 'beta',
  topics: ['DNS', 'TCP handshake', 'TLS', 'NAT', 'BGP', 'kernel'],
  minutes: 3,
  thumbnail: '/og/drift.svg',
  accent: '#7FF0D0',
  missions: 3,
  relatedPosts: [{ title: 'TCP Internals', url: 'https://string-wise.com/tcp-internals' }],
  load: () => import('./index'),
};
