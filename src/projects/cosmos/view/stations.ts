import * as THREE from 'three';
import { glowSprite, type TextFactory } from '@play/three-kit';
import type { LensId } from '../content/lenses';
import { CACHE_POS, DISK, NIC, rnd } from './layout';

/** Disk station, asteroid belt, page cache nebula and the NIC satellite. */
export function createStations(scene: THREE.Scene, soft: THREE.Texture, text: TextFactory) {
  const rocks: { m: THREE.Object3D; sp: THREE.Vector3 }[] = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6a6272, roughness: 0.95, flatShading: true });

  const core = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.2, 1),
    new THREE.MeshStandardMaterial({ color: 0x5c5566, roughness: 0.9, flatShading: true, emissive: 0xff9a5c, emissiveIntensity: 0.06 }),
  );
  core.position.copy(DISK);
  scene.add(core);
  rocks.push({ m: core, sp: new THREE.Vector3(0.05, 0.12, 0.03) });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.6, 0.05, 8, 96),
    new THREE.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.55 }),
  );
  ring.position.copy(DISK);
  ring.rotation.x = Math.PI / 2.3;
  scene.add(ring);
  rocks.push({ m: ring, sp: new THREE.Vector3(0, 0, 0.15) });
  const diskLabel = text.sprite('/dev/nvme0n1 · disk', '#FFB38A', 0.95);
  diskLabel.position.set(DISK.x, DISK.y + 3.4, DISK.z);
  scene.add(diskLabel);

  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.25, 0.9), 0), rockMat);
    const a = rnd(0, 6.28), rr = rnd(24, 34);
    m.position.set(Math.cos(a) * rr, rnd(-9, 9), Math.sin(a) * rr * 0.7);
    m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
    m.scale.set(1.3, 0.85, 1);
    scene.add(m);
    rocks.push({ m, sp: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3)) });
  }

  // page cache nebula: its size is the cache size
  const nebula = new THREE.Group();
  nebula.position.copy(CACHE_POS);
  scene.add(nebula);
  const nebSprites = ([
    [0, 0, 0, 0x8fb8ff],
    [1.2, 0.6, 0.4, 0xb08fff],
    [-1, -0.4, 0.6, 0x7fd8ff],
    [0.3, -0.8, -0.8, 0x9fa8ff],
  ] as const).map(([x, y, z, c]) => {
    const s = glowSprite(soft, c, 6, 0.3);
    s.position.set(x, y, z);
    nebula.add(s);
    return s;
  });
  const nebLabel = text.sprite('page cache', '#8FB8FF', 0.7);
  scene.add(nebLabel);

  // NIC satellite
  const nic = new THREE.Group();
  nic.position.copy(NIC);
  scene.add(nic);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9bfd6, roughness: 0.5, metalness: 0.6 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x2a3f8f, roughness: 0.4, metalness: 0.3, emissive: 0x1a2a6a, emissiveIntensity: 0.4 });
  nic.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.6), metal));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.1), panel);
    p.position.x = s * 2.1;
    nic.add(p);
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 20, 1, true), metal);
  dish.position.set(0, 0.9, 0);
  dish.rotation.x = Math.PI;
  nic.add(dish);
  const blink = glowSprite(soft, 0x7ff0ff, 1.2, 0.8);
  blink.position.set(0, 0.2, 0.9);
  nic.add(blink);
  rocks.push({ m: nic, sp: new THREE.Vector3(0, 0.1, 0) });
  const nicLabel = text.sprite('eth0 · NIC', '#7FF0FF', 0.8);
  nicLabel.position.set(NIC.x, NIC.y + 2, NIC.z);
  scene.add(nicLabel);

  return {
    blinkNic() {
      blink.material.opacity = 1;
    },
    update(dt: number, t: number, lens: LensId | null, cacheMb: number) {
      for (const r of rocks) {
        r.m.rotation.x += r.sp.x * dt;
        r.m.rotation.y += r.sp.y * dt;
        r.m.rotation.z += r.sp.z * dt;
      }
      const bright = lens === 'pagecache' || lens === 'memory';
      const cs = 2 + Math.sqrt(Math.max(0, cacheMb)) * 0.55;
      nebSprites.forEach((s, i) => {
        s.scale.setScalar(cs * (1 + 0.06 * Math.sin(t * 0.5 + i)));
        s.material.opacity = (bright ? 0.55 : 0.2) * (0.8 + 0.2 * Math.sin(t + i));
      });
      nebLabel.position.set(CACHE_POS.x, CACHE_POS.y + cs * 0.5 + 0.8, CACHE_POS.z);
      nebLabel.material.opacity = bright ? 1 : 0.35;
      blink.material.opacity = Math.max(0.25, blink.material.opacity - dt * 2);
    },
  };
}
