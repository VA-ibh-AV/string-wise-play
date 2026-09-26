import * as THREE from 'three';
import { ADD, glowSprite, type TextFactory } from '@play/three-kit';
import { KINDS } from '../content/kinds';
import { K, type GNode, type World } from '../sim';
import { FLOAT, RADIUS, toWorld } from './layout';
import { buildSatellite, SATELLITE_GEOMETRIES } from './probe';
import { atmosphereMaterial, beamMaterial, nebulaCloud, planetMaterial } from './shaders';

const SPHERE = new THREE.SphereGeometry(1, 48, 32);
const MOON = new THREE.SphereGeometry(1, 14, 10);
const TORUS = new THREE.TorusGeometry(1, 0.02, 8, 128);
const RING = new THREE.RingGeometry(1.35, 1.9, 96);
const ORBIT = new THREE.TorusGeometry(1, 0.006, 4, 96);

/** Textures and settings every body shares. */
export interface BodyKit {
  soft: THREE.Texture;
  ringTex: THREE.Texture;
  flare: THREE.Texture;
  text: TextFactory;
  light: THREE.Vector3;
  reduced: boolean;
  low: boolean;
}

/** One body's meshes and its short-lived effects. View-only. */
export class Body {
  readonly group = new THREE.Group();
  /** Where the body is drawn (bobs gently). */
  readonly pos = new THREE.Vector3();
  /** Where lanes attach (does not bob, so lanes are only rebuilt when a body is moved). */
  readonly anchor = new THREE.Vector3();
  readonly r: number;
  private spin = new THREE.Group();
  private halo: THREE.Sprite;
  private sel: THREE.Sprite;
  private hi: THREE.Sprite;
  private pulse: THREE.Sprite;
  private flare = 0;
  private bloom = 0;
  private wilt = 0;
  private ripple = 0;
  private highlighted = false;
  private phase = Math.random() * 6.28;
  private base: THREE.Color;
  private mats: THREE.Material[] = [];
  private core?: THREE.Mesh;
  private coreMat?: THREE.MeshStandardMaterial;
  private planetMat?: THREE.ShaderMaterial;
  private atmos?: THREE.Mesh;
  private beacon?: THREE.Sprite;
  private beams: THREE.ShaderMaterial[] = [];
  private cloud?: THREE.Points;
  private moons: THREE.Mesh[] = [];
  private moonMats: THREE.MeshStandardMaterial[] = [];
  private orbitLine?: THREE.Mesh;
  private motes: THREE.Sprite[] = [];
  private label: THREE.Sprite;

  constructor(private n: GNode, scene: THREE.Scene, private kit: BodyKit) {
    const kind = KINDS[n.type];
    this.r = RADIUS[n.type];
    this.base = new THREE.Color(kind.color);
    const g = this.group;
    g.add(this.spin);
    this.halo = glowSprite(kit.soft, this.base, this.r * 4, 0.12);
    g.add(this.halo);

    switch (n.type) {
      case 'client': {
        const sat = buildSatellite();
        sat.group.scale.setScalar(1.25);
        this.spin.add(sat.group);
        this.mats.push(...sat.materials);
        this.beacon = glowSprite(kit.soft, 0xf5a8c3, 0.9, 0.9);
        this.beacon.position.y = 0.42;
        g.add(this.beacon);
        break;
      }
      case 'router': {
        this.coreMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: this.base, emissiveIntensity: 1.6 });
        this.core = new THREE.Mesh(SPHERE, this.coreMat);
        this.core.scale.setScalar(this.r * 0.55);
        g.add(this.core);
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.flare, color: this.base, transparent: true, opacity: 0.55, blending: ADD, depthWrite: false }));
        fl.scale.setScalar(this.r * 5.5);
        g.add(fl);
        this.mats.push(fl.material);
        const ring = new THREE.Mesh(TORUS, new THREE.MeshBasicMaterial({ color: this.base, transparent: true, opacity: 0.35, blending: ADD, depthWrite: false }));
        ring.scale.setScalar(this.r * 1.9);
        ring.rotation.x = Math.PI / 2.4;
        this.spin.add(ring);
        this.mats.push(ring.material as THREE.Material);
        break;
      }
      case 'lb': {
        this.coreMat = new THREE.MeshStandardMaterial({ color: 0x0a2a22, emissive: this.base, emissiveIntensity: 1.4 });
        this.core = new THREE.Mesh(SPHERE, this.coreMat);
        this.core.scale.setScalar(this.r * 0.55);
        g.add(this.core);
        // lighthouse beams from the poles
        const tilt = new THREE.Group();
        tilt.rotation.z = 0.45;
        this.spin.add(tilt);
        for (const s of [1, -1]) {
          const geo = new THREE.CylinderGeometry(0.02, 0.55, 4.2, 24, 1, true);
          geo.translate(0, 2.1 + this.r * 0.4, 0);
          const m = beamMaterial(kind.color);
          const cone = new THREE.Mesh(geo, m);
          if (s < 0) cone.rotation.z = Math.PI;
          tilt.add(cone);
          this.beams.push(m);
          this.mats.push(m);
        }
        // magnetic field loops
        for (const rot of [0, Math.PI / 2]) {
          const loop = new THREE.Mesh(TORUS, new THREE.MeshBasicMaterial({ color: this.base, transparent: true, opacity: 0.22, blending: ADD, depthWrite: false }));
          loop.scale.set(this.r * 1.4, this.r * 2.2, this.r * 1.4);
          loop.rotation.set(0, rot, 0.45);
          this.spin.add(loop);
          this.mats.push(loop.material as THREE.Material);
        }
        break;
      }
      case 'server': {
        this.planetMat = planetMaterial(kind.color, n.id, kit.light);
        this.core = new THREE.Mesh(SPHERE, this.planetMat);
        this.core.scale.setScalar(this.r);
        this.core.rotation.z = 0.25;
        this.spin.add(this.core);
        const atm = atmosphereMaterial(kind.color, 1.1);
        this.atmos = new THREE.Mesh(SPHERE, atm);
        this.atmos.scale.setScalar(this.r * 1.18);
        g.add(this.atmos);
        this.mats.push(this.planetMat, atm);
        if (n.id % 2 === 0) {
          const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(kind.color).lerp(new THREE.Color('#ffffff'), 0.4), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
          const ring = new THREE.Mesh(RING, ringMat);
          ring.scale.setScalar(this.r);
          ring.rotation.set(Math.PI / 2 - 0.4, 0.2, 0);
          g.add(ring);
          this.mats.push(ringMat);
        }
        this.orbitLine = new THREE.Mesh(ORBIT, new THREE.MeshBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 0.12, blending: ADD, depthWrite: false }));
        this.orbitLine.scale.setScalar(this.r * 1.6);
        this.orbitLine.rotation.x = Math.PI / 2;
        g.add(this.orbitLine);
        this.mats.push(this.orbitLine.material as THREE.Material);
        break;
      }
      case 'cache': {
        this.cloud = nebulaCloud(kit.low ? 220 : 520, this.r * 1.9, ['#8FB8FF', '#B08FFF', '#7FD8FF', '#E7B4FF']);
        g.add(this.cloud);
        this.mats.push(this.cloud.material as THREE.Material);
        this.coreMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xdfe8ff, emissiveIntensity: 1.2 });
        this.core = new THREE.Mesh(SPHERE, this.coreMat);
        this.core.scale.setScalar(0.16);
        g.add(this.core);
        break;
      }
    }
    if (this.coreMat) this.mats.push(this.coreMat);

    const mk = (color: number, op: number) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: kit.ringTex, color, transparent: true, opacity: op, depthWrite: false, blending: ADD }));
      g.add(s);
      this.mats.push(s.material);
      return s;
    };
    this.sel = mk(0xffe7a8, 0);
    this.sel.scale.setScalar(this.r * 3.6);
    this.hi = mk(0xffe7a8, 0);
    this.pulse = mk(0xb89dff, 0);

    this.label = kit.text.sprite(`${kind.label} ${n.name}`, kind.color, 0.62);
    this.label.material.opacity = 0.75;
    this.label.position.y = -this.r - (n.type === 'cache' ? 1.05 : 0.72);
    g.add(this.label);
    this.mats.push(this.label.material);
    scene.add(g);
  }

  flash(kind: 'lsa' | 'bloom' | 'wilt' | 'ripple') {
    if (kind === 'lsa') this.flare = 1;
    else if (kind === 'bloom') this.bloom = 1;
    else if (kind === 'wilt') this.wilt = 1;
    else this.ripple = 1;
  }

  setHighlight(on: boolean) {
    this.highlighted = on;
  }

  private syncMoons(count: number) {
    while (this.moons.length < count) {
      const m = new THREE.MeshStandardMaterial({ color: 0x2a2f48, emissive: 0xffd27a, emissiveIntensity: 0, roughness: 0.8 });
      const mesh = new THREE.Mesh(MOON, m);
      mesh.scale.setScalar(0.1);
      this.group.add(mesh);
      this.moons.push(mesh);
      this.moonMats.push(m);
    }
    while (this.moons.length > count) {
      this.group.remove(this.moons.pop()!);
      this.moonMats.pop()!.dispose();
    }
  }

  private syncMotes(count: number, color: number, size: number) {
    while (this.motes.length < count) {
      const s = glowSprite(this.kit.soft, color, size, 0.9);
      this.group.add(s);
      this.motes.push(s);
    }
    while (this.motes.length > count) {
      const s = this.motes.pop()!;
      this.group.remove(s);
      s.material.dispose();
    }
  }

  update(dt: number, t: number, w: World, selected: boolean) {
    const n = this.n, still = this.kit.reduced;
    toWorld(n.x, n.y, this.anchor);
    this.anchor.y = FLOAT[n.type];
    this.pos.copy(this.anchor);
    if (!still) this.pos.y += Math.sin(t * 0.35 + this.phase) * 0.1;
    this.group.position.copy(this.pos);
    const k = Math.min(1, dt * 3);

    this.flare = Math.max(0, this.flare - dt * 0.7);
    this.bloom = Math.max(0, this.bloom - dt * 1.3);
    this.wilt = Math.max(0, this.wilt - dt);
    this.ripple = Math.max(0, this.ripple - dt * 1.1);

    // routing news: a violet shockwave; selection: a slow gold ring; journey target: a breathing ring
    this.pulse.material.opacity = this.flare * 0.8;
    this.pulse.scale.setScalar(this.r * (2 + (1 - this.flare) * 6));
    this.sel.material.opacity += ((selected ? 0.7 : 0) - this.sel.material.opacity) * k;
    if (!still) this.sel.material.rotation += dt * 0.3;
    const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 380);
    this.hi.material.opacity += ((this.highlighted ? 0.45 + breathe * 0.5 : 0) - this.hi.material.opacity) * Math.min(1, dt * 6);
    this.hi.scale.setScalar(this.r * (4.2 + breathe * 1.2));

    let haloOp = 0.1 + this.bloom * 0.35;
    this.halo.material.color.copy(this.wilt > 0 ? this.base.clone().lerp(WILT, this.wilt) : this.base);

    switch (n.type) {
      case 'client':
        if (!still) this.spin.rotation.y += dt * 0.25;
        this.beacon!.material.opacity = 0.35 + (still ? 0.3 : 0.3 * (0.5 + 0.5 * Math.sin(t * 1.6 + this.phase))) + this.bloom * 0.6;
        if (w.t - n.noroute < 2) haloOp = 0.02;
        break;
      case 'router':
        if (!still) this.spin.rotation.y += dt * 0.2;
        this.coreMat!.emissiveIntensity = 1.4 + Math.sin(t * 1.1 + this.phase) * 0.15 + this.flare * 1.2;
        break;
      case 'lb': {
        if (!still) this.spin.rotation.y += dt * 0.6;
        const recent = n.lastPick != null && w.t - n.lastPickT < 0.4;
        for (const m of this.beams) m.uniforms.uStrength.value += ((recent ? 0.75 : 0.45) - m.uniforms.uStrength.value) * k;
        break;
      }
      case 'server': {
        const pm = this.planetMat!;
        pm.uniforms.uTime.value = still ? 0 : t;
        pm.uniforms.uSick.value += ((n.mode === 'slow' ? 1 : 0) - pm.uniforms.uSick.value) * k;
        pm.uniforms.uDown.value += ((n.mode === 'down' ? 1 : 0) - pm.uniforms.uDown.value) * k;
        if (!still && n.mode !== 'down') this.spin.rotation.y += dt * 0.08;
        (this.atmos!.material as THREE.ShaderMaterial).uniforms.uStrength.value = n.mode === 'down' ? 0.1 : n.mode === 'slow' ? 0.7 : 1.1;
        haloOp = n.mode === 'down' ? 0 : 0.08;
        this.syncMoons(n.mode === 'down' ? 0 : n.conc);
        this.moons.forEach((m, i) => {
          const a = (i / this.moons.length) * Math.PI * 2 + (still ? 0 : t * 0.22);
          m.position.set(Math.cos(a) * this.r * 1.6, 0, Math.sin(a) * this.r * 1.6);
          const busy = i < n.busy.length;
          this.moonMats[i].emissiveIntensity += ((busy ? 2.2 : 0.05) - this.moonMats[i].emissiveIntensity) * k;
          m.scale.setScalar(busy ? 0.13 : 0.09);
        });
        // requests waiting in the queue: small amber lights stacked beside it
        this.syncMotes(Math.min(n.queue.length, 20), 0xffb24a, 0.3);
        this.motes.forEach((s, i) => s.position.set(this.r + 0.55 + Math.floor(i / 5) * 0.3, -0.55 + (i % 5) * 0.27, 0));
        break;
      }
      case 'cache': {
        const cm = this.cloud!.material as THREE.ShaderMaterial;
        cm.uniforms.uTime.value = still ? 0 : t;
        cm.uniforms.uGlow.value = 1 + this.ripple * 1.2;
        this.coreMat!.emissiveIntensity = 1.2 + this.ripple * 2;
        // crystals it holds orbit as coloured gems, fading as their TTL runs out
        this.syncMotes(n.store.size, 0xffffff, 0.26);
        let i = 0;
        for (const [key, e] of n.store) {
          const s = this.motes[i++];
          const a = (key / K) * Math.PI * 2 + (still ? 0 : t * 0.07);
          s.position.set(Math.cos(a) * this.r * 2.1, Math.sin(key * 1.7) * 0.2, Math.sin(a) * this.r * 2.1);
          const life = Math.max(0, Math.min(1, (e.exp - w.t) / n.ttl));
          s.material.color.setHSL(((key * 137.5) % 360) / 360, 0.75, 0.65);
          s.material.opacity = 0.2 + life * 0.8;
        }
        haloOp = 0.06 + this.ripple * 0.3;
        break;
      }
    }
    this.halo.material.opacity += (haloOp - this.halo.material.opacity) * k;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    this.syncMoons(0);
    this.syncMotes(0, 0, 0);
    this.halo.material.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse(o => {
      const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geo && !SHARED.includes(geo)) geo.dispose();
    });
  }
}

const WILT = new THREE.Color('#FF7B8F');
const SHARED: THREE.BufferGeometry[] = [SPHERE, MOON, TORUS, RING, ORBIT, ...SATELLITE_GEOMETRIES];
export const SHARED_GEOMETRIES = SHARED;
