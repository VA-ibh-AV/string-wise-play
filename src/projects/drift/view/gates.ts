import * as THREE from 'three';
import { atmosphereMaterial, glowSprite, planetMaterial, type TextFactory } from '@play/three-kit';
import { zoneAt } from '../content/route';
import type { Gate, Pass } from '../sim/flight';
import { GATE_R, R } from '../sim/flight';
import type { Track } from '../sim/track';

const RING = new THREE.TorusGeometry(GATE_R, 0.09, 12, 72);
const SPHERE = new THREE.SphereGeometry(1, 48, 32);
const CLEAN = new THREE.Color('#9EF0B8'), WIDE = new THREE.Color('#FFB24A');

interface GateMesh {
  group: THREE.Group;
  ring: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  glow: THREE.Sprite;
  label: THREE.Sprite;
  base: THREE.Color;
  pass: Pass | null;
  planet: THREE.ShaderMaterial;
}

/** A glowing ring for every hop, a labelled planet beside it, and the destination world at the end. */
export function createGates(scene: THREE.Scene, track: Track, gates: Gate[], soft: THREE.Texture, text: TextFactory, light: THREE.Vector3) {
  const meshes: GateMesh[] = [];
  const disposables: THREE.Material[] = [];
  gates.forEach((g, i) => {
    const f = track.frameAt(g.hop.u);
    const color = new THREE.Color(zoneAt(g.hop.u).color);
    const group = new THREE.Group();
    const p = track.place(g.hop.u, g.x, g.y);
    group.position.set(p.x, p.y, p.z);
    group.lookAt(p.x + f.t.x, p.y + f.t.y, p.z + f.t.z);
    const mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.6) });
    const ring = new THREE.Mesh(RING, mat);
    group.add(ring);
    const glow = glowSprite(soft, color, GATE_R * 4, 0.35);
    group.add(glow);
    const label = text.sprite(g.hop.title, '#' + color.getHexString(), 0.9);
    label.position.set(0, GATE_R + 1.2, 0);
    group.add(label);
    scene.add(group);

    // the station: a small planet beside the tube, alternating sides
    const side = i % 2 === 0 ? 1 : -1, rad = 3.5 + (i % 3);
    const sp = track.place(g.hop.u + 0.004, side * (R + 16 + rad), 4 + (i % 3) * 2);
    const planet = planetMaterial('#' + color.getHexString(), i + 3, light);
    const pm = new THREE.Mesh(SPHERE, planet);
    pm.position.set(sp.x, sp.y, sp.z);
    pm.scale.setScalar(rad);
    scene.add(pm);
    const atm = atmosphereMaterial('#' + color.getHexString(), 0.55);
    const am = new THREE.Mesh(SPHERE, atm);
    am.position.copy(pm.position);
    am.scale.setScalar(rad * 1.18);
    scene.add(am);
    const st = text.sprite(g.hop.station, '#' + color.getHexString(), 1.6);
    st.position.set(sp.x, sp.y + rad + 2, sp.z);
    scene.add(st);
    disposables.push(planet, atm, mat, glow.material, label.material, st.material);
    meshes.push({ group, ring, mat, glow, label, base: color, pass: null, planet });
  });

  // the destination: a large warm world, string-wise.com
  const end = track.frameAt(1);
  const destPos = new THREE.Vector3(end.p.x + end.t.x * 120, end.p.y + end.t.y * 120 + 10, end.p.z + end.t.z * 120);
  const destMat = planetMaterial('#FFB86B', 42, light);
  const dest = new THREE.Mesh(SPHERE, destMat);
  dest.position.copy(destPos);
  dest.scale.setScalar(45);
  scene.add(dest);
  const destAtm = atmosphereMaterial('#FFD9A0', 0.6);
  const da = new THREE.Mesh(SPHERE, destAtm);
  da.position.copy(destPos);
  da.scale.setScalar(52);
  scene.add(da);
  const destGlow = glowSprite(soft, 0xffc37a, 260, 0.1);
  destGlow.position.copy(destPos);
  scene.add(destGlow);
  const destLabel = text.sprite('string-wise.com', '#FFE7A8', 7);
  destLabel.position.set(destPos.x, destPos.y + 62, destPos.z);
  scene.add(destLabel);
  disposables.push(destMat, destAtm, destGlow.material, destLabel.material);

  return {
    destination: destPos,
    passed(i: number, p: Pass) {
      const m = meshes[i];
      if (m) m.pass = p;
    },
    reset() {
      for (const m of meshes) m.pass = null;
    },
    update(dt: number, t: number, next: number, reduced: boolean) {
      meshes.forEach((m, i) => {
        const upcoming = i === next;
        const target = m.pass === 'clean' ? CLEAN : m.pass === 'wide' ? WIDE : m.base;
        m.mat.color.lerp(target.clone().multiplyScalar(m.pass ? 1.2 : upcoming ? 2.2 : 1.3), Math.min(1, dt * 4));
        const pulse = upcoming && !reduced ? 1 + Math.sin(t * 5) * 0.08 : 1;
        m.ring.scale.setScalar(pulse);
        m.glow.material.opacity = m.pass ? 0.12 : upcoming ? 0.55 : 0.28;
        m.label.material.opacity = m.pass ? 0.35 : 1;
        if (!reduced) m.ring.rotation.z += dt * (upcoming ? 0.8 : 0.2);
        m.planet.uniforms.uTime.value = reduced ? 0 : t;
      });
      destMat.uniforms.uTime.value = reduced ? 0 : t;
    },
    dispose() {
      for (const m of meshes) scene.remove(m.group);
      disposables.forEach(d => d.dispose());
    },
  };
}

export const GATE_GEOMETRIES = [RING, SPHERE];
