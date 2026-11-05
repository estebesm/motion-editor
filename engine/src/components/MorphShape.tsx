import {interpolate as flubber} from 'flubber';
import React, {useMemo} from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {ease} from '../theme';

/**
 * Морфинг между произвольными SVG-контурами (flubber).
 * Каждая форма держится `hold` кадров, затем `morph` кадров перетекает в следующую.
 */
export const MorphShape: React.FC<{
  shapes: string[];
  size: number;
  hold?: number;
  morph?: number;
  delay?: number;
  fill?: string;
  rotate?: (frame: number) => number;
  defs?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({shapes, size, hold = 18, morph = 22, delay = 0, fill = '#fff', rotate, defs, style}) => {
  const frame = useCurrentFrame() - delay;
  const interps = useMemo(
    () =>
      shapes.slice(0, -1).map((a, i) => flubber(a, shapes[i + 1], {maxSegmentLength: 4})),
    [shapes],
  );

  const cycle = hold + morph;
  const idx = Math.min(Math.max(0, Math.floor(frame / cycle)), interps.length - 1);
  const local = frame - idx * cycle;
  const t = interpolate(local, [hold, cycle], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease.cinematic,
  });
  const d = frame < 0 ? shapes[0] : interps[idx](t);
  // «Вдох» во время перехода
  const pulse = 1 + Math.sin(t * Math.PI) * 0.06;

  const half = size / 2;
  return (
    <svg width={size} height={size} viewBox={`${-half} ${-half} ${size} ${size}`} style={style}>
      {defs ? <defs>{defs}</defs> : null}
      <g transform={`rotate(${rotate ? rotate(frame) : 0}) scale(${pulse})`}>
        <path d={d} fill={fill} />
      </g>
    </svg>
  );
};
