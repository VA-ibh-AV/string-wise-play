import { describe, expect, test } from 'vitest';
import { MISSIONS, type MissionId } from '../content/missions';
import { command, record } from '../sim';
import { fileRead } from '../sim/pagecache';
import { doSyscall } from '../sim/syscalls';
import { byComm, until, world } from './helpers';

const scripts: Record<MissionId, (w: ReturnType<typeof world>) => void> = {
  inspect: w => command(w, { type: 'select', pid: 1 }),
  sleep: w => {
    const p = byComm(w, 'sshd');
    command(w, { type: 'select', pid: p.pid });
    p.state = 'R';
    doSyscall(w, p, 'recvfrom');
  },
  fork: w => command(w, { type: 'fork', pid: 412 }),
  cow: w => {
    command(w, { type: 'fork', pid: 1455 });
    until(w, () => w.missions.has('cow'));
  },
  reap: w => {
    const pid = command(w, { type: 'fork', pid: 412 }) as number;
    command(w, { type: 'signal', pid, sig: 'KILL' });
    command(w, { type: 'reap', pid });
  },
  stopcont: w => {
    command(w, { type: 'signal', pid: 412, sig: 'STOP' });
    command(w, { type: 'signal', pid: 412, sig: 'CONT' });
  },
  kill: w => command(w, { type: 'signal', pid: 1455, sig: 'KILL' }),
  orphan: w => command(w, { type: 'signal', pid: 1320, sig: 'KILL' }),
  fifo: w => command(w, { type: 'fifo', pid: 1455 }),
  pin: w => command(w, { type: 'pin', pid: 1455 }),
  throttle: w => {
    command(w, { type: 'toggleCheckoutLimit' });
    until(w, () => w.missions.has('throttle'), 30);
  },
  cachemiss: w => {
    command(w, { type: 'lens', lens: 'pagecache' });
    const be = byComm(w, 'postgres: app checkout SELECT');
    for (let i = 0; i < 50 && !w.missions.has('cachemiss'); i++) {
      w.mem.cache = 10;
      fileRead(w, be);
    }
  },
  majfault: w => {
    command(w, { type: 'startLeak' });
    until(w, () => w.missions.has('majfault'), 120);
  },
  oom: w => {
    command(w, { type: 'startLeak' });
    until(w, () => w.missions.has('oom'), 90);
  },
  irq: w => {
    command(w, { type: 'lens', lens: 'interrupts' });
    command(w, { type: 'trafficBurst' });
    until(w, () => w.missions.has('irq'), 20);
  },
  ns: w => {
    command(w, { type: 'lens', lens: 'namespaces' });
    command(w, { type: 'nsView', inside: true });
  },
};

describe('missions', () => {
  test('there are 16 missions, each with how, learn and cmd', () => {
    expect(MISSIONS).toHaveLength(16);
    for (const m of MISSIONS) expect(m.how && m.learn && m.cmd).toBeTruthy();
  });

  for (const m of MISSIONS) {
    test(`mission "${m.id}" completes from a scripted command sequence`, () => {
      const w = world(11);
      record(w, 1);
      scripts[m.id](w);
      expect(w.missions.has(m.id)).toBe(true);
    });
  }

  test('missions already done are not announced again', () => {
    const w = world();
    command(w, { type: 'select', pid: 1 });
    const again = record(w, 0.1);
    command(w, { type: 'select', pid: 412 });
    expect(again.filter(e => e.type === 'mission.complete')).toHaveLength(0);
  });
});
