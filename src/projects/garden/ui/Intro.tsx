import { useGarden } from '../store';
import { BODY_ICONS } from './Hud';
import { useCtl } from './context';

/** First visit: what these things are, in three sentences. */
export function Intro() {
  const open = useGarden(s => s.intro);
  const ctl = useCtl();
  if (!open) return null;
  return (
    <div className="g-intro-wrap" role="dialog" aria-modal="true" aria-labelledby="g-intro-title">
      <div className="g-intro-card">
        <h2 id="g-intro-title">A network, drawn as a small galaxy</h2>
        <p className="g-desc">Every glowing thing here is part of a real network. You will watch requests travel, then break things and see how the network copes.</p>
        <ol className="g-intro-steps">
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">{BODY_ICONS.client}</svg>
            <div><b>Probes ask</b><span>Satellites are clients. They send requests for “crystals”, like a browser asking for a page.</span></div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">{BODY_ICONS.router}</svg>
            <div><b>Relays pass them along</b><span>Stars are routers. Each keeps a star chart of the cheapest way to everything, and sends requests along lanes of light.</span></div>
          </li>
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">{BODY_ICONS.server}</svg>
            <div><b>Planets answer</b><span>Planets are servers. A Pulsar shares the work between them, and a Nebula remembers popular answers (a cache).</span></div>
          </li>
        </ol>
        <div className="g-legend-row">
          <span><i style={{ background: '#FFB24A' }} />request</span>
          <span><i style={{ background: '#5FDDE6' }} />answer</span>
          <span><i style={{ background: '#B8F06C' }} />answer from the Nebula</span>
          <span><i style={{ background: '#FF7B8F' }} />lost</span>
        </div>
        <div className="g-btns center">
          <button className="g-btn primary big" onClick={() => ctl.closeIntro(true)}>Start the tour</button>
          <button className="g-btn ghost" onClick={() => ctl.closeIntro(false)}>Just let me explore</button>
        </div>
      </div>
    </div>
  );
}
