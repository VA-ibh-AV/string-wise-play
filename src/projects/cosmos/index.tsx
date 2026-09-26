import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassPanel } from '@play/ui';
import { usePageMeta } from '../../usePageMeta';
import { isLensId } from './content/lenses';
import { CosmosController } from './controller';
import { useCosmos, type CosmosMode } from './store';
import { CtlContext } from './ui/context';
import { FactTicker } from './ui/FactTicker';
import { HtopBar } from './ui/HtopBar';
import { LensDock } from './ui/LensDock';
import { LensPanel } from './ui/LensPanel';
import { MissionsPanel } from './ui/MissionsPanel';
import { ProcessCard } from './ui/ProcessCard';
import { LiveProcessCard } from './ui/LiveProcessCard';
import { LiveBadge, ModeTabs, OfflineBanner } from './ui/LiveBits';
import { Toolbar } from './ui/Toolbar';
import { LiveRegion, MissionToast, Tooltip } from './ui/Overlays';
import './cosmos.css';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** How long Live gets to connect before a visitor who didn't choose it lands in the Sandbox. */
const LIVE_GRACE_MS = 12000;
const OFFLINE_BANNER_MS = 10000;

function initialMode(): CosmosMode {
  const q = new URLSearchParams(location.search).get('mode');
  return q === 'sandbox' || q === 'live' ? q : 'live';
}

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
  const [mode, setMode] = useState<CosmosMode>(initialMode);
  // true once the visitor picks a tab (or arrives with ?mode=), so we never override their choice
  const chosen = useRef(new URLSearchParams(location.search).has('mode'));
  const [liveOffline, setLiveOffline] = useState(false);
  const [banner, setBanner] = useState(false);
  const lens = useCosmos(s => s.lens);
  const connection = useCosmos(s => s.connection);

  const choose = useCallback((m: CosmosMode) => {
    chosen.current = true;
    setBanner(false);
    setMode(m);
  }, []);

  useEffect(() => {
    let c: CosmosController;
    try {
      c = new CosmosController(tank.current!, { reduced, mode });
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
  }, [reduced, mode]);

  // Live that never connects within the grace period falls back to the Sandbox
  // (unless the visitor chose Live); Live that drops later offers the Sandbox.
  const everLive = useRef(false);
  const connected = connection === 'live' || connection === 'polling';
  if (connected) everLive.current = true;

  useEffect(() => {
    if (mode !== 'live') return;
    everLive.current = false;
    const t = window.setTimeout(() => {
      if (everLive.current) return;
      setLiveOffline(true);
      if (chosen.current) setBanner(true);
      else setMode('sandbox');
    }, LIVE_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'live') return;
    if (connected) {
      setLiveOffline(false);
      setBanner(false);
      return;
    }
    if (!everLive.current) return; // the grace timer handles the first connection
    const t = window.setTimeout(() => {
      setLiveOffline(true);
      setBanner(true);
    }, OFFLINE_BANNER_MS);
    return () => window.clearTimeout(t);
  }, [mode, connected]);

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
        <p>
          {mode === 'live'
            ? 'A real Linux machine, right now. Every planet is a process on it. Watch, tap and inspect: nothing here can touch it.'
            : 'Every planet is a Linux process and its moons are threads. Tap a planet, or open a lens below.'}
        </p>
        <ModeTabs onChange={choose} liveOffline={liveOffline && mode !== 'live'} />
      </GlassPanel>
      {error && <div className="fallback">{error}</div>}
      {ctl && (
        <CtlContext.Provider value={ctl}>
          <Toolbar />
          {mode === 'live' ? <LiveBadge /> : null}
          {mode === 'live' && banner ? <OfflineBanner onSandbox={() => choose('sandbox')} /> : null}
          {mode === 'live' ? <LiveProcessCard /> : <ProcessCard />}
          {mode === 'sandbox' ? <MissionsPanel /> : null}
          <LensPanel />
          {mode === 'sandbox' ? <FactTicker reduced={reduced} /> : null}
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
