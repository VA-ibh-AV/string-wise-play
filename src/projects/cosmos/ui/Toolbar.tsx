import { MISSIONS } from '../content/missions';
import { useCosmos } from '../store';
import { useCtl } from './context';

const SPEEDS = [
  { v: 0, label: 'Pause', text: '❚❚' },
  { v: 1, label: 'Normal speed', text: '1×' },
  { v: 2, label: 'Double speed', text: '2×' },
];

export function Toolbar() {
  const ctl = useCtl();
  const sound = useCosmos(s => s.sound);
  const done = useCosmos(s => s.done.length);
  const open = useCosmos(s => s.missionsOpen);
  const speed = useCosmos(s => s.speed);
  return (
    <div className="tools">
      <div className="speed" role="group" aria-label="Simulation speed">
        {SPEEDS.map(s => (
          <button key={s.v} aria-label={s.label} aria-pressed={speed === s.v} onClick={() => ctl.setSpeed(s.v)}>
            {s.text}
          </button>
        ))}
      </div>
      <button aria-pressed={sound} onClick={() => ctl.toggleSound()}>
        {sound ? 'Sound on' : 'Sound off'}
      </button>
      <button onClick={() => ctl.dropSyscalls()}>Drop syscalls</button>
      <button
        aria-pressed={open}
        onClick={() => {
          if (!open) ctl.select(null);
          useCosmos.setState({ missionsOpen: !open });
        }}
      >
        Missions {done}/{MISSIONS.length}
      </button>
    </div>
  );
}
