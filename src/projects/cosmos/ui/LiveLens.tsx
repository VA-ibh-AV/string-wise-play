import type { LensId } from '../content/lenses';
import { memUsed, procList } from '../sim';
import { useCtl, useLiveWorld } from './context';
import { useLensAvailable } from './LiveBits';

const mb = (b: number) => Math.round(b / (1 << 20)) + 'M';

/** The live part of each lens when the data comes from a real host. */
export function LiveLens({ lens }: { lens: LensId }) {
  const w = useLiveWorld();
  const live = useCtl().live;
  const available = useLensAvailable(lens);
  if (!live) return null;
  if (!available) return <p className="hint unavailable">Not available on this host yet. The agent reports which lenses have real data; this one needs its eBPF collector.</p>;
  const procs = procList(w).filter(p => p.state !== 'Z');

  switch (lens) {
    case 'scheduler': {
      const rows = [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 10);
      return (
        <>
          <div className="kv">
            <span>load</span><span>{w.load.map(l => l.toFixed(2)).join(' ')}</span>
            <span>context switches</span><span>{w.cs.rate ? `${Math.round(w.cs.rate)}/s` : '—'}</span>
          </div>
          <table className="t">
            <thead><tr><th>process</th><th>%CPU</th><th>CPU</th></tr></thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.pid}><td className="ellip">{p.comm}</td><td>{(p.cpu * 100).toFixed(1)}</td><td>{p.onCpu >= 0 ? p.onCpu : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      );
    }
    case 'memory': {
      const ram = w.mem.ram, used = memUsed(w), cache = w.mem.cache, free = Math.max(0, ram - used - cache);
      const pc = (v: number) => ((v / ram) * 100).toFixed(1) + '%';
      const top = [...procs].sort((a, b) => b.rss - a.rss).slice(0, 6);
      return (
        <>
          <div>
            <h4 className="kicker">RAM · {Math.round(ram)}M</h4>
            <div className="bar tall"><i style={{ background: '#C7A4FF', width: pc(used) }} /><i style={{ background: 'var(--cache)', width: pc(cache) }} /></div>
            <div className="legend">
              <span><i style={{ background: '#C7A4FF' }} />used {Math.round(used)}M</span>
              <span><i style={{ background: 'var(--cache)' }} />buff/cache {Math.round(cache)}M</span>
              <span><i style={{ background: 'rgba(180,186,255,.2)' }} />free {Math.round(free)}M</span>
            </div>
          </div>
          {w.mem.swap > 0 && (
            <div>
              <h4 className="kicker">Swap · {Math.round(w.mem.swap)}M</h4>
              <div className="bar"><i style={{ background: '#9A8FB0', width: ((w.mem.swapUsed / w.mem.swap) * 100).toFixed(1) + '%' }} /></div>
              <div className="legend"><span>used {Math.round(w.mem.swapUsed)}M</span></div>
            </div>
          )}
          <ul className="mono-list">
            {top.map(p => <li key={p.pid}><span>{p.comm}</span><span>{Math.round(p.rss)}M</span></li>)}
          </ul>
        </>
      );
    }
    case 'pagecache':
      return (
        <div className="kv">
          <span>cache size</span><span>{Math.round(w.mem.cache)}M</span>
          <span>dirty</span><span>{mb(live.mem.dirty)}</span>
          <span>writeback</span><span>{mb(live.mem.writeback)}</span>
        </div>
      );
    case 'interrupts':
      return (
        <table className="t">
          <thead><tr><th>IRQ</th><th>CPU</th><th>per s</th></tr></thead>
          <tbody>{live.irq.map((q, i) => <tr key={i}><td>{q.name}</td><td>{q.cpu}</td><td>{q.rate.toFixed(0)}</td></tr>)}</tbody>
        </table>
      );
    case 'cgroups':
      return (
        <table className="t">
          <thead><tr><th>cgroup</th><th>throttled</th><th>memory</th><th>OOM</th></tr></thead>
          <tbody>
            {live.cgroups.map(c => (
              <tr key={c.label}>
                <td className="ellip">{c.label}</td>
                <td style={c.cpuThrottledPct > 1 ? { color: 'var(--rt)' } : undefined}>{c.cpuThrottledPct.toFixed(0)}%</td>
                <td>{mb(c.memCurrent)}{c.memMax !== null ? ` / ${mb(c.memMax)}` : ''}</td>
                <td>{c.oomKills}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'connections': {
      const conns = [...live.conns.values()];
      const byState = new Map<string, number>();
      conns.forEach(c => byState.set(c.state, (byState.get(c.state) ?? 0) + 1));
      return (
        <>
          <div className="kv">
            {[...byState].map(([s, n]) => [<span key={s}>{s}</span>, <span key={s + 'n'}>{n}</span>])}
          </div>
          <ul className="mono-list">
            {conns
              .sort((a, b) => (a.state === 'LISTEN' ? 0 : 1) - (b.state === 'LISTEN' ? 0 : 1))
              .slice(0, 12)
              .map(c => (
                <li key={c.id}>
                  <span>{c.state === 'LISTEN' ? `listen :${c.localPort || '·'}` : `${c.localPort ? ':' + c.localPort : '·'} ⇄ ${c.remote}${c.remotePort ? ':' + c.remotePort : ''}`}</span>
                  <span>{c.proto} {c.state === 'LISTEN' ? '' : c.state}</span>
                </li>
              ))}
          </ul>
          <p className="hint">Remote addresses are never sent: only loopback, lan or internet.</p>
        </>
      );
    }
    case 'namespaces': {
      const raw = procs.map(p => live.raw.get(p.pid)).filter(r => r?.ns);
      const groups = new Map<number, string[]>();
      raw.forEach(r => groups.set(r!.ns!.pid, [...(groups.get(r!.ns!.pid) ?? []), r!.name]));
      return (
        <>
          <table className="t">
            <thead><tr><th>PID namespace</th><th>processes</th></tr></thead>
            <tbody>
              {[...groups].map(([ns, names]) => (
                <tr key={ns}><td>{ns === live.hostPidNs ? `${ns} (host)` : ns}</td><td className="ellip">{names.slice(0, 4).join(', ')}{names.length > 4 ? ` +${names.length - 4}` : ''}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Processes outside the host PID namespace (containers) gather in the green bubble.</p>
        </>
      );
    }
  }
}
