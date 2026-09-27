import * as THREE from 'three';
import type { Dir, Link, World } from '../sim';
import { laneMaterial } from './shaders';

export interface LaneGeom {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
  len: number;
}

/** Quadratic lane between two bodies, bowed sideways and arched up a little. */
export function laneGeom(L: Link, a: THREE.Vector3, b: THREE.Vector3, out?: LaneGeom): LaneGeom {
  const g = out ?? { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), len: 1 };
  g.a.copy(a);
  g.b.copy(b);
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const k = L.curve * len;
  g.c.set((a.x + b.x) / 2 - (dz / len) * k, (a.y + b.y) / 2 + len * 0.06, (a.z + b.z) / 2 + (dx / len) * k);
  g.len = len;
  return g;
}

export function qpt(g: LaneGeom, t: number, out = new THREE.Vector3()) {
  const u = 1 - t;
  return out.set(
    u * u * g.a.x + 2 * u * t * g.c.x + t * t * g.b.x,
    u * u * g.a.y + 2 * u * t * g.c.y + t * t * g.b.y,
    u * u * g.a.z + 2 * u * t * g.c.z + t * t * g.b.z,
  );
}

/** A point on the lane for direction d; lane > 0 offsets sideways so the two directions don't overlap. */
export function posOnLane(g: LaneGeom, d: Dir, prog: number, lane: number, out = new THREE.Vector3()) {
  const t = d === 'ab' ? prog : 1 - prog;
  qpt(g, t, out);
  if (lane) {
    const tx = 2 * (1 - t) * (g.c.x - g.a.x) + 2 * t * (g.b.x - g.c.x);
    const tz = 2 * (1 - t) * (g.c.z - g.a.z) + 2 * t * (g.b.z - g.c.z);
    const l = Math.hypot(tx, tz) || 1, s = d === 'ab' ? 1 : -1;
    out.x += (-tz / l) * lane * s;
    out.z += (tx / l) * lane * s;
  }
  return out;
}

/** Part of a lane, as a curve TubeGeometry can follow. */
class LaneCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private g: LaneGeom, private t0: number, private t1: number) {
    super();
  }
  getPoint(t: number, out = new THREE.Vector3()) {
    return qpt(this.g, this.t0 + (this.t1 - this.t0) * t, out);
  }
}

interface LaneMesh {
  meshes: THREE.Mesh[];
  mat: THREE.ShaderMaterial;
  g: LaneGeom;
  key: string;
}

const CUT = new THREE.Color('#A0624E'), BASE = new THREE.Color('#4C66B8'), SEL = new THREE.Color('#FFE7A8');
const OK_PATH = new THREE.Color('#9EF0B8'), BAD_PATH = new THREE.Color('#FF7B8F'), NONE = new THREE.Color(0, 0, 0);

/** Lanes of light: glowing tubes with drifting dashes; a cut lane shows a gap. */
export class LaneSystem {
  private lanes = new Map<number, LaneMesh>();
  private highlight: number | null = null;

  constructor(private scene: THREE.Scene, private segments: number, private reduced: boolean) {}

  geom(id: number) {
    return this.lanes.get(id)?.g;
  }

  setHighlight(id: number | null) {
    this.highlight = id;
  }

  private rebuild(m: LaneMesh, up: boolean) {
    for (const mesh of m.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    const ranges: [number, number][] = up ? [[0, 1]] : [[0, 0.4], [0.6, 1]];
    m.meshes = ranges.map(([t0, t1]) => {
      const n = Math.max(6, Math.round(this.segments * (t1 - t0)));
      const geo = new THREE.TubeGeometry(new LaneCurve(m.g, t0, t1), n, up ? 0.06 : 0.045, 6, false);
      const mesh = new THREE.Mesh(geo, m.mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    });
  }

  update(w: World, t: number, anchorOf: (id: number) => THREE.Vector3 | undefined, sel: number | null, path: Map<number, boolean>) {
    for (const [id, m] of this.lanes) {
      const L = w.links.get(id);
      if (!L || L.removed) this.drop(id, m);
    }
    for (const L of w.links.values()) {
      if (L.removed) continue;
      const a = anchorOf(L.a), b = anchorOf(L.b);
      if (!a || !b) continue;
      let m = this.lanes.get(L.id);
      if (!m) {
        m = { meshes: [], mat: laneMaterial(), g: { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), len: 1 }, key: '' };
        this.lanes.set(L.id, m);
      }
      // rebuild the tube only when an end moves or the lane is cut / reconnected
      const key = `${a.x.toFixed(2)},${a.z.toFixed(2)},${b.x.toFixed(2)},${b.z.toFixed(2)},${L.up}`;
      if (key !== m.key) {
        laneGeom(L, a, b, m.g);
        this.rebuild(m, L.up);
        m.key = key;
      }
      const u = m.mat.uniforms;
      u.uTime.value = this.reduced ? 0 : t;
      u.uLen.value = m.g.len;
      const onPath = path.get(L.id);
      if (!L.up) {
        u.uColor.value.copy(CUT);
        u.uBusy.value = 0;
        u.uGain.value = 0.9;
        u.uPath.value.copy(NONE);
      } else {
        u.uColor.value.copy(sel === L.id ? SEL : BASE);
        u.uBusy.value += (Math.min(1, (L.util.ab + L.util.ba) / 16) - u.uBusy.value) * 0.1;
        u.uGain.value = 1;
        u.uPath.value.copy(onPath === undefined ? NONE : onPath ? OK_PATH : BAD_PATH);
      }
      const breathe = this.reduced ? 0.6 : 0.5 + 0.5 * Math.sin(performance.now() / 380);
      u.uPulse.value = this.highlight === L.id ? breathe : 0;
    }
  }

  private drop(id: number, m: LaneMesh) {
    for (const mesh of m.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    m.mat.dispose();
    this.lanes.delete(id);
  }

  /** Points along a lane, for picking. */
  samples(id: number, count: number, out: THREE.Vector3[]) {
    const m = this.lanes.get(id);
    if (!m) return out;
    for (let i = 0; i <= count; i++) out.push(qpt(m.g, i / count));
    return out;
  }

  dispose() {
    for (const [id, m] of this.lanes) this.drop(id, m);
  }
}
