import { useCallback, useEffect, useRef, useState } from 'react';
import { usePageMeta } from '../../usePageMeta';
import { OrbitController } from './controller';
import { useOrbit, type OrbitSource } from './store';
import { OrbitCtx } from './ui/context';
import { LiveBadge, OfflineBanner } from './ui/LiveBits';
import { ModeCard } from './ui/ModeCard';
import { Hint, Intro, ShareBars, SidePanel, Toast } from './ui/Side';
import { TopBar } from './ui/Top';
import './orbit.css';

/** How long Live gets to connect before a visitor who didn't choose it lands in the Sandbox. */
const LIVE_GRACE_MS = 12000;
const OFFLINE_BANNER_MS = 10000;

function initialSource(): OrbitSource {
  const q = new URLSearchParams(location.search).get('mode');
  if (q === 'sandbox' || q === 'live') return q;
  // a share link is a Sandbox system
  return location.hash.length > 1 ? 'sandbox' : 'live';
}

export default function OrbitSynth() {
  usePageMeta({
    title: 'Orbit Synth · play.string-wise',
    description: 'A music box that is secretly a CPU scheduler. Hear round robin, CFS, priorities and starvation, or a real Linux machine live.',
    image: '/og/orbit.png',
  });
  const host = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<OrbitController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [source, setSource] = useState<OrbitSource>(initialSource);
  // true once the visitor picks a tab (or arrives with ?mode= or a share link), so we never override their choice
  const chosen = useRef(new URLSearchParams(location.search).has('mode') || location.hash.length > 1);
  const [liveOffline, setLiveOffline] = useState(false);
  const [banner, setBanner] = useState(false);
  const connection = useOrbit(s => s.connection);

  const choose = useCallback((m: OrbitSource) => {
    chosen.current = true;
    setBanner(false);
    const q = new URLSearchParams(location.search);
    q.set('mode', m);
    history.replaceState(history.state, '', `${location.pathname}?${q}${m === 'sandbox' ? location.hash : ''}`);
    setSource(m);
  }, []);

  useEffect(() => {
    let c: OrbitController;
    try {
      c = new OrbitController(host.current!, { reduced, source });
    } catch (e) {
      console.warn(e);
      setError('This browser has WebGL turned off, so the orbits cannot render.');
      return;
    }
    // keep the intro closed and the sound on when switching tabs
    let was = false;
    try {
      was = sessionStorage.getItem('play.orbit.sound') === '1';
    } catch {
      /* fine */
    }
    if (was && !useOrbit.getState().intro) c.resumeSound();
    setCtl(c);
    return () => {
      try {
        sessionStorage.setItem('play.orbit.sound', useOrbit.getState().sound ? '1' : '0');
      } catch {
        /* fine */
      }
      c.dispose();
      setCtl(null);
    };
  }, [reduced, source]);

  // Live that never connects within the grace period falls back to the Sandbox
  // (unless the visitor chose Live); Live that drops later offers the Sandbox.
  const everLive = useRef(false);
  const connected = connection === 'live' || connection === 'polling';
  if (connected) everLive.current = true;

  useEffect(() => {
    if (source !== 'live') return;
    everLive.current = false;
    const t = window.setTimeout(() => {
      if (everLive.current) return;
      setLiveOffline(true);
      if (chosen.current) setBanner(true);
      else setSource('sandbox');
    }, LIVE_GRACE_MS);
    return () => window.clearTimeout(t);
  }, [source]);

  useEffect(() => {
    if (source !== 'live') return;
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
  }, [source, connected]);

  const remix = useCallback(() => {
    if (!ctl) return;
    const hash = ctl.remixHash();
    chosen.current = true;
    history.replaceState(history.state, '', `${location.pathname}?mode=sandbox#${hash}`);
    setSource('sandbox');
  }, [ctl]);

  return (
    <div className="orbit" ref={host}>
      {error && <div className="o-fallback">{error}</div>}
      {ctl && (
        <OrbitCtx.Provider value={ctl}>
          <TopBar onSource={choose} liveOffline={liveOffline && source !== 'live'} />
          {source === 'live' && <LiveBadge />}
          {source === 'live' && banner && <OfflineBanner onSandbox={() => choose('sandbox')} />}
          <ModeCard />
          <SidePanel onRemix={remix} />
          <ShareBars />
          <Hint />
          <Toast />
          <Intro />
        </OrbitCtx.Provider>
      )}
    </div>
  );
}
