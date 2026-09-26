import * as THREE from 'three';
import { ADD } from '@play/three-kit';
import { isThrottled, type Proc, type World } from '../sim';
import { COLORS, FLOOR, randomPoint, rnd, SURF, TD, TW, DISK } from './layout';

/** Visual state of one process. Everything here is view-only; the sim never sees it. */
export interface Planet {
  pid: number;
  g: THREE.Group;
  body: THREE.Group;
  mem: THREE.Mesh;
  mat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshBasicMaterial;
  nuc: THREE.Mesh;
  nucMat: THREE.MeshStandardMaterial;
  orgMat: THREE.MeshStandardMaterial;
  moons: { m: THREE.Mesh; ang: number; spd: number; r: number; tilt: number }[];
  halo: THREE.Sprite;
  ring: THREE.Mesh | null;
  base: THREE.Color;
  size: number;
  scale: number;
  grow: number | null;
  squish: number;
  ph: number;
  vel: THREE.Vector3;
  target: THREE.Vector3;
  retarget: number;
  home: THREE.Vector3;
  nsOff: THREE.Vector3;
}

const MEM_GEO = new THREE.SphereGeometry(1, 36, 24);
const NUC_GEO = new THREE.SphereGeometry(0.68, 48, 32);
const MOON_GEO = new THREE.SphereGeometry(0.12, 14, 10);
const RING_GEO = new THREE.RingGeometry(0.95, 1.45, 72);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Planet size follows resident memory (plus half of any COW-shared pages). */
export const sizeFor = (p: Proc) =>
  (p.kind === 'kernel' ? 0.5 : 0.72 + Math.log2(1 + p.rss + p.shared * 0.5) / 6.5) * (p.child ? 0.8 : 1);

export interface PlanetFrame {
  lens: World['view']['lens'];
  nsInside: boolean;
  selected: number | null;
  nsCenter: THREE.Vector3;
  cometFor: (pid: number) => THREE.Vector3 | null;
  oomPos: THREE.Vector3 | null;
}

export class PlanetSystem {
  readonly planets = new Map<number, Planet>();
  readonly pickables: THREE.Mesh[] = [];
  private lastPos = new Map<number, THREE.Vector3>();
  private bandCache = new Map<string, THREE.CanvasTexture>();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private soft: THREE.Texture, private world: World) {}

  private bandTexture(color: number, seed: number) {
    const key = `${color}:${seed}`;
    const hit = this.bandCache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d')!;
    const r = (color >> 16) & 255, gg = (color >> 8) & 255, b = color & 255;
    for (let y = 0; y < 128; y++) {
      const n = Math.sin(y * 0.19 + seed) * 0.5 + Math.sin(y * 0.53 + seed * 2.1) * 0.3 + Math.sin(y * 1.7 + seed * 0.7) * 0.12;
      const k = 0.72 + n * 0.28;
      g.fillStyle = `rgb(${Math.min(255, r * k) | 0},${Math.min(255, gg * k) | 0},${Math.min(255, b * k) | 0})`;
      g.fillRect(0, y, 256, 1);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,255,255,${rnd(0.02, 0.07)})`;
      g.beginPath();
      g.ellipse(rnd(0, 256), rnd(0, 128), rnd(8, 40), rnd(1, 4), 0, 0, 6.28);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this.bandCache.set(key, t);
    return t;
  }

  create(p: Proc, at: THREE.Vector3 | null, grow: boolean): Planet {
    const base = new THREE.Color(p.color);
    const g = new THREE.Group(), body = new THREE.Group();
    g.add(body);
    const mat = new THREE.MeshStandardMaterial({ color: base, emissive: base, emissiveIntensity: 0.2, transparent: true, opacity: 0.08, depthWrite: false });
    const mem = new THREE.Mesh(MEM_GEO, mat);
    mem.renderOrder = 2;
    mem.userData.pid = p.pid;
    body.add(mem);
    const rimMat = new THREE.MeshBasicMaterial({ color: base.clone(), transparent: true, opacity: 0.2, side: THREE.BackSide, depthWrite: false, blending: ADD });
    const rim = new THREE.Mesh(MEM_GEO, rimMat);
    rim.scale.setScalar(0.86);
    body.add(rim);
    const nucMat = new THREE.MeshStandardMaterial({
      map: this.bandTexture(p.color, p.pid % 7), color: 0xffffff, emissive: base, emissiveIntensity: 0.1, roughness: 0.85, metalness: 0, transparent: true, opacity: 1,
    });
    const nuc = new THREE.Mesh(NUC_GEO, nucMat);
    nuc.rotation.z = rnd(-0.4, 0.4);
    body.add(nuc);
    let ring: THREE.Mesh | null = null;
    if (p.rss >= 100) {
      ring = new THREE.Mesh(
        RING_GEO,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).lerp(base, 0.6), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
      );
      ring.rotation.x = Math.PI / 2 - 0.35;
      ring.rotation.y = 0.2;
      body.add(ring);
    }
    // moons are threads: they all share this planet (one address space)
    const orgMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xe8e4f0).lerp(base, 0.25), roughness: 0.9, transparent: true, opacity: 1, emissive: base, emissiveIntensity: 0.15 });
    const tilt = rnd(-0.5, 0.5);
    const moons = Array.from({ length: Math.min(p.threads - 1, 12) }, (_, i) => {
      const m = new THREE.Mesh(MOON_GEO, orgMat);
      m.scale.setScalar(rnd(0.7, 1.3));
      body.add(m);
      return { m, ang: rnd(0, 6.28), spd: rnd(0.5, 1.1), r: 1.12 + i * 0.07 + rnd(0, 0.05), tilt: tilt + rnd(-0.25, 0.25) };
    });
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.soft, color: base, transparent: true, opacity: 0.2, blending: ADD, depthWrite: false }));
    halo.scale.setScalar(3.4);
    body.add(halo);

    const size = sizeFor(p);
    const home = new THREE.Vector3(rnd(-18, 18), rnd(FLOOR + 2.2, FLOOR + 5.5), rnd(-9, 9));
    const nsOff = new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3));
    const start = at ? at.clone() : randomPoint();
    g.position.copy(start);
    g.scale.setScalar(grow ? 0.01 : size);
    this.scene.add(g);
    this.pickables.push(mem);

    const planet: Planet = {
      pid: p.pid, g, body, mem, mat, rimMat, nuc, nucMat, orgMat, moons, halo, ring, base, size,
      scale: grow ? 0.01 : size, grow: grow ? 0 : null, squish: 0, ph: rnd(0, 6.28),
      vel: new THREE.Vector3(rnd(-1, 1), 0, rnd(-1, 1)), target: start.clone(), retarget: 0, home, nsOff,
    };
    this.planets.set(p.pid, planet);
    return planet;
  }

  remove(pid: number) {
    const f = this.planets.get(pid);
    if (!f) return;
    this.lastPos.set(pid, f.g.position.clone());
    if (this.lastPos.size > 64) this.lastPos.delete(this.lastPos.keys().next().value!);
    this.scene.remove(f.g);
    const i = this.pickables.indexOf(f.mem);
    if (i >= 0) this.pickables.splice(i, 1);
    [f.mat, f.rimMat, f.nucMat, f.orgMat, f.halo.material].forEach(m => m.dispose());
    if (f.ring) (f.ring.material as THREE.Material).dispose();
    this.planets.delete(pid);
  }

  /** Create planets for processes the view has not seen, drop planets whose process is gone. */
  sync(nsCenter: THREE.Vector3) {
    for (const p of this.world.procs.values()) {
      if (!this.planets.has(p.pid)) this.create(p, p.ns ? nsCenter.clone().add(new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3))) : null, false);
    }
    for (const pid of [...this.planets.keys()]) if (!this.world.procs.has(pid)) this.remove(pid);
  }

  posOf(pid: number): THREE.Vector3 | undefined {
    return this.planets.get(pid)?.g.position ?? this.lastPos.get(pid);
  }

  /** A live getter for sparks that chase a moving (or vanished) planet. */
  follow(pid: number): () => THREE.Vector3 {
    let last = this.posOf(pid)?.clone() ?? new THREE.Vector3();
    return () => {
      const p = this.planets.get(pid);
      if (p) last = p.g.position.clone();
      return last;
    };
  }

  forked(parentPid: number, childPid: number) {
    const parent = this.planets.get(parentPid), child = this.planets.get(childPid);
    if (!parent || !child) return;
    const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 0.3), rnd(-1, 1)).normalize();
    parent.squish = 0.35;
    parent.vel.addScaledVector(dir, -2.5);
    child.vel.copy(dir).multiplyScalar(4.5);
  }

  update(dt: number, t: number, fr: PlanetFrame) {
    const w = this.world;
    const sd = this.planets.get(1);
    const tmp = this.tmp;
    for (const f of this.planets.values()) {
      const p = w.procs.get(f.pid);
      if (!p) continue;
      const pos = f.g.position;
      const onCpu = p.onCpu >= 0, R = f.size;
      const comet = p.state === 'R' ? fr.cometFor(p.pid) : null;
      let speed = 0.8, arrive = 1.4;

      if (p.oomT !== null && fr.oomPos) {
        f.target.copy(fr.oomPos);
        speed = 5;
        arrive = 0;
      } else if (p.state === 'Z') {
        f.target.set(pos.x * 1.02, SURF - 1.2 - R * 0.6, pos.z);
        speed = 0.45;
      } else if (p.state === 'T') {
        f.target.copy(pos);
        speed = 0;
      } else if (p.adoptUntil && sd && f !== sd) {
        f.target.copy(sd.g.position).add(this.tmp2.set(Math.cos(p.pid) * 4, 1, Math.sin(p.pid) * 4));
        speed = 3;
      } else if (p.state === 'R') {
        if (comet) {
          f.target.copy(comet);
          speed = 3.6;
          arrive = 0;
        } else {
          f.retarget -= dt;
          if (f.retarget <= 0 || pos.distanceTo(f.target) < 1.5) {
            f.target.copy(p.ns ? fr.nsCenter.clone().add(new THREE.Vector3(rnd(-3.5, 3.5), rnd(-2.5, 2.5), rnd(-3.5, 3.5))) : randomPoint());
            f.retarget = rnd(5, 10);
          }
          speed = onCpu ? 3.4 : 1.8;
        }
      } else if (p.state === 'D') {
        f.target.set(DISK.x + Math.cos(p.pid) * 3.4, DISK.y + 2 + Math.sin(t + p.pid) * 0.3, DISK.z + Math.sin(p.pid) * 3.4);
        speed = 2.2;
      } else if (p.ns) {
        f.target.copy(fr.nsCenter).add(f.nsOff);
      } else {
        f.target.set(
          f.home.x + Math.sin(t * 0.15 + p.pid) * 1.6,
          f.home.y + Math.sin(t * 0.4 + p.pid) * 0.5,
          f.home.z + Math.cos(t * 0.15 + p.pid) * 1.6,
        );
      }

      tmp.copy(f.target).sub(pos);
      const d = tmp.length();
      const want = d < arrive ? 0 : speed * Math.min(1, d / 3);
      if (d > 0.001) tmp.multiplyScalar(want / d);
      f.vel.lerp(tmp, Math.min(1, dt * 0.9));
      pos.addScaledVector(f.vel, dt);
      pos.x = Math.max(-TW / 2 + R, Math.min(TW / 2 - R, pos.x));
      pos.y = Math.max(FLOOR + R + 0.3, Math.min(SURF - R * 0.5, pos.y));
      pos.z = Math.max(-TD / 2 + R, Math.min(TD / 2 - R, pos.z));
      if (p.oomT === null) {
        for (const o of this.planets.values()) {
          if (o === f) continue;
          const q = w.procs.get(o.pid);
          if (q && q.oomT !== null) continue;
          tmp.copy(pos).sub(o.g.position);
          const dd = tmp.length(), min = (R + o.size) * 1.05;
          if (dd > 0.0001 && dd < min) pos.addScaledVector(tmp, ((min - dd) / dd) * Math.min(1, dt * 3));
        }
      }

      // size follows resident memory
      if (f.grow !== null && f.grow < 1) f.grow = Math.min(1, f.grow + dt * 0.9);
      const growK = f.grow === null ? 1 : 1 - Math.pow(1 - f.grow, 3);
      const oomK = p.oomT !== null ? Math.max(0.02, 1 - (w.clock.t - p.oomT) / 2.6) : 1;
      f.size += (sizeFor(p) - f.size) * Math.min(1, dt * 0.8);
      f.scale += (f.size * growK * oomK - f.scale) * Math.min(1, dt * 4);
      f.g.scale.setScalar(Math.max(0.01, f.scale));

      f.ph += dt * (onCpu ? 3.2 : p.state === 'R' ? 1.8 : 0.9);
      f.squish *= Math.max(0, 1 - dt * 2.2);
      const wob = 0.012;
      f.body.scale.set(
        1 + wob * Math.sin(f.ph) + f.squish,
        1 + wob * Math.sin(f.ph + 2.1) - f.squish * 0.5,
        1 + wob * Math.sin(f.ph + 4.2) - f.squish * 0.5,
      );

      const orbit = p.state === 'Z' || p.state === 'T' ? 0 : onCpu ? 2.4 : p.state === 'R' ? 1.0 : 0.22;
      for (const o of f.moons) {
        o.ang += dt * o.spd * orbit;
        tmp.set(Math.cos(o.ang) * o.r, 0, Math.sin(o.ang) * o.r).applyAxisAngle(X_AXIS, o.tilt);
        o.m.position.copy(tmp);
      }
      if (p.state !== 'T') f.nuc.rotation.y += dt * (onCpu ? 0.8 : 0.2);

      // looks
      const dim = fr.lens === 'namespaces' && fr.nsInside && !p.ns;
      const thr = isThrottled(w, p.service);
      const k = Math.min(1, dt * 3);
      const glow = dim || p.state === 'Z' ? 0 : onCpu ? 0.75 + Math.sin(t * 6) * 0.1 : p.state === 'R' ? 0.28 : p.state === 'D' ? 0.22 + Math.sin(t * 3 + p.pid) * 0.16 : 0.05;
      f.nucMat.emissiveIntensity += (glow - f.nucMat.emissiveIntensity) * k;
      f.nucMat.opacity += ((dim ? 0.1 : 1) - f.nucMat.opacity) * k;
      const haloOp = dim || p.state === 'Z' ? 0 : onCpu ? 0.7 : p.state === 'R' ? 0.26 : p.state === 'D' ? 0.22 : 0.08;
      f.halo.material.opacity += ((p.pid === fr.selected ? Math.max(haloOp, 0.55) : haloOp) - f.halo.material.opacity) * k;
      f.mat.opacity += ((dim || p.state === 'Z' ? 0 : p.state === 'S' ? 0.04 : 0.09) - f.mat.opacity) * k;
      f.rimMat.opacity += ((dim || p.state === 'Z' ? 0 : thr ? 0.6 : onCpu ? 0.42 : p.state === 'S' || p.state === 'T' ? 0.1 : 0.2) - f.rimMat.opacity) * k;
      f.rimMat.color.lerp(thr ? COLORS.red : p.policy === 'FIFO' ? COLORS.rt : f.base, Math.min(1, dt * 3));
      f.orgMat.opacity += ((dim || p.state === 'Z' ? 0 : 1) - f.orgMat.opacity) * Math.min(1, dt * 0.8);
      if (f.ring) {
        const rm = f.ring.material as THREE.MeshBasicMaterial;
        rm.opacity += ((dim || p.state === 'Z' ? 0 : 0.35) - rm.opacity) * k;
      }
      const nucScale = p.state === 'Z' ? 0.6 : 1;
      f.nuc.scale.setScalar(f.nuc.scale.x + (nucScale - f.nuc.scale.x) * Math.min(1, dt * 0.8));
      if (p.state === 'Z') f.nucMat.color.lerp(COLORS.zombie, dt * 0.6);
      else if (p.state === 'T') f.nucMat.color.lerp(COLORS.stop, dt * 2);
      else f.nucMat.color.lerp(COLORS.white, Math.min(1, dt * 2));
    }
  }

  dispose() {
    for (const pid of [...this.planets.keys()]) this.remove(pid);
    this.bandCache.forEach(t => t.dispose());
    this.bandCache.clear();
  }
}

export const SHARED_GEOMETRIES = [MEM_GEO, NUC_GEO, MOON_GEO, RING_GEO];
