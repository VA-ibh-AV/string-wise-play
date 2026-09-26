import * as THREE from 'three';

/** World-space layout shared by every view module. */
export const TW = 44;
export const TD = 24;
export const FLOOR = -11;
export const SURF = 11;
export const DISK = new THREE.Vector3(-15, -6.5, -5);
export const CACHE_POS = new THREE.Vector3(-9, -1, -9);
export const NIC = new THREE.Vector3(19, 2, -7);

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const randomPoint = (yMin = FLOOR + 2.5, yMax = SURF - 2) =>
  new THREE.Vector3(rnd(-TW / 2 + 3, TW / 2 - 3), rnd(yMin, yMax), rnd(-TD / 2 + 3, TD / 2 - 3));

export const COLORS = {
  sun: new THREE.Color(0xffe7a8),
  rt: new THREE.Color(0xff8a7a),
  red: new THREE.Color(0xff6a5a),
  zombie: new THREE.Color(0x55505e),
  stop: new THREE.Color(0x8ca0c8),
  white: new THREE.Color(1, 1, 1),
  tileSwap: new THREE.Color(0x3a3548),
};
