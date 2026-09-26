/**
 * Generated soundscape (no samples). Starts muted; the AudioContext is created on
 * the first toggle, which is always a user gesture.
 */
export interface Soundscape {
  readonly on: boolean;
  toggle(): boolean;
  plink(i: number): void;
  chime(): void;
  bubble(vol?: number): void;
  tick(): void;
  zap(v?: number): void;
  thud(): void;
  /** Call every frame; plays a pad chord every 9 s. */
  pad(dt: number): void;
  dispose(): void;
}

const SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5, 1568.0, 1760.0];
const CHORDS = [
  [110, 164.81, 220, 329.63],
  [98, 146.83, 196, 293.66],
  [87.31, 130.81, 174.61, 261.63],
  [98, 146.83, 220, 329.63],
];

export function createSoundscape(): Soundscape {
  let ac: AudioContext | null = null;
  let master: GainNode, wet: GainNode, dry: GainNode;
  let on = false;
  let padT = 0;
  let chord = 0;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  function init(): boolean {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    // one convolver reverb shared by every sound
    const len = ac.sampleRate * 3.2;
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    wet = ac.createGain();
    wet.gain.value = 0.7;
    wet.connect(conv);
    conv.connect(master);
    dry = ac.createGain();
    dry.gain.value = 0.55;
    dry.connect(master);
    // brown noise through a slowly moving low-pass
    const nb = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
    const nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nd.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      nd[i] = last * 3.2;
    }
    const ns = ac.createBufferSource();
    ns.buffer = nb;
    ns.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 240;
    lp.Q.value = 0.6;
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = 0.05;
    lfoG.gain.value = 110;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    lfo.start();
    const ng = ac.createGain();
    ng.gain.value = 0.16;
    ns.connect(lp);
    lp.connect(ng);
    ng.connect(master);
    ns.start();
    return true;
  }

  function note(freq: number, t0: number, dur: number, gain: number, type: OscillatorType = 'sine', wetAmt = 1) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(dry);
    if (wetAmt) {
      const w = ac.createGain();
      w.gain.value = wetAmt;
      g.connect(w);
      w.connect(wet);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  const live = () => on && ac !== null;

  return {
    get on() {
      return on;
    },
    toggle() {
      if (!ac && !init()) return false;
      on = !on;
      if (ac!.state === 'suspended') void ac!.resume();
      const g = master.gain, now = ac!.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(on ? 0.9 : 0, now + 1.2);
      if (on) padT = 0;
      return on;
    },
    plink(i) {
      if (!live()) return;
      const t = ac!.currentTime, f = SCALE[((i % SCALE.length) + SCALE.length) % SCALE.length];
      note(f, t, 1.4, 0.05);
      note(f * 2, t, 0.5, 0.012, 'triangle');
    },
    chime() {
      if (!live()) return;
      const t = ac!.currentTime;
      [659.25, 987.77, 1318.5].forEach((f, i) => note(f, t + i * 0.09, 2.2, 0.035));
    },
    tick() {
      if (live()) note(2093, ac!.currentTime, 0.12, 0.02, 'triangle', 0.3);
    },
    zap(v = 1) {
      if (live()) note(1567.98, ac!.currentTime, 0.25, 0.012 * v, 'sine', 0.6);
    },
    thud() {
      if (!live()) return;
      const t = ac!.currentTime, o = ac!.createOscillator(), g = ac!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 2.2);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      o.connect(g);
      g.connect(dry);
      const w = ac!.createGain();
      w.gain.value = 0.8;
      g.connect(w);
      w.connect(wet);
      o.start(t);
      o.stop(t + 2.7);
    },
    bubble(vol = 1) {
      if (!live()) return;
      const t = ac!.currentTime, o = ac!.createOscillator(), g = ac!.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(rnd(260, 380), t);
      o.frequency.exponentialRampToValueAtTime(rnd(900, 1300), t + 0.09);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.03 * vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g);
      g.connect(dry);
      o.start(t);
      o.stop(t + 0.15);
    },
    pad(dt) {
      if (!live()) return;
      padT -= dt;
      if (padT > 0) return;
      padT = 9;
      const t = ac!.currentTime;
      const ch = CHORDS[chord++ % CHORDS.length];
      for (const f of ch)
        for (const det of [-3, 3]) {
          const o = ac!.createOscillator(), g = ac!.createGain(), lp = ac!.createBiquadFilter();
          o.type = 'triangle';
          o.frequency.value = f;
          o.detune.value = det;
          lp.type = 'lowpass';
          lp.frequency.value = 700;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.012, t + 3.5);
          g.gain.linearRampToValueAtTime(0.0, t + 11);
          o.connect(lp);
          lp.connect(g);
          g.connect(dry);
          const w = ac!.createGain();
          w.gain.value = 1.2;
          g.connect(w);
          w.connect(wet);
          o.start(t);
          o.stop(t + 11.2);
        }
    },
    dispose() {
      on = false;
      if (ac) void ac.close();
      ac = null;
    },
  };
}
