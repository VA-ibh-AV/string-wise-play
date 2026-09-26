import { Link } from 'react-router-dom';
import { MODES, type ModeId } from '../content/modes';
import { useOrbit } from '../store';
import { useCtl, useSys } from './context';

export function TopBar() {
  const sys = useSys();
  const ctl = useCtl();
  const playing = useOrbit(s => s.playing);
  const sound = useOrbit(s => s.sound);
  return (
    <header className="o-top">
      <div className="o-brand">
        <Link to="/" className="o-back">← play</Link>
        <h1>Orbit Synth</h1>
        <p>A music box that is secretly a CPU scheduler.</p>
      </div>
      <div className="o-modes" role="tablist" aria-label="Scheduler">
        {MODES.map(m => (
          <button key={m.id} role="tab" aria-selected={sys.mode === m.id} onClick={() => ctl.setMode(m.id as ModeId)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="o-ctrls">
        <div className="o-seg" role="group" aria-label="CPUs">
          {([1, 2] as const).map(n => (
            <button key={n} aria-pressed={sys.ncpu === n} onClick={() => ctl.setCpus(n)} title={`${n} CPU${n > 1 ? 's' : ''}`}>{n} CPU{n > 1 ? 's' : ''}</button>
          ))}
        </div>
        <button className="o-btn" onClick={() => ctl.togglePlay()} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button className="o-btn" aria-pressed={sound} onClick={() => ctl.toggleSound()}>{sound ? '♪ On' : '♪ Off'}</button>
        <button className="o-btn round" aria-label="How it works" onClick={() => useOrbit.setState({ intro: true })}>?</button>
      </div>
    </header>
  );
}
