import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {Icon} from '../../components/Icon';
import {MorphShape} from '../../components/MorphShape';
import {Headline, headlineBeats, KeyText, keyStarts} from '../../components/KeyText';
import {BrandLogo} from '../../components/BrandLogo';
import {BrandRibbons} from '../../components/BrandRibbons';
import {lineSpan, lineStarts, SpokenStack} from '../../components/Spoken';
import {blob} from '../../lib/shapes';
import {alpha, ease, FONT_FAMILY, glowColor, palette} from '../../theme';
import type {KineticScene as T} from '../types';

/**
 * Типографика в такт речи: фразы озвучки сменяют друг друга по центру,
 * ключевые слова выделяются, камера «толкается» на каждой новой фразе.
 */
export const KineticScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = scene.words ?? [];
  const exitAt = duration - 20;
  const seed = scene.voice?.slice(0, 24) ?? 'k';
  const shapes = useMemo(() => [blob(260, `${seed}a`, 0.3), blob(260, `${seed}b`, 0.25), blob(260, `${seed}c`, 0.3)], [seed]);

  // Толчок камеры на каждой новой фразе
  const spoken = !!scene.lines?.length;
  const structured = !!(scene.headline || scene.subline);
  const starts = spoken ? lineStarts(scene.lines, words, voiceDelay, duration) : structured ? headlineBeats(scene.headline, scene.subline, words, voiceDelay, duration) : keyStarts(scene.keys, words, voiceDelay, duration);
  const last = [...starts].reverse().find((s) => frame >= s);
  const kick = last === undefined ? 0 : spring({frame: frame - last, fps, config: {damping: 12, stiffness: 200}});
  // Без «ударов» на каждой фразе — только плавная камера
  const punch = 0 * kick;
  const kickerIn = spring({frame: frame - 2, fps, config: {damping: 16, stiffness: 120}});
  const leave = interpolate(frame, [exitAt, exitAt + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.in});
  const side = (seed.charCodeAt(0) ?? 0) % 2 ? 1 : -1;
  // Клип: каждая фраза — свой кадр, фон чередуется (тёмный / цветной)
  const clip = spoken && !!palette.clip;

  return (
    <AbsoluteFill style={{background: palette.bg, overflow: 'hidden'}}>
      <Backdrop seed={seed} duration={duration} word={scene.kicker} />
      {palette.ribbons ? <BrandRibbons duration={duration} side={side} seed={seed.length} strength={0.9} /> : null}
      {/* Медленно дышащая форма за текстом — глубина и цвет */}
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: 0.16 * (1 - leave)}}>
        <MorphShape
          shapes={shapes}
          size={820}
          hold={Math.max(20, Math.round(duration / 3) - 40)}
          morph={40}
          fill={glowColor()}
          rotate={(f) => f * 0.12}
          style={{transform: `translate(${side * 420}px, 140px)`, filter: 'blur(30px)'}}
        />
      </AbsoluteFill>
      {scene.icon ? (
        <AbsoluteFill style={{alignItems: side > 0 ? 'flex-start' : 'flex-end', justifyContent: 'flex-start', padding: '90px 120px'}}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`,
              boxShadow: `0 20px 60px ${alpha(palette.accent, 0.35)}`,
              transform: `scale(${kickerIn * (1 - leave)}) rotate(${(1 - kickerIn) * -30 + Math.sin(frame / 30) * 4}deg)`,
            }}
          >
            <Icon name={scene.icon} size={64} color="#fff" stroke={2.2} />
          </div>
        </AbsoluteFill>
      ) : null}
      <Camera duration={duration} from={{zoom: 1.04, rotate: side * -0.6}} to={{zoom: 1.0, rotate: side * 0.6}} shake={4}>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transform: `scale(${1 + punch})`}}>
          {scene.kicker && !spoken ? (
            <div
              style={{
                position: 'absolute',
                top: 210,
                padding: '10px 26px',
                borderRadius: 999,
                fontFamily: FONT_FAMILY,
                fontSize: 30,
                letterSpacing: '0.08em',
                color: palette.accent,
                border: `2px solid ${alpha(palette.accent, 0.5)}`,
                background: alpha(palette.accent, 0.08),
                opacity: kickerIn * (1 - leave),
                transform: `translateY(${(1 - kickerIn) * -30}px)`,
              }}
            >
              {scene.kicker.toUpperCase()}
            </div>
          ) : null}
          {spoken ? (
            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 56}}>
              {scene.logo ? <BrandLogo scene={scene} height={190} at={lineSpan(scene.lines![scene.logoLine ?? 0], words, voiceDelay, duration)[0]} until={clip ? lineStarts(scene.lines, words, voiceDelay, duration).find((s) => s > lineSpan(scene.lines![scene.logoLine ?? 0], words, voiceDelay, duration)[0] + 2) : undefined} /> : null}
              <SpokenStack
                lines={scene.lines!}
                words={words}
                offset={voiceDelay}
                duration={duration}
                maxWidth={1560}
                cuts={clip}
                sizes={clip ? [scene.logo ? 140 : 190] : scene.logo ? [130, 104, 88, 76] : undefined}
              />
            </div>
          ) : structured ? (
            <Headline headline={scene.headline} subline={scene.subline} words={words} offset={voiceDelay} duration={duration} maxWidth={1560} seed={seed} />
          ) : (
            <KeyText keys={scene.keys} words={words} offset={voiceDelay} duration={duration} maxWidth={1560} seed={seed} />
          )}
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
