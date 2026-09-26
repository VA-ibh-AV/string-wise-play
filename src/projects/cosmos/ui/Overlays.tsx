import { useCallback } from 'react';
import { Toast } from '@play/ui';
import { useCosmos } from '../store';

export function MissionToast() {
  const toast = useCosmos(s => s.toast);
  const clear = useCallback(() => useCosmos.setState({ toast: null }), []);
  if (!toast) return null;
  return <Toast key={toast.id} kicker="Mission complete" title={toast.title} body={toast.body} onDone={clear} />;
}

export function Tooltip() {
  const hover = useCosmos(s => s.hover);
  if (!hover) return null;
  return (
    <div className="tip" style={{ left: hover.x, top: hover.y }}>
      {hover.text}
    </div>
  );
}

/** Screen-reader announcements for mission completions and selections. */
export function LiveRegion() {
  const text = useCosmos(s => s.announce);
  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}
