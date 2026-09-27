import { useOrbit } from '../store';
import { useSys } from './context';

/** `● LIVE · pi · 6.12 arm64 · 4 cpus · 3 listeners` */
export function LiveBadge() {
  const sys = useSys();
  const host = useOrbit(s => s.host);
  const connection = useOrbit(s => s.connection);
  const on = connection === 'live' || connection === 'polling';
  const viewers = sys.live?.viewers ?? 0;
  const text = on
    ? [connection === 'live' ? 'LIVE' : 'LIVE (polling)', host?.name, host && `${host.kernel.split('+')[0].split('-')[0]} ${host.arch}`, host && `${host.cpus} cpus`, viewers > 0 && `${viewers} listening`]
        .filter(Boolean)
        .join(' · ')
    : connection === 'offline'
      ? 'live host offline · reconnecting'
      : 'connecting to the live host…';
  return (
    <div className={`o-live-badge ${on ? 'on' : ''}`} role="status">
      <span className="o-live-dot" aria-hidden="true" /> {text}
    </div>
  );
}

export function OfflineBanner({ onSandbox }: { onSandbox: () => void }) {
  return (
    <div className="o-offline" role="alert">
      <span>The live host is offline.</span>
      <button className="o-btn sm" onClick={onSandbox}>Switch to Sandbox</button>
    </div>
  );
}
