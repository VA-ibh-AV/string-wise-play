import * as THREE from 'three';
import type { NodeType } from '../content/kinds';

/** The sky is a 40 × 24 plane; bodies float a little above it. */
export const WX = 40;
export const WZ = 24;
export const FLOAT: Record<NodeType, number> = { client: 0.6, router: 0.9, lb: 1.1, server: 1.3, cache: 1.2 };
/** Body radius in world units. */
export const RADIUS: Record<NodeType, number> = { client: 0.38, router: 0.42, lb: 0.55, server: 0.85, cache: 0.7 };

export const toWorld = (x: number, y: number, out = new THREE.Vector3()) => out.set((x - 0.5) * WX, 0, (y - 0.5) * WZ);
export const fromWorld = (v: THREE.Vector3) => ({ x: v.x / WX + 0.5, y: v.z / WZ + 0.5 });

export const COL = {
  req: new THREE.Color('#FFB24A'),
  res: new THREE.Color('#5FDDE6'),
  hit: new THREE.Color('#B8F06C'),
  fail: new THREE.Color('#FF7B8F'),
  lsa: new THREE.Color('#B89DFF'),
  hc: new THREE.Color('#8E9AAE'),
  lane: new THREE.Color('#5E7BC8'),
  laneHot: new THREE.Color('#9FF0D0'),
  cut: new THREE.Color('#A0624E'),
  accent: new THREE.Color('#FFE7A8'),
  path: new THREE.Color('#9EF0B8'),
  bad: new THREE.Color('#FF7B8F'),
};
