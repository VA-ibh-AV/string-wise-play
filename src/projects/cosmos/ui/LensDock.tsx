import { GlassPanel } from '@play/ui';
import { LENSES } from '../content/lenses';
import { useCosmos } from '../store';
import { useCtl } from './context';
import { LENS_CAP } from './LiveBits';

export function LensDock() {
  const lens = useCosmos(s => s.lens);
  const mode = useCosmos(s => s.mode);
  const caps = useCosmos(s => s.caps);
  const ctl = useCtl();
  return (
    <GlassPanel className="dock" role="toolbar" aria-label="Lenses">
      <span className="lbl">Lenses</span>
      {LENSES.map(l => (
        <button
          key={l.id}
          aria-pressed={lens === l.id}
          className={mode === 'live' && !caps.includes(LENS_CAP[l.id]) ? 'unavail' : undefined}
          title={mode === 'live' && !caps.includes(LENS_CAP[l.id]) ? 'Not available on this host yet' : undefined}
          onClick={() => ctl.toggleLens(l.id)}
        >
          {l.label}
        </button>
      ))}
    </GlassPanel>
  );
}
