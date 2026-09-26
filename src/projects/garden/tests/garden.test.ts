import { describe, expect, test } from 'vitest';
import { MISSIONS, type MissionId } from '../content/missions';
import type { SeedKey } from '../content/seeds';
import {
  createWorld, drain, makeLane, plant, removeBody, run, sawTable, setAlgo, setHealthChecks, setLinkUp, setMode, solarFlare, tracePath,
  type CacheNode, type LbNode, type Link, type ServerNode, type World,
} from '../sim';

const byName = (w: World, name: string) => [...w.nodes.values()].find(n => n.name === name)!;
const lane = (w: World, a: string, b: string) =>
  [...w.links.values()].find(L => !L.removed && [L.a, L.b].sort().join() === [byName(w, a).id, byName(w, b).id].sort().join())!;
const world = (seed: SeedKey) => createWorld({ seed, rngSeed: 7 });

describe('routing', () => {
  test('every relay computes the cheapest path (Dijkstra over its own view)', () => {
    const w = world('ring');
    const tr = tracePath(w, byName(w, 'p1').id, byName(w, 's1').id);
    expect(tr.ok).toBe(true);
    // the r3–r5 shortcut costs +8, so the path goes over the top
    expect(tr.hops.map(id => w.nodes.get(id)!.name)).toEqual(['p1', 'r1', 'r2', 'r4', 'r6', 's1']);
  });

  test('severing a busy lane drops in-flight packets, then the sky converges around it', () => {
    const w = world('ring');
    run(w, 10);
    const L = lane(w, 'r2', 'r4');
    setLinkUp(w, L, false);
    expect(w.flags.cutAt).not.toBeNull();
    run(w, 6);
    expect(w.flags.cutDrops).toBeGreaterThan(0);
    expect(w.flags.convergedAfterCut).toBe(true);
    const tr = tracePath(w, byName(w, 'p1').id, byName(w, 's1').id);
    expect(tr.ok).toBe(true);
    expect(tr.lids).not.toContain(L.id);
  });

  test('a relay only learns about a cut after the dead interval', () => {
    const w = world('ring');
    const L = lane(w, 'r2', 'r4');
    const r1 = byName(w, 'r1');
    setLinkUp(w, L, false);
    run(w, w.cfg.detect * 0.5);
    expect(r1.lsdb.get(L.id)!.up).toBe(true); // still believes the old news
    run(w, w.cfg.detect + 2);
    expect(r1.lsdb.get(L.id)!.up).toBe(false);
  });
});

describe('load balancing', () => {
  test('least-conn sends less work to a slow planet than round robin', () => {
    const slowShare = (algo: 'rr' | 'least') => {
      const w = world('planets');
      const lb = byName(w, 'lb1') as LbNode;
      const slow = byName(w, 's1') as ServerNode;
      setAlgo(lb, algo);
      setMode(w, slow, 'slow');
      let picks = 0, toSlow = 0;
      w.bus.on('lb.pick', e => {
        picks++;
        if (e.server === slow.id) toSlow++;
      });
      run(w, 60);
      return toSlow / picks;
    };
    const rr = slowShare('rr'), least = slowShare('least');
    expect(rr).toBeGreaterThan(0.2); // round robin: one in four
    expect(least).toBeLessThan(rr * 0.8);
  });

  test('health checks take a down planet out of rotation', () => {
    const w = world('planets');
    const lb = byName(w, 'lb1') as LbNode;
    setHealthChecks(w, lb, true);
    setMode(w, byName(w, 's2') as ServerNode, 'down');
    run(w, 10);
    expect(lb.candList.map(s => s.name)).not.toContain('s2');
  });

  test('consistent hashing moves few keys when a planet leaves', () => {
    const w = world('planets');
    const lb = byName(w, 'lb1') as LbNode;
    setAlgo(lb, 'hash');
    run(w, 2);
    removeBody(w, byName(w, 's3'));
    run(w, 4);
    expect(lb.lastMove).not.toBeNull();
    expect(lb.lastMove!.moved).toBeLessThan(lb.lastMove!.modMoved);
    expect(w.flags.hashMoveOk).toBe(true);
  });
});

describe('caching', () => {
  test('a bigger nebula with a longer TTL hits more', () => {
    const hitRatio = (cap: number, ttl: number) => {
      const w = world('nebula');
      const n = byName(w, 'n1') as CacheNode;
      n.cap = cap;
      n.ttl = ttl;
      run(w, 40);
      return w.m.hit ?? 0;
    };
    expect(hitRatio(30, 25)).toBeGreaterThan(hitRatio(4, 2) + 0.2);
  });

  test('coalescing keeps same-crystal fetches to one', () => {
    const w = world('nebula');
    const n = byName(w, 'n1') as CacheNode;
    n.coalesce = true;
    run(w, 5);
    solarFlare(w);
    run(w, 1);
    drain(w, n);
    run(w, 8);
    expect(n.maxSame).toBeLessThanOrEqual(1);
  });
});

describe('building by hand', () => {
  test('a new probe answers once a lane connects it', () => {
    const w = world('empty');
    const p = plant(w, 'client', 0.1, 0.5);
    const s = plant(w, 'server', 0.9, 0.5);
    run(w, 3);
    expect(w.okTotal).toBe(0);
    makeLane(w, p.id, s.id);
    run(w, 10);
    expect(w.okTotal).toBeGreaterThan(5);
  });
});

const scripts: Record<MissionId, [SeedKey, (w: World) => void]> = {
  bloom: ['sky', w => { run(w, 2); followRequest(w, byName(w, 'p2').id); run(w, 20); }],
  rings: ['sky', w => { sawTable(w); run(w, 1); }],
  snip: ['ring', w => { run(w, 10); setLinkUp(w, lane(w, 'r2', 'r4'), false); run(w, 3); }],
  around: ['ring', w => { run(w, 10); setLinkUp(w, lane(w, 'r2', 'r4'), false); run(w, 30); }],
  share: ['planets', w => run(w, 30)],
  sick: ['planets', w => {
    const lb = byName(w, 'lb1') as LbNode;
    setAlgo(lb, 'least');
    setHealthChecks(w, lb, true);
    setMode(w, byName(w, 's1') as ServerNode, 'down');
    run(w, 60);
  }],
  deep: ['nebula', w => { const n = byName(w, 'n1') as CacheNode; n.cap = 30; n.ttl = 25; run(w, 40); }],
  stampede: ['nebula', w => {
    const n = byName(w, 'n1') as CacheNode;
    n.coalesce = true;
    run(w, 5);
    solarFlare(w);
    run(w, 1);
    drain(w, n);
    run(w, 10);
  }],
  hash: ['planets', w => { setAlgo(byName(w, 'lb1') as LbNode, 'hash'); run(w, 2); removeBody(w, byName(w, 's4')); run(w, 4); }],
};

describe('missions', () => {
  for (const m of MISSIONS) {
    test(`"${m.title}" completes from a scripted sequence`, () => {
      const [seed, script] = scripts[m.id];
      const w = world(seed);
      script(w);
      expect(w.missions.has(m.id)).toBe(true);
    });
  }
});

export type { Link };

import { JOURNEYS, byName as jByName } from '../content/journeys';
import { JourneyRunner } from '../journey';
import { followRequest, setCost, type GardenEvent } from '../sim';

describe('tracing', () => {
  test('a followed request is narrated hop by hop and comes home', () => {
    const w = world('sky');
    run(w, 2);
    const hops: GardenEvent[] = [];
    w.bus.on('trace', e => hops.push(e));
    const p = jByName(w, 'p2')!;
    followRequest(w, p.id);
    run(w, 20);
    const whats = hops.map(h => (h.type === 'trace' ? h.what : ''));
    expect(whats[0]).toBe('ask');
    expect(whats.filter(x => x === 'hop').length).toBeGreaterThanOrEqual(3);
    expect(whats).toContain('answer');
    expect(w.flags.tracedDone).toBe(true);
    // only one request is traced
    expect(whats.filter(x => x === 'ask')).toHaveLength(1);
  });
});

/** Scripted visitor for each journey: what a person would click. */
const visitor: Record<string, (w: World, r: JourneyRunner, select: (name: string) => void) => void> = {
  bloom: (_w, _r, select) => select('p2'),
  rings: (_w, r, select) => { select('r1'); r.advance(); },
  snip: (_w, r) => r.advance(),
  around: () => {},
  share: (_w, r, select) => { select('lb1'); r.advance(); },
  sick: (w, _r, select) => { select('s1'); setMode(w, byName(w, 's1') as ServerNode, 'slow'); setAlgo(byName(w, 'lb1') as LbNode, 'least'); setHealthChecks(w, byName(w, 'lb1') as LbNode, true); },
  deep: (w, _r, select) => { select('n1'); const n = byName(w, 'n1') as CacheNode; n.cap = 30; n.ttl = 25; },
  stampede: w => { (byName(w, 'n1') as CacheNode).coalesce = true; },
  hash: w => setAlgo(byName(w, 'lb1') as LbNode, 'hash'),
};

describe('journeys', () => {
  for (const j of JOURNEYS) {
    test(`journey "${j.title}" can be finished by a visitor`, () => {
      const w = createWorld({ seed: j.layout, rngSeed: 5 });
      let finished = false;
      const r = new JourneyRunner(w, s => (finished = !!s?.finished));
      w.bus.onAny(e => r.event(e));
      r.start(j.id);
      // selecting a relay opens its star chart, exactly as the controller does
      const select = (name: string) => {
        const n = byName(w, name);
        if (n.type === 'router') sawTable(w);
        r.event({ type: 'select', kind: 'node', id: n.id });
      };
      run(w, 3);
      visitor[j.id](w, r, select);
      // a patient visitor: presses the coach's button once per step, after a moment
      let acted: unknown = null, openFor = 0;
      for (let i = 0; i < 400 && !finished; i++) {
        run(w, 0.5);
        r.tick(0.5);
        if (r.step !== acted) {
          openFor += 0.5;
          if (openFor >= 1 && r.step?.action) {
            acted = r.step;
            openFor = 0;
            r.runAction();
          }
        }
      }
      run(w, 1);
      expect(finished).toBe(true);
      expect(w.missions.has(j.id)).toBe(true);
    });
  }
  void setCost;
});
