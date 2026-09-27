import { JOURNEYS } from '../content/journeys';
import { useGarden } from '../store';
import { useCtl } from './context';

export function JourneysTab() {
  const done = useGarden(s => s.done);
  const active = useGarden(s => s.journey?.id);
  const ctl = useCtl();
  const nextUp = JOURNEYS.find(j => !done.includes(j.id));
  return (
    <section>
      <p className="g-desc">Short guided journeys, about a minute each. Pick one, or follow them in order.</p>
      <ol className="g-journeys">
        {JOURNEYS.map((j, i) => {
          const ok = done.includes(j.id);
          const isNext = nextUp?.id === j.id;
          return (
            <li key={j.id} className={`${ok ? 'done' : ''} ${isNext ? 'next' : ''}`}>
              <span className="g-jnum">{ok ? '✓' : i + 1}</span>
              <div>
                <b>{j.title}</b>
                <small>{j.blurb}</small>
              </div>
              <button className={`g-btn sm ${isNext ? 'primary' : ''}`} disabled={active === j.id} onClick={() => ctl.startJourney(j.id)}>
                {active === j.id ? 'On' : ok ? 'Again' : 'Start'}
              </button>
            </li>
          );
        })}
        <li className="build">
          <span className="g-jnum">+</span>
          <div>
            <b>Build your own</b>
            <small>Add probes, relays, planets and lanes, then cut things and watch the network cope.</small>
          </div>
          <button className="g-btn sm" onClick={() => { ctl.stopJourney(); ctl.setMode('build'); }}>Build</button>
        </li>
      </ol>
      {done.length > 0 && (
        <button className="g-btn sm ghost" onClick={() => ctl.resetProgress()}>Reset progress</button>
      )}
    </section>
  );
}

export function Tabs() {
  const tab = useGarden(s => s.tab);
  const set = (t: 'journeys' | 'inspect' | 'sky') => useGarden.setState({ tab: t });
  return (
    <div className="g-tabs" role="tablist">
      {([['journeys', 'Journeys'], ['inspect', 'Inspect'], ['sky', 'Controls']] as const).map(([t, l]) => (
        <button key={t} role="tab" aria-selected={tab === t} onClick={() => set(t)}>{l}</button>
      ))}
    </div>
  );
}
