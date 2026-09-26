import * as THREE from 'three';

export function createPicker(camera: THREE.Camera, canvas: HTMLCanvasElement, pickables: THREE.Object3D[]) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  return (clientX: number, clientY: number): number | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? (hit.object.userData.pid as number) : null;
  };
}
