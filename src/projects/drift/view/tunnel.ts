import * as THREE from 'three';
import { ADD } from '@play/three-kit';
import { ZONES, zoneAt } from '../content/route';
import { R } from '../sim/flight';
import type { Track } from '../sim/track';

const tmpC = new THREE.Color();

/** Colour of the tube at u: zone colours, blended softly at the borders. */
function zoneColor(u: number, out: THREE.Color) {
  const z = zoneAt(u);
  out.set(z.color);
  const i = ZONES.indexOf(z);
  const nextZ = ZONES[i + 1];
  if (nextZ) {
    const k = Math.max(0, (u - (z.to - 0.012)) / 0.012);
    if (k > 0) out.lerp(tmpC.set(nextZ.color), Math.min(1, k) * 0.5);
  }
  return out;
}

/**
 * The tube: glowing rings every 14 units and 8 rails, coloured by zone, plus
 * dust drifting around the route. Two LineSegments and one Points: cheap.
 */
export function createTunnel(scene: THREE.Scene, track: Track, soft: THREE.Texture, low: boolean) {
  const ringGap = 14, seg = low ? 24 : 40, rails = 8;
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  const rings = Math.floor(track.length / ringGap);
  for (let i = 0; i <= rings; i++) {
    const u = (i * ringGap) / track.length;
    const f = track.frameAt(u);
    zoneColor(u, c);
    const k = i % 5 === 0 ? 1 : 0.55; // every fifth ring brighter: a sense of speed
    for (let s = 0; s < seg; s++) {
      for (const j of [s, s + 1]) {
        const a = (j / seg) * Math.PI * 2;
        const x = Math.cos(a) * R, y = Math.sin(a) * R;
        pos.push(f.p.x + f.r.x * x + f.up.x * y, f.p.y + f.r.y * x + f.up.y * y, f.p.z + f.r.z * x + f.up.z * y);
        col.push(c.r * k, c.g * k, c.b * k);
      }
    }
  }
  const railStep = 5 / track.length;
  for (let r = 0; r < rails; r++) {
    const a = (r / rails) * Math.PI * 2 + Math.PI / rails;
    const x = Math.cos(a) * R, y = Math.sin(a) * R;
    for (let u = 0; u < 1 - railStep; u += railStep) {
      for (const uu of [u, u + railStep]) {
        const p = track.place(uu, x, y);
        zoneColor(uu, c);
        pos.push(p.x, p.y, p.z);
        col.push(c.r * 0.45, c.g * 0.45, c.b * 0.45);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, blending: ADD, depthWrite: false }));
  lines.frustumCulled = false;
  scene.add(lines);

  // dust around the route, in zone colours
  const n = low ? 2500 : 6000;
  const dp = new Float32Array(n * 3), dc = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const a = Math.random() * Math.PI * 2, rr = R + 3 + Math.random() * 40;
    const p = track.place(u, Math.cos(a) * rr, Math.sin(a) * rr * 0.7);
    dp.set([p.x, p.y, p.z], i * 3);
    zoneColor(u, c);
    const k = 0.25 + Math.random() * 0.35;
    dc.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dgeo.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ size: 0.6, map: soft, vertexColors: true, transparent: true, depthWrite: false, blending: ADD }));
  dust.frustumCulled = false;
  scene.add(dust);
  return { lines, dust };
}
