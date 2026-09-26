import * as THREE from 'three';
import { ADD, type TextFactory } from '@play/three-kit';
import { syscallColor, type SyscallName } from '../content/syscalls';
import { FLOOR, rnd, SURF } from './layout';

const PELLET_GEO = new THREE.IcosahedronGeometry(0.2, 1);
const TAIL_GEO = new THREE.ConeGeometry(0.17, 2.2, 10, 1, true);
TAIL_GEO.translate(0, 1.1, 0);

interface Comet {
  id: number;
  pid: number;
  m: THREE.Mesh;
  label: THREE.Sprite;
  tail: THREE.Mesh;
  from: THREE.Vector3;
  t: number;
  dur: number;
  /** Seconds since it missed its process and fell to the floor. */
  landed: number;
}

/** Syscall comets fall from above toward the calling process, labelled with the call. */
export class CometSystem {
  private list: Comet[] = [];
  constructor(private scene: THREE.Scene, private text: TextFactory) {}

  launch(id: number, pid: number, name: SyscallName, dur: number, near: THREE.Vector3 | undefined) {
    const col = syscallColor(name);
    const m = new THREE.Mesh(PELLET_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true }));
    const at = near ?? new THREE.Vector3();
    m.position.set(at.x + rnd(-2, 2), SURF - 0.3, at.z + rnd(-2, 2));
    const label = this.text.sprite(name + '()', col, 0.75);
    label.position.set(0.9, 0.55, 0);
    m.add(label);
    const tail = new THREE.Mesh(TAIL_GEO, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, blending: ADD, depthWrite: false }));
    m.add(tail);
    this.scene.add(m);
    this.list.push({ id, pid, m, label, tail, from: m.position.clone(), t: 0, dur, landed: 0 });
  }

  /** The sim decided: hit means the syscall ran; a miss falls on and fades. */
  land(id: number, hit: boolean) {
    const i = this.list.findIndex(c => c.id === id);
    if (i < 0) return;
    if (hit) this.kill(i);
    else this.list[i].landed = 0.001;
  }

  /** Where the in-flight comet for a process is, so the planet can rise to catch it. */
  targetFor(pid: number): THREE.Vector3 | null {
    const c = this.list.find(x => x.pid === pid && !x.landed);
    return c ? c.m.position : null;
  }

  update(dt: number, t: number, posOf: (pid: number) => THREE.Vector3 | undefined) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const mat = c.m.material as THREE.MeshBasicMaterial;
      if (c.landed) {
        c.landed += dt;
        if (c.m.position.y > FLOOR + 0.4) c.m.position.y -= 1.7 * dt;
        mat.opacity = Math.max(0, 1 - c.landed / 3);
        c.label.material.opacity = mat.opacity;
        (c.tail.material as THREE.MeshBasicMaterial).opacity = mat.opacity * 0.55;
        if (c.landed > 3) this.kill(i);
        continue;
      }
      c.t += dt;
      const target = posOf(c.pid);
      if (target) {
        const k = Math.min(1, c.t / c.dur);
        const e = k * k * (3 - 2 * k);
        c.m.position.copy(c.from).lerp(target, e);
        c.m.position.x += Math.sin(t * 1.3 + c.id) * 0.15;
      } else {
        c.m.position.y -= 1.7 * dt;
      }
      // never hang around past the sim's verdict (e.g. when the sim ran ahead)
      if (c.t > c.dur + 1.5) c.landed = 0.001;
    }
  }

  private kill(i: number) {
    const c = this.list[i];
    this.scene.remove(c.m);
    (c.m.material as THREE.Material).dispose();
    c.label.material.dispose();
    (c.tail.material as THREE.Material).dispose();
    this.list.splice(i, 1);
  }

  get count() {
    return this.list.length;
  }

  dispose() {
    while (this.list.length) this.kill(this.list.length - 1);
  }
}

export const COMET_GEOMETRIES = [PELLET_GEO, TAIL_GEO];
