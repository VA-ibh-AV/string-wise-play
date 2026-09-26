import { createLoop, type Loop } from '@play/engine';
import { loadProgress, saveProgress } from '@play/progress';
import { createGardenMusic, type GardenMusic } from './audio/music';
import type { NodeType } from './content/kinds';
import { MISSIONS, type MissionId } from './content/missions';
import { JOURNEYS } from './content/journeys';
import { SEEDS, type SeedKey } from './content/seeds';
import {
  createWorld, entryFor, followRequest, makeLane, moveBody, plant, plantSeed, removeBody, removeLane, run, sawTable, setLinkUp, step, tracePath,
  type GNode, type TraceEvent, type World,
} from './sim';
import { ALGOS } from './content/algos';
import { byName, laneBetween } from './content/journeys';
import { JourneyRunner, type JourneyState } from './journey';
import { initialGardenState, useGarden, type Tool } from './store';
import { createGardenView, type GardenView, type Selection } from './view';
import { KINDS } from './content/kinds';

export const PROJECT_ID = 'garden';
/** Garden time runs at half speed at "1×": calm enough to follow a single packet. */
export const TIME_SCALE = 0.5;
const MISSION_IDS = new Set<string>(MISSIONS.map(m => m.id));
const SEED_KEY = 'play.garden.seed';
const INTRO_KEY = 'play.garden.intro';

const seenIntro = () => {
  try {
    return localStorage.getItem(INTRO_KEY) === '1';
  } catch {
    return false;
  }
};

export const bodyLabel = (n: GNode) => `${KINDS[n.type].label} ${n.name}`;

/** One plain line about what a body is doing right now (hover, inspector). */
export function bodyStatus(_w: World, n: GNode): string {
  switch (n.type) {
    case 'client':
      return `${n.pending.size} request${n.pending.size === 1 ? '' : 's'} waiting · ${n.ok} answered · ${n.fail} failed`;
    case 'router': {
      let up = 0;
      for (const e of n.lsdb.values()) if (e.up) up++;
      return `routing between ${n.nh.size} bodies over ${up} lanes it knows are open`;
    }
    case 'lb':
      return `${ALGOS[n.algo].label} across ${n.candList.length} planet${n.candList.length === 1 ? '' : 's'}${n.hc ? ' · health checks on' : ''}`;
    case 'server':
      return n.mode === 'down' ? 'down: requests sent here vanish' : `${n.busy.length} of ${n.conc} workers busy · ${n.queue.length} waiting${n.mode === 'slow' ? ' · slow (6× longer)' : ''}`;
    case 'cache': {
      let h = 0;
      for (const l of n.look) if (l.hit) h++;
      return `holding ${n.store.size} of ${n.cap} crystals · hit ratio ${n.look.length ? Math.round((h / n.look.length) * 100) + '%' : '–'}`;
    }
  }
}

const readSeed = (): SeedKey => {
  try {
    const s = localStorage.getItem(SEED_KEY);
    return s && s in SEEDS ? (s as SeedKey) : 'sky';
  } catch {
    return 'sky';
  }
};
const writeSeed = (s: SeedKey) => {
  try {
    localStorage.setItem(SEED_KEY, s);
  } catch {
    /* no storage: fine */
  }
};

export class GardenController {
  readonly world: World;
  readonly view: GardenView;
  readonly music: GardenMusic;
  private loop: Loop;
  private canvas: HTMLCanvasElement;
  private offs: (() => void)[] = [];
  private toastId = 0;
  private toastSeen = new Map<string, number>();
  private drag: { id?: number; lane?: number; sx: number; sy: number; dx: number; dy: number; moved: boolean; pointer: number } | null = null;
  private laneFrom: number | null = null;
  private cameraPointers = new Set<number>();
  private toolPointer: number | null = null;
  readonly journey: JourneyRunner;
  private traceClear = 0;

  constructor(host: HTMLElement, opts: { reduced: boolean }) {
    const done = [...loadProgress(PROJECT_ID)].filter((id): id is MissionId => MISSION_IDS.has(id));
    this.world = createWorld({ seed: readSeed(), done });
    useGarden.setState({ ...initialGardenState, done, intro: !seenIntro() });
    this.journey = new JourneyRunner(this.world, s => this.onJourney(s), () => this.music.stepDone());

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'garden-gl';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Packet Garden: a network drawn as bodies in space. Use the panel to inspect them.');
    host.prepend(this.canvas);
    this.view = createGardenView(this.canvas, () => this.world, { reduced: opts.reduced });
    this.music = createGardenMusic();
    this.wireEvents();
    this.wireInput();

    let uiT = 0;
    this.loop = createLoop({
      hz: 120,
      step: () => step(this.world),
      render: (_a, real, sim) => {
        this.view.render(real, sim);
        this.music.tick();
        uiT += real;
        if (uiT > 0.25) {
          this.journey.tick(uiT);
          uiT = 0;
          this.refreshPath();
          useGarden.setState(s => ({ tick: s.tick + 1 }));
        }
      },
    });
    this.loop.setSpeed(TIME_SCALE);
    this.loop.start();
    const onResize = () => this.view.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));

    if (import.meta.env.DEV) {
      (window as unknown as { __garden?: unknown }).__garden = { world: this.world, run: (s: number) => run(this.world, s), ctl: this };
      this.offs.push(() => delete (window as unknown as { __garden?: unknown }).__garden);
    }
  }

  // ---------- actions the UI calls ----------
  select(sel: Selection | null) {
    const n = sel?.kind === 'node' ? this.world.nodes.get(sel.id) : undefined;
    if (n?.type === 'router') sawTable(this.world);
    this.view.setSelection(sel);
    const label = n ? `${KINDS[n.type].label} ${n.name}` : sel ? 'lane' : '';
    useGarden.setState({
      sel, announce: sel ? `Selected ${label}.` : '',
      ...(sel ? { tab: 'inspect' as const } : {}),
      ...(sel && window.innerWidth <= 760 ? { sheet: true } : {}),
    });
    this.refreshPath();
    if (sel) this.journey.event({ type: 'select', kind: sel.kind, id: sel.id });
  }

  // ---------- journeys ----------
  startJourney(id: MissionId) {
    const j = JOURNEYS.find(x => x.id === id);
    if (!j) return;
    plantSeed(this.world, j.layout);
    writeSeed(j.layout);
    this.select(null);
    this.setMode('watch');
    if (useGarden.getState().speed === 0) this.setSpeed(1);
    useGarden.setState({ tab: 'journeys', trace: null, sheet: false });
    this.journey.start(id);
  }

  stopJourney() {
    this.journey.stop();
  }

  private onJourney(s: JourneyState | null) {
    useGarden.setState({ journey: s });
    const step = this.journey.step;
    if (step?.tool) this.setTool(step.tool);
    else if (useGarden.getState().mode === 'watch') this.setTool('select');
    const target = s?.target ? this.resolve(s.target) : null;
    this.view.setHighlight(target);
    if (target) this.view.focus(target);
    else if (!s || s.finished) this.view.focus(null);
  }

  /** "p2" → body, "r2-r4" → the lane between them. */
  resolve(name: string): Selection | null {
    const w = this.world;
    if (name.includes('-')) {
      const [a, b] = name.split('-');
      const L = laneBetween(w, a, b);
      return L ? { kind: 'link', id: L.id } : null;
    }
    const n = byName(w, name);
    return n ? { kind: 'node', id: n.id } : null;
  }

  follow(probeId: number) {
    if (followRequest(this.world, probeId)) this.view.followTrace(true);
  }

  setMode(mode: 'watch' | 'build') {
    if (mode === 'build' && useGarden.getState().journey?.finished) this.journey.stop();
    useGarden.setState({ mode });
    if (mode === 'watch' && !this.journey.step?.tool) this.setTool('select');
  }

  closeIntro(tour: boolean) {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* fine */
    }
    useGarden.setState({ intro: false });
    if (tour) this.startJourney('bloom');
  }

  private narrate(e: TraceEvent): string {
    const w = this.world;
    const L = (id?: number) => {
      const n = id !== undefined ? w.nodes.get(id) : undefined;
      return n ? bodyLabel(n) : 'somewhere';
    };
    switch (e.what) {
      case 'ask': return `${L(e.node)} asks for a crystal. The nearest place to get one is ${L(e.dst)}.`;
      case 'hop':
        return e.node === e.dst ? '' : e.kind === 'res'
          ? `The answer passes ${L(e.node)} on its way home to ${L(e.dst)}.`
          : `${L(e.node)} checks its star chart: to reach ${L(e.dst)}, the next hop is ${L(e.next)}.`;
      case 'pick': {
        const n = w.nodes.get(e.node);
        return `${L(e.node)} picks ${L(e.next)}${n?.type === 'lb' ? ` (${ALGOS[n.algo].label.toLowerCase()})` : ''}.`;
      }
      case 'hit': return `${L(e.node)} already has this crystal: a cache hit! The answer goes straight back.`;
      case 'miss': return `${L(e.node)} doesn't have it (a miss), so it fetches it from ${L(e.dst)}.`;
      case 'wait': return `${L(e.node)} is already fetching this crystal, so the request waits for that fetch.`;
      case 'serve': return `${L(e.node)} starts working on it: a worker moon lights up.`;
      case 'queue': return `${L(e.node)} is busy. The request waits in its queue.`;
      case 'fetch': return '';
      case 'answer':
        return e.ok ? `Answer home in ${(e.lat ?? 0).toFixed(1)}s${e.hit ? ', straight from the nebula' : ''}.` : 'The answer came back as a failure.';
      case 'lost':
        return `Lost at ${L(e.node)}: ${e.reason === 'cut' ? 'its lane was cut' : e.reason === 'queue' ? 'the queue was full' : e.reason === 'ttl' ? 'it went round in circles' : 'there was no route'}.`;
    }
  }

  setTool(tool: Tool) {
    this.laneFrom = null;
    useGarden.setState({ tool });
  }

  setSpeed(speed: number) {
    this.loop.setSpeed(speed * TIME_SCALE);
    useGarden.setState({ speed });
  }

  toggleSound() {
    useGarden.setState({ sound: this.music.toggle() });
  }

  plantSeed(key: SeedKey) {
    plantSeed(this.world, key);
    writeSeed(key);
    this.laneFrom = null;
    this.select(null);
  }

  resetProgress() {
    this.world.missions.clear();
    saveProgress(PROJECT_ID, []);
    useGarden.setState({ done: [] });
  }

  /** Lanes on the paths of the selected body, as each relay would route right now. */
  private refreshPath() {
    const sel = useGarden.getState().sel;
    const w = this.world;
    const path = new Map<number, boolean>();
    const n = sel?.kind === 'node' ? w.nodes.get(sel.id) : undefined;
    if (n) {
      const traces =
        n.type === 'client' ? [entryFor(w, n, ['cache', 'lb', 'server'])]
          : n.type === 'cache' ? [entryFor(w, n, ['lb', 'server'])]
            : n.type === 'lb' ? n.candList : [];
      for (const t of traces) {
        if (!t) continue;
        const tr = tracePath(w, n.id, t.id);
        for (const lid of tr.lids) path.set(lid, tr.ok);
      }
    }
    this.view.setPath(path);
  }

  private toast(msg: string, tone: '' | 'warn' | 'good', key?: string) {
    const k = key || msg, now = performance.now();
    if ((this.toastSeen.get(k) ?? -1e9) > now - 2500) return;
    this.toastSeen.set(k, now);
    const id = ++this.toastId;
    useGarden.setState(s => ({ toasts: [...s.toasts, { id, msg, tone }].slice(-3) }));
    window.setTimeout(() => useGarden.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), tone === 'good' ? 6500 : 5500);
  }

  private wireEvents() {
    const b = this.world.bus;
    this.offs.push(
      b.on('toast', e => this.toast(e.msg, e.tone, e.key)),
      b.on('mission', e => {
        saveProgress(PROJECT_ID, this.world.missions);
        const m = MISSIONS.find(x => x.id === e.id);
        useGarden.setState({ done: [...this.world.missions], announce: m ? `Mission complete: ${m.title}.` : '' });
        this.music.mission();
      }),
      b.on('answer', e => this.music.answer(e.key, e.hit)),
      b.on('drop', () => this.music.drop()),
      b.on('lsa', () => this.music.news()),
      b.on('cut', e => !e.up && this.music.sever()),
      b.on('trace', e => {
        const text = this.narrate(e);
        if (text) useGarden.setState({ trace: text });
        window.clearTimeout(this.traceClear);
        if (e.what === 'answer' || e.what === 'lost') {
          this.view.followTrace(false);
          this.traceClear = window.setTimeout(() => useGarden.setState({ trace: null }), 9000);
        } else this.view.followTrace(true);
      }),
      b.onAny(e => this.journey.event(e)),
    );
  }

  // ---------- pointer tools ----------
  private wireInput() {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(t: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      c.addEventListener(t, fn as EventListener, o);
      this.offs.push(() => c.removeEventListener(t, fn as EventListener, o));
    };
    on('contextmenu', e => e.preventDefault());
    on('wheel', e => {
      e.preventDefault();
      this.view.camera.zoom(1 + Math.sign(e.deltaY) * 0.08);
    }, { passive: false });
    on('pointerdown', e => {
      c.setPointerCapture(e.pointerId);
      const secondTouch = e.pointerType === 'touch' && this.toolPointer !== null;
      if (e.button === 1 || e.button === 2 || secondTouch) {
        if (secondTouch && this.toolPointer !== null) {
          // two fingers: the first one stops being a tool and joins the camera
          this.cameraPointers.add(this.toolPointer);
          this.view.camera.down(new PointerEvent('pointerdown', { pointerId: this.toolPointer, clientX: this.drag?.sx ?? e.clientX, clientY: this.drag?.sy ?? e.clientY }));
          this.drag = null;
          this.toolPointer = null;
          this.view.setPreview(null);
        }
        this.cameraPointers.add(e.pointerId);
        this.view.camera.down(e);
        return;
      }
      this.toolPointer = e.pointerId;
      this.toolDown(e);
    });
    on('pointermove', e => {
      if (this.cameraPointers.has(e.pointerId)) return this.view.camera.move(e);
      if (e.pointerId === this.toolPointer) this.toolMove(e);
      else if (e.pointerType === 'mouse') {
        const id = this.view.pickBody(e.clientX, e.clientY);
        const n = id !== null ? this.world.nodes.get(id) : undefined;
        if (useGarden.getState().tool === 'select') c.style.cursor = n ? 'grab' : this.view.pickLane(e.clientX, e.clientY) !== null ? 'pointer' : 'default';
        const r = c.getBoundingClientRect();
        useGarden.setState({ hover: n ? { text: `${bodyLabel(n)} · ${bodyStatus(this.world, n)}`, x: e.clientX - r.left, y: e.clientY - r.top } : null });
      }
    });
    const end = (e: PointerEvent) => {
      if (this.cameraPointers.delete(e.pointerId)) return this.view.camera.up(e);
      if (e.pointerId === this.toolPointer) {
        this.toolUp(e);
        this.toolPointer = null;
      }
    };
    on('pointerup', end);
    on('pointerleave', () => useGarden.setState({ hover: null }));
    on('pointercancel', e => {
      this.cameraPointers.delete(e.pointerId);
      this.view.camera.up(e);
      this.drag = null;
      this.toolPointer = null;
      this.view.setPreview(null);
    });
  }

  private toolDown(e: PointerEvent) {
    const w = this.world, tool = useGarden.getState().tool;
    const bodyId = this.view.pickBody(e.clientX, e.clientY);
    const laneId = bodyId === null ? this.view.pickLane(e.clientX, e.clientY) : null;
    const base = { sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, pointer: e.pointerId };
    switch (tool) {
      case 'select':
        if (bodyId !== null) {
          this.select({ kind: 'node', id: bodyId });
          const n = w.nodes.get(bodyId)!;
          const g = this.view.ground(e.clientX, e.clientY);
          this.drag = { ...base, id: bodyId, dx: g ? n.x - g.x : 0, dy: g ? n.y - g.y : 0 };
        } else if (laneId !== null) this.select({ kind: 'link', id: laneId });
        else this.select(null);
        return;
      case 'lane':
        if (bodyId === null) {
          this.laneFrom = null;
          return;
        }
        if (this.laneFrom !== null && this.laneFrom !== bodyId) {
          makeLane(w, this.laneFrom, bodyId);
          this.laneFrom = null;
        } else this.drag = { ...base, lane: bodyId };
        return;
      case 'sever':
        if (laneId !== null) {
          const L = w.links.get(laneId)!;
          setLinkUp(w, L, !L.up);
        } else if (bodyId !== null) this.toast('The sever tool works on lanes. Tap a lane instead.', '', 'sever');
        return;
      case 'remove':
        if (bodyId !== null) {
          removeBody(w, w.nodes.get(bodyId)!);
          if (useGarden.getState().sel?.id === bodyId) this.select(null);
        } else if (laneId !== null) removeLane(w, w.links.get(laneId)!);
        return;
      default: {
        if (bodyId !== null) return this.select({ kind: 'node', id: bodyId });
        if (laneId !== null) return this.select({ kind: 'link', id: laneId });
        const g = this.view.ground(e.clientX, e.clientY);
        if (!g) return;
        const n = plant(w, tool as NodeType, g.x, g.y);
        this.select({ kind: 'node', id: n.id });
        this.toast(`Placed ${KINDS[n.type].label.toLowerCase()} ${n.name}. Join it to the sky with the Lane tool.`, '', 'plant' + n.type);
      }
    }
  }

  private toolMove(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6) d.moved = true;
    if (!d.moved) return;
    if (d.id !== undefined) {
      const n = this.world.nodes.get(d.id), g = this.view.ground(e.clientX, e.clientY);
      if (n && g) moveBody(n, g.x + d.dx, g.y + d.dy);
    } else if (d.lane !== undefined) this.view.setPreview(d.lane, e.clientX, e.clientY);
  }

  private toolUp(e: PointerEvent) {
    const d = this.drag;
    this.drag = null;
    this.view.setPreview(null);
    if (!d || d.lane === undefined) return;
    const target = this.view.pickBody(e.clientX, e.clientY);
    if (d.moved && target !== null && target !== d.lane) makeLane(this.world, d.lane, target);
    else if (!d.moved) this.laneFrom = d.lane;
  }

  get laneStart() {
    return this.laneFrom;
  }

  dispose() {
    window.clearTimeout(this.traceClear);
    this.journey.stop();
    this.loop.stop();
    this.offs.forEach(f => f());
    this.offs = [];
    this.music.dispose();
    this.view.dispose();
    this.world.bus.clear();
    this.canvas.remove();
    useGarden.setState({ ...initialGardenState });
  }
}
