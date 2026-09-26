import * as THREE from 'three';
import { createTextFactory, disposeDeep, OrbitFollowCamera, SparkSystem, softTexture } from '@play/three-kit';
import type { Anchor, SimEvent, World } from '../sim';
import { createBeams } from './beams';
import { CometSystem, COMET_GEOMETRIES } from './comets';
import { CACHE_POS, DISK, NIC } from './layout';
import { createBlackHole, createBubble, createDust, createLinks, Popups } from './overlays';
import { createPicker } from './picking';
import { PlanetSystem, SHARED_GEOMETRIES } from './planets';
import { createScene } from './scene';
import { createStations } from './stations';

export interface CosmosView {
  /** simDt is 0 while paused; realDt always advances (camera). */
  render(realDt: number, simDt: number): void;
  resize(): void;
  pick(clientX: number, clientY: number): number | null;
  camera: OrbitFollowCamera;
  dispose(): void;
}

/**
 * Builds the three.js scene for a world. The view only reads world state and
 * listens to sim events; it never changes the sim.
 */
export function createCosmosView(canvas: HTMLCanvasElement, world: World, opts: { reduced: boolean; bubbleLabel?: string }): CosmosView {
  const soft = softTexture();
  const text = createTextFactory();
  const { renderer, scene, camera } = createScene(canvas, soft);
  const stations = createStations(scene, soft, text);
  const beams = createBeams(scene, soft, text, world.cpus.length);
  const planets = new PlanetSystem(scene, soft, world);
  const comets = new CometSystem(scene, text);
  const sparks = new SparkSystem(scene, soft);
  const popups = new Popups(scene, text);
  const dust = createDust(scene, soft);
  const bubble = createBubble(scene, text, opts.bubbleLabel);
  const hole = createBlackHole(scene, soft, text);
  const links = createLinks(scene, text);
  const orbit = new OrbitFollowCamera(camera, canvas, { minR: 16, maxR: 70, restR: 46, home: new THREE.Vector3(0, -1, 0), reduced: opts.reduced });
  const pick = createPicker(camera, canvas, planets.pickables);

  planets.sync(bubble.center);

  const queue: SimEvent[] = [];
  const offBus = world.bus.onAny(e => queue.push(e));
  const lens = () => world.view.lens;

  const anchorPos = (a: Anchor, up?: number): THREE.Vector3 | null => {
    if ('pid' in a) {
      const p = planets.posOf(a.pid);
      const size = planets.planets.get(a.pid)?.size ?? 1;
      return p ? p.clone().add(new THREE.Vector3(0, (up ?? 1.4) + size, 0)) : null;
    }
    if ('cpu' in a) return beams.starPos(a.cpu).clone().add(new THREE.Vector3(0, -1.4, 0));
    const base = a.place === 'cache' ? CACHE_POS : a.place === 'disk' ? DISK : NIC;
    return base.clone().add(new THREE.Vector3(0, 3, 0));
  };

  function handle(e: SimEvent) {
    switch (e.type) {
      case 'note': {
        const at = anchorPos(e.at, e.up);
        if (at) popups.add(e.text, e.color, at, e.life);
        break;
      }
      case 'proc.spawn': {
        const p = world.procs.get(e.pid);
        if (!p || planets.planets.has(e.pid)) break;
        const near = e.near !== undefined ? planets.posOf(e.near) : undefined;
        planets.create(p, near ?? (p.ns ? bubble.center.clone() : null), e.grow);
        break;
      }
      case 'proc.fork':
        planets.forked(e.parent, e.child);
        break;
      case 'proc.reap':
      case 'proc.remove': {
        const p = planets.posOf(e.pid);
        if (p && (e.type === 'proc.reap' || e.burst)) dust.burst(p, e.type === 'proc.reap' ? 24 : 12, e.type === 'proc.reap' ? 4 : 3);
        break;
      }
      case 'syscall.issue':
        comets.launch(e.id, e.pid, e.name, e.dur, planets.posOf(e.pid));
        break;
      case 'syscall.land':
        comets.land(e.id, e.hit);
        break;
      case 'cache.hit':
        sparks.add(CACHE_POS, planets.follow(e.pid), 0x8fb8ff, 0.7, 0.8);
        break;
      case 'cache.miss':
        sparks.add(DISK, planets.follow(e.pid), 0xffb38a, 1.1, 0.9);
        break;
      case 'swap.out': {
        const p = planets.posOf(e.pid);
        if (e.visual && p) sparks.add(p, DISK, 0x9a8fb0, 1.0, 0.7);
        break;
      }
      case 'fault.major':
        sparks.add(DISK, planets.follow(e.pid), 0xffb38a, 0.9, 0.9);
        break;
      case 'irq.nic.raise':
        stations.blinkNic();
        sparks.add(NIC, () => beams.starPos(e.cpu), 0x7ff0ff, e.dur, 1.1, 2.5);
        break;
      case 'irq.nic':
      case 'irq.disk':
        beams.flash(e.cpu);
        break;
      case 'packet.deliver':
        sparks.add(beams.starPos(e.cpu).clone(), planets.follow(e.pid), 0x7ff0ff, e.dur, 0.6, 1);
        break;
      case 'irq.disk.raise':
        sparks.add(DISK, () => beams.starPos(e.cpu), 0xffb38a, e.dur, 0.9, 2.5);
        break;
      case 'conn.send': {
        const from = planets.posOf(e.from);
        if (from) sparks.add(from, planets.follow(e.to), 0x7ff0ff, e.dur, lens() === 'connections' ? 0.9 : 0.55, 0.6);
        break;
      }
      case 'cs':
        beams.flash(e.cpu, 0.6);
        if (lens() === 'scheduler') popups.add('context switch', '#FFE7A8', beams.starPos(e.cpu).clone().add(new THREE.Vector3(0, -1.2, 0)), 0.9);
        break;
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 64 : 48;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    camera: orbit,
    resize,
    pick: (x, y) => pick(x, y),
    render(realDt, simDt) {
      const t = world.clock.t;
      for (const e of queue.splice(0)) handle(e);
      planets.sync(bubble.center);

      let pod = world.mode === 'sim';
      if (!pod) for (const p of world.procs.values()) if (p.ns) { pod = true; break; }
      bubble.update(simDt, t, lens() === 'namespaces', pod);
      hole.update(simDt, world, planets);
      planets.update(simDt, t, {
        lens: world.view.lens,
        nsInside: world.view.nsInside,
        selected: world.view.selected,
        nsCenter: bubble.center,
        cometFor: pid => comets.targetFor(pid),
        oomPos: hole.pos,
      });
      comets.update(simDt, t, pid => planets.posOf(pid));
      sparks.update(simDt);
      popups.update(simDt);
      beams.update(simDt, world, pid => planets.posOf(pid));
      links.update(simDt, world, planets);
      stations.update(simDt, t, world.view.lens, world.mem.cache);
      dust.update(simDt);

      const sel = world.view.selected;
      orbit.step(realDt, performance.now() / 1000, sel !== null ? planets.posOf(sel) ?? null : null);
      renderer.render(scene, camera);
    },
    dispose() {
      offBus();
      comets.dispose();
      sparks.dispose();
      popups.dispose();
      planets.dispose();
      disposeDeep(scene);
      [...SHARED_GEOMETRIES, ...COMET_GEOMETRIES].forEach(g => g.dispose());
      (scene.background as THREE.Texture | null)?.dispose();
      soft.dispose();
      text.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
