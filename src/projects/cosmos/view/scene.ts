import * as THREE from 'three';
import { glowSprite, starfield } from '@play/three-kit';

/** Renderer, camera, lights, background, stars and distant nebulae. */
export function createScene(canvas: HTMLCanvasElement, soft: THREE.Texture) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#120F33');
  gr.addColorStop(0.5, '#070819');
  gr.addColorStop(1, '#020309');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  scene.fog = new THREE.FogExp2(0x05061a, 0.006);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 600);

  // physically based light units: the prototype's legacy intensities × π
  const PI = Math.PI;
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x120a20, 0.32 * PI));
  const key = new THREE.DirectionalLight(0xffe2b8, 1.25 * PI);
  key.position.set(-30, 14, 18);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f7bff, 0.35 * PI);
  rim.position.set(25, -6, -20);
  scene.add(rim);
  scene.add(new THREE.AmbientLight(0x1a1a3a, 0.4 * PI));

  scene.add(starfield(2600, 160, 280));
  for (const [x, y, z, col, sc] of [
    [-120, 40, -170, 0x6b3fa0, 190],
    [140, -30, -150, 0x1f6f8b, 170],
    [20, 90, -220, 0x9b3f6b, 150],
    [-60, -80, 160, 0x2e4aa0, 200],
  ]) {
    const sp = glowSprite(soft, col, sc, 0.32);
    sp.position.set(x, y, z);
    scene.add(sp);
  }

  return { renderer, scene, camera, background: bg };
}
