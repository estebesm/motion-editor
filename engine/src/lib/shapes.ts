import {noise2D} from '@remotion/noise';

type Pt = [number, number];

const toPath = (pts: Pt[]) =>
  'M' + pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L') + 'Z';

const radial = (n: number, r: (a: number, i: number) => number, cx = 0, cy = 0): Pt[] =>
  Array.from({length: n}, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const rr = r(a, i);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });

export const circle = (r: number, n = 120) => toPath(radial(n, () => r));

export const star = (rOuter: number, rInner: number, spikes = 5) =>
  toPath(radial(spikes * 2, (_, i) => (i % 2 === 0 ? rOuter : rInner)));

export const blob = (r: number, seed: string, wobble = 0.22, n = 120) =>
  toPath(
    radial(n, (a) => r * (1 + wobble * noise2D(seed, Math.cos(a) * 0.9, Math.sin(a) * 0.9))),
  );

// Суперэллипс: power 2 = круг, 4..6 = «сквиркл»
export const squircle = (r: number, power = 5, n = 120) =>
  toPath(
    radial(n, (a) => {
      const c = Math.abs(Math.cos(a)) ** power;
      const s = Math.abs(Math.sin(a)) ** power;
      return r / (c + s) ** (1 / power);
    }),
  );

export const polygon = (r: number, sides: number) => toPath(radial(sides, () => r));
