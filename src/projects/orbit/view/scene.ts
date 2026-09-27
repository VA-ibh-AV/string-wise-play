import * as THREE from 'three';
import { ADD, glowSprite, starfield } from '@play/three-kit';

export function createScene(canvas: HTMLCanvasElement, soft: THREE.Texture) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0D0A2C');
  gr.addColorStop(0.55, '#060818');
  gr.addColorStop(1, '#02030A');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 900);
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x0e0a1c, 0.3 * Math.PI));
  scene.add(new THREE.AmbientLight(0x1a1a3a, 0.4 * Math.PI));
  scene.add(starfield(2600, 220, 420));
  for (const [x, y, z, col, sc, op] of [
    [-160, 40, -220, 0x5b3fa0, 300, 0.3],
    [180, -60, -200, 0x1f6f8b, 260, 0.24],
    [30, 120, -300, 0x8b3f6b, 220, 0.2],
    [0, -140, 60, 0x2e4aa0, 260, 0.2],
  ]) {
    const sp = glowSprite(soft, col, sc, op);
    sp.position.set(x, y, z);
    scene.add(sp);
  }
  // a faint disc of dust in the orbital plane
  const n = 1800, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const tint = [new THREE.Color('#8FB8FF'), new THREE.Color('#C7A4FF'), new THREE.Color('#FFE7A8')];
  for (let i = 0; i < n; i++) {
    const r = 3 + Math.pow(Math.random(), 0.7) * 22, a = Math.random() * Math.PI * 2;
    pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.8, Math.sin(a) * r], i * 3);
    const t = tint[i % 3], k = 0.15 + Math.random() * 0.25;
    col.set([t.r * k, t.g * k, t.b * k], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.18, map: soft, vertexColors: true, transparent: true, depthWrite: false, blending: ADD }));
  scene.add(dust);
  return { renderer, scene, camera, dust };
}
