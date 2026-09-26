import * as THREE from 'three';

export const ADD = THREE.AdditiveBlending;

/** Radial soft dot used by every glow. */
export function softTexture(size = 128): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const h = size / 2;
  const r = g.createRadialGradient(h, h, size / 32, h, h, h);
  r.addColorStop(0, 'rgba(255,255,255,0.8)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

export function glowSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, size: number, opacity: number): THREE.Sprite {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: ADD, depthWrite: false, fog: false }),
  );
  s.scale.setScalar(size);
  return s;
}

/** Text sprites with cached canvas textures. One factory per view so it can be disposed. */
export function createTextFactory(font = '"JetBrains Mono", ui-monospace, monospace') {
  const cache = new Map<string, { t: THREE.CanvasTexture; aspect: number }>();
  const texture = (text: string, color: string, weight = 500) => {
    const key = `${text}\u0000${color}\u0000${weight}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = `${weight} 30px ${font}`;
    const w = Math.ceil(g.measureText(text).width) + 24;
    c.width = w;
    c.height = 48;
    g.font = `${weight} 30px ${font}`;
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.fillText(text, 12, 25);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    const r = { t, aspect: w / 48 };
    // popups are mostly unique strings; keep the cache bounded
    if (cache.size > 400) {
      const first = cache.keys().next().value!;
      cache.get(first)!.t.dispose();
      cache.delete(first);
    }
    cache.set(key, r);
    return r;
  };
  return {
    sprite(text: string, color: string, h = 0.7, weight = 500): THREE.Sprite {
      const { t, aspect } = texture(text, color, weight);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
      s.scale.set(h * aspect, h, 1);
      return s;
    },
    dispose() {
      cache.forEach(v => v.t.dispose());
      cache.clear();
    },
  };
}
export type TextFactory = ReturnType<typeof createTextFactory>;

/** A pool of two-point lines that are moved every frame instead of reallocated. */
export function linePool(scene: THREE.Object3D, color: THREE.ColorRepresentation, n: number): THREE.Line[] {
  const arr: THREE.Line[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, blending: ADD, depthWrite: false }));
    l.frustumCulled = false;
    scene.add(l);
    arr.push(l);
  }
  return arr;
}

export function setLine(l: THREE.Line, a: THREE.Vector3, b: THREE.Vector3, opacity: number, color?: THREE.Color) {
  const attr = l.geometry.attributes.position as THREE.BufferAttribute;
  const p = attr.array as Float32Array;
  p[0] = a.x; p[1] = a.y; p[2] = a.z; p[3] = b.x; p[4] = b.y; p[5] = b.z;
  attr.needsUpdate = true;
  const m = l.material as THREE.LineBasicMaterial;
  m.opacity = opacity;
  if (color) m.color.copy(color);
}

type Target = THREE.Vector3 | (() => THREE.Vector3);

/** Glowing motes that travel from A to B along an arc. B may move. */
export class SparkSystem {
  private list: { s: THREE.Sprite; from: THREE.Vector3; to: Target; t: number; dur: number; arc: number }[] = [];
  constructor(private scene: THREE.Object3D, private tex: THREE.Texture) {}

  add(from: THREE.Vector3, to: Target, color: THREE.ColorRepresentation, dur: number, size = 0.9, arc = 1.5) {
    const s = glowSprite(this.tex, color, size, 0.95);
    s.position.copy(from);
    this.scene.add(s);
    this.list.push({ s, from: from.clone(), to, t: 0, dur: Math.max(0.05, dur), arc });
  }

  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.t += dt / k.dur;
      const to = typeof k.to === 'function' ? k.to() : k.to;
      const e = Math.min(1, k.t);
      const s = e * e * (3 - 2 * e);
      k.s.position.copy(k.from).lerp(to, s);
      k.s.position.y += Math.sin(Math.PI * e) * k.arc;
      if (k.t >= 1) {
        this.scene.remove(k.s);
        k.s.material.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  get count() {
    return this.list.length;
  }

  dispose() {
    for (const k of this.list) {
      this.scene.remove(k.s);
      k.s.material.dispose();
    }
    this.list = [];
  }
}

/** Distant star points on a shell. */
export function starfield(n: number, rMin: number, rMax: number, rand: () => number = Math.random): THREE.Points {
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tints = [0xffffff, 0xcfd8ff, 0xffe7c4, 0xb9c8ff].map(c => new THREE.Color(c));
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize().multiplyScalar(rMin + rand() * (rMax - rMin));
    pos.set([v.x, v.y, v.z], i * 3);
    const t = tints[Math.floor(rand() * tints.length)].clone().multiplyScalar(0.35 + rand() * 0.65);
    col.set([t.r, t.g, t.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(
    g,
    new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.95 }),
  );
}

/** Dispose every geometry, material and texture under an object. */
export function disposeDeep(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach(x => mats.add(x));
    else if (mat) mats.add(mat);
  });
  geos.forEach(g => g.dispose());
  mats.forEach(m => {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    m.dispose();
  });
}

/**
 * Orbit camera that can follow a target. Drag to orbit, wheel or pinch to zoom.
 * `step` must be called every frame.
 */
export class OrbitFollowCamera {
  theta = 0.55;
  phi = 1.22;
  r = 46;
  goalR = 46;
  target = new THREE.Vector3(0, -1, 0);
  goal = new THREE.Vector3(0, -1, 0);
  lastInteract = -99;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  dragged = false;
  private downAt: { x: number; y: number } | null = null;

  constructor(
    public camera: THREE.PerspectiveCamera,
    private el: HTMLElement,
    private opts: { minR: number; maxR: number; restR: number; home: THREE.Vector3; reduced: boolean },
  ) {
    this.goal.copy(opts.home);
    this.target.copy(opts.home);
    this.r = this.goalR = opts.restR;
  }

  /** Returns true if the pointer is now a drag (so the caller can skip picking). */
  pointerDown(e: PointerEvent, now: number) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.downAt = { x: e.clientX, y: e.clientY };
      this.dragged = false;
    } else if (this.pointers.size === 2) {
      this.pinchDist = this.pinchDistance();
      this.dragged = true;
    }
    this.lastInteract = now;
  }

  pointerMove(e: PointerEvent, now: number): boolean {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return false;
    if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const d = this.pinchDistance();
      if (this.pinchDist > 0 && d > 0) this.zoomBy(this.pinchDist / d);
      this.pinchDist = d;
      this.lastInteract = now;
      return true;
    }
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (this.downAt && Math.abs(e.clientX - this.downAt.x) + Math.abs(e.clientY - this.downAt.y) > 4) this.dragged = true;
    if (this.dragged) {
      this.theta -= dx * 0.005;
      this.phi = Math.max(0.45, Math.min(1.72, this.phi - dy * 0.004));
      this.lastInteract = now;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    return this.dragged;
  }

  /** Returns true if this pointer-up was a tap (not a drag or pinch). */
  pointerUp(e: PointerEvent): boolean {
    const had = this.pointers.delete(e.pointerId);
    const tap = had && !this.dragged && this.pointers.size === 0;
    if (this.pointers.size === 0) {
      this.downAt = null;
      this.dragged = false;
    }
    return tap;
  }

  get active() {
    return this.pointers.size > 0;
  }

  zoomBy(k: number) {
    this.goalR = Math.max(this.opts.minR, Math.min(this.opts.maxR, this.goalR * k));
  }

  private pinchDistance() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  step(dt: number, now: number, follow: THREE.Vector3 | null) {
    const { restR, home, reduced } = this.opts;
    if (follow) {
      this.goal.copy(follow);
      this.goalR = Math.min(this.goalR, 26);
    } else this.goal.copy(home);
    if (!reduced && !this.active && now - this.lastInteract > 6) this.theta += dt * 0.025;
    this.target.lerp(this.goal, Math.min(1, dt * 1.6));
    this.r += (this.goalR - this.r) * Math.min(1, dt * 2);
    if (!follow && this.goalR < restR * 0.74 && now - this.lastInteract > 3) this.goalR += (restR - this.goalR) * Math.min(1, dt * 0.5);
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.r * sp * Math.sin(this.theta),
      this.target.y + this.r * Math.cos(this.phi),
      this.target.z + this.r * sp * Math.cos(this.theta),
    );
    this.camera.lookAt(this.target);
  }

  get element() {
    return this.el;
  }
}
