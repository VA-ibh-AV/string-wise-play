import { useEffect, useState } from 'react';
import { GlassPanel } from '@play/ui';
import { FACTS } from '../content/facts';

export function FactTicker({ reduced }: { reduced: boolean }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * FACTS.length));
  const [shown, setShown] = useState(true);
  useEffect(() => {
    let fade = 0;
    const id = window.setInterval(() => {
      setShown(false);
      fade = window.setTimeout(() => {
        setI(x => (x + 1) % FACTS.length);
        setShown(true);
      }, reduced ? 0 : 900);
    }, 14000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(fade);
    };
  }, [reduced]);
  return (
    <GlassPanel className="fact" style={{ opacity: shown ? 1 : 0 }} aria-hidden="true">
      <small>Did you know</small>
      <span>{FACTS[i]}</span>
    </GlassPanel>
  );
}
