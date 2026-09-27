import { JOURNEYS, type Journey, type JourneyEvent, type Step } from './content/journeys';
import type { MissionId } from './content/missions';
import type { World } from './sim';

export interface JourneyState {
  id: MissionId;
  title: string;
  step: number;
  total: number;
  say: string;
  /** Set for ~3.5 s after a step completes. */
  then: string | null;
  action: string | null;
  next: boolean;
  target: string | null;
  finished: boolean;
}

const THEN_SECONDS = 3.5;

/**
 * Runs one journey: checks the open step against sim events and UI events,
 * shows "what just happened", then moves on. Pure: no DOM, no three.js.
 */
export class JourneyRunner {
  private j: Journey | null = null;
  private i = 0;
  private since = 0;
  private thenLeft = 0;
  private thenText: string | null = null;

  constructor(private w: World, private onChange: (s: JourneyState | null) => void, private onStepDone: () => void = () => {}) {}

  get step(): Step | null {
    return this.j && this.i < this.j.steps.length ? this.j.steps[this.i] : null;
  }

  get active() {
    return this.j !== null;
  }

  start(id: MissionId) {
    this.j = JOURNEYS.find(x => x.id === id) ?? null;
    this.i = 0;
    this.since = 0;
    this.thenLeft = 0;
    this.thenText = null;
    this.emit();
  }

  stop() {
    this.j = null;
    this.onChange(null);
  }

  /** Feed every sim event and UI event. */
  event(ev: JourneyEvent) {
    this.check(ev);
  }

  /** Call regularly with real seconds; also checks state-based steps. */
  tick(dt: number) {
    if (!this.j) return;
    this.since += dt;
    if (this.thenLeft > 0) {
      this.thenLeft -= dt;
      if (this.thenLeft <= 0) {
        this.thenText = null;
        this.emit();
      }
    }
    this.check(null);
  }

  /** Next button (reading steps) and Skip step. */
  advance() {
    const s = this.step;
    if (!s) return;
    this.complete(s);
  }

  runAction() {
    this.step?.action?.run(this.w);
  }

  private check(ev: JourneyEvent | null) {
    const s = this.step;
    if (!s || !s.done || s.next) return;
    if (s.done({ w: this.w, ev, since: this.since })) this.complete(s);
  }

  private complete(s: Step) {
    this.i++;
    this.since = 0;
    this.thenText = s.then ?? null;
    this.thenLeft = s.then ? THEN_SECONDS : 0;
    this.onStepDone();
    this.emit();
    // a later step may already be satisfied (e.g. the mission finished early)
    this.check(null);
  }

  private emit() {
    const j = this.j;
    if (!j) return this.onChange(null);
    const s = this.step;
    this.onChange({
      id: j.id, title: j.title, step: Math.min(this.i + 1, j.steps.length), total: j.steps.length,
      say: s?.say ?? 'Journey complete.', then: this.thenText, action: s?.action?.label ?? null, next: !!s?.next,
      target: s?.target ?? null, finished: !s,
    });
  }
}
