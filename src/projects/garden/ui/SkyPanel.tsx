import { useEffect, useRef } from 'react';
import { SEEDS, SEED_KEYS } from '../content/seeds';
import { solarFlare } from '../sim';
import { Slider } from './Controls';
import { fmtS, useCtl, useLiveWorld } from './context';

function Spark() {
  const w = useLiveWorld();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = c.clientWidth, H = c.clientHeight;
    if (!W || !H) return;
    if (c.width !== Math.round(W * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, W, H);
    x.strokeStyle = 'rgba(163,168,204,.14)';
    for (const gy of [0.33, 0.66]) {
      x.beginPath();
      x.moveTo(0, Math.round(H * gy) + 0.5);
      x.lineTo(W, Math.round(H * gy) + 0.5);
      x.stroke();
    }
    const hs = w.hist;
    if (hs.length < 2) return;
    const rmax = Math.max(1, ...hs.map(p => Math.max(p.ok, p.origin))) * 1.15, pmax = Math.max(0.5, ...hs.map(p => p.p95)) * 1.15;
    const X = (i: number) => W - ((hs.length - 1 - i) / 119) * W;
    for (const [k, col, mx] of [['ok', '#5FDDE6', rmax], ['origin', '#FF8B66', rmax], ['p95', '#FFB24A', pmax]] as const) {
      x.strokeStyle = col;
      x.lineWidth = 1.6;
      x.beginPath();
      hs.forEach((p, i) => {
        const py = H - 5 - (p[k] / mx) * (H - 10);
        if (i) x.lineTo(X(i), py);
        else x.moveTo(X(i), py);
      });
      x.stroke();
    }
  });
  return (
    <>
      <canvas ref={ref} className="g-spark" aria-label="Answers per second, origin load and p95 latency over the last minute" />
      <div className="g-sparkkey">
        <span><i style={{ background: '#5FDDE6' }} />answers/s <b>{w.m.okRate.toFixed(1)}</b></span>
        <span><i style={{ background: '#FF8B66' }} />origin/s <b>{w.m.origin.toFixed(1)}</b></span>
        <span><i style={{ background: '#FFB24A' }} />p95 <b>{w.m.p95 ? fmtS(w.m.p95) : '–'}</b></span>
      </div>
    </>
  );
}

export function SkyPanel() {
  const w = useLiveWorld();
  const ctl = useCtl();
  const flareLeft = w.flash - w.t;
  return (
    <section className="g-sky">
      <h3>Last minute</h3>
      <Spark />
      <div className="g-stats">
        <div className="g-stat"><span>requests / s</span><b>{w.m.rps.toFixed(1)}</b></div>
        <div className="g-stat"><span>served by Nebula</span><b>{w.m.hit == null ? '–' : Math.round(w.m.hit * 100) + '%'}</b></div>
        <div className="g-stat"><span>reaching planets / s</span><b>{w.m.origin.toFixed(1)}</b></div>
        <div className="g-stat"><span>lost packets</span><b>{w.dropTotal}</b></div>
      </div>
      <h3>Tune</h3>
      <Slider label="Traffic" min={0} max={3} step={0.25} value={w.cfg.traffic} onChange={v => (w.cfg.traffic = v)} fmt={v => v.toFixed(2) + '×'} />
      <Slider label="Dead interval, s" min={0.2} max={3} step={0.1} value={w.cfg.detect} onChange={v => (w.cfg.detect = v)} fmt={v => v.toFixed(1)} />
      <div className="g-btns">
        <button className="g-btn primary" disabled={flareLeft > 0} onClick={() => solarFlare(w)}>
          {flareLeft > 0 ? `Solar flare · ${Math.ceil(flareLeft)}s left` : 'Start a solar flare'}
        </button>
      </div>
      <h3>Layouts</h3>
      <div className="g-seeds">
        {SEED_KEYS.map(k => (
          <button key={k} className="g-btn" aria-current={w.seed === k} onClick={() => ctl.plantSeed(k)}>
            {SEEDS[k].name}
            <small>{SEEDS[k].blurb}</small>
          </button>
        ))}
      </div>
      <h3>What you’re seeing</h3>
      <div className="g-legend">
        <span><i style={{ background: '#FFB24A' }} />request</span>
        <span><i style={{ background: '#5FDDE6' }} />answer from a planet</span>
        <span><i style={{ background: '#B8F06C' }} />answer from the nebula</span>
        <span><i style={{ background: '#FF7B8F' }} />failed answer or lost packet</span>
        <span><i className="ring" style={{ borderColor: '#B89DFF' }} />routing news (LSA)</span>
        <span><i style={{ background: '#8E9AAE' }} />health check</span>
        <span><i style={{ background: '#A0624E' }} />severed lane</span>
        <span><i style={{ background: '#FFE7A8' }} />busy worker moon</span>
      </div>
      <p className="g-foot">
        Time here runs slowly so you can follow every packet. A one-hop delay of a third of a second stands in for a few milliseconds on a real network.
      </p>
    </section>
  );
}
