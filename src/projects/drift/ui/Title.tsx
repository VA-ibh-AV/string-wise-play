import { Link } from 'react-router-dom';
import { BADGES } from '../controller';
import { useDrift } from '../store';
import { useCtl } from './context';

export function Title() {
  const phase = useDrift(s => s.phase);
  const best = useDrift(s => s.best);
  const badges = useDrift(s => s.badges);
  const sound = useDrift(s => s.sound);
  const ctl = useCtl();
  if (phase !== 'title') return null;
  return (
    <div className="d-overlay" role="dialog" aria-modal="true" aria-labelledby="d-title">
      <div className="d-card d-title">
        <Link to="/" className="d-back">← play</Link>
        <p className="d-kicker">A calm space flight</p>
        <h1 id="d-title">Packet Drift</h1>
        <p className="d-lede">Fly one HTTPS request from your laptop to <b>string-wise.com</b>.</p>
        <ol className="d-how">
          <li><span>1</span>You are a single packet. The tunnel is the real path a web request takes.</li>
          <li><span>2</span>Every glowing ring is one real step: DNS, the TCP handshake, TLS, NAT, routers, the server’s kernel, nginx. Watch your packet’s headers change as you pass.</li>
          <li><span>3</span>Fly through the middle of a ring for a little boost. Miss it and you just slow down. You cannot crash.</li>
        </ol>
        <div className="d-controls">
          <span><kbd>Mouse</kbd> or <kbd>drag</kbd> steer</span>
          <span><kbd>Space</kbd> boost</span>
          <span><kbd>Esc</kbd> pause</span>
        </div>
        <div className="d-actions">
          <button className="d-btn primary big" onClick={() => ctl.launch()} autoFocus>
            Launch <small>Enter</small>
          </button>
          <button className="d-btn" aria-pressed={sound} onClick={() => ctl.toggleSound()}>
            {sound ? '♪ Sound on' : '♪ Turn sound on'}
          </button>
        </div>
        <div className="d-meta">
          {best ? <span>Best: <b>{best.t.toFixed(1)}s</b> · {best.clean}/13 clean</span> : <span>About 45 seconds a flight.</span>}
          <span className="d-badges">
            {BADGES.map(b => (
              <i key={b.id} className={badges.includes(b.id) ? 'on' : ''} title={`${b.title}: ${b.how}`}>{b.title}</i>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
