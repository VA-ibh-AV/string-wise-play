import { useGarden } from '../store';
import { useCtl } from './context';

/** The journey guide: what to do now, and what just happened. */
export function Coach() {
  const j = useGarden(s => s.journey);
  const trace = useGarden(s => s.trace);
  const ctl = useCtl();
  if (!j) {
    // following a request outside a journey: just the narration
    return trace ? <div className="g-caption" aria-live="polite">{trace}</div> : null;
  }
  return (
    <section className={`g-coach ${j.then ? 'done' : ''}`} aria-live="polite" aria-label="Journey guide">
      <div className="g-coach-top">
        <span className="g-coach-title">{j.title}</span>
        <span className="g-dots" aria-label={`Step ${j.step} of ${j.total}`}>
          {Array.from({ length: j.total }, (_, i) => (
            <i key={i} className={i < j.step - (j.finished ? 0 : 1) ? 'on' : i === j.step - 1 && !j.finished ? 'now' : ''} />
          ))}
        </span>
        <button className="g-btn sm ghost" onClick={() => ctl.stopJourney()}>Exit</button>
      </div>
      {j.then && <p className="g-then">✓ {j.then}</p>}
      {!j.finished && <p className="g-say">{j.say}</p>}
      {trace && !j.finished && <p className="g-narrate">{trace}</p>}
      {j.finished ? (
        <div className="g-coach-actions">
          <span className="g-say">Journey complete.</span>
          <button className="g-btn primary" onClick={() => { ctl.stopJourney(); useGarden.setState({ tab: 'journeys', sheet: true }); }}>Choose the next journey</button>
        </div>
      ) : (
        <div className="g-coach-actions">
          {j.action && <button className="g-btn primary" onClick={() => ctl.journey.runAction()}>{j.action}</button>}
          {j.next && <button className="g-btn primary" onClick={() => ctl.journey.advance()}>Next</button>}
          {!j.next && <button className="g-btn sm ghost" onClick={() => ctl.journey.advance()}>Skip step</button>}
        </div>
      )}
    </section>
  );
}
