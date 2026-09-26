import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KINDS, type NodeType } from '../content/kinds';
import { useGarden, type Tool } from '../store';
import { fmtS, pct, useCtl, useLiveWorld } from './context';

export function Hud() {
  const w = useLiveWorld();
  const ctl = useCtl();
  const speed = useGarden(s => s.speed);
  const sound = useGarden(s => s.sound);
  const mode = useGarden(s => s.mode);
  const m = w.m;
  return (
    <header className="g-hud">
      <div className="g-brand">
        <Link to="/" className="g-back">← play</Link>
        <h1>Packet Garden</h1>
        <p>How requests find their way across a network.</p>
      </div>
      <div className="g-ctrls">
        <button className="g-btn round" title="How it works" aria-label="How it works" onClick={() => useGarden.setState({ intro: true })}>?</button>
        <div className="g-seg" role="group" aria-label="Mode">
          <button aria-pressed={mode === 'watch'} onClick={() => ctl.setMode('watch')} title="Watch and explore">Watch</button>
          <button aria-pressed={mode === 'build'} onClick={() => ctl.setMode('build')} title="Add, connect and cut things yourself">Build</button>
        </div>
        <div className="g-seg" role="group" aria-label="Speed">
          {([[0, '❚❚', 'Pause'], [1, '1×', 'Calm speed'], [2, '2×', 'Double speed']] as const).map(([v, t, l]) => (
            <button key={v} aria-label={l} title={l} aria-pressed={speed === v} onClick={() => ctl.setSpeed(v)}>{t}</button>
          ))}
        </div>
        <button className="g-btn" aria-pressed={sound} onClick={() => ctl.toggleSound()} title="Generative ambient music">
          {sound ? '♪ On' : '♪ Off'}
        </button>
      </div>
      <div className="g-chips">
        <span className="g-chip" title="Requests answered per second, over the last 10 seconds">Answers/s <b>{m.okRate.toFixed(1)}</b></span>
        <span className={`g-chip ${m.success != null && m.success < 0.95 ? 'bad' : ''}`} title="Share of requests that got an answer">Success <b>{m.success == null ? '–' : pct(m.success)}</b></span>
        <span className="g-chip" title="How long the slowest 5% of requests waited for an answer (p95)">Wait time <b>{m.p95 ? fmtS(m.p95) : '–'}</b></span>
      </div>
    </header>
  );
}

const BODY_ICONS: Record<NodeType, JSX.Element> = {
  client: <><rect x="9" y="9" width="6" height="6" rx="1" fill="#C9A86A" /><rect x="2" y="11" width="6" height="2" fill="#4A6BFF" /><rect x="16" y="11" width="6" height="2" fill="#4A6BFF" /><circle cx="12" cy="6.5" r="1.6" fill="#F5A8C3" /></>,
  router: <><circle cx="12" cy="12" r="3.5" fill="#FFE7A8" /><path d="M12 3v18M3 12h18" stroke="#FFE7A8" strokeWidth=".8" opacity=".7" /><ellipse cx="12" cy="12" rx="9" ry="3.3" fill="none" stroke="#FFE7A8" strokeWidth="1" transform="rotate(-20 12 12)" opacity=".6" /></>,
  lb: <><circle cx="12" cy="12" r="3.6" fill="#9FF0D0" /><path d="M12 8.5L9.8 1h4.4zM12 15.5l2.2 7.5H9.8z" fill="#9FF0D0" opacity=".55" /></>,
  server: <><circle cx="12" cy="12" r="6.5" fill="#6FA8FF" /><path d="M6 10.5c3 1 9 1 12 0M6.3 14c3 1 8.5 1 11.4 0" stroke="#bcd6ff" strokeWidth=".9" fill="none" /><circle cx="20.5" cy="8" r="1.4" fill="#FFD27A" /></>,
  cache: <><circle cx="10" cy="12" r="6" fill="#8FB8FF" opacity=".5" /><circle cx="14.5" cy="10.5" r="5" fill="#B08FFF" opacity=".45" /><circle cx="12" cy="12" r="1.6" fill="#fff" /></>,
};

const TOOL_TIPS: Record<Tool, string> = {
  select: 'Tap anything to inspect it. Drag bodies to move them.',
  client: 'Tap empty space to add a Probe (a client that sends requests).',
  router: 'Tap empty space to add a Relay (a router).',
  lb: 'Tap empty space to add a Pulsar (a load balancer).',
  server: 'Tap empty space to add a Planet (a server that answers).',
  cache: 'Tap empty space to add a Nebula (a cache).',
  lane: 'Drag from one body to another to connect them with a lane.',
  sever: 'Tap a lane to cut it. Tap a cut lane to reconnect it.',
  remove: 'Tap a body or lane to remove it.',
};

export const TOOL_KEYS: Record<string, Tool> = { '1': 'client', '2': 'router', '3': 'lb', '4': 'server', '5': 'cache', v: 'lane', x: 'sever', d: 'remove' };

/** Build mode only: five buttons, bodies grouped under "Add". */
export function BuildDock() {
  const tool = useGarden(s => s.tool);
  const mode = useGarden(s => s.mode);
  const ctl = useCtl();
  const [open, setOpen] = useState(false);
  if (mode !== 'build') return null;
  const adding = tool in KINDS;
  const pick = (t: Tool) => {
    ctl.setTool(t);
    setOpen(false);
  };
  return (
    <>
      {open && (
        <div className="g-addmenu" role="menu">
          {(Object.keys(KINDS) as NodeType[]).map(t => (
            <button key={t} role="menuitem" onClick={() => pick(t)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">{BODY_ICONS[t]}</svg>
              <span><b>{KINDS[t].label}</b><small>{KINDS[t].role}</small></span>
            </button>
          ))}
        </div>
      )}
      <nav className="g-tools" aria-label="Build tools">
        <button className="g-tool" aria-pressed={tool === 'select'} onClick={() => pick('select')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5l12.5 7.2-5.6 1.5-2.9 5.3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>Inspect
        </button>
        <button className="g-tool" aria-pressed={adding} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{adding ? BODY_ICONS[tool as NodeType] : <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}</svg>
          {adding ? KINDS[tool as NodeType].label : 'Add'} ▾
        </button>
        <button className="g-tool" aria-pressed={tool === 'lane'} onClick={() => pick('lane')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18C8.5 17.5 10 7 20 6" stroke="#9FF0D0" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg>Connect
        </button>
        <button className="g-tool" aria-pressed={tool === 'sever'} onClick={() => pick('sever')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18C7 17 8 13 10 11M14 9c2-2 3-4 6-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" /><path d="M10.5 6l3 8" stroke="#FF7B8F" strokeWidth="1.6" strokeLinecap="round" /></svg>Cut
        </button>
        <button className="g-tool" aria-pressed={tool === 'remove'} onClick={() => pick('remove')}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>Remove
        </button>
      </nav>
      {!open && <div className="g-hint" aria-live="polite">{TOOL_TIPS[tool]}</div>}
    </>
  );
}

export function Toasts() {
  const toasts = useGarden(s => s.toasts);
  const journey = useGarden(s => s.journey);
  // during a journey the coach card does the talking
  const shown = journey ? toasts.filter(t => t.tone === 'good') : toasts;
  return (
    <div className="g-toasts" aria-live="polite">
      {shown.map(t => (
        <div key={t.id} className={`g-toast ${t.tone}`}>
          {t.tone === 'good' && <b>Journey complete · </b>}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function HoverTip() {
  const hover = useGarden(s => s.hover);
  if (!hover) return null;
  return <div className="g-tip" style={{ left: hover.x, top: hover.y }}>{hover.text}</div>;
}

export { BODY_ICONS };
