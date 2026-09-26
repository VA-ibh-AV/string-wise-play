import { describe, expect, test } from 'vitest';
import { command, record } from '../sim';
import { block } from '../sim/state';
import { byComm, world } from './helpers';

describe('signals and lifecycle', () => {
  test('SIGKILL on a task in D is deferred until the disk interrupt', () => {
    const w = world();
    const wal = byComm(w, 'postgres: walwriter');
    block(w, wal, 'D', 1, 'fsync()');
    command(w, { type: 'signal', pid: wal.pid, sig: 'KILL' });
    expect(wal.state).toBe('D');
    expect(wal.pendingKill).toBe(true);
    const events = record(w, 3);
    const irq = events.findIndex(e => e.type === 'irq.disk' && e.pid === wal.pid);
    const exit = events.findIndex(e => e.type === 'proc.exit' && e.pid === wal.pid);
    expect(irq).toBeGreaterThanOrEqual(0);
    expect(exit).toBeGreaterThan(irq);
  });

  test('SIGTERM sent while stopped is delivered on SIGCONT', () => {
    const w = world();
    const redis = byComm(w, 'redis-server');
    command(w, { type: 'signal', pid: redis.pid, sig: 'STOP' });
    expect(redis.state).toBe('T');
    command(w, { type: 'signal', pid: redis.pid, sig: 'TERM' });
    expect(redis.pendingTerm).toBe(true);
    expect(record(w, 5).some(e => e.type === 'proc.exit')).toBe(false);
    command(w, { type: 'signal', pid: redis.pid, sig: 'CONT' });
    const events = record(w, 4);
    const exit = events.find(e => e.type === 'proc.exit' && e.pid === redis.pid);
    expect(exit && exit.type === 'proc.exit' && exit.reason).toBe('exit(0) after SIGTERM');
  });

  test('PID 1 and kernel threads ignore signals', () => {
    const w = world();
    command(w, { type: 'signal', pid: 1, sig: 'KILL' });
    command(w, { type: 'signal', pid: 14, sig: 'KILL' });
    expect(w.procs.get(1)!.state).not.toBe('Z');
    expect(w.procs.get(14)!.state).not.toBe('Z');
  });

  test("an orphan's ppid becomes 1 and systemd restarts the unit with new PIDs", () => {
    const w = world();
    command(w, { type: 'signal', pid: 901, sig: 'KILL' });
    for (const pid of [902, 903, 904, 905]) expect(w.procs.get(pid)?.ppid).toBe(1);
    const events = record(w, 9);
    expect(events.some(e => e.type === 'service.restart' && e.name === 'nginx.service')).toBe(true);
    const nginx = [...w.procs.values()].filter(p => p.service === 'nginx.service' && p.state !== 'Z');
    expect(nginx.length).toBe(5);
    for (const p of nginx) expect(p.pid).toBeGreaterThanOrEqual(3100);
    const master = nginx.find(p => p.comm === 'nginx: master')!;
    expect(nginx.filter(p => p.ppid === master.pid)).toHaveLength(4);
  });

  test('zombies are reaped by their parent after 7 s', () => {
    const w = world();
    const pid = command(w, { type: 'fork', pid: 412 }) as number;
    command(w, { type: 'signal', pid, sig: 'KILL' });
    expect(w.procs.get(pid)!.state).toBe('Z');
    record(w, 6.5);
    expect(w.procs.has(pid)).toBe(true);
    record(w, 1);
    expect(w.procs.has(pid)).toBe(false);
  });

  test('the nginx master forks a replacement 2.5 s after a worker dies', () => {
    const w = world();
    command(w, { type: 'signal', pid: 903, sig: 'KILL' });
    const events = record(w, 3);
    expect(events.some(e => e.type === 'proc.fork' && e.parent === 901)).toBe(true);
  });
});
