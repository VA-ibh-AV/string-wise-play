import { createLoop, type Loop } from '@play/engine';
import { loadProgress, saveProgress } from '@play/progress';
import { createDriftSound, type DriftSound } from './audio/driftSound';
import { START_HEADER, zoneAt } from './content/route';
import { autopilot, createFlight, stepFlight, type Flight, type Input } from './sim/flight';
import { initialDrift, useDrift, type Best } from './store';
import { createDriftView, type DriftView } from './view';

export const PROJECT_ID = 'drift';
export const BADGES = [
  { id: 'flown', title: 'First flight', how: 'Deliver one request to nginx.' },
  { id: 'perfect', title: 'Every ring', how: 'Fly a clean pass through all 13 rings.' },
  { id: 'swift', title: 'Under 40 seconds', how: 'Arrive in less than 40 seconds (boost helps).' },
];
const BEST_KEY = 'play.drift.best';

const readBest = (): Best | null => {
  try {
    const b = JSON.parse(localStorage.getItem(BEST_KEY) ?? 'null');
    return b && typeof b.t === 'number' ? b : null;
  } catch {
    return null;
  }
};

export class DriftController {
  flight: Flight;
  readonly view: DriftView;
  readonly sound: DriftSound;
  private loop: Loop;
  private canvas: HTMLCanvasElement;
  private offs: (() => void)[] = [];
  private target = { x: 0, y: 0 };
  private keys = new Set<string>();
  private boostHeld = false;
  private pointerActive = false;
  private arriveTimer = 0;
  private padStart = false;
  private padBoost = false;

  constructor(host: HTMLElement, opts: { reduced: boolean }) {
    this.flight = createFlight(Date.now() & 0xffff);
    useDrift.setState({ ...initialDrift, best: readBest(), badges: [...loadProgress(PROJECT_ID)] });
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drift-gl';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'A tunnel through space: the path one HTTPS request takes across the internet.');
    host.prepend(this.canvas);
    this.view = createDriftView(this.canvas, this.flight, opts);
    this.sound = createDriftSound();
    this.bindFlight();
    this.wireInput();

    let ui = 0;
    this.loop = createLoop({
      hz: 60,
      step: dt => {
        if (useDrift.getState().phase === 'flying') stepFlight(this.flight, dt, this.input(dt));
      },
      render: (_a, real, sim) => {
        this.pollGamepad();
        const flying = useDrift.getState().phase === 'flying';
        this.view.render(real, flying ? sim : 0);
        this.sound.tick();
        this.sound.speed(this.flight.speed);
        ui += real;
        if (ui > 0.1 && flying) {
          ui = 0;
          useDrift.setState(s => ({ tick: s.tick + 1, t: this.flight.t, speed: this.flight.speed }));
        }
      },
    });
    this.loop.start();
    const onResize = () => this.view.resize();
    const onHidden = () => document.hidden && this.pause();
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onHidden);
    this.offs.push(() => window.removeEventListener('resize', onResize), () => document.removeEventListener('visibilitychange', onHidden));
    if (import.meta.env.DEV) {
      (window as unknown as { __drift?: unknown }).__drift = {
        ctl: this,
        /** fly `sec` sim seconds on autopilot */
        ff: (sec: number) => {
          for (let i = 0; i < sec * 60 && !this.flight.done; i++) stepFlight(this.flight, 1 / 60, autopilot(this.flight));
        },
      };
      this.offs.push(() => delete (window as unknown as { __drift?: unknown }).__drift);
    }
  }

  private bindFlight() {
    const b = this.flight.bus;
    b.on('gate', e => {
      this.view.passed(e.index, e.pass);
      if (e.pass === 'clean') this.sound.clean(e.index);
      else this.sound.wide();
      useDrift.setState({
        header: { ...this.flight.header }, changed: { keys: e.changed, at: performance.now() }, last: { hop: e.hop, pass: e.pass, index: e.index },
        next: this.flight.next, log: [...this.flight.log], passes: [...this.flight.passes], ms: this.flight.ms,
      });
    });
    b.on('zone', e => useDrift.setState({ zone: e.name }));
    b.on('arrive', e => {
      this.sound.arrive();
      this.sound.engine(false);
      const s = useDrift.getState();
      const newBest = !s.best || e.t < s.best.t;
      const best = newBest ? { t: e.t, clean: e.clean } : s.best;
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(best));
      } catch {
        /* fine */
      }
      const badges = new Set(s.badges);
      badges.add('flown');
      if (e.clean === this.flight.gates.length) badges.add('perfect');
      if (e.t < 40) badges.add('swift');
      saveProgress(PROJECT_ID, badges);
      useDrift.setState({ best, badges: [...badges], t: e.t, ms: e.ms, result: { t: e.t, clean: e.clean, ms: e.ms, newBest } });
      // let the destination fill the screen for a moment, then the summary
      this.arriveTimer = window.setTimeout(() => useDrift.setState({ phase: 'summary' }), 1800);
    });
  }

  // ---------- flow ----------
  launch() {
    window.clearTimeout(this.arriveTimer);
    if (this.flight.t > 0) {
      this.flight = createFlight(Date.now() & 0xffff);
      this.bindFlight();
      this.view.setFlight(this.flight);
    }
    this.target = { x: 0, y: 0 };
    useDrift.setState({
      phase: 'flying', header: { ...START_HEADER }, changed: { keys: [], at: 0 }, last: null, next: 0, zone: zoneAt(0).name, log: [], passes: [],
      t: 0, ms: 0, result: null,
    });
    this.sound.engine(true);
  }

  pause() {
    if (useDrift.getState().phase !== 'flying') return;
    useDrift.setState({ phase: 'paused' });
    this.sound.engine(false);
  }

  resume() {
    if (useDrift.getState().phase !== 'paused') return;
    useDrift.setState({ phase: 'flying' });
    this.sound.engine(true);
  }

  toggleSound() {
    useDrift.setState({ sound: this.sound.toggle() });
    if (useDrift.getState().phase === 'flying') this.sound.engine(true);
  }

  setBoost(on: boolean) {
    this.boostHeld = on;
  }

  // ---------- input ----------
  private input(dt: number): Input {
    const k = this.keys;
    const kx = (k.has('arrowright') || k.has('d') ? 1 : 0) - (k.has('arrowleft') || k.has('a') ? 1 : 0);
    const ky = (k.has('arrowup') || k.has('w') ? 1 : 0) - (k.has('arrowdown') || k.has('s') ? 1 : 0);
    if (kx || ky) {
      this.pointerActive = false;
      this.target.x = Math.max(-1, Math.min(1, this.target.x + kx * dt * 1.8));
      this.target.y = Math.max(-1, Math.min(1, this.target.y + ky * dt * 1.8));
    }
    return { tx: this.target.x, ty: this.target.y, boost: this.boostHeld || this.padBoost || k.has(' ') || k.has('shift') };
  }

  private pointerTarget(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    const s = Math.min(r.width, r.height) * 0.38;
    this.target.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / s));
    this.target.y = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height / 2)) / s));
    this.pointerActive = true;
  }

  private pollGamepad() {
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p) continue;
      const [ax, ay] = p.axes;
      if (Math.abs(ax) > 0.12 || Math.abs(ay) > 0.12) {
        this.target.x = ax;
        this.target.y = -ay;
      }
      const boost = (p.buttons[7]?.value ?? 0) > 0.3 || !!p.buttons[0]?.pressed;
      this.padBoost = boost;
      const start = !!p.buttons[9]?.pressed;
      if (start && !this.padStart) {
        const ph = useDrift.getState().phase;
        if (ph === 'flying') this.pause();
        else if (ph === 'paused') this.resume();
        else this.launch();
      }
      this.padStart = start;
      return;
    }
  }

  private wireInput() {
    const on = <K extends keyof WindowEventMap>(t: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, fn);
      this.offs.push(() => window.removeEventListener(t, fn));
    };
    const c = this.canvas;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.buttons || e.pointerType === 'touch') this.pointerTarget(e);
    };
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerdown', onMove);
    this.offs.push(() => c.removeEventListener('pointermove', onMove), () => c.removeEventListener('pointerdown', onMove));
    on('keydown', e => {
      const k = e.key.toLowerCase();
      if ((e.target as HTMLElement).closest?.('input,textarea')) return;
      const ph = useDrift.getState().phase;
      if (k === 'enter' && ph !== 'flying' && ph !== 'paused') {
        e.preventDefault();
        return this.launch();
      }
      if (k === 'escape' || k === 'p') {
        if (ph === 'flying') this.pause();
        else if (ph === 'paused') this.resume();
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k) && ph === 'flying') e.preventDefault();
      this.keys.add(k);
    });
    on('keyup', e => this.keys.delete(e.key.toLowerCase()));
    on('blur', () => this.keys.clear());
  }

  get steeringByPointer() {
    return this.pointerActive;
  }

  dispose() {
    window.clearTimeout(this.arriveTimer);
    this.loop.stop();
    this.offs.forEach(f => f());
    this.sound.dispose();
    this.view.dispose();
    this.canvas.remove();
    useDrift.setState({ ...initialDrift });
  }
}
