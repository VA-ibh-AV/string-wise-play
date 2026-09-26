import { CmdButton } from '@play/ui';
import { MODES, SMP_NOTE } from '../content/modes';
import { useOrbit } from '../store';
import { useSys } from './context';

/** What this scheduler does, what to listen for, and what to try. */
export function ModeCard() {
  const sys = useSys();
  const open = useOrbit(s => s.infoOpen);
  const m = MODES.find(x => x.id === sys.mode)!;
  return (
    <section className={`o-mode ${open ? '' : 'closed'}`} aria-label={m.title}>
      <button className="o-mode-head" aria-expanded={open} onClick={() => useOrbit.setState({ infoOpen: !open })}>
        <span>
          <b>{m.title}</b>
          <small>♪ {m.hear}</small>
        </span>
        <i aria-hidden="true">{open ? '−' : '+'}</i>
      </button>
      {open && (
        <div className="o-mode-body">
          <p>{m.text}</p>
          {sys.ncpu === 2 && sys.mode !== 'free' && <p className="o-smp">{SMP_NOTE}</p>}
          <h3>Try this</h3>
          <ul className="o-tries">
            {m.tries.map(t => <li key={t}>{t}</li>)}
          </ul>
          <h3>On a real machine</h3>
          <div className="o-cmds">{m.cmds.map(c => <CmdButton key={c} cmd={c} />)}</div>
        </div>
      )}
    </section>
  );
}
