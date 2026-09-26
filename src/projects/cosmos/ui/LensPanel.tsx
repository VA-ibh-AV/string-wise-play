import { CmdList, GlassPanel, RichText } from '@play/ui';
import { LENSES } from '../content/lenses';
import {
  CHECKOUT, connectionPairs, hasLeak, isThrottled, memUsed, podMembers, procList, RAM, SWAP, type World,
} from '../sim';
import { useCosmos } from '../store';
import { useCtl, useLiveWorld } from './context';

export function LensPanel() {
  const lens = useCosmos(s => s.lens);
  const def = LENSES.find(l => l.id === lens);
  if (!def) return null;
  return (
    <GlassPanel className="lens" aria-label={`${def.label} lens`}>
      <h3>{def.title}</h3>
      {def.body.map((t, i) => (
        <p key={i}>
          <RichText text={t} />
        </p>
      ))}
      <LensActions />
      <div className="live">
        <LensLive />
      </div>
      <CmdList cmds={def.cmds} />
    </GlassPanel>
  );
}

/** Static structure, so buttons are never re-rendered away mid-click. */
function LensActions() {
  const lens = useCosmos(s => s.lens);
  const nsInside = useCosmos(s => s.nsInside);
  const w = useLiveWorld();
  const ctl = useCtl();
  const cmd = ctl.cmd.bind(ctl);
  switch (lens) {
    case 'memory':
      return (
        <div className="row">
          <button disabled={hasLeak(w)} onClick={() => cmd({ type: 'startLeak' })}>
            Start a memory leak
          </button>
          <button onClick={() => cmd({ type: 'dropCaches' })}>Drop caches</button>
        </div>
      );
    case 'pagecache':
      return (
        <div className="row">
          <button onClick={() => cmd({ type: 'dropCaches' })}>Drop caches</button>
        </div>
      );
    case 'interrupts':
      return (
        <div className="row">
          <button onClick={() => cmd({ type: 'trafficBurst' })}>Send a traffic burst</button>
        </div>
      );
    case 'cgroups': {
      const limited = (w.cgroups.get(CHECKOUT)?.quota ?? Infinity) !== Infinity;
      return (
        <div className="row">
          <button onClick={() => cmd({ type: 'toggleCheckoutLimit' })}>{limited ? 'Remove the checkout pod limit' : 'Limit checkout pod to 0.5 CPU'}</button>
        </div>
      );
    }
    case 'namespaces':
      return (
        <div className="row">
          <button aria-pressed={nsInside} onClick={() => cmd({ type: 'nsView', inside: !nsInside })}>
            {nsInside ? 'Back to the host view' : 'View from inside the pod'}
          </button>
        </div>
      );
    default:
      return null;
  }
}

function LensLive() {
  const lens = useCosmos(s => s.lens);
  const w = useLiveWorld();
  switch (lens) {
    case 'scheduler':
      return <SchedulerLive w={w} />;
    case 'memory':
      return <MemoryLive w={w} />;
    case 'pagecache': {
      const m = w.mem, tot = m.hits + m.misses;
      return (
        <>
          <div className="kv">
            <span>cache size</span><span>{Math.round(m.cache)}M</span>
            <span>hits</span><span>{m.hits}</span>
            <span>misses</span><span>{m.misses}</span>
            <span>hit ratio</span><span>{tot ? ((m.hits / tot) * 100).toFixed(0) + '%' : '–'}</span>
          </div>
          <p className="hint">Postgres backends and cron's backup.sh read files with pread64. Press "Drop syscalls" to make more reads happen.</p>
        </>
      );
    }
    case 'interrupts':
      return (
        <>
          <table className="t">
            <thead>
              <tr>
                <th>IRQ</th>
                {w.cpus.map(c => <th key={c.id}>CPU{c.id}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr><td>45 eth0</td>{w.irq.perCpu.map((c, i) => <td key={i}>{c.eth}</td>)}</tr>
              <tr><td>38 nvme0q</td>{w.irq.perCpu.map((c, i) => <td key={i}>{c.nvme}</td>)}</tr>
              <tr><td>LOC timer</td>{w.irq.perCpu.map((c, i) => <td key={i}>{c.loc}</td>)}</tr>
            </tbody>
          </table>
          <div className="kv">
            <span>NET_RX softirqs</span><span>{w.irq.netrx}</span>
            <span>ksoftirqd wake-ups</span><span>{w.irq.ksoftirqd}</span>
          </div>
        </>
      );
    case 'cgroups': {
      const names = [...w.cgroups.keys()].filter(k => procList(w).some(p => p.service === k && p.state !== 'Z')).sort();
      return (
        <table className="t">
          <thead>
            <tr><th>cgroup</th><th>cpu.max</th><th>CPU</th><th>throttled</th></tr>
          </thead>
          <tbody>
            {names.map(k => {
              const cg = w.cgroups.get(k)!;
              return (
                <tr key={k}>
                  <td className="ellip">{k}</td>
                  <td>{cg.quota === Infinity ? 'max' : `${cg.quota * 100000} 100000`}</td>
                  <td>{(cg.usage * 100).toFixed(0)}%</td>
                  <td style={cg.throttled ? { color: 'var(--rt)' } : undefined}>{cg.nrThrottled}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }
    case 'connections':
      return (
        <ul className="mono-list">
          {connectionPairs(w).slice(0, 9).map(([a, b]) => (
            <li key={`${a.pid}:${b.pid}`}>
              <span>{a.comm} ⇄ {b.comm}</span>
              <span>TCP</span>
            </li>
          ))}
        </ul>
      );
    case 'namespaces':
      return (
        <>
          <table className="t">
            <thead>
              <tr><th>process</th><th>PID on host</th><th>PID in pod</th></tr>
            </thead>
            <tbody>
              {podMembers(w).map(p => (
                <tr key={p.pid}><td>{p.comm}</td><td>{p.pid}</td><td>{p.nsPid}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">
            {w.view.nsInside ? 'Inside the pod, only its own processes exist. Everything else has faded out.' : 'From the host, every process is visible with its real PID.'}
          </p>
        </>
      );
    default:
      return null;
  }
}

function SchedulerLive({ w }: { w: World }) {
  const run = procList(w).filter(p => p.state === 'R' && p.oomT === null);
  const rt = run.filter(p => p.policy === 'FIFO');
  const cf = run.filter(p => p.policy !== 'FIFO').sort((a, b) => a.vruntime - b.vruntime);
  const minV = cf.length ? cf[0].vruntime : 0;
  const span = Math.max(8, ...cf.map(p => p.vruntime - minV));
  return (
    <>
      <div className="kv">
        <span>context switches</span><span>{w.cs.rate.toFixed(1)}/s · total {w.cs.total}</span>
        <span>runnable</span><span>{run.length} tasks on {w.cpus.length} CPUs</span>
      </div>
      <div className="rq">
        {run.length === 0 && <p>Everything is asleep. All four CPUs are idle.</p>}
        {[...rt, ...cf].slice(0, 10).map(p => {
          const thr = isThrottled(w, p.service);
          const tag = p.policy === 'FIFO' ? <span style={{ color: 'var(--rt)' }}>FIFO</span> : thr ? <span style={{ color: 'var(--rt)' }}>thrtl</span> : p.onCpu >= 0 ? 'CPU' + p.onCpu : 'wait';
          const width = p.policy === 'FIFO' ? 4 : 8 + (92 * (p.vruntime - minV)) / span;
          return (
            <div className="r" key={p.pid}>
              <span className="n">
                {p.comm} <span className="faint">{p.pid}{p.affinity !== null ? ' ·pin' : ''}</span>
              </span>
              <span className="bar"><i style={{ background: 'var(--sun)', width: width + '%' }} /></span>
              <span className={`c ${p.onCpu < 0 ? 'w' : ''}`}>{tag}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function MemoryLive({ w }: { w: World }) {
  const used = memUsed(w), cache = w.mem.cache, free = Math.max(0, RAM - used - cache);
  const pc = (v: number) => ((v / RAM) * 100).toFixed(1) + '%';
  const leak = procList(w).find(q => q.comm === 'leaky-job' && q.state !== 'Z');
  return (
    <>
      <div>
        <h4 className="kicker">RAM · {RAM}M</h4>
        <div className="bar tall" role="img" aria-label={`RAM: ${Math.round(used)}M used, ${Math.round(cache)}M cache, ${Math.round(free)}M free`}>
          <i style={{ background: '#C7A4FF', width: pc(used) }} />
          <i style={{ background: 'var(--cache)', width: pc(cache) }} />
        </div>
        <div className="legend">
          <span><i style={{ background: '#C7A4FF' }} />used {Math.round(used)}M</span>
          <span><i style={{ background: 'var(--cache)' }} />buff/cache {Math.round(cache)}M</span>
          <span><i style={{ background: 'rgba(180,186,255,.2)' }} />free {Math.round(free)}M</span>
        </div>
      </div>
      <div>
        <h4 className="kicker">Swap · {SWAP}M</h4>
        <div className="bar" role="img" aria-label={`Swap: ${Math.round(w.mem.swapUsed)}M used`}>
          <i style={{ background: '#9A8FB0', width: ((w.mem.swapUsed / SWAP) * 100).toFixed(1) + '%' }} />
        </div>
        <div className="legend">
          <span>used {Math.round(w.mem.swapUsed)}M</span>
          {leak && <span style={{ color: '#E86A9A' }}>leaky-job RSS {Math.round(leak.rss)}M and growing</span>}
        </div>
      </div>
      {w.dmesg.length > 0 && (
        <div>
          <h4 className="kicker">dmesg</h4>
          <div className="dmesg">
            {w.dmesg.slice(0, 4).map(l => <span key={l}>{l}</span>)}
          </div>
        </div>
      )}
    </>
  );
}
