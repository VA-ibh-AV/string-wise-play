import { cosmos } from './cosmos/manifest';
import { garden } from './garden/manifest';
import type { ProjectManifest } from './types';

const soon = (id: string, title: string, tagline: string, teaser: string, topics: string[], accent: string): ProjectManifest => ({
  id, title, tagline, teaser, topics, accent,
  route: `/${id}`, status: 'soon', minutes: 5, thumbnail: `/og/${id}.svg`, relatedPosts: [],
});

/** The only file to edit when adding a project. */
export const PROJECTS: ProjectManifest[] = [
  cosmos,
  soon('lanterns', 'Goroutine Lanterns', 'Channels as strings of light.', 'hchan, select and deadlocks you can see.', ['go', 'channels', 'select'], '#FFB38A'),
  garden,
  soon('choir', 'Consensus Choir', 'Raft, as sound.', 'Leader election and log replication you can hear.', ['raft', 'consensus'], '#C7A4FF'),
  soon('zen', 'Data Structure Zen Garden', 'Rake a B-tree.', 'B-trees, hash rings and heaps, arranged calmly.', ['b-trees', 'hash rings', 'heaps'], '#8FC3FF'),
  soon('slow-packet', 'Slow Packet', "One packet's long trip.", 'DNS → TCP → NAT → conntrack → socket, slowly.', ['dns', 'tcp', 'nat', 'conntrack'], '#7FF0FF'),
];

export const liveProjects = PROJECTS.filter(p => p.load);
