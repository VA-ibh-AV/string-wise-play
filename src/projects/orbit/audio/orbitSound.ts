/**
 * Bell voices and a star drone, scheduled ahead on the AudioContext clock so
 * rhythm stays tight even when a frame is late. One shared reverb.
 */
export interface OrbitSound {
  readonly on: boolean;
  readonly ready: boolean;
  /** Must be called from a user gesture. */
  start(): void;
  toggle(): boolean;
  /** Audio-clock time for a sim time `at`, given the sim time right now. */
  when(at: number, simNow: number): number;
  bell(freq: number, when: number, pan: number, gain?: number): void;
  drone(rootHz: number): void;
  throttle(when: number): void;
  dispose(): void;
}

export function createOrbitSound(): OrbitSound {
  let ac: AudioContext | null = null;
  let master!: GainNode, dry!: GainNode, verb!: GainNode;
  let on = false;
  let droneNodes: { o: OscillatorNode; g: GainNode }[] = [];
  let droneRoot = 0;

  function init() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    master.connect(comp).connect(ac.destination);
    const len = Math.floor(ac.sampleRate * 4.8), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    verb = ac.createGain();
    verb.gain.value = 0.55;
    verb.connect(conv).connect(master);
    dry = ac.createGain();
    dry.gain.value = 0.6;
    dry.connect(master);
    return true;
  }

  const live = () => on && ac !== null;

  return {
    get on() {
      return on;
    },
    get ready() {
      return ac !== null;
    },
    start() {
      if (!ac && !init()) return;
      if (ac!.state === 'suspended') void ac!.resume();
      if (!on) this.toggle();
    },
    toggle() {
      if (!ac && !init()) return false;
      on = !on;
      if (ac!.state === 'suspended') void ac!.resume();
      const now = ac!.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? 0.9 : 0, now + 1.2);
      return on;
    },
    when(at, simNow) {
      return ac ? ac.currentTime + Math.max(0, at - simNow) : 0;
    },
    bell(freq, when, pan, gain = 0.07) {
      if (!live()) return;
      const a = ac!, out = a.createGain(), p = a.createStereoPanner();
      p.pan.value = Math.max(-0.9, Math.min(0.9, pan));
      out.gain.setValueAtTime(0, when);
      out.gain.linearRampToValueAtTime(gain, when + 0.006);
      out.gain.exponentialRampToValueAtTime(0.0001, when + 2.2);
      // sine fundamental, an octave partial at 0.28, a triangle third partial at 0.08
      for (const [mult, amp, type] of [[1, 1, 'sine'], [2, 0.28, 'sine'], [3, 0.08, 'triangle']] as const) {
        const o = a.createOscillator(), g = a.createGain();
        o.type = type;
        o.frequency.value = freq * mult;
        g.gain.value = amp;
        o.connect(g).connect(out);
        o.start(when);
        o.stop(when + 2.3);
      }
      out.connect(p);
      p.connect(dry);
      p.connect(verb);
    },
    drone(rootHz) {
      if (!ac || rootHz === droneRoot) return;
      droneRoot = rootHz;
      const now = ac.currentTime;
      for (const d of droneNodes) {
        d.g.gain.setTargetAtTime(0, now, 1.2);
        d.o.stop(now + 6);
      }
      droneNodes = [rootHz / 2, (rootHz / 2) * 1.5, rootHz / 4].map((f, i) => {
        const o = ac!.createOscillator(), g = ac!.createGain(), lp = ac!.createBiquadFilter();
        o.type = i === 1 ? 'triangle' : 'sine';
        o.frequency.value = f;
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        g.gain.value = 0;
        g.gain.setTargetAtTime(i === 2 ? 0.05 : 0.03, now, 2);
        o.connect(lp).connect(g);
        g.connect(dry);
        g.connect(verb);
        o.start(now);
        return { o, g };
      });
    },
    throttle(when) {
      if (!live()) return;
      const a = ac!, o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, when);
      o.frequency.exponentialRampToValueAtTime(90, when + 0.4);
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(0.04, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
      o.connect(g).connect(dry);
      o.start(when);
      o.stop(when + 0.7);
    },
    dispose() {
      on = false;
      if (ac) void ac.close();
      ac = null;
    },
  };
}
