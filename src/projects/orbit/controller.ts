import { createLoop, type Loop } from '@play/engine';
import { LiveStream } from '@play/protocol';
import { loadProgress, saveProgress } from '@play/progress';
import { createOrbitSound, type OrbitSound } from './audio/orbitSound';
import { DISCOVERIES } from './content/discoveries';
import type { ModeId } from './content/modes';
import { PRESETS, type Preset } from './content/presets';
import { midiHz, noteMidi, ROOT_MIDI, type ScaleId } from './content/scales';
import { measured, promised, starved } from './sim/shares';
import {
  addPlanet, advance, applyPreset, createSystem, decodeSystem, encodeSystem, movePlanet, omega, removePlanet, RINGS, setCpus, setMode,
  MAX_PLANETS, type OrbitSystem,
} from './sim/system';
import { sliceLen } from './sim/clock';
import { applyDelta, applyKey, createFeed, remixPreset, syncPlanets } from './sim/live';
import { initialOrbit, useOrbit, type OrbitSource } from './store';
import { createOrbitView, type OrbitView } from './view';

export const PROJECT_ID = 'orbit';
/** Notes are generated this far ahead and scheduled on the audio clock. */
const LOOKAHEAD = 0.12;
const INTRO_KEY = 'play.orbit.intro';
/** Seconds of listening to the live host before the discovery. */
const LIVE_LISTEN = 30;

export class OrbitController {
  readonly sys: OrbitSystem;
  readonly view: OrbitView;
  readonly sound: OrbitSound;
  private loop: Loop;
  private canvas: HTMLCanvasElement;
  private offs: (() => void)[] = [];
  /** Sim time the listener is hearing right now. */
  private now = 0;
  private visual: { id: number; at: number; cpu: number }[] = [];
  private throttles: number[] = [];
  private drag: { id: number; moved: boolean; x: number; y: number } | null = null;
  private pinch: { d: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private toastId = 0;
  private sawThrottle = false;
  private hashTimer = 0;
  private stream: LiveStream | null = null;
  private listened = 0;

  constructor(host: HTMLElement, opts: { reduced: boolean; source: OrbitSource }) {
    this.sys = createSystem();
    if (opts.source === 'live') {
      this.sys.mode = 'live';
      this.sys.live = createFeed();
    } else {
      const shared = location.hash.length > 1 ? decodeSystem(location.hash.slice(1)) : null;
      applyPreset(this.sys, shared ?? PRESETS.find(p => p.id === 'fair')!);
    }
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      /* fine */
    }
    useOrbit.setState({
      ...initialOrbit, intro: !seen, found: [...loadProgress(PROJECT_ID)], infoOpen: window.innerWidth > 760,
      source: opts.source, connection: opts.source === 'live' ? 'connecting' : null,
    });

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'orbit-gl';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Planets orbiting a star. Each planet is a task; the star is the CPU. Tap an empty orbit to add a planet.');
    host.prepend(this.canvas);
    this.view = createOrbitView(this.canvas, this.sys, opts);
    this.sound = createOrbitSound();

    this.offs.push(
      this.sys.bus.on('play', e => this.onPlay(e)),
      this.sys.bus.on('throttle', e => {
        this.throttles.push(e.at);
        this.sound.throttle(this.sound.when(e.at, this.now));
        this.sawThrottle = true;
      }),
      this.sys.bus.on('change', () => this.saveHash()),
    );
    this.wireInput();

    let ui = 0, check = 0;
    this.loop = createLoop({
      hz: 60,
      step: () => {},
      render: (_a, real) => {
        if (useOrbit.getState().playing) this.now += real;
        advance(this.sys, this.now + LOOKAHEAD);
        // visuals fire when the note is actually heard
        while (this.visual.length && this.visual[0].at <= this.now) {
          const v = this.visual.shift()!;
          this.view.play(v.id, v.cpu);
        }
        while (this.throttles.length && this.throttles[0] <= this.now) {
          this.throttles.shift();
          this.view.throttle();
        }
        const s = useOrbit.getState();
        this.view.render(real, this.now, s.sel, s.hoverRing);
        ui += real;
        check += real;
        if (ui > 0.2) {
          ui = 0;
          useOrbit.setState(x => ({ tick: x.tick + 1 }));
        }
        if (check > 0.5) {
          check = 0;
          this.checkDiscoveries();
        }
      },
    });
    this.loop.start();
    if (opts.source === 'live') this.startLive();
    const onResize = () => this.view.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    if (import.meta.env.DEV) {
      (window as unknown as { __orbit?: unknown }).__orbit = { ctl: this, sys: this.sys };
      this.offs.push(() => delete (window as unknown as { __orbit?: unknown }).__orbit);
    }
  }

  get live() {
    return this.sys.mode === 'live';
  }

  private startLive() {
    const feed = this.sys.live!;
    const sync = () => {
      const { born } = syncPlanets(this.sys, feed);
      // a new planet arrives with a soft, high chime
      if (born.length && this.sound.on && useOrbit.getState().playing) {
        born.slice(0, 2).forEach((_, i) => this.sound.bell(midiHz(noteMidi(this.sys.scale, 12 + i)), this.sound.when(this.now + 0.05 + i * 0.12, this.now), 0, 0.03));
      }
      const sel = useOrbit.getState().sel;
      if (sel !== null && !this.sys.planets.some(p => p.id === sel)) this.select(null);
    };
    this.stream = new LiveStream({
      onConnection: connection => useOrbit.setState({ connection }),
      onHello: h => {
        feed.host = h.host;
        useOrbit.setState({ host: h.host });
      },
      onKey: k => {
        applyKey(feed, k);
        sync();
      },
      onDelta: d => {
        applyDelta(feed, d);
        sync();
      },
    });
    this.stream.start();
  }

  /** Copy the live planets into a Sandbox system; returns its share hash. */
  remixHash() {
    const tmp = createSystem();
    applyPreset(tmp, remixPreset(this.sys));
    return encodeSystem(tmp);
  }

  private onPlay(e: { id: number; at: number; cpu: number; note: number; moons: number }) {
    const p = this.sys.planets.find(q => q.id === e.id);
    if (!p) return;
    this.visual.push({ id: e.id, at: e.at, cpu: e.cpu });
    if (!this.sound.on) return;
    const when = this.sound.when(e.at, this.now);
    // pan by where the planet will be when the note sounds
    const a = p.angle - omega(this.sys, p) * (this.sys.t - e.at);
    const pan = (Math.cos(a) * RINGS[p.ring]) / 15;
    const sc = this.sys.scale;
    this.sound.bell(midiHz(noteMidi(sc, e.note)), when, pan);
    // moons: harmony notes two and four scale steps up, just after
    for (let i = 0; i < e.moons; i++) this.sound.bell(midiHz(noteMidi(sc, e.note + 2 + i * 2)), when + 0.07 * (i + 1), pan, 0.035);
  }

  // ---------- actions ----------
  closeIntro() {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* fine */
    }
    this.sound.start();
    this.sound.drone(midiHz(ROOT_MIDI));
    useOrbit.setState({ intro: false, sound: this.sound.on });
  }

  /** Turn sound back on after a Live/Sandbox switch (the click was the gesture). */
  resumeSound() {
    this.sound.start();
    this.sound.drone(midiHz(ROOT_MIDI));
    useOrbit.setState({ sound: this.sound.on });
  }

  toggleSound() {
    const on = this.sound.toggle();
    if (on) this.sound.drone(midiHz(ROOT_MIDI));
    useOrbit.setState({ sound: on });
  }

  togglePlay() {
    useOrbit.setState(s => ({ playing: !s.playing }));
  }

  select(id: number | null) {
    useOrbit.setState({ sel: id, ...(id !== null && window.innerWidth <= 760 ? { sheet: true } : {}) });
  }

  setMode(m: ModeId) {
    if (this.live) return;
    setMode(this.sys, m);
    this.sawThrottle = false;
  }
  setCpus(n: 1 | 2) {
    if (this.live) return;
    setCpus(this.sys, n);
  }
  setScale(s: ScaleId) {
    this.sys.scale = s;
    this.saveHash();
  }
  setTempo(bpm: number) {
    this.sys.bpm = bpm;
    this.saveHash();
  }
  setRt(on: boolean) {
    if (this.live) return;
    this.sys.rtLimit = on;
    this.saveHash();
  }
  preset(p: Preset) {
    if (this.live) return;
    applyPreset(this.sys, p);
    this.select(null);
  }
  add(ring: number, angle: number) {
    if (this.live) return null;
    // the system runs slightly ahead of what you hear; place the planet where you tapped
    const p = addPlanet(this.sys, ring, 0);
    if (!p) return null;
    p.angle = (angle + omega(this.sys, p) * (this.sys.t - this.now)) % (Math.PI * 2);
    return p;
  }
  remove(id: number) {
    if (this.live) return;
    removePlanet(this.sys, id);
    if (useOrbit.getState().sel === id) this.select(null);
  }
  edit(id: number, fn: (p: OrbitSystem['planets'][number]) => void) {
    if (this.live) return;
    const p = this.sys.planets.find(q => q.id === id);
    if (p) fn(p);
    this.saveHash();
    useOrbit.setState(s => ({ tick: s.tick + 1 }));
  }

  async copyLink() {
    this.saveHash(true);
    try {
      await navigator.clipboard.writeText(location.href);
      useOrbit.setState({ copied: true });
      window.setTimeout(() => useOrbit.setState({ copied: false }), 1600);
    } catch {
      /* the link is in the address bar */
    }
  }

  private saveHash(now = false) {
    window.clearTimeout(this.hashTimer);
    if (this.live) return; // a live system has nothing to share: it is the host
    const write = () => history.replaceState(history.state, '', `${location.pathname}${location.search}#${encodeSystem(this.sys)}`);
    if (now) write();
    else this.hashTimer = window.setTimeout(write, 600);
  }

  private checkDiscoveries() {
    const sys = this.sys, s = useOrbit.getState();
    const found = new Set(s.found);
    const before = found.size;
    if (this.live) {
      if (s.playing && (s.connection === 'live' || s.connection === 'polling') && sys.planets.length >= 3) this.listened += 0.5;
      if (this.listened >= LIVE_LISTEN) found.add('live');
      this.announce(found, before);
      return;
    }
    const sched = sys.mode !== 'free';
    const warm = sys.planets.length > 0 && sys.planets.every(p => sys.slice - p.bornSlice >= 32);
    if (sched && warm && (sys.mode === 'rr' || sys.mode === 'cfs') && sys.planets.length >= 3 &&
      sys.planets.every(p => Math.abs((measured(sys, p) ?? 0) - (promised(sys, p) ?? 0)) < 0.07)) found.add('fair');
    if (sys.mode === 'cfs' && warm && sys.planets.some(p => p.nice <= -5 && (measured(sys, p) ?? 0) >= 0.4)) found.add('weight');
    if (sys.mode === 'prio' && sys.planets.some(p => starved(sys, p))) found.add('starve');
    if (sys.mode === 'prio' && sys.rtLimit && this.sawThrottle) found.add('rescue');
    if (sched && sys.ncpu === 2 && sys.planets.length >= 4 && warm) found.add('cores');
    this.announce(found, before);
  }

  private announce(found: Set<string>, before: number) {
    const s = useOrbit.getState();
    if (found.size !== before) {
      const id = [...found].find(x => !s.found.includes(x))!;
      const d = DISCOVERIES.find(x => x.id === id)!;
      saveProgress(PROJECT_ID, found);
      useOrbit.setState({ found: [...found], toast: { id: ++this.toastId, title: d.title, text: d.how } });
      const tid = this.toastId;
      window.setTimeout(() => useOrbit.getState().toast?.id === tid && useOrbit.setState({ toast: null }), 5000);
    }
  }

  // ---------- input ----------
  private wireInput() {
    const c = this.canvas;
    const add = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      c.addEventListener(t, fn as EventListener, o);
      this.offs.push(() => c.removeEventListener(t, fn as EventListener, o));
    };
    add('pointerdown', e => {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        this.drag = null;
        return;
      }
      c.setPointerCapture(e.pointerId);
      const id = this.view.pickPlanet(e.clientX, e.clientY);
      if (id !== null) {
        this.select(id);
        if (this.live) return;
        this.drag = { id, moved: false, x: e.clientX, y: e.clientY };
        return;
      }
      const hit = this.live ? null : this.view.pickOrbit(e.clientX, e.clientY);
      if (hit && this.sys.planets.length < MAX_PLANETS) {
        const p = this.add(hit.ring, hit.angle);
        if (p) this.select(p.id);
      } else this.select(null);
    });
    add('pointermove', e => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch && this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 0) this.view.zoom(this.pinch.d / d);
        this.pinch.d = d;
        return;
      }
      if (this.drag) {
        if (Math.hypot(e.clientX - this.drag.x, e.clientY - this.drag.y) > 6) this.drag.moved = true;
        if (this.drag.moved) {
          const hit = this.view.pickOrbit(e.clientX, e.clientY);
          const p = this.sys.planets.find(q => q.id === this.drag!.id);
          if (hit && p) {
            movePlanet(this.sys, p.id, hit.ring, 0);
            p.angle = (hit.angle + omega(this.sys, p) * (this.sys.t - this.now)) % (Math.PI * 2);
          }
        }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const over = this.view.pickPlanet(e.clientX, e.clientY);
      const hit = over === null && !this.live && this.sys.planets.length < MAX_PLANETS ? this.view.pickOrbit(e.clientX, e.clientY) : null;
      c.style.cursor = over !== null ? 'grab' : hit ? 'copy' : 'default';
      const ring = hit ? hit.ring : null;
      if (ring !== useOrbit.getState().hoverRing) useOrbit.setState({ hoverRing: ring });
    });
    const up = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      if (this.drag?.moved) this.saveHash();
      this.drag = null;
    };
    add('pointerup', up);
    add('pointercancel', up);
    add('pointerleave', () => useOrbit.setState({ hoverRing: null }));
    add('wheel', e => {
      e.preventDefault();
      this.view.zoom(1 + Math.sign(e.deltaY) * 0.08);
    }, { passive: false });

    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
      const s = useOrbit.getState();
      if (s.intro) {
        if (e.key === 'Enter' || e.key === 'Escape') this.closeIntro();
        return;
      }
      const k = e.key;
      if (/^[1-8]$/.test(k)) return this.select(this.sys.planets[+k - 1]?.id ?? null);
      if (k === 'Escape') return this.select(null);
      if (k === ' ') {
        e.preventDefault();
        return this.togglePlay();
      }
      const p = this.sys.planets.find(q => q.id === s.sel);
      if (!p) return;
      if (k === '[' || k === ']') this.edit(p.id, q => (q.note = Math.max(0, Math.min(14, q.note + (k === ']' ? 1 : -1)))));
      if (k === '-' || k === '=') {
        const up = k === '=' ? 1 : -1;
        if (this.sys.mode === 'prio') this.edit(p.id, q => (q.prio = Math.max(1, Math.min(99, q.prio + up * 10))));
        else this.edit(p.id, q => (q.nice = Math.max(-20, Math.min(19, q.nice - up))));
      }
      if (k === 'Delete' || k === 'Backspace') this.remove(p.id);
    };
    window.addEventListener('keydown', onKey);
    this.offs.push(() => window.removeEventListener('keydown', onKey));
  }

  get sliceSeconds() {
    return sliceLen(this.sys.bpm);
  }

  dispose() {
    window.clearTimeout(this.hashTimer);
    this.stream?.stop();
    this.loop.stop();
    this.offs.forEach(f => f());
    this.sound.dispose();
    this.view.dispose();
    this.canvas.remove();
    useOrbit.setState({ ...initialOrbit });
  }
}

export { DISCOVERIES };
