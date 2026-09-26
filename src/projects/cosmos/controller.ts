import { createLoop, type Loop } from '@play/engine';
import { createSoundscape, type Soundscape } from '@play/audio';
import { loadProgress, saveProgress } from '@play/progress';
import { attachCosmosSound } from './audio/cosmosSound';
import { MISSIONS, type MissionId } from './content/missions';
import type { LensId } from './content/lenses';
import { record, shownPid, type Command, type World } from './sim';
import { initialCosmosState, useCosmos, type CosmosMode } from './store';
import type { DataSource } from './data/source';
import { MockSource } from './data/mock-source';
import { LiveSource } from './data/live-source';
import type { LiveState } from './data/live-adapter';
import { createCosmosView, type CosmosView } from './view';

export const PROJECT_ID = 'cosmos';
const MISSION_IDS = new Set<string>(MISSIONS.map(m => m.id));

/**
 * Owns one running Cosmos: world, loop, view, sound and input.
 * Mount creates everything; dispose() tears all of it down.
 */
export class CosmosController {
  readonly source: DataSource;
  readonly world: World;
  readonly view: CosmosView;
  private loop: Loop;
  private sound: Soundscape;
  private offs: (() => void)[] = [];
  private canvas: HTMLCanvasElement;
  private toastId = 0;

  constructor(host: HTMLElement, opts: { reduced: boolean; mode: CosmosMode; seed?: number }) {
    const saved = [...loadProgress(PROJECT_ID)].filter((id): id is MissionId => MISSION_IDS.has(id));
    this.source =
      opts.mode === 'live'
        ? new LiveSource({
            onConnection: connection => useCosmos.setState({ connection }),
            onHello: s => useCosmos.setState({ host: s.host, caps: [...s.caps] }),
          })
        : new MockSource({ seed: opts.seed ?? (Date.now() & 0x7fffffff), done: saved });
    this.world = this.source.world;
    useCosmos.setState({
      ...initialCosmosState,
      done: saved,
      mode: opts.mode,
      readOnly: this.source.readOnly,
      connection: opts.mode === 'live' ? 'connecting' : null,
    });

    // a fresh canvas per mount: a context that was force-lost cannot be reused
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'gl';
    this.canvas.setAttribute('aria-label', 'A 3D star system where planets are Linux processes');
    this.canvas.setAttribute('role', 'img');
    host.prepend(this.canvas);
    this.view = createCosmosView(this.canvas, this.world, {
      reduced: opts.reduced,
      bubbleLabel: this.source.kind === 'live' ? 'containers · PID namespaces' : undefined,
    });

    this.sound = createSoundscape();
    this.offs.push(attachCosmosSound(this.world, this.sound));
    this.wireEvents();
    this.wireInput();

    let uiT = 0;
    this.loop = createLoop({
      hz: 50,
      step: dt => this.source.step(dt),
      render: (_alpha, realDt, simDt) => {
        this.view.render(realDt, simDt);
        this.sound.pad(realDt);
        uiT += realDt;
        if (uiT > 0.3) {
          uiT = 0;
          useCosmos.setState(s => ({ tick: s.tick + 1 }));
        }
      },
    });
    this.loop.start();
    this.source.start();

    const onResize = () => this.view.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));

    if (import.meta.env.DEV) {
      (window as unknown as { __cosmos?: unknown }).__cosmos = {
        world: this.world,
        cmd: (c: Command) => this.cmd(c),
        step: (sec: number) => (this.source.kind === 'mock' ? record(this.world, sec).length : 0),
      };
      this.offs.push(() => delete (window as unknown as { __cosmos?: unknown }).__cosmos);
    }
    useCosmos.setState({ ready: true });
  }

  cmd(c: Command) {
    return this.source.command(c);
  }

  /** Live host details, or null in the Sandbox. */
  get live(): LiveState | null {
    return this.source instanceof LiveSource ? this.source.state : null;
  }

  select(pid: number | null) {
    if (pid !== null) useCosmos.setState({ missionsOpen: false });
    this.cmd({ type: 'select', pid });
  }

  toggleLens(id: LensId | null) {
    this.cmd({ type: 'lens', lens: this.world.view.lens === id ? null : id });
  }

  fork(pid: number) {
    if (this.source.readOnly) return;
    const child = this.cmd({ type: 'fork', pid });
    if (typeof child === 'number') this.select(child);
  }

  toggleSound() {
    useCosmos.setState({ sound: this.sound.toggle() });
  }

  dropSyscalls() {
    if (this.source.readOnly) return;
    this.cmd({ type: 'dropSyscalls' });
    this.sound.bubble();
  }

  setSpeed(speed: number) {
    this.loop.setSpeed(speed);
    useCosmos.setState({ speed });
  }

  resetProgress() {
    this.world.missions.clear();
    saveProgress(PROJECT_ID, []);
    useCosmos.setState({ done: [] });
  }

  private wireEvents() {
    const b = this.world.bus;
    this.offs.push(
      b.on('ui.select', e => {
        const p = e.pid !== null ? this.world.procs.get(e.pid) : undefined;
        useCosmos.setState({
          selected: e.pid,
          announce: p ? `Selected ${p.comm}, PID ${shownPid(this.world, p)}, state ${p.state}.` : '',
        });
      }),
      b.on('ui.lens', e => useCosmos.setState({ lens: e.lens, nsInside: this.world.view.nsInside })),
      b.on('ns.view', e => useCosmos.setState({ nsInside: e.inside })),
      b.on('mission.complete', e => {
        const m = MISSIONS.find(x => x.id === e.id);
        if (!m) return;
        saveProgress(PROJECT_ID, this.world.missions);
        useCosmos.setState({
          done: [...this.world.missions],
          toast: { id: ++this.toastId, title: m.title, body: m.learn },
          announce: `Mission complete: ${m.title}. ${m.learn}`,
        });
      }),
    );
  }

  private wireInput() {
    const c = this.canvas;
    const orbit = this.view.camera;
    const now = () => performance.now() / 1000;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      c.addEventListener(type, fn as EventListener, opts);
      this.offs.push(() => c.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', e => {
      orbit.pointerDown(e, now());
      c.setPointerCapture(e.pointerId);
    });
    on('pointermove', e => {
      if (orbit.pointerMove(e, now())) {
        c.classList.add('dragging');
        useCosmos.setState({ hover: null });
        return;
      }
      if (e.pointerType !== 'mouse' || orbit.active) return;
      const pid = this.view.pick(e.clientX, e.clientY);
      const p = pid !== null ? this.world.procs.get(pid) : undefined;
      c.classList.toggle('hovering', !!p);
      if (!p) {
        if (useCosmos.getState().hover) useCosmos.setState({ hover: null });
        return;
      }
      const w = this.world;
      const hidden = w.view.lens === 'namespaces' && w.view.nsInside && !p.ns;
      const r = c.getBoundingClientRect();
      const state = p.oomT !== null ? 'OOM' : p.onCpu >= 0 ? 'on CPU' + p.onCpu : p.state;
      useCosmos.setState({
        hover: { text: hidden ? 'not visible from inside the pod' : `${p.comm} · ${shownPid(w, p)} · ${state}`, x: e.clientX - r.left, y: e.clientY - r.top },
      });
    });
    on('pointerup', e => {
      c.classList.remove('dragging');
      if (!orbit.pointerUp(e)) return;
      const pid = this.view.pick(e.clientX, e.clientY);
      if (pid !== null) this.select(pid);
      else if (this.world.view.selected !== null) this.select(null);
    });
    on('pointercancel', e => orbit.pointerUp(e));
    on('pointerleave', () => useCosmos.setState({ hover: null }));
    on(
      'wheel',
      e => {
        e.preventDefault();
        orbit.zoomBy(1 + Math.sign(e.deltaY) * 0.08);
        orbit.lastInteract = now();
      },
      { passive: false },
    );
  }

  dispose() {
    this.loop.stop();
    this.source.stop();
    this.offs.forEach(off => off());
    this.offs = [];
    this.sound.dispose();
    this.view.dispose();
    this.world.bus.clear();
    this.canvas.remove();
    useCosmos.setState({ ...initialCosmosState });
  }
}
