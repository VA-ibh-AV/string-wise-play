/** Track geometry: a uniform Catmull-Rom spline through the control points, walked by arc length. Math only. */
export interface V3 {
  x: number;
  y: number;
  z: number;
}
export interface Frame {
  /** centre of the tube */
  p: V3;
  /** forward */
  t: V3;
  /** right (lateral x) */
  r: V3;
  /** up (lateral y) */
  up: V3;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (a: V3) => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};
const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export class Track {
  readonly length: number;
  private pts: V3[];
  private cum: Float64Array; // arc length at each sample
  private samples = 6000;

  constructor(points: [number, number, number][]) {
    this.pts = points.map(([x, y, z]) => ({ x, y, z }));
    this.cum = new Float64Array(this.samples + 1);
    let prev = this.at(0), total = 0;
    for (let i = 1; i <= this.samples; i++) {
      const p = this.at(i / this.samples);
      total += len(sub(p, prev));
      this.cum[i] = total;
      prev = p;
    }
    this.length = total;
  }

  /** Position at spline parameter s in 0..1 (not arc length). */
  private at(s: number): V3 {
    const n = this.pts.length - 1;
    const f = Math.min(n - 1e-9, Math.max(0, s * n));
    const i = Math.floor(f), t = f - i;
    const p0 = this.pts[Math.max(0, i - 1)], p1 = this.pts[i], p2 = this.pts[Math.min(n, i + 1)], p3 = this.pts[Math.min(n, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    const c = (a: number, b: number, c2: number, d: number) =>
      0.5 * (2 * b + (-a + c2) * t + (2 * a - 5 * b + 4 * c2 - d) * t2 + (-a + 3 * b - 3 * c2 + d) * t3);
    return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y), z: c(p0.z, p1.z, p2.z, p3.z) };
  }

  /** Spline parameter for a fraction u of the arc length. */
  private param(u: number) {
    const target = Math.min(1, Math.max(0, u)) * this.length;
    let lo = 0, hi = this.samples;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.cum[m] < target) lo = m + 1;
      else hi = m;
    }
    const i = Math.max(1, lo);
    const a = this.cum[i - 1], b = this.cum[i];
    return (i - 1 + (b > a ? (target - a) / (b - a) : 0)) / this.samples;
  }

  pointAt(u: number): V3 {
    return this.at(this.param(u));
  }

  frameAt(u: number): Frame {
    const s = this.param(u);
    const p = this.at(s);
    const t = norm(sub(this.at(Math.min(1, s + 0.0004)), this.at(Math.max(0, s - 0.0004))));
    const r = norm(cross(t, { x: 0, y: 1, z: 0 }));
    const up = cross(r, t);
    return { p, t, r, up };
  }

  /** World position of a lateral offset (x right, y up) inside the tube at u. */
  place(u: number, x: number, y: number): V3 {
    const f = this.frameAt(u);
    return { x: f.p.x + f.r.x * x + f.up.x * y, y: f.p.y + f.r.y * x + f.up.y * y, z: f.p.z + f.r.z * x + f.up.z * y };
  }
}
