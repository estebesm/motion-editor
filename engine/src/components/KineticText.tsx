import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {ease, FONT_FAMILY, palette} from '../theme';

export type KineticMode = 'flip' | 'rise' | 'scatter';

/**
 * Кинетическая типографика: каждая буква анимируется отдельно (spring + стаггер),
 * с размытием, сжатием и «трекингом» межбуквенного интервала. Всё плоское, без 3D.
 */
export const KineticText: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  size?: number;
  color?: string;
  mode?: KineticMode;
  exitAt?: number;
  tracking?: [number, number]; // em: от → до
  style?: React.CSSProperties;
}> = ({
  text,
  delay = 0,
  stagger = 2,
  size = 120,
  color = palette.ink,
  mode = 'flip',
  exitAt,
  tracking = [0.25, 0.02],
  style,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const chars = Array.from(text);

  const trackingNow = interpolate(frame, [delay, delay + 45], tracking, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease.out,
  });

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontSize: size,
        lineHeight: 1,
        color,
        display: 'flex',
        letterSpacing: `${trackingNow}em`,
        whiteSpace: 'pre',
        ...style,
      }}
    >
      {chars.map((ch, i) => {
        const s = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: {damping: 15, mass: 0.9, stiffness: 110},
        });
        const inv = 1 - s;

        let e = 0;
        if (exitAt !== undefined) {
          const start = exitAt + i * Math.max(1, stagger * 0.6);
          e = interpolate(frame, [start, start + 14], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: ease.in,
          });
        }

        let tx = 0;
        let ty = 0;
        let rz = 0;
        let sc = 1;
        let sy = 1;
        if (mode === 'flip') {
          // буква «вырастает» от базовой линии
          ty = inv * size * 0.35;
          sy = Math.max(0, s);
        } else if (mode === 'rise') {
          ty = inv * size * 1.1;
          sc = 0.8 + 0.2 * s;
        } else {
          tx = inv * (random(`sx${text}${i}`) - 0.5) * size * 6;
          ty = inv * (random(`sy${text}${i}`) - 0.5) * size * 4;
          rz = inv * (random(`sr${text}${i}`) - 0.5) * 180;
          sc = 0.3 + 0.7 * s;
        }
        ty -= e * size * 0.8;
        sy *= 1 - e * 0.6;

        const blur = inv * 14 + e * 12;
        const opacity = Math.min(1, s * 1.4) * (1 - e);

        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              transformOrigin: '50% 100%',
              transform: `translate(${tx}px, ${ty}px) rotate(${rz}deg) scale(${sc}, ${sc * sy})`,
              filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
              opacity,
            }}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        );
      })}
    </div>
  );
};
