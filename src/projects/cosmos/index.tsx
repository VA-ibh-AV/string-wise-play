import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassPanel } from '@play/ui';
import { usePageMeta } from '../../usePageMeta';
import { isLensId } from './content/lenses';
import { CosmosController } from './controller';
import { useCosmos } from './store';
import { CtlContext } from './ui/context';
import { FactTicker } from './ui/FactTicker';
import { HtopBar } from './ui/HtopBar';
import { LensDock } from './ui/LensDock';
import { LensPanel } from './ui/LensPanel';
import { MissionsPanel } from './ui/MissionsPanel';
import { ProcessCard } from './ui/ProcessCard';
import { Toolbar } from './ui/Toolbar';
import { LiveRegion, MissionToast, Tooltip } from './ui/Overlays';
import './cosmos.css';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function KernelCosmos() {
  usePageMeta({
    title: 'Kernel Cosmos · play.string-wise',
    description: 'Every planet is a Linux process and its moons are its threads. Poke the scheduler, memory, page cache, interrupts, cgroups and namespaces.',
    image: '/og/cosmos.png',
  });
  const tank = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<CosmosController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduced] = useState(reducedMotion);
  const lens = useCosmos(s => s.lens);

  useEffect(() => {
    let c: CosmosController;
    try {
      c = new CosmosController(tank.current!, { reduced });
    } catch (e) {
      console.warn(e);
      setError('This browser has WebGL turned off, so the star system cannot render.');
      return;
    }
    setCtl(c);
    // deep link: /cosmos#memory opens the Memory lens
    const hash = location.hash.slice(1);
    if (isLensId(hash)) c.cmd({ type: 'lens', lens: hash });
    return () => {
      c.dispose();
      setCtl(null);
    };
  }, [reduced]);

  // keep the hash in sync with the open lens
  useEffect(() => {
    if (!ctl) return;
    const want = lens ? `#${lens}` : '';
    if (location.hash !== want) history.replaceState(history.state, '', location.pathname + location.search + want);
  }, [lens, ctl]);

  useEffect(() => {
    if (!ctl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      ctl.select(null);
      if (ctl.world.view.lens) ctl.toggleLens(null);
      useCosmos.setState({ missionsOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctl]);

  return (
    <div className="tank" ref={tank}>
      <GlassPanel className="title">
        <Link to="/" className="back">
          ← play
        </Link>
        <h1>Kernel Cosmos</h1>
        <p>Every planet is a Linux process and its moons are threads. Tap a planet, or open a lens below.</p>
      </GlassPanel>
      {error && <div className="fallback">{error}</div>}
      {ctl && (
        <CtlContext.Provider value={ctl}>
          <Toolbar />
          <ProcessCard />
          <MissionsPanel />
          <LensPanel />
          <FactTicker reduced={reduced} />
          <MissionToast />
          <div className="bottom">
            <HtopBar />
            <LensDock />
          </div>
          <Tooltip />
          <LiveRegion />
        </CtlContext.Provider>
      )}
    </div>
  );
}
