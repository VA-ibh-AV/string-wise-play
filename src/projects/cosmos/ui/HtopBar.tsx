import { GlassPanel } from '@play/ui';
import { memUsed, procList, RAM, SWAP } from '../sim';
import { OTHER_VPID } from '../data/live-adapter';
import { useCtl } from './context';
import { useLiveWorld } from './context';

export function HtopBar() {
  const w = useLiveWorld();
  const live = useCtl().live;
  if (live) {
    const shown = procList(w).filter(p => p.pid !== OTHER_VPID && p.state !== 'Z');
    const running = shown.filter(p => p.state === 'R').length;
    const [a, b, c] = w.load;
    return (
      <GlassPanel className="htop">
        Tasks <b>{shown.length + live.other.count}</b> ({shown.length} shown), <b>{running}</b> running · load <b>{a.toFixed(2)}</b> {b.toFixed(2)} {c.toFixed(2)} · Mem{' '}
        <b>{Math.round(memUsed(w))}</b>/{Math.round(w.mem.ram)}M · cache {Math.round(w.mem.cache)}M · Swp {Math.round(w.mem.swapUsed)}/{Math.round(w.mem.swap)}M
        {w.cs.rate ? ` · cs ${Math.round(w.cs.rate)}/s` : ''}
      </GlassPanel>
    );
  }
  const all = procList(w);
  const threads = all.reduce((s, p) => s + p.threads, 0);
  const running = all.filter(p => p.state === 'R').length;
  const up = w.uptimeBase + w.clock.t;
  const d = Math.floor(up / 86400);
  const h = String(Math.floor((up % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((up % 3600) / 60)).padStart(2, '0');
  const [l1, l5, l15] = w.load;
  return (
    <GlassPanel className="htop">
      Tasks <b>{all.length}</b>, <b>{threads}</b> thr, <b>{running}</b> running · load <b>{l1.toFixed(2)}</b> {l5.toFixed(2)} {l15.toFixed(2)} · Mem{' '}
      <b>{Math.round(memUsed(w))}</b>/{RAM}M · cache {Math.round(w.mem.cache)}M · Swp {Math.round(w.mem.swapUsed)}/{SWAP}M · cs {w.cs.rate.toFixed(0)}/s · up {d}d {h}:{m}
    </GlassPanel>
  );
}
