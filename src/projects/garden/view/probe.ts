import * as THREE from 'three';

const BODY = new THREE.BoxGeometry(0.34, 0.26, 0.26);
const PANEL = new THREE.BoxGeometry(0.46, 0.02, 0.22);
const DISH = new THREE.ConeGeometry(0.16, 0.12, 20, 1, true);
const ARM = new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6);

/** A small satellite: gold body, two blue solar wings, a dish pointing up. */
export function buildSatellite() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.8, roughness: 0.35, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
  const panel = new THREE.MeshStandardMaterial({ color: 0x1b2f7a, metalness: 0.3, roughness: 0.4, emissive: 0x2a4aff, emissiveIntensity: 0.25 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8e8f0, metalness: 0.2, roughness: 0.5 });
  g.add(new THREE.Mesh(BODY, metal));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(PANEL, panel);
    p.position.x = s * 0.44;
    g.add(p);
    const arm = new THREE.Mesh(ARM, white);
    arm.rotation.z = Math.PI / 2;
    arm.position.x = s * 0.19;
    g.add(arm);
  }
  const dish = new THREE.Mesh(DISH, white);
  dish.position.y = 0.2;
  dish.rotation.x = Math.PI;
  g.add(dish);
  return { group: g, materials: [metal, panel, white] };
}

export const SATELLITE_GEOMETRIES = [BODY, PANEL, DISH, ARM];
