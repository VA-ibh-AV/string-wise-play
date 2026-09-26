/**
 * Generative ambient score for the garden. Everything is synthesised: a slow
 * lydian pad, a soft bass, cosmic wind, and sparse FM bells. Sim events play
 * notes from the current chord, quantised to the pulse, so they join the music
 * instead of interrupting it. Off until the visitor turns it on.
 */
export interface GardenMusic {
  readonly on: boolean;
  toggle(): boolean;
  /** Call every frame: schedules chords and bells ahead of time. */
  tick(): void;
  answer(key: number, hit: boolean): void;
  drop(): void;
  news(): void;
  mission(): void;
  sever(): void;
  /** Soft two-note chime when a journey step completes. */
  stepDone(): void;
  dispose(): void;
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const BEAT = 60 / 66; // 66 bpm
const EIGHTH = BEAT / 2;
const CHORD_BEATS = 16;

// D lydian colours: Dmaj9 → Bm11 → Gmaj9(#11) → A6/9
const CHORDS: { pad: number[]; bass: number; bells: number[] }[] = [
  { pad: [50, 57, 61, 64, 66], bass: 38, bells: [74, 76, 78, 81, 85, 86] },
  { pad: [47, 54, 57, 62, 64], bass: 35, bells: [71, 74, 76, 78, 81, 83] },
  { pad: [43, 50, 54, 57, 61], bass: 31, bells: [73, 74, 78, 79, 81, 85] },
  { pad: [45, 52, 59, 61, 66], bass: 33, bells: [69, 71, 73, 76, 78, 83] },
];

export function createGardenMusic(): GardenMusic {
  let ac: AudioContext | null = null;
  let master!: GainNode, dry!: GainNode, verb!: GainNode, delay!: DelayNode, delaySend!: GainNode;
  let on = false;
  let chordIdx = 0, nextChord = 0, nextBell = 0, lastEvent = 0, lastDrop = 0;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);

  function init() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = 0;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(comp).connect(ac.destination);

    // long, soft reverb: decorrelated noise with a slow exponential tail
    const len = Math.floor(ac.sampleRate * 6);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 200 ? i / 200 : 1);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    verb = ac.createGain();
    verb.gain.value = 0.62;
    verb.connect(conv).connect(master);
    dry = ac.createGain();
    dry.gain.value = 0.5;
    dry.connect(master);

    // dotted-eighth echo with a darkening feedback loop
    delay = ac.createDelay(2);
    delay.delayTime.value = EIGHTH * 1.5;
    const fb = ac.createGain();
    fb.gain.value = 0.38;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    delay.connect(tone).connect(fb).connect(delay);
    delaySend = ac.createGain();
    delaySend.gain.value = 0.28;
    delaySend.connect(delay);
    tone.connect(verb);

    // cosmic wind: filtered noise, slowly breathing
    const nb = ac.createBuffer(1, ac.sampleRate * 5, ac.sampleRate);
    const nd = nb.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < nd.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.03;
      b1 = 0.985 * b1 + white * 0.05;
      nd[i] = (b0 + b1) * 0.8;
    }
    const src = ac.createBufferSource();
    src.buffer = nb;
    src.loop = true;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.7;
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = 0.021;
    lfoG.gain.value = 500;
    lfo.connect(lfoG).connect(bp.frequency);
    const wind = ac.createGain();
    wind.gain.value = 0.05;
    src.connect(bp).connect(wind).connect(verb);
    wind.connect(dry);
    lfo.start();
    src.start();
    return true;
  }

  function padVoice(freq: number, t: number, dur: number, gain: number, pan: number) {
    const a = ac!;
    const g = a.createGain();
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(600, t + dur + 6);
    const p = a.createStereoPanner();
    p.pan.value = pan;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 5);
    g.gain.setValueAtTime(gain, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 7);
    for (const [type, det] of [['triangle', -6], ['sine', 5]] as const) {
      const o = a.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 7.2);
    }
    lp.connect(g).connect(p);
    p.connect(verb);
    p.connect(dry);
  }

  function bass(freq: number, t: number, dur: number) {
    const a = ac!;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 4);
    g.gain.setValueAtTime(0.09, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 5);
    o.connect(g).connect(dry);
    o.start(t);
    o.stop(t + dur + 5.2);
  }

  /** A soft FM bell: sine carrier, decaying inharmonic modulator. */
  function bell(freq: number, t: number, gain: number, decay = 3.5, pan = rnd(-0.6, 0.6)) {
    const a = ac!;
    const car = a.createOscillator(), mod = a.createOscillator(), mg = a.createGain(), g = a.createGain();
    const p = a.createStereoPanner();
    car.frequency.value = freq;
    mod.frequency.value = freq * 3.5;
    mg.gain.setValueAtTime(freq * 1.4, t);
    mg.gain.exponentialRampToValueAtTime(freq * 0.05, t + decay * 0.6);
    mod.connect(mg).connect(car.frequency);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    p.pan.value = pan;
    car.connect(g).connect(p);
    p.connect(dry);
    p.connect(verb);
    p.connect(delaySend);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.1);
    mod.stop(t + decay + 0.1);
  }

  /** Next eighth-note slot at or after now. */
  function quantise(now: number) {
    return Math.ceil((now + 0.03) / EIGHTH) * EIGHTH;
  }

  const live = () => on && ac !== null && ac.state === 'running';

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
      master.gain.linearRampToValueAtTime(on ? 0.85 : 0, now + 2.5);
      if (on && nextChord < now) {
        nextChord = now + 0.1;
        nextBell = now + BEAT * 4;
      }
      return on;
    },
    tick() {
      if (!live()) return;
      const now = ac!.currentTime, ahead = now + 0.5;
      if (nextChord <= ahead) {
        const c = CHORDS[chordIdx++ % CHORDS.length];
        const dur = CHORD_BEATS * BEAT;
        c.pad.forEach((m, i) => padVoice(midi(m), nextChord, dur, 0.022, -0.5 + i * 0.25));
        bass(midi(c.bass), nextChord, dur);
        nextChord += dur;
      }
      if (nextBell <= ahead) {
        const c = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
        // a short, sparse phrase: 1–3 notes, then silence
        const notes = 1 + Math.floor(Math.random() * 3);
        let t = quantise(nextBell);
        for (let i = 0; i < notes; i++) {
          bell(midi(c.bells[Math.floor(Math.random() * c.bells.length)]), t, 0.035, 4);
          t += EIGHTH * (1 + Math.floor(Math.random() * 3));
        }
        nextBell = t + BEAT * rnd(3, 7);
      }
    },
    answer(key, hit) {
      if (!live()) return;
      const now = ac!.currentTime;
      if (now - lastEvent < EIGHTH * 0.9) return; // one note per slot keeps it musical
      lastEvent = now;
      const c = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
      const m = c.bells[key % c.bells.length] + (hit ? 12 : 0);
      bell(midi(m), quantise(now), hit ? 0.014 : 0.018, 2.2);
    },
    drop() {
      if (!live()) return;
      const now = ac!.currentTime;
      if (now - lastDrop < 0.6) return;
      lastDrop = now;
      const a = ac!, o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = 'sine';
      o.frequency.setValueAtTime(196, now);
      o.frequency.exponentialRampToValueAtTime(98, now + 0.5);
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.03, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      o.connect(lp).connect(g).connect(verb);
      o.start(now);
      o.stop(now + 0.75);
    },
    news() {
      if (!live()) return;
      const now = ac!.currentTime;
      if (now - lastEvent < BEAT) return;
      lastEvent = now;
      const c = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
      bell(midi(c.bells[c.bells.length - 1] + 12), quantise(now), 0.008, 2.5);
    },
    mission() {
      if (!live()) return;
      const c = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
      const t = quantise(ac!.currentTime);
      c.bells.slice(0, 5).forEach((m, i) => bell(midi(m), t + i * EIGHTH * 0.5, 0.04, 4.5, -0.4 + i * 0.2));
    },
    sever() {
      if (!live()) return;
      const a = ac!, now = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, now);
      o.frequency.exponentialRampToValueAtTime(45, now + 1.4);
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.08, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
      o.connect(g);
      g.connect(dry);
      g.connect(verb);
      o.start(now);
      o.stop(now + 1.9);
    },
    stepDone() {
      if (!live()) return;
      const c = CHORDS[(chordIdx + CHORDS.length - 1) % CHORDS.length];
      const t = quantise(ac!.currentTime);
      bell(midi(c.bells[2]), t, 0.03, 3);
      bell(midi(c.bells[4]), t + EIGHTH, 0.03, 3.5);
    },
    dispose() {
      on = false;
      if (ac) void ac.close();
      ac = null;
    },
  };
}
