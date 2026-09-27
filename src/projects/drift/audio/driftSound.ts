/**
 * Flight sound, all synthesised: a soft engine (brown noise whose filter
 * opens with speed), a slow pad, bright notes for clean passes, a low note for
 * wide ones, and a rising chord on arrival. Off until the visitor turns it on.
 */
export interface DriftSound {
  readonly on: boolean;
  toggle(): boolean;
  /** Engine running (during a flight) or idle. */
  engine(running: boolean): void;
  speed(v: number): void;
  tick(): void;
  clean(hop: number): void;
  wide(): void;
  arrive(): void;
  dispose(): void;
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// C lydian, bright and open: Cmaj9 → Am9 → Fmaj7(#11) → G6/9
const CHORDS = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 60],
  [41, 48, 52, 55, 59],
  [43, 50, 57, 59, 64],
];
const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100];

export function createDriftSound(): DriftSound {
  let ac: AudioContext | null = null;
  let master!: GainNode, dry!: GainNode, verb!: GainNode, echo!: GainNode, engineGain!: GainNode, engineLp!: BiquadFilterNode;
  let on = false, running = false, nextChord = 0, chord = 0;

  function init() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp).connect(ac.destination);
    const len = Math.floor(ac.sampleRate * 4.5), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    verb = ac.createGain();
    verb.gain.value = 0.6;
    verb.connect(conv).connect(master);
    dry = ac.createGain();
    dry.gain.value = 0.55;
    dry.connect(master);
    const delay = ac.createDelay(1);
    delay.delayTime.value = 0.34;
    const fb = ac.createGain();
    fb.gain.value = 0.3;
    delay.connect(fb).connect(delay);
    delay.connect(verb);
    echo = ac.createGain();
    echo.gain.value = 0.25;
    echo.connect(delay);

    // engine: brown noise, low-passed by speed
    const nb = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      nd[i] = last * 3.4;
    }
    const src = ac.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    engineLp = ac.createBiquadFilter();
    engineLp.type = 'lowpass';
    engineLp.frequency.value = 200;
    engineLp.Q.value = 1.2;
    engineGain = ac.createGain();
    engineGain.gain.value = 0;
    src.connect(engineLp).connect(engineGain).connect(dry);
    src.start();
    return true;
  }

  const live = () => on && ac !== null && ac.state === 'running';

  function note(freq: number, t: number, dur: number, gain: number, type: OscillatorType = 'sine', send = true) {
    const a = ac!, o = a.createOscillator(), g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dry);
    g.connect(verb);
    if (send) g.connect(echo);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function pad(freqs: number[], t: number, dur: number) {
    const a = ac!;
    for (const [i, f] of freqs.entries()) {
      const g = a.createGain(), lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.016, t + 3);
      g.gain.setValueAtTime(0.016, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + 4);
      for (const det of [-5, 5]) {
        const o = a.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur + 4.2);
      }
      lp.connect(g);
      g.connect(dry);
      g.connect(verb);
    }
  }

  return {
    get on() {
      return on;
    },
    toggle() {
      if (!ac && !init()) return false;
      on = !on;
      if (ac!.state === 'suspended') void ac!.resume();
      const now = ac!.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? 0.9 : 0, now + 1.5);
      if (on && nextChord < now) nextChord = now + 0.1;
      return on;
    },
    engine(r) {
      running = r;
      if (!ac) return;
      const now = ac.currentTime;
      engineGain.gain.cancelScheduledValues(now);
      engineGain.gain.setValueAtTime(engineGain.gain.value, now);
      engineGain.gain.linearRampToValueAtTime(r ? 0.16 : 0.0, now + 1.2);
    },
    speed(v) {
      if (!ac || !running) return;
      engineLp.frequency.setTargetAtTime(160 + v * 9, ac.currentTime, 0.2);
    },
    tick() {
      if (!live()) return;
      const now = ac!.currentTime;
      if (nextChord <= now + 0.4) {
        const dur = 8;
        pad(CHORDS[chord++ % CHORDS.length].map(midi), nextChord, dur);
        nextChord += dur;
      }
    },
    clean(hop) {
      if (!live()) return;
      const t = ac!.currentTime, f = midi(PENTA[hop % PENTA.length]);
      note(f, t, 1.6, 0.06);
      note(f * 1.5, t + 0.04, 1.3, 0.03);
    },
    wide() {
      if (!live()) return;
      note(midi(45), ac!.currentTime, 1.2, 0.07, 'sine', false);
    },
    arrive() {
      if (!live()) return;
      const t = ac!.currentTime;
      [60, 64, 67, 71, 76].forEach((m, i) => note(midi(m), t + i * 0.14, 3.5, 0.05));
    },
    dispose() {
      on = false;
      if (ac) void ac.close();
      ac = null;
    },
  };
}
