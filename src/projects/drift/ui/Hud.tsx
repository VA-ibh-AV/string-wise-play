import { useEffect, useState } from 'react';
import { HOPS, ZONES, type PacketHeader } from '../content/route';
import { useDrift } from '../store';
import { fmtMs, useCtl } from './context';

const TAG_COLOR: Record<string, string> = {
  DNS: '#B89BFF', TCP: '#FFE7A8', TLS: '#FF9BD2', NAT: '#FFB38A', ROUTE: '#8FB8FF', LB: '#9EF0B8', KERNEL: '#FFB38A', APP: '#FFE7A8',
};

/** Top-left: title, 13-segment hop bar, current zone, time and latency. */
export function HopBar() {
  const passes = useDrift(s => s.passes);
  const next = useDrift(s => s.next);
  const zone = useDrift(s => s.zone);
  const t = useDrift(s => s.t);
  const ms = useDrift(s => s.ms);
  const zc = ZONES.find(z => z.name === zone)?.color ?? 0xffffff;
  return (
    <div className="d-hopbar">
      <div className="d-name">Packet Drift</div>
      <div className="d-segs" aria-label={`${passes.length} of ${HOPS.length} steps passed`}>
        {HOPS.map((h, i) => (
          <i key={i} title={h.title} className={i < passes.length ? passes[i] : i === next ? 'next' : ''} />
        ))}
      </div>
      <div className="d-zone">
        <span style={{ color: '#' + zc.toString(16).padStart(6, '0') }}>●</span> {zone}
        <span className="d-sub">{t.toFixed(1)}s · {fmtMs(ms)} of network time</span>
      </div>
    </div>
  );
}

/** Fields hidden on small screens. */
const MINOR = new Set<keyof PacketHeader>(['sport', 'dport', 'proto', 'seq', 'ack']);
const ROWS: [keyof PacketHeader, string][] = [
  ['src', 'src'], ['sport', 'sport'], ['dst', 'dst'], ['dport', 'dport'], ['ttl', 'TTL'], ['proto', 'proto'], ['flags', 'flags'], ['seq', 'seq'], ['ack', 'ack'], ['state', 'state'],
];

/** Top-right: the live IP/L4 header; changed fields flash. */
export function PacketHeaderPanel() {
  const h = useDrift(s => s.header);
  const changed = useDrift(s => s.changed);
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => force(x => x + 1), 1600);
    return () => window.clearTimeout(id);
  }, [changed.at]);
  const fresh = performance.now() - changed.at < 1500;
  return (
    <section className="d-header" aria-label="Your packet's headers">
      <h2>Your packet</h2>
      <dl>
        {ROWS.map(([k, label]) => {
          const v = h[k];
          if (v === null || v === '') return null;
          return (
            <div key={k} className={`${fresh && changed.keys.includes(k) ? 'flash' : ''} ${MINOR.has(k) ? 'minor' : ''}`}>
              <dt>{label}</dt>
              <dd>{String(v)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** Bottom-centre: what you just flew through, or what is coming next. */
export function HopInfo() {
  const last = useDrift(s => s.last);
  const next = useDrift(s => s.next);
  const upcoming = HOPS[next];
  return (
    <section className="d-hopinfo" aria-live="polite">
      {last && (
        <div className="d-last" key={last.index}>
          <span className="d-tag" style={{ color: TAG_COLOR[last.hop.tag], borderColor: TAG_COLOR[last.hop.tag] }}>{last.hop.tag}</span>
          <b>{last.hop.title}</b>
          <span className={`d-pass ${last.pass}`}>{last.pass === 'clean' ? 'clean pass +boost' : 'wide'}</span>
          <p>{last.hop.text}</p>
        </div>
      )}
      {upcoming && (
        <div className="d-upnext">
          Next ring: <b style={{ color: TAG_COLOR[upcoming.tag] }}>{upcoming.title}</b> · {upcoming.next}
        </div>
      )}
    </section>
  );
}

/** Bottom-left: tcpdump -n, newest first. */
export function TcpdumpLog() {
  const log = useDrift(s => s.log);
  return (
    <section className="d-log" aria-label="tcpdump log">
      <h2>$ tcpdump -n</h2>
      {log.length === 0 ? <p className="d-dim">waiting for the first packet…</p> : log.slice(0, 5).map((l, i) => <p key={log.length - i}>{l}</p>)}
    </section>
  );
}

/** Top-centre: pause and sound. Bottom-right: boost for touch. */
export function Controls() {
  const ctl = useCtl();
  const sound = useDrift(s => s.sound);
  const [held, setHeld] = useState(false);
  const set = (v: boolean) => {
    setHeld(v);
    ctl.setBoost(v);
  };
  return (
    <>
      <div className="d-top">
        <button className="d-btn sm" onClick={() => ctl.pause()} aria-label="Pause">❚❚ Pause</button>
        <button className="d-btn sm" aria-pressed={sound} onClick={() => ctl.toggleSound()}>{sound ? '♪ On' : '♪ Off'}</button>
      </div>
      <button
        className={`d-boost ${held ? 'on' : ''}`}
        aria-label="Boost (hold)"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          set(true);
        }}
        onPointerUp={() => set(false)}
        onPointerCancel={() => set(false)}
        onContextMenu={e => e.preventDefault()}
      >
        BOOST
      </button>
    </>
  );
}
