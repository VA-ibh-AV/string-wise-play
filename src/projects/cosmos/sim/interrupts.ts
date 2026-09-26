import { isAlive, note, noteAt, now, procList, wake } from './state';
import type { Proc, World } from './types';

const NIC_TRAVEL = 0.55;
const PACKET_TRAVEL = 0.7;
const DISK_TRAVEL = 0.5;
/** IRQ affinity: the disk interrupt is routed to CPU2. */
export const DISK_CPU = 2;

/** NIC → CPU0/CPU1 (IRQ affinity) → NET_RX softirq → socket owner wakes. */
export function nicInterrupt(w: World) {
  const cpu = w.rng.chance(0.6) ? 0 : 1;
  w.bus.emit({ type: 'irq.nic.raise', cpu, dur: NIC_TRAVEL });
  w.clock.after(NIC_TRAVEL, () => {
    const irq = w.irq;
    irq.perCpu[cpu].eth++;
    irq.recent.push(now(w));
    irq.recent = irq.recent.filter(t => now(w) - t < 2);
    irq.netrx++;
    // more than 5 interrupts within 2 s: the rest of the softirq work goes to ksoftirqd
    const flood = irq.recent.length >= 5;
    w.bus.emit({ type: 'irq.nic', cpu, flood });
    if (flood) {
      const ks = procList(w).find(q => q.comm === 'ksoftirqd/0');
      if (ks && ks.state === 'S') {
        wake(w, ks, 'softirq backlog');
        irq.ksoftirqd++;
        w.bus.emit({ type: 'ksoftirqd.wake', pid: ks.pid });
        noteAt(w, ks, 'ksoftirqd/0: finishing NET_RX softirqs', '#B7C4E0');
      }
    } else if (w.view.lens === 'interrupts') {
      note(w, { cpu }, 'IRQ → NET_RX softirq', '#7FF0FF', undefined, 1.2);
    }
    const rx = procList(w).filter(q => (q.comm === 'nginx: worker' || q.comm === 'sshd') && q.state !== 'Z' && q.state !== 'T');
    if (!rx.length) return;
    const q = w.rng.pick(rx);
    w.bus.emit({ type: 'packet.deliver', cpu, pid: q.pid, dur: PACKET_TRAVEL });
    w.clock.after(PACKET_TRAVEL, () => {
      if (!isAlive(w, q)) return;
      if (q.state === 'S') wake(w, q, 'packet arrived');
      w.bus.emit({ type: 'packet.wake', pid: q.pid });
      if (w.view.lens === 'interrupts') noteAt(w, q, 'packet → socket → woken', '#7FF0FF', 1);
    });
  });
}

/** I/O completion: the disk interrupts CPU2 and the waiter in D becomes runnable. */
export function diskInterrupt(w: World, p: Proc) {
  p.ioIrq = true;
  w.bus.emit({ type: 'irq.disk.raise', pid: p.pid, cpu: DISK_CPU, dur: DISK_TRAVEL });
  w.clock.after(DISK_TRAVEL, () => {
    w.irq.perCpu[DISK_CPU].nvme++;
    w.bus.emit({ type: 'irq.disk', pid: p.pid, cpu: DISK_CPU });
    if (w.view.lens === 'interrupts') note(w, { cpu: DISK_CPU }, 'nvme IRQ: I/O complete', '#FFB38A', undefined, 1.2);
    p.ioIrq = false;
    if (isAlive(w, p) && p.state === 'D') wake(w, p, 'disk I/O complete');
  });
}

export function trafficBurst(w: World) {
  for (let i = 0; i < 12; i++) w.clock.after(i * 0.16, () => nicInterrupt(w));
}

export function stepInterrupts(w: World, dt: number) {
  w.irq.next -= dt;
  if (w.irq.next <= 0) {
    w.irq.next = w.rng.range(1.2, 3.2);
    nicInterrupt(w);
  }
}
