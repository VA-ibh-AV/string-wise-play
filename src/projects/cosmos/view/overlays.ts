import * as THREE from 'three';
import { ADD, glowSprite, linePool, setLine, type TextFactory } from '@play/three-kit';
import { connectionPairs, type World } from '../sim';
import { COLORS, FLOOR, rnd, SURF, TD, TW } from './layout';
import type { PlanetSystem } from './planets';

/** Floating dust that also serves as burst particles (fork, reap, restart). */
export function createDust(scene: THREE.Scene, soft: THREE.Texture) {
  const N = 320;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
  const reset = (i: number) => {
    pos[i * 3] = rnd(-TW / 2 - 6, TW / 2 + 6);
    pos[i * 3 + 1] = rnd(FLOOR - 4, SURF + 4);
    pos[i * 3 + 2] = rnd(-TD / 2 - 6, TD / 2 + 6);
    vel[i * 3] = rnd(-0.25, 0.25);
    vel[i * 3 + 1] = rnd(-0.12, 0.12);
    vel[i * 3 + 2] = rnd(-0.25, 0.25);
  };
  for (let i = 0; i < N; i++) reset(i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: soft, color: 0xc9d2ff, transparent: true, depthWrite: false, opacity: 0.7, blending: ADD })));
  return {
    burst(at: THREE.Vector3, n = 24, speed = 4) {
      const d = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const b = Math.floor(Math.random() * N);
        pos.set([at.x, at.y, at.z], b * 3);
        d.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(speed * 0.4, speed));
        vel.set([d.x, d.y, d.z], b * 3);
      }
    },
    update(dt: number) {
      for (let i = 0; i < N; i++) {
        const j = i * 3;
        pos[j] += vel[j] * dt;
        pos[j + 1] += vel[j + 1] * dt;
        pos[j + 2] += vel[j + 2] * dt;
        const damp = Math.pow(0.995, dt * 60);
        vel[j] *= damp;
        vel[j + 1] *= damp;
        vel[j + 2] *= damp;
        if (Math.abs(pos[j]) > TW / 2 + 8 || Math.abs(pos[j + 1]) > 16 || Math.abs(pos[j + 2]) > TD / 2 + 8) reset(i);
        else if (Math.abs(vel[j]) + Math.abs(vel[j + 2]) < 0.05) {
          vel[j] = rnd(-0.25, 0.25);
          vel[j + 2] = rnd(-0.25, 0.25);
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/** Floating labels ("fork() → 3102", "page cache hit" …). */
export class Popups {
  private list: { s: THREE.Sprite; life: number; max: number }[] = [];
  constructor(private scene: THREE.Scene, private text: TextFactory) {}
  add(text: string, color: string, at: THREE.Vector3, life = 1.8) {
    const s = this.text.sprite(text, color, 0.6);
    s.position.copy(at);
    this.scene.add(s);
    this.list.push({ s, life, max: life });
    if (this.list.length > 60) this.kill(0);
  }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const u = this.list[i];
      u.life -= dt;
      u.s.position.y += dt * 0.6;
      u.s.material.opacity = Math.min(1, u.life / 0.8);
      if (u.life <= 0) this.kill(i);
    }
  }
  private kill(i: number) {
    this.scene.remove(this.list[i].s);
    this.list[i].s.material.dispose();
    this.list.splice(i, 1);
  }
  dispose() {
    while (this.list.length) this.kill(this.list.length - 1);
  }
}

/** The PID namespace bubble around the checkout pod. It drifts slowly. */
export function createBubble(scene: THREE.Scene, text: TextFactory, labelText = 'pod: checkout · PID namespace') {
  const center = new THREE.Vector3(9, 0, 5);
  const group = new THREE.Group();
  scene.add(group);
  const fill = new THREE.MeshBasicMaterial({ color: 0x9ff0d0, transparent: true, opacity: 0.03, depthWrite: false });
  const rim = new THREE.MeshBasicMaterial({ color: 0x9ff0d0, transparent: true, opacity: 0.08, side: THREE.BackSide, depthWrite: false, blending: ADD });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(6.4, 40, 28), fill));
  group.add(new THREE.Mesh(new THREE.SphereGeometry(6.55, 40, 28), rim));
  const label = text.sprite(labelText, '#9FF0D0', 0.7);
  label.position.set(0, 7.3, 0);
  group.add(label);
  return {
    center,
    update(dt: number, t: number, active: boolean, show = true) {
      group.visible = show;
      center.set(9 + Math.sin(t * 0.05) * 3, Math.sin(t * 0.07) * 1.5, 5 + Math.cos(t * 0.05) * 2);
      group.position.copy(center);
      const k = Math.min(1, dt * 3);
      fill.opacity += ((active ? 0.07 : 0.025) - fill.opacity) * k;
      rim.opacity += ((active ? 0.22 : 0.07) - rim.opacity) * k;
      label.material.opacity = active ? 1 : 0.3;
    },
  };
}

/** The OOM killer: a black hole that appears next to the victim and swallows it. */
export function createBlackHole(scene: THREE.Scene, soft: THREE.Texture, text: TextFactory) {
  const hole = new THREE.Group();
  hole.visible = false;
  scene.add(hole);
  hole.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 })));
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 4.2, 96),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, blending: ADD, depthWrite: false }),
  );
  disc.rotation.x = Math.PI / 2.4;
  hole.add(disc);
  hole.add(glowSprite(soft, 0xff7a3a, 9, 0.35));
  const label = text.sprite('OOM killer', '#FFB38A', 0.8);
  label.position.set(0, 3.2, 0);
  hole.add(label);
  let forPid: number | null = null;
  return {
    get pos() {
      return hole.visible ? hole.position : null;
    },
    update(dt: number, w: World, planets: PlanetSystem) {
      const o = w.oom;
      if (!o) {
        hole.visible = false;
        forPid = null;
        return;
      }
      if (forPid !== o.pid) {
        forPid = o.pid;
        const v = planets.posOf(o.pid);
        const size = planets.planets.get(o.pid)?.size ?? 1;
        hole.position.copy(v ?? new THREE.Vector3()).add(new THREE.Vector3(size * 3.2, 1.2, 0));
        hole.visible = true;
      }
      const t = w.clock.t;
      const k = Math.min(1, (t - o.t) / 0.8);
      const fade = o.done !== null ? Math.max(0, 1 - (t - o.done) / 2.5) : 1;
      hole.scale.setScalar(Math.max(0.01, k * fade));
      disc.rotation.z += dt * 2;
    },
  };
}

/** cgroup constellations, TCP lines, COW links and page tiles around the selected process. */
export function createLinks(scene: THREE.Scene, text: TextFactory) {
  const cgLines = linePool(scene, 0xffe7a8, 24);
  const connLines = linePool(scene, 0x7ff0ff, 14);
  const cowLines = linePool(scene, 0xffffff, 8);
  const cgLabels = new Map<string, THREE.Sprite>();

  const TILE_N = 40;
  const tiles = new THREE.Group();
  tiles.visible = false;
  scene.add(tiles);
  const tileGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
  const tileMats = Array.from({ length: TILE_N }, () => {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    tiles.add(new THREE.Mesh(tileGeo, m));
    return m;
  });
  const centroid = new THREE.Vector3();

  return {
    update(dt: number, w: World, planets: PlanetSystem) {
      const lens = w.view.lens;
      const pos = (pid: number) => planets.posOf(pid);

      // cgroup constellations
      let li = 0;
      const groups = new Map<string, number[]>();
      for (const p of w.procs.values()) {
        if (!p.service || p.state === 'Z' || !planets.planets.has(p.pid)) continue;
        const g = groups.get(p.service) ?? [];
        g.push(p.pid);
        groups.set(p.service, g);
      }
      cgLabels.forEach(s => (s.visible = false));
      if (lens === 'cgroups') {
        for (const [name, pids] of groups) {
          const thr = w.cgroups.get(name)?.throttled;
          for (let i = 1; i < pids.length && li < cgLines.length; i++) setLine(cgLines[li++], pos(pids[0])!, pos(pids[i])!, 0.55, thr ? COLORS.red : COLORS.sun);
          let s = cgLabels.get(name);
          if (!s) {
            s = text.sprite(name, '#FFE7A8', 0.62);
            scene.add(s);
            cgLabels.set(name, s);
          }
          centroid.set(0, 0, 0);
          pids.forEach(pid => centroid.add(pos(pid)!));
          centroid.multiplyScalar(1 / pids.length);
          s.position.copy(centroid).add(new THREE.Vector3(0, 2.6 + (planets.planets.get(pids[0])?.size ?? 1), 0));
          s.visible = true;
        }
      }
      for (; li < cgLines.length; li++) (cgLines[li].material as THREE.LineBasicMaterial).opacity = 0;

      // TCP connections
      li = 0;
      if (lens === 'connections') {
        for (const [a, b] of connectionPairs(w)) {
          if (li >= connLines.length) break;
          const pa = pos(a.pid), pb = pos(b.pid);
          if (pa && pb) setLine(connLines[li++], pa, pb, 0.45);
        }
      }
      for (; li < connLines.length; li++) (connLines[li].material as THREE.LineBasicMaterial).opacity = 0;

      // copy-on-write links while pages are still shared
      li = 0;
      for (const p of w.procs.values()) {
        if (!(p.shared > 0) || li >= cowLines.length) continue;
        const pa = pos(p.pid), pb = pos(p.ppid);
        if (!pa || !pb || !w.procs.has(p.ppid)) continue;
        setLine(cowLines[li++], pa, pb, (lens === 'memory' ? 0.7 : 0.25) * Math.min(1, p.shared / 20));
      }
      for (; li < cowLines.length; li++) (cowLines[li].material as THREE.LineBasicMaterial).opacity = 0;

      // page tiles: colored = resident, white = COW shared, dark = swapped
      const sel = w.view.selected !== null ? w.procs.get(w.view.selected) : undefined;
      const f = sel ? planets.planets.get(sel.pid) : undefined;
      const show = lens === 'memory' && sel && f && sel.kind !== 'kernel';
      tiles.visible = !!show;
      if (show) {
        const r = f.scale * 1.9 + 0.8;
        tiles.position.copy(f.g.position);
        tiles.rotation.y += dt * 0.15;
        const tot = Math.max(1, sel.rss + sel.shared + sel.swapped);
        const nRes = Math.round((TILE_N * sel.rss) / tot), nSh = Math.round((TILE_N * sel.shared) / tot);
        tiles.children.forEach((m, i) => {
          const a = (i / TILE_N) * Math.PI * 2;
          m.position.set(Math.cos(a) * r, Math.sin(a * 3) * 0.15, Math.sin(a) * r);
          tileMats[i].color.copy(i < nRes ? f.base : i < nRes + nSh ? COLORS.white : COLORS.tileSwap);
          tileMats[i].opacity = i < nRes + nSh ? 0.95 : 0.55;
        });
      }
    },
  };
}
