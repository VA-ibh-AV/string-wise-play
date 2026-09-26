import { CmdList, GlassPanel, Pill, StatGrid } from '@play/ui';
import { syscallNote } from '../content/syscalls';
import { OTHER_VPID } from '../data/live-adapter';
import { useCosmos } from '../store';
import { hex, STATE_TXT, useCtl, useLiveWorld } from './context';

const fmtMB = (b: number) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(1) + 'G' : Math.round(b / (1 << 20)) + 'M');

/** Process card for a real host: explanations and commands, no actions. */
export function LiveProcessCard() {
  const selected = useCosmos(s => s.selected);
  const w = useLiveWorld();
  const ctl = useCtl();
  const live = ctl.live;
  const p = selected !== null ? w.procs.get(selected) : undefined;
  const raw = selected !== null ? live?.raw.get(selected) : undefined;
  if (!p || !raw || !live) return null;
  const [letter, txt, col] = STATE_TXT[p.state];
  const isOther = p.pid === OTHER_VPID;
  const parent = w.procs.get(p.ppid);

  return (
    <GlassPanel className="side" aria-label={`Process ${p.comm}`}>
      <div className="head">
        <span className="dot" style={{ color: hex(p.color) }} />
        <div>
          <h2>{p.comm}</h2>
          <div className="ids">
            {isOther ? 'aggregate' : `vpid ${p.pid}`}
            {parent ? ` · parent ${parent.comm}` : ''}
            {raw.cgroup ? ` · ${raw.cgroup}` : ''}
          </div>
        </div>
        <button className="close" aria-label="Close" onClick={() => ctl.select(null)}>
          ✕
        </button>
      </div>
      {!isOther && (
        <div className="state">
          <Pill color={col}>{p.onCpu >= 0 ? `R · CPU${p.onCpu}` : letter}</Pill>
          <span>{p.state === 'Z' ? 'exited' : p.onCpu >= 0 ? 'using a CPU this tick' : txt}</span>
        </div>
      )}
      <StatGrid
        items={[
          { label: '%CPU', value: (raw.cpu * 100).toFixed(1) },
          { label: 'threads', value: isOther ? '—' : raw.threads },
          { label: 'RSS', value: fmtMB(raw.rssBytes) },
          { label: 'policy', value: raw.policy ?? '—' },
          { label: 'nice', value: raw.nice ?? '—' },
          { label: 'CPUs', value: raw.affinity ? (raw.affinity.length === w.cpus.length ? 'all' : raw.affinity.join(',')) : '—' },
          { label: 'faults/s min', value: raw.minflt.toFixed(0) },
          { label: 'faults/s maj', value: raw.majflt.toFixed(0) },
          { label: 'syscalls/s', value: raw.sysRate ? raw.sysRate.toFixed(0) : '—' },
        ]}
      />
      <p className="about">{p.about}</p>
      {raw.topSys.length > 0 && (
        <div>
          <h3 className="kicker">Top syscalls (sampled)</h3>
          <ul className="mono-list">
            {raw.topSys.map(([name, n]) => (
              <li key={name}>
                <span>
                  {name}() · {n}
                </span>
                <span>{syscallNote(name)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="hint">
        This is a real machine, so it is view-only. Signals, fork() and scheduling changes are in the Sandbox tab. Real PIDs, arguments, users and addresses are never sent;
        numbers here are virtual PIDs.
      </p>
      <CmdList
        cmds={[
          'ps -o pid,ppid,stat,ni,cls,psr,nlwp,rss,min_flt,maj_flt,comm -p PID',
          'cat /proc/PID/stat /proc/PID/statm',
          'kill -STOP PID   # what SIGSTOP would do: state T',
          'cat /proc/PID/cgroup',
        ]}
      />
    </GlassPanel>
  );
}
