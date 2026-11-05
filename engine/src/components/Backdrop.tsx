import {noise2D} from '@remotion/noise';
import React from 'react';
import {AbsoluteFill, interpolate, random, useCurrentFrame} from 'remotion';
import {alpha, ease, FONT_FAMILY, glowColor, palette} from '../theme';

/**
 * Живой фон сцены: крупные мягкие пятна акцентных цветов, медленный световой «луч»
 * и огромное контурное слово темы, бегущее строкой за контентом.
 * Без мелкого декора — фон работает на глубину и цвет, а не спорит с текстом.
 */
export const Backdrop: React.FC<{seed: string; duration: number; count?: number; strength?: number; word?: string}> = ({
  seed,
  duration,
  strength = 1,
  word,
}) => {
  const frame = useCurrentFrame();
  const light = palette.light;
  const t = frame / 30;
  const appear = interpolate(frame, [0, 24], [0, 1], {extrapolateRight: 'clamp', easing: ease.out});
  const leave = interpolate(frame, [duration - 20, duration], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  const flip = random(`${seed}-f`) > 0.5;
  const blobs = [
    {c: palette.accent, x: flip ? 0.85 : 0.12, y: 0.18, r: 1100},
    {c: glowColor(), x: flip ? 0.1 : 0.9, y: 0.85, r: 1200},
    {c: palette.accent, x: 0.5, y: 1.05, r: 900},
  ].map((b, i) => ({
    ...b,
    x: b.x + noise2D(`${seed}-bx${i}`, t * 0.05, 0) * 0.1,
    y: b.y + noise2D(`${seed}-by${i}`, 0, t * 0.05) * 0.1,
  }));
  const blobA = (light ? 0.22 : 0.2) * strength;

  // Бегущее контурное слово
  const text = word?.trim().toUpperCase();
  const dir = random(`${seed}-d`) > 0.5 ? 1 : -1;
  const speed = 2.2;
  const shift = (frame * speed * dir) % 2400;

  return (
    <AbsoluteFill style={{overflow: 'hidden', pointerEvents: 'none'}}>
      {blobs.map((b, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: b.x * 1920 - b.r / 2,
            top: b.y * 1080 - b.r / 2,
            width: b.r,
            height: b.r,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${alpha(b.c, blobA * (i === 2 ? 0.6 : 1))} 0%, transparent 62%)`,
          }}
        />
      ))}
      {/* Медленный диагональный световой луч */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent ${20 + t * 4}%, ${alpha(palette.ink, light ? 0.05 : 0.035)} ${30 + t * 4}%, transparent ${40 + t * 4}%)`,
        }}
      />
      {text ? (
        <AbsoluteFill style={{justifyContent: 'center', opacity: appear * leave * strength}}>
          <div
            style={{
              whiteSpace: 'nowrap',
              fontFamily: FONT_FAMILY,
              fontSize: 380,
              lineHeight: 1,
              color: 'transparent',
              WebkitTextStroke: `3px ${alpha(palette.ink, light ? 0.1 : 0.07)}`,
              transform: `translateX(${-1200 + shift}px) translateY(${flip ? -230 : 230}px)`,
            }}
          >
            {`${text} · ${text} · ${text} · ${text} · ${text}`}
          </div>
        </AbsoluteFill>
      ) : null}
      {/* Виньетка — фокус на центр */}
      <AbsoluteFill style={{background: `radial-gradient(ellipse at center, transparent 55%, ${alpha(palette.bg, light ? 0.3 : 0.7)} 100%)`}} />
    </AbsoluteFill>
  );
};
