import { Link } from 'react-router-dom';
import { CmdButton } from '@play/ui';
import { COMMANDS, TAKEAWAY } from '../content/commands';
import { HOPS } from '../content/route';
import { useDrift } from '../store';
import { fmtMs, useCtl } from './context';

export function Pause() {
  const phase = useDrift(s => s.phase);
  const sound = useDrift(s => s.sound);
  const ctl = useCtl();
  if (phase !== 'paused') return null;
  return (
    <div className="d-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="d-card d-pause">
        <h2>Paused</h2>
        <div className="d-actions col">
          <button className="d-btn primary big" onClick={() => ctl.resume()} autoFocus>Resume</button>
          <button className="d-btn" onClick={() => ctl.launch()}>Restart the flight</button>
          <button className="d-btn" aria-pressed={sound} onClick={() => ctl.toggleSound()}>{sound ? '♪ Sound on' : '♪ Sound off'}</button>
          <Link className="d-btn ghost" to="/">Leave to play</Link>
        </div>
      </div>
    </div>
  );
}

/** The flight as a traceroute, the takeaway, and real commands to try. */
export function Summary() {
  const phase = useDrift(s => s.phase);
  const result = useDrift(s => s.result);
  const passes = useDrift(s => s.passes);
  const best = useDrift(s => s.best);
  const ctl = useCtl();
  if (phase !== 'summary' || !result) return null;
  let total = 0;
  return (
    <div className="d-overlay scroll" role="dialog" aria-modal="true" aria-labelledby="d-sum-title">
      <div className="d-card d-summary">
        <p className="d-kicker">Delivered to nginx</p>
        <h2 id="d-sum-title">Your request arrived.</h2>
        <div className="d-stats">
          <div><b>{result.clean}/{HOPS.length}</b><span>clean passes</span></div>
          <div><b>{result.t.toFixed(1)}s</b><span>flight time{result.newBest ? ' · new best!' : best ? ` · best ${best.t.toFixed(1)}s` : ''}</span></div>
          <div><b>{fmtMs(result.ms)}</b><span>real-world latency</span></div>
        </div>
        <p className="d-takeaway">{TAKEAWAY}</p>
        <h3>Your flight as a traceroute</h3>
        <div className="d-tablewrap">
          <table className="d-trace">
            <thead>
              <tr><th>#</th><th>step</th><th>what happened</th><th>+ms</th><th>total</th></tr>
            </thead>
            <tbody>
              {HOPS.map((h, i) => {
                total += h.ms;
                return (
                  <tr key={i} className={passes[i] ?? ''}>
                    <td>{i + 1}</td>
                    <td>{h.title}</td>
                    <td className="d-what">{h.log}</td>
                    <td>{h.ms < 1 ? h.ms.toFixed(2) : h.ms}</td>
                    <td>{total < 10 ? total.toFixed(2) : total.toFixed(1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <h3>Try it on a real machine</h3>
        <div className="d-cmds">
          {COMMANDS.map(c => (
            <div key={c.cmd}>
              <CmdButton cmd={c.cmd} />
              <small>{c.what}</small>
            </div>
          ))}
        </div>
        <div className="d-actions">
          <button className="d-btn primary big" onClick={() => ctl.launch()} autoFocus>Fly again <small>Enter</small></button>
          <a className="d-btn" href="https://string-wise.com/tcp-internals" target="_blank" rel="noreferrer">Read: TCP internals ↗</a>
          <Link className="d-btn ghost" to="/">Back to play</Link>
        </div>
      </div>
    </div>
  );
}
