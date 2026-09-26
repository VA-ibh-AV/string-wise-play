import * as THREE from 'three';
import { ADD, glowSprite } from '@play/three-kit';

const TRAIL = 70;
/** Only the first part of the trail gets glowing points; near the camera they would balloon. */
const DOTS = 28;

/** The packet: a glowing octahedron with a comet trail. */
export function createShip(scene: THREE.Scene, soft: THREE.Texture) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x0a2a24, emissive: 0x7ff0d0, emissiveIntensity: 2.2, flatShading: true, roughness: 0.3 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), mat);
  const glow = glowSprite(soft, 0x7ff0d0, 4.5, 0.55);
  const halo = glowSprite(soft, 0x7ff0d0, 12, 0.12);
  const group = new THREE.Group();
  group.add(core, glow, halo);
  scene.add(group);

  const tp = new Float32Array(TRAIL * 3), tc = new Float32Array(TRAIL * 3);
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tgeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const trail = new THREE.Line(tgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: ADD, depthWrite: false }));
  trail.frustumCulled = false;
  scene.add(trail);
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  dotGeo.setDrawRange(0, DOTS);
  const trailPts = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 0.5, map: soft, vertexColors: true, transparent: true, blending: ADD, depthWrite: false }));
  trailPts.frustumCulled = false;
  scene.add(trailPts);
  let filled = false;
  const color = new THREE.Color(0x7ff0d0), goal = new THREE.Color(0x7ff0d0);

  return {
    group,
    setColor(hex: number) {
      goal.set(hex);
    },
    reset(p: THREE.Vector3) {
      filled = false;
      color.set(0x7ff0d0);
      goal.set(0x7ff0d0);
      group.position.copy(p);
    },
    update(dt: number, p: THREE.Vector3, speed: number, flash: number) {
      color.lerp(goal, Math.min(1, dt * 2));
      mat.emissive.copy(color);
      mat.emissiveIntensity = 2 + flash * 3;
      glow.material.color.copy(color);
      halo.material.color.copy(color);
      glow.scale.setScalar(4.5 + flash * 4);
      group.position.copy(p);
      core.rotation.x += dt * 1.6;
      core.rotation.y += dt * 2.3;
      // shift the trail back one slot and put the packet at the front
      if (!filled) {
        for (let i = 0; i < TRAIL; i++) tp.set([p.x, p.y, p.z], i * 3);
        filled = true;
      }
      tp.copyWithin(3, 0, (TRAIL - 1) * 3);
      tp.set([p.x, p.y, p.z], 0);
      for (let i = 0; i < TRAIL; i++) {
        const k = Math.pow(1 - i / TRAIL, 2.4) * (0.5 + Math.min(1, (speed - 40) / 60));
        tc.set([color.r * k, color.g * k, color.b * k], i * 3);
      }
      tgeo.attributes.position.needsUpdate = true;
      tgeo.attributes.color.needsUpdate = true;
      dotGeo.attributes.position.needsUpdate = true;
      dotGeo.attributes.color.needsUpdate = true;
    },
    dispose() {
      scene.remove(group, trail, trailPts);
      core.geometry.dispose();
      mat.dispose();
      glow.material.dispose();
      halo.material.dispose();
      tgeo.dispose();
      dotGeo.dispose();
      (trail.material as THREE.Material).dispose();
      (trailPts.material as THREE.Material).dispose();
    },
  };
}
