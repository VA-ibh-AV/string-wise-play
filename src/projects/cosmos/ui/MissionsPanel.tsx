import { CmdButton, GlassPanel } from '@play/ui';
import { MISSIONS } from '../content/missions';
import { useCosmos } from '../store';
import { useCtl } from './context';

export function MissionsPanel() {
  const open = useCosmos(s => s.missionsOpen);
  const done = useCosmos(s => s.done);
  const ctl = useCtl();
  if (!open) return null;
  return (
    <GlassPanel className="side" aria-label="Missions">
      <div className="head">
        <span />
        <div>
          <h2>Missions</h2>
          <div className="ids">
            {done.length} of {MISSIONS.length} complete · no timer, no score
          </div>
        </div>
        <button className="close" aria-label="Close" onClick={() => useCosmos.setState({ missionsOpen: false })}>
          ✕
        </button>
      </div>
      <ul className="mlist">
        {MISSIONS.map(m => {
          const ok = done.includes(m.id);
          return (
            <li key={m.id} className={ok ? 'done' : ''}>
              <span className="ck" aria-label={ok ? 'done' : 'not done'} />
              <div>
                <b>{m.title}</b>
                {ok ? (
                  <>
                    <small className="learn">{m.learn}</small>
                    <CmdButton cmd={m.cmd} />
                  </>
                ) : (
                  <small>{m.how}</small>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <button className="subtle" onClick={() => ctl.resetProgress()}>
          Reset progress
        </button>
      )}
    </GlassPanel>
  );
}
