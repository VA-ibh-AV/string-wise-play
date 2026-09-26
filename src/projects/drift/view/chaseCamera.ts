import * as THREE from 'three';
import { BASE } from '../sim/flight';
import type { Flight } from '../sim/flight';

/** Sits 16 units back along the curve, 2.4 up, following 55% of the packet's drift. FOV widens with speed. */
export function createChaseCamera(camera: THREE.PerspectiveCamera, reduced: boolean) {
  const pos = new THREE.Vector3(), look = new THREE.Vector3(), want = new THREE.Vector3(), wantLook = new THREE.Vector3();
  let first = true;
  return {
    update(dt: number, f: Flight, ship: THREE.Vector3, overview = 0) {
      const back = Math.max(0, f.u - 16 / f.track.length);
      const fr = f.track.frameAt(back);
      const lx = f.x * 0.55, ly = f.y * 0.55 + 2.4 + overview * 14;
      want.set(fr.p.x + fr.r.x * lx + fr.up.x * ly, fr.p.y + fr.r.y * lx + fr.up.y * ly, fr.p.z + fr.r.z * lx + fr.up.z * ly);
      const ahead = f.track.frameAt(Math.min(1, f.u + 10 / f.track.length));
      wantLook.set(ahead.p.x * 0.5 + ship.x * 0.5, ahead.p.y * 0.5 + ship.y * 0.5, ahead.p.z * 0.5 + ship.z * 0.5);
      const k = first ? 1 : Math.min(1, dt * (reduced ? 3 : 6));
      pos.lerp(want, k);
      look.lerp(wantLook, k);
      first = false;
      camera.position.copy(pos);
      camera.lookAt(look);
      const kick = reduced ? 0.05 : 0.18;
      const fov = 70 + (f.speed - BASE) * kick;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov += (fov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }
    },
    reset() {
      first = true;
    },
  };
}
