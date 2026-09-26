import * as THREE from 'three';
import { glowSprite, starfield } from '@play/three-kit';

/** Renderer, deep-space background, soft lights and far nebulae. */
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
  gr.addColorStop(0, '#0B0A26');
  gr.addColorStop(0.55, '#060818');
  gr.addColorStop(1, '#03040C');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;
  scene.fog = new THREE.FogExp2(0x05061a, 0.008);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 700);
  scene.add(new THREE.HemisphereLight(0xb8c4ff, 0x0e0a1c, 0.28 * Math.PI));
  const key = new THREE.DirectionalLight(0xffe2b8, 0.75 * Math.PI);
  key.position.set(-20, 30, 14);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6f7bff, 0.35 * Math.PI);
  rim.position.set(20, 8, -24);
  scene.add(rim);

  scene.add(starfield(2400, 180, 320));
  for (const [x, y, z, col, sc, op] of [
    [-90, 30, -150, 0x5b3fa0, 200, 0.28],
    [110, -10, -120, 0x1f6f8b, 170, 0.24],
    [10, 70, -210, 0x8b3f6b, 150, 0.2],
    [0, -60, 40, 0x1c2a70, 160, 0.22],
  ]) {
    const sp = glowSprite(soft, col, sc, op);
    sp.position.set(x, y, z);
    scene.add(sp);
  }
  // the milky way: a faint band of dust and stars behind everything
  const mw = new THREE.Sprite(new THREE.SpriteMaterial({ map: milkyWay(), transparent: true, opacity: 0.55, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  mw.scale.set(520, 130, 1);
  mw.material.rotation = 0.32;
  mw.position.set(-20, 30, -260);
  scene.add(mw);
  // a faint orbital grid under the sky so it reads as one place
  const grid = new THREE.Group();
  const gridMat = new THREE.LineBasicMaterial({ color: 0x3a4a9a, transparent: true, opacity: 0.16, depthWrite: false });
  for (const r of [5, 10, 15, 20, 25]) {
    const pts = Array.from({ length: 129 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * Math.PI * 2) * r * 1.3, 0, Math.sin((i / 128) * Math.PI * 2) * r * 0.8));
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gridMat));
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    grid.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(Math.cos(a) * 6.5, 0, Math.sin(a) * 4), new THREE.Vector3(Math.cos(a) * 32.5, 0, Math.sin(a) * 20)]), gridMat));
  }
  grid.position.y = -0.4;
  scene.add(grid);
  const disc = glowSprite(soft, 0x2a3d8f, 70, 0.14);
  disc.position.set(0, -3, 0);
  disc.scale.set(80, 48, 1);
  scene.add(disc);
  return { renderer, scene, camera, background: bg };
}

/** Slow drifting motes: the only thing that moves when nothing is happening. */
export function createMotes(scene: THREE.Scene, soft: THREE.Texture, count: number) {
  const pos = new Float32Array(count * 3), vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 60, Math.random() * 10 - 2, (Math.random() - 0.5) * 40], i * 3);
    vel.set([(Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.15], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.25, map: soft, color: 0xc9d2ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(pts);
  return (dt: number) => {
    for (let i = 0; i < count * 3; i += 3) {
      pos[i] += vel[i] * dt;
      pos[i + 1] += vel[i + 1] * dt;
      pos[i + 2] += vel[i + 2] * dt;
      if (Math.abs(pos[i]) > 32) vel[i] *= -1;
      if (pos[i + 1] > 9 || pos[i + 1] < -3) vel[i + 1] *= -1;
      if (Math.abs(pos[i + 2]) > 22) vel[i + 2] *= -1;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

export function ringTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const h = size / 2;
  const r = g.createRadialGradient(h, h, h * 0.55, h, h, h);
  r.addColorStop(0, 'rgba(255,255,255,0)');
  r.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.75, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
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
    const hue = [255, 220, 200, 290][i % 4];
    rg.addColorStop(0, `hsla(${hue},60%,70%,0.10)`);
    rg.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = rg;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 1600; i++) {
    const y = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 90;
    g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * 1024, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
