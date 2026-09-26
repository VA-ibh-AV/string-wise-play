import { useEffect, useRef, useState } from 'react';
import { usePageMeta } from '../../usePageMeta';
import { OrbitController } from './controller';
import { OrbitCtx } from './ui/context';
import { ModeCard } from './ui/ModeCard';
import { Hint, Intro, ShareBars, SidePanel, Toast } from './ui/Side';
import { TopBar } from './ui/Top';
import './orbit.css';

export default function OrbitSynth() {
  usePageMeta({
    title: 'Orbit Synth · play.string-wise',
    description: 'A music box that is secretly a CPU scheduler. Hear round robin, CFS, priorities and starvation.',
    image: '/og/orbit.png',
  });
  const host = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<OrbitController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let c: OrbitController;
    try {
      c = new OrbitController(host.current!, { reduced });
    } catch (e) {
      console.warn(e);
      setError('This browser has WebGL turned off, so the orbits cannot render.');
      return;
    }
    setCtl(c);
    return () => {
      c.dispose();
      setCtl(null);
    };
  }, [reduced]);

  return (
    <div className="orbit" ref={host}>
      {error && <div className="o-fallback">{error}</div>}
      {ctl && (
        <OrbitCtx.Provider value={ctl}>
          <TopBar />
          <ModeCard />
          <SidePanel />
          <ShareBars />
          <Hint />
          <Toast />
          <Intro />
        </OrbitCtx.Provider>
      )}
    </div>
  );
}
