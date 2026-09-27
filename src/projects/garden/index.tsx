import { useEffect, useRef, useState } from 'react';
import { usePageMeta } from '../../usePageMeta';
import { GardenController } from './controller';
import { useGarden } from './store';
import { removeBody, removeLane } from './sim';
import { GardenCtx } from './ui/context';
import { BuildDock, Hud, HoverTip, Toasts, TOOL_KEYS } from './ui/Hud';
import { Coach } from './ui/Coach';
import { Intro } from './ui/Intro';
import { Legend } from './ui/Legend';
import { JourneysTab, Tabs } from './ui/Journeys';
import { Inspector } from './ui/Inspector';
import { SkyPanel } from './ui/SkyPanel';
import './garden.css';

export default function PacketGarden() {
  usePageMeta({
    title: 'Packet Garden · play.string-wise',
    description: 'Grow a constellation, watch it route. Routing, caching and load balancing as a calm garden in space.',
    image: '/og/garden.png',
  });
  const host = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<GardenController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const sheet = useGarden(s => s.sheet);
  const announce = useGarden(s => s.announce);
  const tab = useGarden(s => s.tab);
  const mode = useGarden(s => s.mode);

  useEffect(() => {
    let c: GardenController;
    try {
      c = new GardenController(host.current!, { reduced });
    } catch (e) {
      console.warn(e);
      setError('This browser has WebGL turned off, so the garden cannot render.');
      return;
    }
    setCtl(c);
    return () => {
      c.dispose();
      setCtl(null);
    };
  }, [reduced]);

  useEffect(() => {
    if (!ctl) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k] && useGarden.getState().mode === 'build') return ctl.setTool(TOOL_KEYS[k]);
      if (k === 'escape') {
        if (useGarden.getState().intro) return ctl.closeIntro(false);
        ctl.setTool('select');
        ctl.select(null);
        return;
      }
      if (k === ' ' && !(e.target as HTMLElement).closest('button')) {
        e.preventDefault();
        const s = useGarden.getState().speed;
        ctl.setSpeed(s === 0 ? 1 : 0);
        return;
      }
      if (k === 'delete' || k === 'backspace') {
        const sel = useGarden.getState().sel;
        if (!sel) return;
        if (sel.kind === 'node') {
          const n = ctl.world.nodes.get(sel.id);
          if (n) removeBody(ctl.world, n);
        } else {
          const L = ctl.world.links.get(sel.id);
          if (L) removeLane(ctl.world, L);
        }
        ctl.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  return (
    <div className={`garden ${mode}`} ref={host}>
      {error && <div className="g-fallback">{error}</div>}
      {ctl && (
        <GardenCtx.Provider value={ctl}>
          <Hud />
          <BuildDock />
          {mode === 'watch' && <Legend />}
          <Coach />
          <Toasts />
          <HoverTip />
          <aside className={`g-panel ${sheet ? 'open' : ''}`} aria-label="Journeys, inspector and controls">
            <button className="g-handle" aria-label="Show or hide the panel" aria-expanded={sheet} onClick={() => useGarden.setState({ sheet: !sheet })}>
              <span />
            </button>
            <Tabs />
            {tab === 'journeys' && <JourneysTab />}
            {tab === 'inspect' && <Inspector />}
            {tab === 'sky' && <SkyPanel />}
          </aside>
          <Intro />
          <div className="sr-only" aria-live="polite">{announce}</div>
        </GardenCtx.Provider>
      )}
    </div>
  );
}
