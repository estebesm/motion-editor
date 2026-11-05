import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {MorphShape} from '../../components/MorphShape';
import {Headline, KeyText, withoutRepeats} from '../../components/KeyText';
import {fitText} from '../../lib/fit';
import {blob, circle, squircle, star} from '../../lib/shapes';
import {alpha, ease, FONT_FAMILY, mix, palette} from '../../theme';
import type {MorphScene as T} from '../types';

export const MorphScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const shapes = useMemo(
    () => [blob(270, 'b0', 0.35), star(320, 150, 6), blob(260, 'b1', 0.25), circle(260), squircle(250, 5)],
    [],
  );
  // Подстраиваем темп морфинга под длину сцены
  const cycle = Math.max(28, Math.floor((duration - 30) / (shapes.length - 1)));
  const morph = Math.round(cycle * 0.6);
  const {size} = fitText(scene.word, {maxWidth: 1600, maxSize: 300, maxLines: 1});
  const drift = interpolate(frame, [0, duration], [160, -160]);
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const appear = interpolate(frame, [0, 25], [0, 1], {...clamp, easing: ease.out});
  const leave = interpolate(frame, [duration - 24, duration - 4], [0, 1], {...clamp, easing: ease.in});

  const word = (front: boolean) => (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: size,
          whiteSpace: 'nowrap',
          transform: `translateX(${drift}px) scale(${1 + leave * 0.3})`,
          opacity: appear * (1 - leave),
          filter: leave > 0 ? `blur(${leave * 16}px)` : undefined,
          color: front ? 'transparent' : palette.ink,
          WebkitTextStroke: front ? `3px ${palette.ink}` : undefined,
        }}
      >
        {scene.word}
      </div>
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 55%, ${mix(palette.accent2, palette.bg, 0.18)} 0%, ${palette.bg} 65%)`}}>
      <Backdrop seed={scene.word} duration={duration} strength={0.8} />
      <Camera duration={duration} from={{zoom: 1.18, rotate: 3, x: -30}} to={{zoom: 1.0, rotate: -2, x: 30}} shake={4}>
        {word(false)}
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
          <MorphShape
            shapes={shapes}
            size={760}
            delay={6}
            hold={cycle - morph}
            morph={morph}
            fill="url(#morphGrad)"
            rotate={(f) => f * 0.5}
            style={{
              transform: `scale(${appear * (1 - leave * 0.6)})`,
              filter: `drop-shadow(0 30px 80px ${alpha(palette.accent2, 0.45)})`,
            }}
            defs={
              <linearGradient id="morphGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={palette.accent} />
                <stop offset="100%" stopColor={palette.accent2} />
              </linearGradient>
            }
          />
        </AbsoluteFill>
        {word(true)}
        {scene.words?.length ? (
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 150}}>
            {scene.headline || scene.subline ? (
              <Headline subline={scene.subline ?? scene.headline} words={scene.words} offset={voiceDelay} duration={duration} maxWidth={1400} from={30} seed={scene.word} />
            ) : (
              <KeyText keys={withoutRepeats(scene.keys, [scene.word]) ?? []} words={scene.words} offset={voiceDelay} duration={duration} variant="caption" maxWidth={1400} from={30} seed={scene.word} />
            )}
          </AbsoluteFill>
        ) : scene.caption ? (
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 175}}>
            <FitKinetic text={scene.caption} maxWidth={1400} maxSize={46} maxLines={2} mode="rise" delay={28} stagger={1.2} exitAt={duration - 22} />
          </AbsoluteFill>
        ) : null}
      </Camera>
    </AbsoluteFill>
  );
};
