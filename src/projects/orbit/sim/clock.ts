/** One slice is one eighth note. */
export const sliceLen = (bpm: number) => 60 / bpm / 2;
/** Free orbits: T = 2.2 s × (r / r0)^1.5 at 96 bpm (Kepler's third law), scaled by tempo. */
export const R0 = 4.5;
export const period = (r: number, bpm: number) => 2.2 * Math.pow(r / R0, 1.5) * (96 / bpm);
