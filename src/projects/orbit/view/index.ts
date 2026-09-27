import * as THREE from 'three';
import {
  ADD, atmosphereMaterial, createBloom, createTextFactory, disposeDeep, glowSprite, planetMaterial, softTexture,
} from '@play/three-kit';
import { RINGS, omega, type OrbitPlanet, type OrbitSystem } from '../sim/system';
import { starved } from '../sim/shares';
import { createScene } from './scene';

export interface OrbitView {
  /** A note plays now (visuals are triggered at the note's time, not when it was scheduled). */
  play(id: number, cpu: number): void;
  throttle(): void;
  render(realDt: number, simNow: number, sel: number | null, hoverRing: number | null): void;
  resize(): void;
  /** Screen position of a planet, for its bar and tooltips. */
  pickPlanet(cx: number, cy: number): number | null;
  /** Orbit ring and angle under the pointer, or null. */
  pickOrbit(cx: number, cy: number): { ring: number; angle: number } | null;
  zoom(k: number): void;
  dispose(): void;
}

const SPHERE = new THREE.SphereGeometry(1, 48, 32);
const MOON = new THREE.SphereGeometry(1, 16, 12);
const PLANET_R = 0.72;

interface PlanetMesh {
  group: THREE.Group;
  body: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  atm: THREE.ShaderMaterial;
  halo: THREE.Sprite;
  label: THREE.Sprite;
  starve: THREE.Sprite;
  moons: THREE.Mesh[];
  moonMat: THREE.MeshStandardMaterial;
  flash: number;
  pos: THREE.Vector3;
  color: THREE.Color;
  name: string;
  /** Drawn radius: eases toward the planet's ring, so live planets glide. */
  r: number;
  /** 0..1 fade-in when it appears. */
  grow: number;
}

/** Angle in the orbital plane → world position (+x is the play line). */
const toXZ = (r: number, a: number, out: THREE.Vector3) => out.set(Math.cos(a) * r, 0, -Math.sin(a) * r);

export function createOrbitView(canvas: HTMLCanvasElement, sys: OrbitSystem, opts: { reduced: boolean }): OrbitView {
  const low = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  const soft = softTexture();
  const text = createTextFactory();
  const { renderer, scene, camera, dust } = createScene(canvas, soft);
  const bloom = createBloom(renderer, scene, camera, low);
  const light = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  // ---- the star: the CPU ----
  const starMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffd89a, emissiveIntensity: 2.2 });
  const star = new THREE.Mesh(SPHERE, starMat);
  star.scale.setScalar(1.6);
  scene.add(star);
  const glowIn = glowSprite(soft, 0xffe7a8, 9, 0.6);
  const glowOut = glowSprite(soft, 0xffb86b, 22, 0.22);
  scene.add(glowIn, glowOut);
  const cpuLabel = text.sprite('CPU', '#FFE7A8', 0.9);
  cpuLabel.position.set(0, 2.6, 0);
  cpuLabel.material.opacity = 0.7;
  scene.add(cpuLabel);
  let pulse = 0, red = 0;

  // ---- orbits ----
  const ringMats = RINGS.map(r => {
    const pts = Array.from({ length: 161 }, (_, i) => toXZ(r, (i / 160) * Math.PI * 2, new THREE.Vector3()));
    const m = new THREE.LineBasicMaterial({ color: 0x8fb8ff, transparent: true, opacity: 0.16, blending: ADD, depthWrite: false });
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), m));
    return m;
  });
  // the golden play line (free orbits)
  const playLineMat = new THREE.LineBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1.8, 0, 0), new THREE.Vector3(RINGS[RINGS.length - 1] + 1.2, 0, 0)]), playLineMat));

  // ---- CPU beams, one per core (up to 8 on a live host) ----
  const beams = Array.from({ length: 8 }, () => {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: ADD, depthWrite: false });
    const line = new THREE.Line(geo, m);
    line.frustumCulled = false;
    scene.add(line);
    return { line, m, id: -1, life: 0 };
  });

  // ---- ripples (pooled) ----
  const ringTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d')!;
    const rg = g.createRadialGradient(64, 64, 34, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)');
    rg.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const ripples = Array.from({ length: 24 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, opacity: 0, blending: ADD, depthWrite: false }));
    scene.add(s);
    return { s, life: 0, id: -1 };
  });
  let rippleIdx = 0;

  // ---- planets ----
  const meshes = new Map<number, PlanetMesh>();
  function make(p: OrbitPlanet): PlanetMesh {
    const group = new THREE.Group();
    const mat = planetMaterial(p.color, p.id + 1, light);
    const body = new THREE.Mesh(SPHERE, mat);
    body.scale.setScalar(PLANET_R);
    body.rotation.z = 0.3;
    group.add(body);
    const atm = atmosphereMaterial(p.color, 0.8);
    const am = new THREE.Mesh(SPHERE, atm);
    am.scale.setScalar(PLANET_R * 1.2);
    group.add(am);
    const halo = glowSprite(soft, p.color, 4, 0.12);
    group.add(halo);
    const label = text.sprite(p.name, p.color, 0.55);
    label.position.y = -1.35;
    group.add(label);
    const starve = text.sprite('starved', '#FF7B8F', 0.45);
    starve.position.y = 1.35;
    starve.material.opacity = 0;
    group.add(starve);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xd8dcef, emissive: new THREE.Color(p.color), emissiveIntensity: 0.3, roughness: 0.8 });
    scene.add(group);
    return { group, body, mat, atm, halo, label, starve, moons: [], moonMat, flash: 0, pos: new THREE.Vector3(), color: new THREE.Color(p.color), name: p.name, r: RINGS[p.ring], grow: sys.mode === 'live' ? 0 : 1 };
  }
  function drop(id: number, m: PlanetMesh) {
    scene.remove(m.group);
    [m.mat, m.atm, m.halo.material, m.label.material, m.starve.material, m.moonMat].forEach(x => x.dispose());
    meshes.delete(id);
  }

  // ---- camera: tilted over the plane, drifting very slowly ----
  let theta = 0.4, dist = 44, goalDist = 44, t = 0;
  function placeCamera(dt: number) {
    if (!opts.reduced) theta += dt * 0.01;
    dist += (goalDist - dist) * Math.min(1, dt * 3);
    const phi = 0.78;
    camera.position.set(Math.sin(theta) * Math.sin(phi) * dist, Math.cos(phi) * dist, Math.cos(theta) * Math.sin(phi) * dist);
    camera.lookAt(0, -1.5, 0);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the outer orbit on screen, and leave room for the panels and bars
    const wide = w > 900;
    camera.fov = w / h < 1 ? 62 : 45;
    goalDist = w / h < 1 ? 50 : 42;
    if (wide) camera.setViewOffset(w, h, 0, h * 0.04, w, h);
    else camera.setViewOffset(w, h, 0, h * 0.06, w, h);
    camera.updateProjectionMatrix();
    bloom.setSize(w, h);
  }
  resize();

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const toNdc = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    return r;
  };

  return {
    play(id, cpu) {
      const m = meshes.get(id);
      if (!m) return;
      m.flash = 1;
      pulse = 1;
      const b = beams[cpu % beams.length];
      b.id = id;
      b.life = 1;
      b.m.color.copy(m.color);
      const r = ripples[rippleIdx++ % ripples.length];
      r.id = id;
      r.life = 1;
      r.s.material.color.copy(m.color);
    },
    throttle() {
      red = 1;
    },
    render(dt, simNow, sel, hoverRing) {
      t += dt;
      // planets follow the sim; the sim runs a little ahead, so step back to "now"
      for (const [id, m] of meshes) if (!sys.planets.some(p => p.id === id)) drop(id, m);
      for (const p of sys.planets) {
        let m = meshes.get(p.id);
        if (!m) meshes.set(p.id, (m = make(p)));
        const a = p.angle - omega(sys, p) * (sys.t - simNow);
        m.r += (RINGS[p.ring] - m.r) * Math.min(1, dt * (sys.mode === 'live' ? 0.6 : 30));
        m.grow = Math.min(1, m.grow + dt * 0.8);
        toXZ(m.r, a, m.pos);
        m.group.position.copy(m.pos);
        m.group.scale.setScalar(0.2 + 0.8 * m.grow);
        m.flash = Math.max(0, m.flash - dt * 2.4);
        const st = starved(sys, p);
        m.mat.uniforms.uTime.value = opts.reduced ? 0 : t;
        m.mat.uniforms.uSick.value += ((st ? 0.8 : 0) - m.mat.uniforms.uSick.value) * Math.min(1, dt * 3);
        m.body.scale.setScalar(PLANET_R * (1 + m.flash * 0.25));
        m.body.rotation.y += dt * 0.2;
        m.halo.material.opacity = (st ? 0.03 : 0.1) + m.flash * 0.7 + (sel === p.id ? 0.25 : 0);
        m.halo.scale.setScalar(4 + m.flash * 3 + (sel === p.id ? 1.5 : 0));
        m.starve.material.opacity += ((st ? 0.95 : 0) - m.starve.material.opacity) * Math.min(1, dt * 4);
        m.label.material.opacity = sel === p.id ? 1 : st ? 0.45 : 0.8;
        // moons are threads: harmony notes played just after the planet's
        while (m.moons.length < p.moons) {
          const mm = new THREE.Mesh(MOON, m.moonMat);
          mm.scale.setScalar(0.16);
          m.group.add(mm);
          m.moons.push(mm);
        }
        while (m.moons.length > p.moons) m.group.remove(m.moons.pop()!);
        m.moons.forEach((mm, i) => {
          const ma = t * (1.2 + i * 0.3) + i * 2.1;
          mm.position.set(Math.cos(ma) * (1.25 + i * 0.28), Math.sin(ma * 0.7) * 0.2, Math.sin(ma) * (1.25 + i * 0.28));
        });
        m.moonMat.emissiveIntensity = 0.3 + m.flash * 2;
      }
      // star pulses on every note; the outer glow blushes red when RT throttling steps in
      pulse = Math.max(0, pulse - dt * 3);
      red = Math.max(0, red - dt * 1.2);
      starMat.emissiveIntensity = 2 + pulse * 1.2;
      star.scale.setScalar(1.6 * (1 + pulse * 0.08));
      glowIn.material.opacity = 0.5 + pulse * 0.35;
      glowOut.material.color.setRGB(1, 0.72 - red * 0.45, 0.42 - red * 0.2);
      glowOut.material.opacity = 0.2 + red * 0.3;
      for (const b of beams) {
        b.life = Math.max(0, b.life - dt * 3.2);
        const m = meshes.get(b.id);
        b.m.opacity = m && sys.mode !== 'free' ? b.life * 0.9 : 0;
        if (m) {
          const arr = b.line.geometry.attributes.position.array as Float32Array;
          arr.set([0, 0, 0, m.pos.x, m.pos.y, m.pos.z]);
          b.line.geometry.attributes.position.needsUpdate = true;
        }
      }
      for (const r of ripples) {
        if (r.life <= 0) continue;
        r.life = Math.max(0, r.life - dt * 1.4);
        const m = meshes.get(r.id);
        if (m) r.s.position.copy(m.pos);
        r.s.scale.setScalar(1.5 + (1 - r.life) * 5);
        r.s.material.opacity = r.life * 0.7;
      }
      ringMats.forEach((m, i) => (m.opacity += ((i === hoverRing ? 0.55 : 0.16) - m.opacity) * Math.min(1, dt * 8)));
      playLineMat.opacity += ((sys.mode === 'free' ? 0.8 : 0) - playLineMat.opacity) * Math.min(1, dt * 4);
      if (!opts.reduced) dust.rotation.y += dt * 0.01;
      placeCamera(dt);
      bloom.render();
    },
    resize,
    pickPlanet(cx, cy) {
      const r = toNdc(cx, cy);
      let best: number | null = null, bd = 30;
      for (const [id, m] of meshes) {
        tmp.copy(m.pos).project(camera);
        const x = r.left + ((tmp.x + 1) / 2) * r.width, y = r.top + ((1 - tmp.y) / 2) * r.height;
        const d = Math.hypot(x - cx, y - cy);
        if (d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    },
    pickOrbit(cx, cy) {
      toNdc(cx, cy);
      ray.setFromCamera(ndc, camera);
      const hit = ray.ray.intersectPlane(plane, tmp);
      if (!hit) return null;
      const r = Math.hypot(hit.x, hit.z);
      let ring = -1, bd = 1.0;
      RINGS.forEach((rr, i) => {
        if (Math.abs(rr - r) < bd) {
          bd = Math.abs(rr - r);
          ring = i;
        }
      });
      if (ring < 0) return null;
      return { ring, angle: ((Math.atan2(-hit.z, hit.x) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) };
    },
    zoom(k) {
      goalDist = Math.max(24, Math.min(80, goalDist * k));
    },
    dispose() {
      for (const [id, m] of meshes) drop(id, m);
      bloom.dispose();
      disposeDeep(scene);
      [SPHERE, MOON].forEach(g => g.dispose());
      ringTex.dispose();
      soft.dispose();
      text.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
