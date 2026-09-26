import * as THREE from 'three';
import { glowSprite, starfield } from '@play/three-kit';

/** Deep space that travels with the camera: stars, nebulae and a milky-way band. */
export function createScene(canvas: HTMLCanvasElement, soft: THREE.Texture) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#0C0A2A');
  gr.addColorStop(0.5, '#060818');
  gr.addColorStop(1, '#02030A');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  scene.fog = new THREE.FogExp2(0x060818, 0.0035);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1600);
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x0e0a1c, 0.35 * Math.PI));
  const key = new THREE.DirectionalLight(0xffe2b8, 0.9 * Math.PI);
  key.position.set(-30, 40, 20);
  scene.add(key);

  // far things ride with the camera so the journey never runs out of sky
  const sky = new THREE.Group();
  sky.add(starfield(3000, 300, 700));
  for (const [x, y, z, col, sc, op] of [
    [-220, 80, -420, 0x5b3fa0, 420, 0.3],
    [260, -40, -380, 0x1f6f8b, 360, 0.26],
    [40, 180, -520, 0x8b3f6b, 300, 0.22],
    [-120, -160, -300, 0x2e4aa0, 320, 0.22],
  ]) {
    const sp = glowSprite(soft, col, sc, op);
    sp.position.set(x, y, z);
    sp.material.fog = false;
    sky.add(sp);
  }
  const mw = new THREE.Sprite(new THREE.SpriteMaterial({ map: milkyWay(), transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  mw.scale.set(1200, 280, 1);
  mw.material.rotation = -0.3;
  mw.position.set(0, 60, -650);
  sky.add(mw);
  scene.add(sky);
  return { renderer, scene, camera, sky, background: bg, key };
}

function milkyWay() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  const band = g.createLinearGradient(0, 0, 0, 256);
  band.addColorStop(0, 'rgba(0,0,0,0)');
  band.addColorStop(0.5, 'rgba(120,110,190,0.35)');
  band.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = band;
  g.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * 1024, y = 128 + (Math.random() - 0.5) * 120, r = 20 + Math.random() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `hsla(${[255, 220, 200, 290][i % 4]},60%,70%,0.1)`);
    rg.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 1024, 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 90, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
