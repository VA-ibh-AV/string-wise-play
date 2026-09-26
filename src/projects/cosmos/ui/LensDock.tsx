import { GlassPanel } from '@play/ui';
import { LENSES } from '../content/lenses';
import { useCosmos } from '../store';
import { useCtl } from './context';

export function LensDock() {
  const lens = useCosmos(s => s.lens);
  const ctl = useCtl();
  return (
    <GlassPanel className="dock" role="toolbar" aria-label="Lenses">
      <span className="lbl">Lenses</span>
      {LENSES.map(l => (
        <button key={l.id} aria-pressed={lens === l.id} onClick={() => ctl.toggleLens(l.id)}>
          {l.label}
        </button>
      ))}
    </GlassPanel>
  );
}
