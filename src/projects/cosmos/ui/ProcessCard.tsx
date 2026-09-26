import { CmdList, GlassPanel, Pill, StatGrid } from '@play/ui';
import { SYSCALLS } from '../content/syscalls';
import { isThrottled, oomScore, shownPid, insidePod, type Proc } from '../sim';
import { useCosmos } from '../store';
import { hex, STATE_TXT, useCtl, useLiveWorld } from './context';

export function ProcessCard() {
  const selected = useCosmos(s => s.selected);
  const w = useLiveWorld();
  const ctl = useCtl();
  const p = selected !== null ? w.procs.get(selected) : undefined;
  if (!p) return null;

  const [letter, txt, col] = STATE_TXT[p.state];
  const thr = isThrottled(w, p.service);
  const pill = p.oomT !== null ? 'OOM' : p.onCpu >= 0 ? `R · CPU${p.onCpu}` : letter;
  const stateText = p.oomT !== null ? 'being killed by the OOM killer' : p.onCpu >= 0 ? 'on a CPU right now' : thr ? 'runnable, but its cgroup is throttled' : txt;
  const nsNote = p.ns ? (insidePod(w) ? ` · host PID ${p.pid}` : ` · PID ${p.nsPid} in pod`) : '';
  const fds = p.kind === 'kernel' ? ['(kernel thread, no files)'] : ['0 /dev/null', '1 socket:[journal]', '2 socket:[journal]', ...p.fds];

  return (
    <GlassPanel className="side" aria-label={`Process ${p.comm}`}>
      <div className="head">
        <span className="dot" style={{ color: hex(p.color) }} />
        <div>
          <h2>{p.comm}</h2>
          <div className="ids">
            PID {shownPid(w, p)} · PPID {p.ppid} · {p.user}
            {nsNote}
            {p.service ? ' · ' + p.service : ''}
          </div>
        </div>
        <button className="close" aria-label="Close" onClick={() => ctl.select(null)}>
          ✕
        </button>
      </div>
      <div className="state">
        <Pill color={p.oomT !== null ? 'var(--disk)' : col}>{pill}</Pill>
        <span>{stateText}</span>
      </div>
      <StatGrid
        items={[
          { label: '%CPU', value: (p.cpu * 100).toFixed(1) },
          { label: 'nice', value: p.nice },
          { label: 'vruntime', value: p.vruntime.toFixed(0) + ' ms' },
          { label: 'policy', value: p.policy === 'FIFO' ? 'FIFO 50' : 'OTHER' },
          { label: 'CPUs', value: p.affinity === null ? '0-3' : String(p.affinity) },
          { label: 'threads', value: p.threads },
        ]}
      />
      <div>
        <h3 className="kicker">Memory</h3>
        <StatGrid
          items={[
            { label: 'RSS', value: Math.round(p.rss) + 'M' },
            { label: 'swap', value: Math.round(p.swapped) + 'M' },
            { label: 'COW shared', value: Math.round(p.shared) + 'M' },
            { label: 'VSZ', value: Math.round(p.vsz) + 'M' },
            { label: 'faults min/maj', value: `${p.minflt}/${p.majflt}` },
            { label: 'oom_score', value: oomScore(p) },
          ]}
        />
      </div>
      <p className="about">{p.about}</p>
      <div>
        <h3 className="kicker">Recent syscalls</h3>
        <ul className="mono-list">
          {p.recent.length ? (
            p.recent.slice(0, 5).map((r, i) => (
              <li key={i}>
                <span>{r.name}()</span>
                <span>{SYSCALLS[r.name].note}</span>
              </li>
            ))
          ) : (
            <li>
              <span className="hint">Waiting for its next syscall…</span>
            </li>
          )}
        </ul>
      </div>
      <div>
        <h3 className="kicker">File descriptors · /proc/{p.pid}/fd</h3>
        <ul className="mono-list fd">
          {fds.map(f => (
            <li key={f}>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>
      <Actions p={p} />
      <CmdList
        cmds={[
          `ps -o pid,ppid,stat,ni,cls,psr,rss,vsz,min_flt,maj_flt -p ${p.pid}`,
          `cat /proc/${p.pid}/status`,
          `ls -l /proc/${p.pid}/fd`,
          `cat /proc/${p.pid}/oom_score`,
        ]}
      />
    </GlassPanel>
  );
}

function Actions({ p }: { p: Proc }) {
  const ctl = useCtl();
  const pid = p.pid;
  if (p.state === 'Z') {
    return (
      <div className="acts">
        <div className="actions">
          <button onClick={() => ctl.cmd({ type: 'reap', pid })}>parent: wait4()</button>
        </div>
        <p className="hint">
          {p.exitReason ?? 'exited'}. Its parent (PID {p.ppid}) has not collected the exit status yet.
        </p>
      </div>
    );
  }
  if (p.kind === 'kernel') return <p className="hint">Kernel threads cannot be forked, signalled or reniced from user space.</p>;
  const sig = (s: 'TERM' | 'STOP' | 'CONT' | 'KILL') => () => ctl.cmd({ type: 'signal', pid, sig: s });
  return (
    <div className="acts">
      <div>
        <h3 className="kicker">Process</h3>
        <div className="actions">
          <button onClick={() => ctl.fork(pid)}>fork()</button>
          <button onClick={() => ctl.cmd({ type: 'nice', pid, delta: -5 })}>nice −5</button>
          <button onClick={() => ctl.cmd({ type: 'nice', pid, delta: 5 })}>nice +5</button>
        </div>
      </div>
      <div>
        <h3 className="kicker">Signals</h3>
        <div className="actions">
          <button onClick={sig('TERM')}>SIGTERM</button>
          {p.state === 'T' ? <button onClick={sig('CONT')}>SIGCONT</button> : <button onClick={sig('STOP')}>SIGSTOP</button>}
          <button className="warn" onClick={sig('KILL')}>
            SIGKILL
          </button>
        </div>
      </div>
      <div>
        <h3 className="kicker">Scheduling</h3>
        <div className="actions">
          <button aria-pressed={p.policy === 'FIFO'} onClick={() => ctl.cmd({ type: 'fifo', pid })}>
            {p.policy === 'FIFO' ? 'back to SCHED_OTHER' : 'SCHED_FIFO'}
          </button>
          <button aria-pressed={p.affinity !== null} onClick={() => ctl.cmd({ type: 'pin', pid })}>
            {p.affinity !== null ? 'unpin' : 'pin to CPU0'}
          </button>
        </div>
      </div>
      <div>
        <h3 className="kicker">Memory</h3>
        <div className="actions">
          <button aria-pressed={p.oomAdj <= -1000} onClick={() => ctl.cmd({ type: 'oomProtect', pid })}>
            {p.oomAdj <= -1000 ? 'oom_score_adj 0' : 'protect: oom_score_adj −1000'}
          </button>
        </div>
      </div>
    </div>
  );
}
