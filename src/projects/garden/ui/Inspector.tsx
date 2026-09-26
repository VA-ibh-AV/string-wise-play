import { ALGOS, lbConfig, type Algo } from '../content/algos';
import { KINDS } from '../content/kinds';
import {
  drain, entryFor, linkLat, nodeName, other, pctl, removeBody, removeLane, setAlgo, setCost, setHealthChecks, setLinkUp, setMode,
  staleCount, tracePath, K, type CacheNode, type ClientNode, type GNode, type LbNode, type Link, type RouterNode, type ServerNode, type World,
} from '../sim';
import { useGarden } from '../store';
import { Card, Seg, Slider, Stat } from './Controls';
import { fmtS, pct, useCtl, useLiveWorld } from './context';
import { bodyStatus } from '../controller';

function Head({ n }: { n: GNode }) {
  const ctl = useCtl();
  const w = useLiveWorld();
  return (
    <>
      <div className="g-ihead">
        <span className="g-dot" style={{ background: KINDS[n.type].color, color: KINDS[n.type].color }} />
        <div>
          <h2>{KINDS[n.type].label} {n.name}</h2>
          <div className="g-role">{KINDS[n.type].role}</div>
        </div>
        <button className="g-btn sm" onClick={() => ctl.select(null)} aria-label="Close inspector">
          Close
        </button>
      </div>
      <p className="g-now">
        <b>Now:</b> {bodyStatus(w, n)}
      </p>
      <p className="g-desc">{KINDS[n.type].blurb}</p>
    </>
  );
}

function Remove({ n }: { n: GNode }) {
  const ctl = useCtl();
  return (
    <div className="g-btns">
      <button className="g-btn warn" onClick={() => { removeBody(ctl.world, n); ctl.select(null); }}>
        Remove {KINDS[n.type].label.toLowerCase()}
      </button>
    </div>
  );
}

function pathText(w: World, n: GNode, prefs: GNode['type'][]) {
  const t = entryFor(w, n, prefs);
  if (!t) return 'no route to anything that makes crystals';
  const tr = tracePath(w, n.id, t.id);
  return tr.hops.map(id => nodeName(w, id)).join(' → ') + (tr.ok ? '' : `  ✕ ${tr.why}`);
}

function ProbeCard({ n }: { n: ClientNode }) {
  const w = useLiveWorld();
  const ctl = useCtl();
  const lats = n.recent.filter(x => x.ok).map(x => x.lat).sort((a, b) => a - b);
  return (
    <>
      <Head n={n} />
      <div className="g-btns">
        <button className="g-btn primary" onClick={() => ctl.follow(n.id)} disabled={w.traceNext === n.id}>
          {w.traceNext === n.id ? 'Sending…' : '✦ Follow a request'}
        </button>
      </div>
      <Slider label="Requests / s" min={0} max={8} step={0.25} value={n.rate} onChange={v => (n.rate = v)} fmt={v => v.toFixed(2)} />
      <div className="g-stats">
        <Stat label="answered">{n.ok}</Stat>
        <Stat label="failed">{n.fail}</Stat>
        <Stat label="p95, last 30">{lats.length ? fmtS(pctl(lats, 0.95)) : '–'}</Stat>
        <Stat label="in flight">{n.pending.size}</Stat>
      </div>
      <div className="g-pathline">
        Path right now, read from each relay’s own table<b>{pathText(w, n, ['cache', 'lb', 'server'])}</b>
      </div>
      <Card summary="Measure it on a real network" code={"curl -so /dev/null -w 'connect %{time_connect}s  total %{time_total}s\\n' https://sky.example/crystal/7\n\nmtr -rwc 20 sky.example   # the path, hop by hop"}>
        The glowing lanes are the path this probe’s requests take right now. During convergence it can point into a severed lane or loop back on itself.
      </Card>
      <Remove n={n} />
    </>
  );
}

const ORDER: Record<GNode['type'], number> = { client: 0, cache: 1, lb: 2, server: 3, router: 4 };

function RelayCard({ n }: { n: RouterNode }) {
  const w = useLiveWorld();
  let up = 0;
  for (const e of n.lsdb.values()) if (e.up) up++;
  const st = staleCount(w, n);
  const rows = [...w.nodes.values()].filter(m => m.id !== n.id).sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.id - b.id);
  return (
    <>
      <Head n={n} />
      <div className="g-stats">
        <Stat label="lanes it knows are up">{up}</Stat>
        <Stat label="its view">{st ? `${st} lane${st > 1 ? 's' : ''} out of date` : 'in sync'}</Stat>
      </div>
      <h3>Routing table</h3>
      <div className="g-tablewrap">
        <table className="g-rt">
          <thead>
            <tr><th>to</th><th>next hop</th><th>cost</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={3} className="dim">nothing else in the sky yet</td></tr>}
            {rows.map(m => {
              const lid = n.nh.get(m.id), L = lid != null ? w.links.get(lid) : undefined;
              if (!L) return <tr key={m.id}><td>{m.name}</td><td className="dim">unreachable</td><td className="dim">∞</td></tr>;
              const bad = !L.up || L.removed;
              return (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className={bad ? 'bad' : ''}>{nodeName(w, other(L, n.id))}{bad ? ' (severed)' : ''}</td>
                  <td>{n.dist.get(m.id)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Card summary="On a real router" code={"ip route show                      # this relay's table\ntraceroute -n 10.0.9.2             # the path, hop by hop\nvtysh -c 'show ip ospf neighbor'   # FRRouting: who it hears\nvtysh -c 'show ip ospf database'   # everything it knows"}>
        OSPF and IS-IS work like this: flood link state, then compute shortest paths locally. For a moment after a change, relays disagree. That window is convergence.
      </Card>
      <Remove n={n} />
    </>
  );
}

function PulsarCard({ n }: { n: LbNode }) {
  const w = useLiveWorld();
  let tot = 0;
  for (const v of n.share.values()) tot += v;
  const servers = [...w.nodes.values()].filter((s): s is ServerNode => s.type === 'server' && n.dist.has(s.id));
  const lm = n.lastMove;
  return (
    <>
      <Head n={n} />
      <h3>How it picks</h3>
      <Seg<Algo> label="Algorithm" value={n.algo} options={Object.entries(ALGOS).map(([k, a]) => [k as Algo, a.label])} onChange={a => setAlgo(n, a)} />
      <p className="g-desc">{ALGOS[n.algo].desc}</p>
      <label className="g-tog">
        <input type="checkbox" checked={n.hc} onChange={e => setHealthChecks(w, n, e.target.checked)} />
        <span>
          Active health checks<small>Every 1s. Two misses and the planet is out of rotation.</small>
        </span>
      </label>
      <h3>Planets</h3>
      <div className="g-tablewrap">
        <table className="g-rt">
          <thead>
            <tr><th>planet</th><th>health</th><th>in flight</th><th>share</th></tr>
          </thead>
          <tbody>
            {servers.length === 0 && <tr><td colSpan={4} className="dim">no reachable planets</td></tr>}
            {servers.map(s => {
              const h = n.health.get(s.id);
              return (
                <tr key={s.id}>
                  <td>{s.name}{s.mode !== 'ok' ? <span className="bad"> {s.mode}</span> : null}</td>
                  <td>{!n.hc ? <span className="dim">unchecked</span> : h && !h.up ? <span className="bad">out</span> : <span className="ok">ok</span>}</td>
                  <td>{n.inflight.get(s.id) || 0}</td>
                  <td>{tot > 0.01 ? Math.round(((n.share.get(s.id) || 0) / tot) * 100) + '%' : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {n.algo === 'hash' && (
        <p className="g-desc">
          {lm
            ? `Last rotation change (${lm.from} → ${lm.to} planets): ${lm.moved} of ${K} crystals moved. Hash mod N would have moved ${lm.modMoved}.`
            : `Change the rotation (remove a planet, or set one Down with health checks on) to see how many of the ${K} crystals move.`}
        </p>
      )}
      <Card summary="The same choice in nginx and HAProxy" code={lbConfig(n.algo)} open>
        HAProxy active checks: <code>server s1 10.0.0.11:80 check inter 1s fall 2 rise 1</code>. Open-source nginx only has passive checks (<code>max_fails</code>, <code>fail_timeout</code>).
      </Card>
      <Remove n={n} />
    </>
  );
}

function PlanetCard({ n }: { n: ServerNode }) {
  const w = useLiveWorld();
  return (
    <>
      <Head n={n} />
      <Seg<ServerNode['mode']> label="Health" value={n.mode} options={[['ok', 'Healthy'], ['slow', 'Slow'], ['down', 'Down']]} onChange={m => setMode(w, n, m)} />
      <Slider label="Worker moons" min={1} max={12} step={1} value={n.conc} onChange={v => (n.conc = v)} />
      <Slider label="Work time, s" min={0.1} max={2} step={0.05} value={n.svc} onChange={v => (n.svc = v)} fmt={v => v.toFixed(2)} />
      <div className="g-stats">
        <Stat label="busy moons">{n.busy.length}/{n.conc}</Stat>
        <Stat label="queued">{n.queue.length}/{n.qcap}</Stat>
        <Stat label="served / s">{(n.servedEW / 2).toFixed(1)}</Stat>
        <Stat label="turned away">{n.rejects}</Stat>
      </div>
      <Card summary="Is it keeping up?" code={"ss -ltn 'sport = :8080'   # Recv-Q: connections waiting to be accepted\ncurl -so /dev/null -w '%{time_starttransfer}\\n' http://s1:8080/crystal/7\n\n# Little's law: in flight = arrival rate × time in system"}>
        Slow means every request takes 6× longer. The process is up and passes health checks; it is just sluggish. Down means the process is gone: requests vanish and callers wait for their timeout.
      </Card>
      <Remove n={n} />
    </>
  );
}

function NebulaCard({ n }: { n: CacheNode }) {
  const w = useLiveWorld();
  let h = 0;
  for (const l of n.look) if (l.hit) h++;
  return (
    <>
      <Head n={n} />
      <Slider label="Size, crystals" min={2} max={40} step={1} value={n.cap} onChange={v => (n.cap = v)} />
      <Slider label="TTL, s" min={1} max={30} step={1} value={n.ttl} onChange={v => (n.ttl = v)} />
      <label className="g-tog">
        <input type="checkbox" checked={n.coalesce} onChange={e => (n.coalesce = e.target.checked)} />
        <span>
          Request coalescing<small>One fetch per crystal. Everyone else who wants it waits for that fetch.</small>
        </span>
      </label>
      <div className="g-stats">
        <Stat label="hit ratio, 10s">{n.look.length ? pct(h / n.look.length) : '–'}</Stat>
        <Stat label="holding">{n.store.size}/{n.cap} · evicted {n.evictions}</Stat>
        <Stat label="fetches to planets / s">{(n.fetchEW / 2).toFixed(1)}</Stat>
        <Stat label="same-crystal fetches, peak">{n.maxSame}</Stat>
      </div>
      <div className="g-btns">
        <button className="g-btn" onClick={() => drain(w, n)}>Drain the nebula</button>
      </div>
      <Card summary="The same nebula in nginx" code={"proxy_cache_path /var/cache/sky keys_zone=sky:10m max_size=1g;\n\nlocation /crystal/ {\n  proxy_cache sky;\n  proxy_cache_valid 200 10s;        # TTL\n  proxy_cache_lock on;              # coalescing: one fetch per key\n  proxy_cache_use_stale updating;   # serve old crystals while refreshing\n  add_header X-Cache $upstream_cache_status;\n  proxy_pass http://planets;\n}"}>
        proxy_cache_lock is coalescing: while one request fetches a missing crystal, the rest wait for it instead of stampeding the planets. Check hits with curl -sI and look at X-Cache.
      </Card>
      <Remove n={n} />
    </>
  );
}

function LaneCard({ L }: { L: Link }) {
  const w = useLiveWorld();
  const ctl = useCtl();
  const A = nodeName(w, L.a), B = nodeName(w, L.b);
  return (
    <>
      <div className="g-ihead">
        <span className="g-dot" style={{ background: '#9FF0D0', color: '#9FF0D0' }} />
        <div>
          <h2>Lane {A} ↔ {B}</h2>
          <div className="g-role">link</div>
        </div>
        <button className="g-btn sm" onClick={() => ctl.select(null)} aria-label="Close inspector">Close</button>
      </div>
      <p className="g-desc">Packets queue at each end, then travel the lane. Routing picks paths by <b>cost</b>, and the cost does not have to match the length.</p>
      <div className="g-stats">
        <Stat label="status">{L.up ? 'open' : `severed ${(w.t - L.cutAt).toFixed(1)}s ago`}</Stat>
        <Stat label="one-way delay">{fmtS(linkLat(w, L))}</Stat>
        <Stat label={`${A} → ${B}`}>{L.util.ab.toFixed(1)}/s · q {L.q.ab.length}</Stat>
        <Stat label={`${B} → ${A}`}>{L.util.ba.toFixed(1)}/s · q {L.q.ba.length}</Stat>
      </div>
      <Slider label="Routing cost" min={1} max={60} step={1} value={L.cost} onChange={v => setCost(w, L, v)} />
      <Slider label="Bandwidth, pkt/s" min={5} max={120} step={5} value={L.bw} onChange={v => (L.bw = v)} />
      <div className="g-btns">
        <button className="g-btn primary" onClick={() => setLinkUp(w, L, !L.up)}>{L.up ? 'Sever it' : 'Reconnect it'}</button>
        <button className="g-btn warn" onClick={() => { removeLane(w, L); ctl.select(null); }}>Remove lane</button>
      </div>
      <Card summary="On a real link" code={'ip link set dev eth1 down        # sever\nip link set dev eth1 up          # reconnect\ntc qdisc add dev eth1 root netem delay 80ms   # a longer lane\n\n# FRRouting: make this lane less attractive\ninterface eth1\n ip ospf cost 30\n ip ospf dead-interval 4'}>
        Sever a busy lane and watch: packets already heading into it are lost until the relays at each end notice (the dead interval), then the news spreads as violet rings. Real networks shrink that window with BFD.
      </Card>
    </>
  );
}

export function Inspector() {
  const sel = useGarden(s => s.sel);
  const w = useLiveWorld();
  if (!sel) {
    return (
      <div className="g-empty">
        <h2>Tap anything in the sky</h2>
        <p className="g-desc">Each body shows what it is doing right now, what it is in a real network, and the command you would use to check it on a real machine.</p>
      </div>
    );
  }
  if (sel.kind === 'link') {
    const L = w.links.get(sel.id);
    return L && !L.removed ? <LaneCard key={L.id} L={L} /> : null;
  }
  const n = w.nodes.get(sel.id);
  if (!n) return null;
  switch (n.type) {
    case 'client': return <ProbeCard key={n.id} n={n} />;
    case 'router': return <RelayCard key={n.id} n={n} />;
    case 'lb': return <PulsarCard key={n.id} n={n} />;
    case 'server': return <PlanetCard key={n.id} n={n} />;
    case 'cache': return <NebulaCard key={n.id} n={n} />;
  }
}

