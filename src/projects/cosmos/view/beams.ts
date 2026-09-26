import * as THREE from 'three';
import { ADD, glowSprite, type TextFactory } from '@play/three-kit';
import type { World } from '../sim';
import { COLORS, SURF } from './layout';

/** CPU stars above the system, each shining a beam on the task it runs. */
export function createBeams(scene: THREE.Scene, soft: THREE.Texture, text: TextFactory, n: number) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 128;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0.05)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 2, 128);
  const beamTex = new THREE.CanvasTexture(c);

  const cpus = Array.from({ length: n }, (_, i) => {
    const geo = new THREE.CylinderGeometry(0.5, 1.9, 1, 28, 1, true);
    geo.translate(0, -0.5, 0);
    const beam = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0xffe7a8, map: beamTex, transparent: true, opacity: 0, blending: ADD, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    const x = -12 + i * 8;
    beam.position.set(x, SURF, 0);
    scene.add(beam);
    const label = text.sprite(`CPU${i}`, '#FFE7A8', 0.62);
    scene.add(label);
    const star = glowSprite(soft, 0xffe7a8, 2.4, 0.5);
    scene.add(star);
    return { beam, label, star, x, z: 0, len: 4, op: 0, flash: 0 };
  });

  return {
    starPos: (i: number) => cpus[i].star.position,
    flash(i: number, v = 1) {
      cpus[i].flash = Math.max(cpus[i].flash, v);
    },
    update(dt: number, w: World, posOf: (pid: number) => THREE.Vector3 | undefined) {
      const sched = w.view.lens === 'scheduler';
      w.cpus.forEach((cpu, i) => {
        const b = cpus[i];
        const p = cpu.pid !== null ? w.procs.get(cpu.pid) : undefined;
        const running = p && p.state === 'R' ? p : null;
        const q = running ? posOf(running.pid) : undefined;
        let tx = b.x, tz = b.z, tlen = 3.5, top = 0.035;
        if (running && q) {
          tx = q.x;
          tz = q.z;
          tlen = Math.max(2, SURF - q.y + 0.6);
          top = sched ? 0.32 : 0.2;
        }
        const k = Math.min(1, dt * 3.2);
        b.x += (tx - b.x) * k;
        b.z += (tz - b.z) * k;
        b.len += (tlen - b.len) * k;
        b.op += (top - b.op) * Math.min(1, dt * 2.5);
        b.beam.position.set(b.x, SURF, b.z);
        b.beam.scale.set(1, b.len, 1);
        (b.beam.material as THREE.MeshBasicMaterial).opacity = b.op;
        (b.beam.material as THREE.MeshBasicMaterial).color.lerp(running?.policy === 'FIFO' ? COLORS.rt : COLORS.sun, Math.min(1, dt * 4));
        b.flash *= Math.max(0, 1 - dt * 4);
        b.label.position.set(b.x, SURF + 1.3, b.z);
        b.star.position.set(b.x, SURF, b.z);
        b.star.material.opacity = 0.35 + b.op * 2.2 + b.flash * 0.6;
        b.star.scale.setScalar(2.4 * (1 + b.flash * 0.8));
      });
    },
  };
}
