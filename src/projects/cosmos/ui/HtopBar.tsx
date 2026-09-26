import { GlassPanel } from '@play/ui';
import { memUsed, procList, RAM, SWAP } from '../sim';
import { useLiveWorld } from './context';

export function HtopBar() {
  const w = useLiveWorld();
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
