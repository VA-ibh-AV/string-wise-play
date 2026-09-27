import { DISCOVERIES } from '../content/discoveries';
import { PRESETS } from '../content/presets';
import { noteName, SCALES, type ScaleId } from '../content/scales';
import { weight } from '../sim/schedulers';
import { isHidden } from '../sim/live';
import { measured, promised, starved } from '../sim/shares';
import { useOrbit } from '../store';
import { pct, useCtl, useSys } from './context';

const POLICY: Record<string, string> = {
  normal: 'SCHED_OTHER (CFS)', batch: 'SCHED_BATCH', idle: 'SCHED_IDLE', fifo: 'SCHED_FIFO (real-time)', rr: 'SCHED_RR (real-time)',
};
const STATE: Record<string, string> = { R: 'running', S: 'sleeping', D: 'waiting on I/O', T: 'stopped', Z: 'zombie' };

/** A real process: read-only facts from the agent. */
function LivePlanetCard() {
  const sys = useSys();
  const ctl = useCtl();
  const sel = useOrbit(s => s.sel);
  const p = sys.planets.find(q => q.id === sel);
  if (!p?.live) return null;
  const m = measured(sys, p);
  const rt = p.live.policy === 'fifo' || p.live.policy === 'rr';
  return (
    <section className="o-card o-planet" aria-label={`Process ${p.name}`}>
      <div className="o-card-head">
        <span className="o-dot" style={{ background: p.color, color: p.color }} />
        <div>
          <h2>{p.name}{rt && <span className="o-rt">real-time</span>}</h2>
          <small>a real process · {m === null ? '–' : pct(m)} of the notes · {pct(promised(sys, p) ?? 0)} of the planets' CPU</small>
        </div>
        <button className="o-btn sm ghost" onClick={() => ctl.select(null)} aria-label="Close">✕</button>
      </div>
      <dl className="o-facts">
        <dt>CPU</dt><dd>{(p.live.cpu * 100).toFixed(1)}% of one core</dd>
        <dt>nice</dt><dd>{p.nice > 0 ? '+' + p.nice : p.nice} <small>weight {Math.round(weight(p.nice))}</small></dd>
        <dt>Policy</dt><dd>{POLICY[p.live.policy] ?? p.live.policy}</dd>
        <dt>State</dt><dd>{STATE[p.live.state] ?? p.live.state}</dd>
        <dt>Threads</dt><dd>{p.live.threads} <small>(moons: up to 3)</small></dd>
        <dt>Note</dt><dd>{noteName(sys.scale, p.note)}</dd>
      </dl>
      {isHidden(p.name) && <p className="o-hint">Name hidden: this program is not on the agent's allowlist, so its name never leaves the machine.</p>}
      <p className="o-hint">Read-only: this is the real host. Remix it in the Sandbox to change nice values.</p>
    </section>
  );
}

function PlanetCard() {
  const sys = useSys();
  const ctl = useCtl();
  const sel = useOrbit(s => s.sel);
  const p = sys.planets.find(q => q.id === sel);
  if (!p) return null;
  if (sys.mode === 'live') return <LivePlanetCard />;
  const m = measured(sys, p), pr = promised(sys, p);
  return (
    <section className="o-card o-planet" aria-label={`Task ${p.name}`}>
      <div className="o-card-head">
        <span className="o-dot" style={{ background: p.color, color: p.color }} />
        <div>
          <h2>{p.name}</h2>
          <small>
            {sys.mode === 'free' ? 'plays when it crosses the golden line' : m === null ? '' : `got ${pct(m)} of the CPU${pr !== null ? ` · promised ${pct(pr)}` : ''}`}
            {starved(sys, p) ? ' · starved' : ''}
          </small>
        </div>
        <button className="o-btn sm ghost" onClick={() => ctl.select(null)} aria-label="Close">✕</button>
      </div>
      <div className="o-row">
        <span>Note</span>
        <div className="o-stepper">
          <button className="o-btn sm" aria-label="Lower note" onClick={() => ctl.edit(p.id, q => (q.note = Math.max(0, q.note - 1)))}>◀</button>
          <b>{noteName(sys.scale, p.note)}</b>
          <button className="o-btn sm" aria-label="Higher note" onClick={() => ctl.edit(p.id, q => (q.note = Math.min(14, q.note + 1)))}>▶</button>
        </div>
      </div>
      {sys.mode === 'cfs' && (
        <label className="o-row">
          <span>nice <b>{p.nice > 0 ? '+' + p.nice : p.nice}</b></span>
          <input type="range" min={-20} max={19} value={p.nice} onChange={e => ctl.edit(p.id, q => (q.nice = +e.target.value))} />
          <small className="o-note">weight {Math.round(weight(p.nice))}</small>
        </label>
      )}
      {sys.mode === 'prio' && (
        <label className="o-row">
          <span>priority <b>{p.prio}</b></span>
          <input type="range" min={1} max={99} value={p.prio} onChange={e => ctl.edit(p.id, q => (q.prio = +e.target.value))} />
        </label>
      )}
      {(sys.mode === 'rr' || sys.mode === 'free') && <p className="o-hint">Switch to CFS for nice values, or Priority for priorities.</p>}
      <div className="o-row">
        <span>Moons (threads)</span>
        <div className="o-seg">
          {[0, 1, 2, 3].map(n => (
            <button key={n} aria-pressed={p.moons === n} onClick={() => ctl.edit(p.id, q => (q.moons = n))}>{n}</button>
          ))}
        </div>
      </div>
      <button className="o-btn warn" onClick={() => ctl.remove(p.id)}>Remove {p.name}</button>
    </section>
  );
}

function Controls({ onRemix }: { onRemix: () => void }) {
  const sys = useSys();
  const live = sys.mode === 'live';
  const ctl = useCtl();
  const copied = useOrbit(s => s.copied);
  const found = useOrbit(s => s.found);
  return (
    <section className="o-card">
      <label className="o-row">
        <span>Tempo <b>{sys.bpm} bpm</b></span>
        <input type="range" min={60} max={140} step={2} value={sys.bpm} onChange={e => ctl.setTempo(+e.target.value)} />
      </label>
      <label className="o-row">
        <span>Scale</span>
        <select value={sys.scale} onChange={e => ctl.setScale(e.target.value as ScaleId)}>
          {Object.entries(SCALES).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
        </select>
      </label>
      {sys.mode === 'prio' && (
        <label className="o-tog">
          <input type="checkbox" checked={sys.rtLimit} onChange={e => ctl.setRt(e.target.checked)} />
          <span>RT throttling (95%)<small>Real-time tasks may use only 95% of the CPU; the rest can sneak in.</small></span>
        </label>
      )}
      {live ? (
        <button className="o-btn primary o-remix" onClick={onRemix} disabled={!sys.planets.length}>
          Remix in Sandbox
          <small>Copy these processes into the Sandbox and change their nice values</small>
        </button>
      ) : (
        <>
          <h3>Presets</h3>
          <div className="o-presets">
            {PRESETS.map(p => (
              <button key={p.id} className="o-btn" onClick={() => ctl.preset(p)}>
                {p.name}
                <small>{p.blurb}</small>
              </button>
            ))}
          </div>
          <button className="o-btn" onClick={() => ctl.copyLink()}>{copied ? 'Link copied' : 'Copy a link to this system'}</button>
        </>
      )}
      <h3>Discoveries <span>{found.length}/{DISCOVERIES.length}</span></h3>
      <ul className="o-found">
        {DISCOVERIES.map(d => (
          <li key={d.id} className={found.includes(d.id) ? 'on' : ''}>
            <i aria-hidden="true" />
            <div><b>{d.title}</b><small>{d.how}</small></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SidePanel({ onRemix }: { onRemix: () => void }) {
  const sheet = useOrbit(s => s.sheet);
  return (
    <aside className={`o-side ${sheet ? 'open' : ''}`} aria-label="Task and controls">
      <button className="o-handle" aria-expanded={sheet} aria-label="Show or hide controls" onClick={() => useOrbit.setState({ sheet: !sheet })}><span /></button>
      <PlanetCard />
      <Controls onRemix={onRemix} />
    </aside>
  );
}

/** What each task actually got over the last 32 slices; the dashed line is what the scheduler promises. */
export function ShareBars() {
  const sys = useSys();
  const ctl = useCtl();
  const sel = useOrbit(s => s.sel);
  if (!sys.planets.length) return null;
  return (
    <section className="o-bars" aria-label="CPU share over the last 32 slices">
      <h2>
        {sys.mode === 'free' ? 'No scheduler: nobody is sharing anything' : sys.mode === 'live' ? 'Share of the notes · dashed: share of the CPU' : 'CPU share, last 32 slices'}
      </h2>
      <div className="o-bars-row">
        {sys.planets.map((p, i) => {
          const m = measured(sys, p), pr = promised(sys, p), st = starved(sys, p);
          return (
            <button key={p.id} className={`o-bar ${sel === p.id ? 'sel' : ''} ${st ? 'starved' : ''}`} onClick={() => ctl.select(p.id)} title={`${i + 1}: ${p.name}`}>
              <div className="o-bar-track">
                <div className="o-bar-fill" style={{ height: pct(m ?? 0), background: p.color }} />
                {pr !== null && <div className="o-bar-promise" style={{ bottom: pct(Math.min(1, pr)) }} />}
              </div>
              <b>{m === null ? '–' : pct(m)}</b>
              <small style={{ color: p.color }}>{p.name}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function Hint() {
  const sys = useSys();
  const connection = useOrbit(s => s.connection);
  if (sys.mode === 'live') {
    // the badge already says when the host is offline
    if (sys.planets.length || connection === 'offline') return null;
    return <p className="o-hint-top">Listening for the live host…</p>;
  }
  if (sys.planets.length >= 3) return null;
  return <p className="o-hint-top">{sys.planets.length === 0 ? 'Tap an empty orbit to add a planet.' : 'Tap another orbit to add more planets.'}</p>;
}

export function Toast() {
  const t = useOrbit(s => s.toast);
  if (!t) return null;
  return (
    <div className="o-toast" role="status">
      <small>Discovery</small>
      <b>{t.title}</b>
      <span>{t.text}</span>
    </div>
  );
}

export function Intro() {
  const open = useOrbit(s => s.intro);
  const ctl = useCtl();
  if (!open) return null;
  return (
    <div className="o-overlay" role="dialog" aria-modal="true" aria-labelledby="o-intro-title">
      <div className="o-intro">
        <p className="o-kicker">A relaxing instrument</p>
        <h2 id="o-intro-title">Orbit Synth</h2>
        <p className="o-lede">A music box that is secretly a CPU scheduler.</p>
        <ol>
          <li><span>1</span>Each planet is a task: nginx, postgres, redis… The star in the middle is the CPU.</li>
          <li><span>2</span>Every time a task gets the CPU, it plays its note. So the melody is the schedule.</li>
          <li><span>3</span>Switch the scheduler at the top and <b>hear</b> fairness, nice values, priorities and starvation. The bars at the bottom show who really got the CPU.</li>
          <li><span>4</span><b>Live</b> plays a real Raspberry Pi: its busiest processes are the planets, and the real Linux scheduler writes the tune.</li>
        </ol>
        <p className="o-small">Tap an empty orbit to add a planet, tap a planet to change it, drag to move it. Headphones recommended.</p>
        <button className="o-btn primary big" onClick={() => ctl.closeIntro()} autoFocus>Start listening</button>
      </div>
    </div>
  );
}

/** Browsers only start audio after a tap; make that tap obvious. */
export function ListenPrompt() {
  const sound = useOrbit(s => s.sound);
  const intro = useOrbit(s => s.intro);
  const ctl = useCtl();
  if (sound || intro) return null;
  return (
    <button className="o-btn primary o-listen" onClick={() => ctl.toggleSound()}>
      ♪ Tap to listen
    </button>
  );
}
