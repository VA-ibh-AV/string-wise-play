import { Link } from 'react-router-dom';
import { MODES, type ModeId } from '../content/modes';
import { useOrbit, type OrbitSource } from '../store';
import { useCtl, useSys } from './context';

export function TopBar({ onSource, liveOffline }: { onSource: (s: OrbitSource) => void; liveOffline: boolean }) {
  const sys = useSys();
  const ctl = useCtl();
  const playing = useOrbit(s => s.playing);
  const sound = useOrbit(s => s.sound);
  const source = useOrbit(s => s.source);
  return (
    <header className="o-top">
      <div className="o-brand">
        <Link to="/" className="o-back">← play</Link>
        <h1>Orbit Synth</h1>
        <p>A music box that is secretly a CPU scheduler.</p>
        <div className="o-source" role="tablist" aria-label="Data source">
          <button role="tab" aria-selected={source === 'live'} onClick={() => onSource('live')}>
            <span className={`o-live-dot ${liveOffline ? 'off' : ''}`} aria-hidden="true" /> Live{liveOffline ? ' · offline' : ''}
          </button>
          <button role="tab" aria-selected={source === 'sandbox'} onClick={() => onSource('sandbox')}>Sandbox</button>
        </div>
      </div>
      {source === 'sandbox' ? (
        <div className="o-modes" role="tablist" aria-label="Scheduler">
          {MODES.map(m => (
            <button key={m.id} role="tab" aria-selected={sys.mode === m.id} onClick={() => ctl.setMode(m.id as ModeId)}>
              {m.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="o-modes o-modes-live" aria-label="Scheduler">
          <span>Scheduler: the real Linux kernel</span>
        </div>
      )}
      <div className="o-ctrls">
        {source === 'sandbox' && (
          <div className="o-seg" role="group" aria-label="CPUs">
            {([1, 2] as const).map(n => (
              <button key={n} aria-pressed={sys.ncpu === n} onClick={() => ctl.setCpus(n)} title={`${n} CPU${n > 1 ? 's' : ''}`}>{n} CPU{n > 1 ? 's' : ''}</button>
            ))}
          </div>
        )}
        <button className="o-btn" onClick={() => ctl.togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button className="o-btn" aria-pressed={sound} onClick={() => ctl.toggleSound()}>{sound ? '♪ On' : '♪ Off'}</button>
        <button className="o-btn round" aria-label="How it works" onClick={() => useOrbit.setState({ intro: true })}>?</button>
      </div>
    </header>
  );
}
