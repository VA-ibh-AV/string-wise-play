import { useEffect, useRef, useState } from 'react';
import { usePageMeta } from '../../usePageMeta';
import { DriftController } from './controller';
import { useDrift } from './store';
import { DriftCtx } from './ui/context';
import { Controls, HopBar, HopInfo, PacketHeaderPanel, TcpdumpLog } from './ui/Hud';
import { Pause, Summary } from './ui/Overlays';
import { Title } from './ui/Title';
import './drift.css';

export default function PacketDrift() {
  usePageMeta({
    title: 'Packet Drift · play.string-wise',
    description: 'Fly one HTTPS request across the internet: DNS, the TCP handshake, TLS, NAT, routers, the kernel and nginx.',
    image: '/og/drift.png',
  });
  const host = useRef<HTMLDivElement>(null);
  const [ctl, setCtl] = useState<DriftController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const phase = useDrift(s => s.phase);

  useEffect(() => {
    let c: DriftController;
    try {
      c = new DriftController(host.current!, { reduced });
    } catch (e) {
      console.warn(e);
      setError('This browser has WebGL turned off, so the flight cannot render.');
      return;
    }
    setCtl(c);
    return () => {
      c.dispose();
      setCtl(null);
    };
  }, [reduced]);

  const flying = phase === 'flying' || phase === 'paused';
  return (
    <div className={`drift ${phase}`} ref={host}>
      {error && <div className="d-fallback">{error}</div>}
      {ctl && (
        <DriftCtx.Provider value={ctl}>
          {flying && (
            <>
              <HopBar />
              <PacketHeaderPanel />
              <HopInfo />
              <TcpdumpLog />
              <Controls />
            </>
          )}
          <Title />
          <Pause />
          <Summary />
        </DriftCtx.Provider>
      )}
    </div>
  );
}
