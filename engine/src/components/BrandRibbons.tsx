import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {alpha, ease, palette} from '../theme';

/**
 * Фирменные ленты: широкие диагональные полосы с «ступенькой», как на фирменных обложках (настройка «Ленты: да»).
 * Въезжают по диагонали в начале сцены, медленно плывут (параллакс), по ним скользит блик; к концу сцены уходят.
 * side — с какой стороны кадра (1 — справа, -1 — слева), strength — насколько заметны.
 */
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

// Силуэт «M»: левая наклонная стойка, ступенька, высокая правая диагональ (координаты в поле 1000 × 1000)
const M_PATH = 'M0 1000 L260 380 L420 380 L470 520 L560 520 L820 -200 L1100 -200 L740 1000 Z';

export const BrandRibbons: React.FC<{duration: number; side?: number; strength?: number; delay?: number; seed?: number}> = ({duration, side = 1, strength = 1, delay = 0, seed = 0}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame: f - delay, fps, config: {damping: 20, stiffness: 70}});
  const leave = interpolate(f, [duration - 22, duration], [0, 1], {...clamp, easing: ease.in});
  const drift = Math.sin((f + seed * 37) / 70) * 14 + f * 0.25;
  // Блик пробегает по лентам раз в ~3 с
  const sheen = ((f + seed * 23) % 96) / 96;
  const a = (light: boolean) => (light ? 0.5 : 0.62) * strength;
  const id = `rib${seed}`;
  const shift = (1 - enter) * 520 + leave * -380;

  return (
    <AbsoluteFill style={{overflow: 'hidden', pointerEvents: 'none'}}>
      <svg
        width={1920}
        height={1080}
        viewBox="0 0 1920 1080"
        style={{position: 'absolute', inset: 0, transform: side < 0 ? 'scaleX(-1)' : undefined, opacity: enter * (1 - leave)}}
      >
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={palette.accent} stopOpacity={0} />
            <stop offset="45%" stopColor={palette.accent} stopOpacity={a(palette.light) * 0.55} />
            <stop offset="100%" stopColor={palette.accent} stopOpacity={a(palette.light)} />
          </linearGradient>
          <linearGradient id={`${id}s`} x1="0" y1="1" x2="1" y2="0">
            <stop offset={`${Math.max(0, sheen * 140 - 30)}%`} stopColor="#fff" stopOpacity={0} />
            <stop offset={`${sheen * 140 - 15}%`} stopColor="#fff" stopOpacity={0.16 * strength} />
            <stop offset={`${Math.min(100, sheen * 140)}%`} stopColor="#fff" stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`${id}y`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor={palette.accent2} stopOpacity={0} />
            <stop offset="100%" stopColor={palette.accent2} stopOpacity={0.5 * strength} />
          </linearGradient>
        </defs>
        {/* Дальний слой — крупнее и медленнее */}
        <g transform={`translate(${1080 + shift * 0.6 + drift * 0.5}, ${-60 - shift * 0.35}) scale(1.25)`} opacity={0.45}>
          <path d={M_PATH} fill={`url(#${id}g)`} />
        </g>
        {/* Ближний слой */}
        <g transform={`translate(${1260 + shift + drift}, ${120 - shift * 0.6}) scale(0.95)`}>
          <path d={M_PATH} fill={`url(#${id}g)`} />
          <path d={M_PATH} fill={`url(#${id}s)`} />
        </g>
        {/* Тонкая жёлтая кромка — акцент дизайнбука */}
        <g transform={`translate(${1260 + shift + drift}, ${120 - shift * 0.6}) scale(0.95)`}>
          <path d="M820 -200 L860 -200 L500 1000 L460 1000 Z" fill={`url(#${id}y)`} opacity={0.8} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
