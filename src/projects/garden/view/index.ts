import * as THREE from 'three';
import { ADD, createTextFactory, disposeDeep, glowSprite, softTexture } from '@play/three-kit';
import type { GardenEvent, World } from '../sim';
import { Body, SHARED_GEOMETRIES, type BodyKit } from './bodies';
import { SkyCamera } from './camera';
import { LaneSystem, posOnLane } from './lanes';
import { COL, fromWorld } from './layout';
import { Embers, PointPool } from './particles';
import { createPost } from './post';
import { createMotes, createScene, ringTexture } from './scene';
import { flareTexture } from './shaders';

export interface Selection {
  kind: 'node' | 'link';
  id: number;
}

export interface GardenView {
  render(realDt: number, simDt: number): void;
  resize(): void;
  pickBody(cx: number, cy: number): number | null;
  pickLane(cx: number, cy: number): number | null;
  /** Normalised sky coordinates under the pointer, or null off the plane. */
  ground(cx: number, cy: number): { x: number; y: number } | null;
  setSelection(s: Selection | null): void;
  /** Lanes on the selected body's current paths: lid → path ok. */
  setPath(path: Map<number, boolean>): void;
  /** Lane being drawn from a body to the pointer. */
  setPreview(from: number | null, cx?: number, cy?: number): void;
  /** The journey step's target: a breathing ring (body) or pulse (lane). */
  setHighlight(s: Selection | null): void;
  /** Ease the camera towards a body or lane; null returns home. */
  focus(s: Selection | null): void;
  /** Keep the camera near the followed request while it travels. */
  followTrace(on: boolean): void;
  camera: SkyCamera;
  dispose(): void;
}

export function createGardenView(canvas: HTMLCanvasElement, getWorld: () => World, opts: { reduced: boolean }): GardenView {
  const low = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  const soft = softTexture();
  const ringTex = ringTexture();
  const flare = flareTexture();
  const text = createTextFactory();
  const { renderer, scene, camera } = createScene(canvas, soft);
  const light = new THREE.Vector3(-20, 30, 14).normalize();
  const kit: BodyKit = { soft, ringTex, flare, text, light, reduced: opts.reduced, low };
  const post = createPost(renderer, scene, camera, low);
  const cam = new SkyCamera(camera, opts.reduced);
  const updateMotes = createMotes(scene, soft, opts.reduced ? 40 : low ? 80 : 160);
  const bodies = new Map<number, Body>();
  const lanes = new LaneSystem(scene, low ? 24 : 48, opts.reduced);
  const packets = new PointPool(scene, soft, 3000, 0.7);
  const trails = new PointPool(scene, soft, 6000, 0.42, 0.7);
  const pings = new PointPool(scene, soft, 600, 0.22, 0.45);
  const news = new PointPool(scene, ringTex, 800, 0.8, 0.8);
  const embers = new Embers(new PointPool(scene, soft, 600, 0.32));
  const tracer = glowSprite(soft, 0xfff2c8, 1.6, 0);
  scene.add(tracer);
  const tracerTrail = new PointPool(scene, soft, 40, 0.8, 0.9);
  const beams: { line: THREE.Line; life: number }[] = [];
  const previewGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const preview = new THREE.Line(previewGeo, new THREE.LineDashedMaterial({ color: COL.laneHot, dashSize: 0.4, gapSize: 0.3, transparent: true, opacity: 0.9 }));
  preview.visible = false;
  preview.frustumCulled = false;
  scene.add(preview);

  let selection: Selection | null = null;
  let highlight: Selection | null = null;
  let focusSel: Selection | null = null;
  let follow = false;
  let path = new Map<number, boolean>();
  const queue: GardenEvent[] = [];
  let boundWorld: World | null = null;
  let off: (() => void) | null = null;
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8);
  const ndc = new THREE.Vector2();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tracePos = new THREE.Vector3();
  let viewT = 0;
  let traceVisible = false;

  const bind = (w: World) => {
    if (boundWorld === w) return;
    off?.();
    for (const [id, b] of bodies) {
      b.dispose(scene);
      bodies.delete(id);
    }
    boundWorld = w;
    off = w.bus.onAny(e => queue.push(e));
  };

  const posOf = (id: number) => bodies.get(id)?.pos;
  const anchorOf = (id: number) => bodies.get(id)?.anchor;

  function handle(e: GardenEvent) {
    switch (e.type) {
      case 'seed': // a new layout reuses ids from 1: start the bodies over
        for (const [id, b] of bodies) {
          b.dispose(scene);
          bodies.delete(id);
        }
        break;
      case 'lsa':
        bodies.get(e.node)?.flash('lsa');
        break;
      case 'answer':
        bodies.get(e.node)?.flash('bloom');
        break;
      case 'fail':
        bodies.get(e.node)?.flash('wilt');
        break;
      case 'cache.hit':
        bodies.get(e.node)?.flash('ripple');
        break;
      case 'drop': {
        let p: THREE.Vector3 | undefined;
        if ('node' in e.at) p = posOf(e.at.node)?.clone();
        else {
          const g = lanes.geom(e.at.link);
          p = g ? posOnLane(g, e.at.d, e.at.prog, 0.22) : undefined;
        }
        if (p) embers.spawn(p, e.reason === 'ttl' ? COL.cut : e.reason === 'noroute' ? COL.hc : COL.fail);
        break;
      }
      case 'lb.pick': {
        const a = posOf(e.node), b = posOf(e.server);
        if (!a || !b || beams.length > 6) break;
        const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x9ff0d0, transparent: true, opacity: 0.4, blending: ADD, depthWrite: false }));
        scene.add(line);
        beams.push({ line, life: 0.6 });
        break;
      }
    }
  }

  function syncBodies(w: World) {
    for (const n of w.nodes.values()) if (!bodies.has(n.id)) bodies.set(n.id, new Body(n, scene, kit));
    for (const [id, b] of bodies)
      if (!w.nodes.has(id)) {
        b.dispose(scene);
        bodies.delete(id);
      }
  }

  const colorOf = (p: { kind: string; ok?: boolean; hit?: boolean }) =>
    p.kind === 'req' ? COL.req : !p.ok ? COL.fail : p.hit ? COL.hit : COL.res;

  function drawTraffic(w: World) {
    packets.begin();
    trails.begin();
    pings.begin();
    news.begin();
    tracerTrail.begin();
    traceVisible = false;
    for (const f of w.flights) {
      const g = lanes.geom(f.L.id);
      if (!g) continue;
      const prog = Math.min(1, Math.max(0, (w.t - f.t0) / (f.t1 - f.t0)));
      const p = f.p;
      if (p.kind === 'lsa') {
        news.add(posOnLane(g, f.d, prog, 0, tmp), COL.lsa);
      } else if (p.kind === 'hc' || p.kind === 'hcr') {
        pings.add(posOnLane(g, f.d, prog, 0.22, tmp), COL.hc);
      } else {
        const c = colorOf(p);
        // a comet: bright head, a few fading points behind it
        const step = 0.35 / Math.max(1, g.len);
        if (p.trace) {
          traceVisible = true;
          posOnLane(g, f.d, prog, 0.22, tracePos);
          for (let i = 1; i <= 10; i++) tracerTrail.add(posOnLane(g, f.d, Math.max(0, prog - step * i * 0.6), 0.22, tmp), c, 1 - i / 11);
          continue;
        }
        packets.add(posOnLane(g, f.d, prog, 0.22, tmp), c);
        for (let i = 1; i <= 3; i++) if (prog - step * i > 0) trails.add(posOnLane(g, f.d, prog - step * i, 0.22, tmp), c, 0.55 - i * 0.14);
      }
    }
    // requests waiting at each end of a lane
    for (const L of w.links.values()) {
      if (L.removed) continue;
      const g = lanes.geom(L.id);
      if (!g) continue;
      for (const d of ['ab', 'ba'] as const) {
        const qd = L.q[d];
        if (!qd.length) continue;
        const from = bodies.get(d === 'ab' ? L.a : L.b);
        const r0 = (from?.r ?? 0.5) + 0.4;
        for (let i = 0; i < Math.min(qd.length, 12); i++) {
          const p = qd[i];
          if (p.kind === 'lsa' || p.kind === 'hc' || p.kind === 'hcr') continue;
          packets.add(posOnLane(g, d, Math.min(0.5, (r0 + i * 0.3) / g.len), 0.22, tmp), colorOf(p), 0.7);
        }
      }
    }
    packets.end();
    trails.end();
    pings.end();
    news.end();
    tracerTrail.end();
    tracer.position.copy(tracePos);
    tracer.material.opacity += ((traceVisible ? 1 : 0) - tracer.material.opacity) * 0.2;
    tracer.scale.setScalar(1.3 + (opts.reduced ? 0 : Math.sin(performance.now() / 200) * 0.25));
  }

  function selPos(s: Selection): THREE.Vector3 | undefined {
    if (s.kind === 'node') return posOf(s.id);
    const g = lanes.geom(s.id);
    return g ? tmp2.copy(g.a).add(g.b).multiplyScalar(0.5) : undefined;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    // centre the sky in the part of the screen the side panel doesn't cover
    const panel = w > 760 ? (w <= 1000 ? 300 : 340) : 0;
    // on phones the HUD sits on top and the coach + sheet at the bottom
    const top = panel ? 0 : 110, bottom = panel ? 0 : 290;
    const vis = w - panel, visH = Math.max(200, h - top - bottom);
    camera.aspect = w / h;
    camera.fov = vis / visH < 1 ? 55 : 42;
    camera.setViewOffset(w, h, panel / 2, (bottom - top) / 2, w, h);
    camera.updateProjectionMatrix();
    cam.fit(vis, visH, h);
    post.setSize(w, h);
  }
  resize();

  function toNdc(cx: number, cy: number) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    return r;
  }
  function screen(p: THREE.Vector3, r: DOMRect) {
    tmp2.copy(p).project(camera);
    return { x: r.left + ((tmp2.x + 1) / 2) * r.width, y: r.top + ((1 - tmp2.y) / 2) * r.height };
  }

  return {
    camera: cam,
    resize,
    render(realDt, simDt) {
      const w = getWorld();
      bind(w);
      viewT += simDt;
      for (const e of queue.splice(0)) handle(e);
      syncBodies(w);
      for (const [id, b] of bodies) {
        b.setHighlight(highlight?.kind === 'node' && highlight.id === id);
        b.update(simDt, viewT, w, selection?.kind === 'node' && selection.id === id);
      }
      lanes.setHighlight(highlight?.kind === 'link' ? highlight.id : null);
      lanes.update(w, viewT, anchorOf, selection?.kind === 'link' ? selection.id : null, path);
      drawTraffic(w);
      embers.update(simDt);
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.life -= simDt;
        (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.6) * 0.4;
        if (b.life <= 0) {
          scene.remove(b.line);
          b.line.geometry.dispose();
          (b.line.material as THREE.Material).dispose();
          beams.splice(i, 1);
        }
      }
      // camera: follow the traced request, else the journey target, else home
      if (follow && traceVisible) cam.focus(tracePos, 0.72);
      else if (focusSel) cam.focus(selPos(focusSel) ?? null);
      else cam.focus(null);
      updateMotes(realDt);
      cam.update(realDt, camera.aspect);
      post.render();
    },
    pickBody(cx, cy) {
      const r = toNdc(cx, cy);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      let best: number | null = null, bd = Infinity;
      for (const [id, b] of bodies) {
        const c = screen(b.pos, r);
        const e = screen(tmp.copy(b.pos).addScaledVector(right, b.r * 1.6), r);
        const rad = Math.max(16, Math.hypot(e.x - c.x, e.y - c.y));
        const d = Math.hypot(c.x - cx, c.y - cy);
        if (d < rad && d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    },
    pickLane(cx, cy) {
      const r = toNdc(cx, cy);
      const w = getWorld();
      let best: number | null = null, bd = 14;
      for (const L of w.links.values()) {
        if (L.removed) continue;
        const pts = lanes.samples(L.id, 24, []);
        for (let i = 1; i < pts.length; i++) {
          const a = screen(pts[i - 1], r), b = screen(pts[i], r);
          const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / l2));
          const d = Math.hypot(cx - (a.x + t * dx), cy - (a.y + t * dy));
          if (d < bd) {
            bd = d;
            best = L.id;
          }
        }
      }
      return best;
    },
    ground(cx, cy) {
      toNdc(cx, cy);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(plane, tmp);
      if (!hit) return null;
      const p = fromWorld(hit);
      if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return null;
      return { x: Math.min(0.98, Math.max(0.02, p.x)), y: Math.min(0.98, Math.max(0.02, p.y)) };
    },
    setSelection(s) {
      selection = s;
    },
    setPath(p) {
      path = p;
    },
    setHighlight(s) {
      highlight = s;
    },
    focus(s) {
      focusSel = s;
    },
    followTrace(on) {
      follow = on;
    },
    setPreview(from, cx, cy) {
      const a = from != null ? posOf(from) : undefined;
      if (!a || cx === undefined || cy === undefined) {
        preview.visible = false;
        return;
      }
      toNdc(cx, cy);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.ray.intersectPlane(plane, tmp);
      if (!hit) return;
      const arr = previewGeo.attributes.position.array as Float32Array;
      arr.set([a.x, a.y, a.z, hit.x, hit.y, hit.z]);
      previewGeo.attributes.position.needsUpdate = true;
      preview.computeLineDistances();
      preview.visible = true;
    },
    dispose() {
      off?.();
      for (const b of bodies.values()) b.dispose(scene);
      lanes.dispose();
      post.dispose();
      disposeDeep(scene);
      SHARED_GEOMETRIES.forEach(g => g.dispose());
      (scene.background as THREE.Texture | null)?.dispose();
      soft.dispose();
      ringTex.dispose();
      flare.dispose();
      text.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
