import * as THREE from 'three';
import { ADD } from '@play/three-kit';

/** A fixed pool of coloured points, refilled every frame. */
export class PointPool {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0;

  constructor(scene: THREE.Scene, tex: THREE.Texture, private cap: number, size: number, opacity = 1) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size, map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, blending: ADD,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  begin() {
    this.n = 0;
  }

  add(p: THREE.Vector3, c: THREE.Color, k = 1) {
    if (this.n >= this.cap) return;
    const i = this.n++ * 3;
    this.pos[i] = p.x;
    this.pos[i + 1] = p.y;
    this.pos[i + 2] = p.z;
    this.col[i] = c.r * k;
    this.col[i + 1] = c.g * k;
    this.col[i + 2] = c.b * k;
  }

  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.points);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Lost packets: small embers that drift down and fade. */
export class Embers {
  private list: { p: THREE.Vector3; v: THREE.Vector3; life: number; c: THREE.Color }[] = [];
  constructor(private pool: PointPool) {}
  spawn(at: THREE.Vector3, c: THREE.Color) {
    if (this.list.length > 160) return;
    for (let i = 0; i < 3; i++) {
      this.list.push({
        p: at.clone(),
        v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2 + Math.random() * 0.3, (Math.random() - 0.5) * 0.6),
        life: 2.4,
        c,
      });
    }
  }
  update(dt: number) {
    this.pool.begin();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      e.v.y -= 0.25 * dt;
      e.p.addScaledVector(e.v, dt);
      this.pool.add(e.p, e.c, e.life / 2.4);
    }
    this.pool.end();
  }
}
