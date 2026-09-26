import * as THREE from 'three';
import { createBloom, createTextFactory, disposeDeep, softTexture } from '@play/three-kit';
import type { Flight, Pass } from '../sim/flight';
import { createChaseCamera } from './chaseCamera';
import { createGates, GATE_GEOMETRIES } from './gates';
import { createScene } from './scene';
import { createShip } from './ship';
import { createTunnel } from './tunnel';

export interface DriftView {
  /** Swap in a new flight (new ring offsets). */
  setFlight(f: Flight): void;
  passed(i: number, p: Pass): void;
  render(realDt: number, simDt: number): void;
  resize(): void;
  dispose(): void;
}

export function createDriftView(canvas: HTMLCanvasElement, flight: Flight, opts: { reduced: boolean }): DriftView {
  const low = matchMedia('(pointer: coarse)').matches || window.innerWidth < 760;
  const soft = softTexture();
  const text = createTextFactory();
  const { renderer, scene, camera, sky } = createScene(canvas, soft);
  const light = new THREE.Vector3(-30, 40, 20).normalize();
  const bloom = createBloom(renderer, scene, camera, low);
  createTunnel(scene, flight.track, soft, low);
  let f = flight;
  let gates = createGates(scene, f.track, f.gates, soft, text, light);
  const ship = createShip(scene, soft);
  const chase = createChaseCamera(camera, opts.reduced);
  const shipPos = new THREE.Vector3();
  let flash = 0, t = 0;

  const place = () => {
    const p = f.track.place(f.u, f.x, f.y);
    return shipPos.set(p.x, p.y, p.z);
  };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    bloom.setSize(w, h);
  }
  resize();

  return {
    setFlight(nf) {
      f = nf;
      gates.dispose();
      gates = createGates(scene, f.track, f.gates, soft, text, light);
      ship.reset(place());
      chase.reset();
    },
    passed(i, p) {
      gates.passed(i, p);
      if (p === 'clean') flash = 1;
    },
    render(realDt, simDt) {
      t += realDt;
      flash = Math.max(0, flash - realDt * 2.5);
      ship.setColor(f.color);
      // idle bob before launch, so the title screen is alive
      const idle = f.t === 0 && !opts.reduced ? Math.sin(t * 1.2) * 0.3 : 0;
      const p = place();
      p.y += idle;
      ship.update(realDt, p, f.speed, flash);
      gates.update(realDt, t, f.next, opts.reduced);
      chase.update(simDt > 0 || f.t === 0 ? realDt : 0, f, p);
      sky.position.copy(camera.position);
      bloom.render();
    },
    resize,
    dispose() {
      gates.dispose();
      ship.dispose();
      bloom.dispose();
      disposeDeep(scene);
      GATE_GEOMETRIES.forEach(g => g.dispose());
      (scene.background as THREE.Texture | null)?.dispose();
      soft.dispose();
      text.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
