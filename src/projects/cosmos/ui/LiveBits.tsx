import type { Cap } from '@play/protocol';
import type { LensId } from '../content/lenses';
import { useCosmos, type CosmosMode } from '../store';
import { useCtl, useLiveWorld } from './context';

export const LENS_CAP: Record<LensId, Cap> = {
  scheduler: 'sched',
  memory: 'memory',
  pagecache: 'pagecache',
  interrupts: 'irq',
  cgroups: 'cgroup',
  connections: 'net',
  namespaces: 'ns',
};

/** True when the lens has real data (always true in the Sandbox). */
export function useLensAvailable(lens: LensId) {
  const mode = useCosmos(s => s.mode);
  const caps = useCosmos(s => s.caps);
  return mode === 'sandbox' || caps.includes(LENS_CAP[lens]);
}

export function ModeTabs({ onChange, liveOffline }: { onChange: (m: CosmosMode) => void; liveOffline: boolean }) {
  const mode = useCosmos(s => s.mode);
  return (
    <div className="modes" role="tablist" aria-label="Data source">
      <button role="tab" aria-selected={mode === 'live'} aria-pressed={mode === 'live'} onClick={() => onChange('live')}>
        <span className={`live-dot ${liveOffline ? 'off' : ''}`} aria-hidden="true" /> Live{liveOffline ? ' · offline' : ''}
      </button>
      <button role="tab" aria-selected={mode === 'sandbox'} aria-pressed={mode === 'sandbox'} onClick={() => onChange('sandbox')}>
        Sandbox
      </button>
    </div>
  );
}

/** `● LIVE · goroutine_guy's pi · 6.8.0 arm64 · 4 cpus · 37 viewers` */
export function LiveBadge() {
  const host = useCosmos(s => s.host);
  const connection = useCosmos(s => s.connection);
  useLiveWorld();
  const live = useCtl().live;
  if (!live) return null;
  const text =
    connection === 'live' || connection === 'polling'
      ? [connection === 'live' ? 'LIVE' : 'LIVE (polling)', host?.name, host && `${host.kernel.split('+')[0].split('-')[0]} ${host.arch}`, host && `${host.cpus} cpus`, `${live.viewers} viewer${live.viewers === 1 ? '' : 's'}`]
          .filter(Boolean)
          .join(' · ')
      : connection === 'connecting'
        ? 'connecting to the live host…'
        : 'live host offline · reconnecting';
  return (
    <div className={`live-badge ${connection === 'live' || connection === 'polling' ? 'on' : ''}`} role="status">
      <span className="live-dot" aria-hidden="true" /> {text}
    </div>
  );
}

export function OfflineBanner({ onSandbox }: { onSandbox: () => void }) {
  return (
    <div className="offline-banner panel" role="alert">
      <span>The live host is offline.</span>
      <button onClick={onSandbox}>Switch to Sandbox</button>
    </div>
  );
}
