export type ScaleId = 'majpenta' | 'minpenta' | 'hirajoshi' | 'lydian';

export const SCALES: Record<ScaleId, { name: string; steps: number[] }> = {
  majpenta: { name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  minpenta: { name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  hirajoshi: { name: 'Hirajoshi', steps: [0, 2, 3, 7, 8] },
  lydian: { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
};

/** Root: A3. Note index 0 is the root; indices walk up the scale across octaves. */
export const ROOT_MIDI = 57;
export const NOTE_COUNT = 15;
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export function noteMidi(scale: ScaleId, index: number) {
  const s = SCALES[scale].steps;
  const oct = Math.floor(index / s.length), step = ((index % s.length) + s.length) % s.length;
  return ROOT_MIDI + 12 * oct + s[step];
}
export const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (scale: ScaleId, index: number) => {
  const m = noteMidi(scale, index);
  return NAMES[m % 12] + (Math.floor(m / 12) - 1);
};
