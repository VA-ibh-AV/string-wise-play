import * as THREE from 'three';

/**
 * A calm camera: tilted over the sky, drifting very slowly on its own.
 * Right-drag (or two fingers) orbits; wheel or pinch zooms.
 */
export class SkyCamera {
  theta = 0;
  phi = 0.95;
  r = 38;
  goalR = 38;
  private drift = 0;
  private lastUser = -99;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private target = new THREE.Vector3(0, 0.5, 0);
  private goalTarget = new THREE.Vector3(0, 0.5, 0);
  private zoomIn = 1;
  private goalZoomIn = 1;

  constructor(readonly camera: THREE.PerspectiveCamera, private reduced: boolean) {}

  get orbiting() {
    return this.pointers.size > 0;
  }

  down(e: PointerEvent) {
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.pinch = this.spread();
  }

  move(e: PointerEvent) {
    const prev = this.pointers.get(e.pointerId);
    if (!prev) return;
    const now = performance.now() / 1000;
    if (this.pointers.size === 2) {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const s = this.spread();
      if (this.pinch > 0 && s > 0) this.zoom(this.pinch / s);
      this.pinch = s;
    }
    this.theta -= (e.clientX - prev.x) * 0.004 / Math.max(1, this.pointers.size);
    this.phi = Math.min(1.35, Math.max(0.35, this.phi - ((e.clientY - prev.y) * 0.003) / Math.max(1, this.pointers.size)));
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.lastUser = now;
  }

  up(e: PointerEvent) {
    this.pointers.delete(e.pointerId);
    this.pinch = 0;
  }

  zoom(k: number) {
    this.goalR = Math.min(70, Math.max(16, this.goalR * k));
    this.lastUser = performance.now() / 1000;
  }

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Distance that fits the 40-unit-wide sky into the visible width. */
  fit(visW: number, visH: number, fullH: number) {
    const tanV = Math.tan((this.camera.fov * Math.PI) / 360);
    // portrait screens turn the sky a quarter so its long side runs down the screen
    const portrait = visW / visH < 1;
    this.theta = portrait ? Math.PI / 2 : 0;
    this.phi = portrait ? 0.55 : 0.95;
    const halfW = portrait ? 13.5 : 23, halfD = portrait ? 21 : 13;
    const needW = halfW / (tanV * (visW / fullH));
    const needH = (halfD * Math.cos(this.phi) + 2) / (tanV * (visH / fullH));
    this.goalR = Math.min(110, Math.max(24, Math.max(needW, needH) * 1.08));
  }

  /** Ease the view towards a point (a journey target, a followed packet); null returns home. */
  focus(p: THREE.Vector3 | null, closer = 0.85) {
    if (p) {
      // lean towards the point rather than centring hard on it: the whole sky stays readable
      this.goalTarget.set(p.x * 0.55, 0.5 + p.y * 0.3, p.z * 0.55);
      this.goalZoomIn = closer;
    } else {
      this.goalTarget.set(0, 0.5, 0);
      this.goalZoomIn = 1;
    }
  }

  update(dt: number, aspect: number) {
    const now = performance.now() / 1000;
    // after a quiet spell, the view sways back and forth very slowly
    if (!this.reduced && now - this.lastUser > 8) this.drift += dt;
    const sway = this.reduced ? 0 : Math.sin(this.drift * 0.03) * 0.22;
    void aspect;
    this.r += (this.goalR - this.r) * Math.min(1, dt * 2);
    const k = Math.min(1, dt * 1.2);
    this.target.lerp(this.goalTarget, k);
    this.zoomIn += (this.goalZoomIn - this.zoomIn) * k;
    const th = this.theta + sway, sp = Math.sin(this.phi), r = this.r * this.zoomIn;
    this.camera.position.set(this.target.x + r * sp * Math.sin(th), this.target.y + r * Math.cos(this.phi) + 0.5, this.target.z + r * sp * Math.cos(th));
    this.camera.lookAt(this.target);
  }
}
