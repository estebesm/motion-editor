import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {MorphShape} from '../../components/MorphShape';
import {Headline, KeyText, withoutRepeats} from '../../components/KeyText';
import {shotOf, SpokenStack} from '../../components/Spoken';
import {blob} from '../../lib/shapes';
import {alpha, ease, palette} from '../../theme';
import type {StatementScene as T} from '../types';

/** Тёмный или светлый текст — что читается лучше на цвете акцента. */
const inkOn = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 165 ? '#111114' : '#ffffff';
};

/**
 * Ключевая мысль / важное предупреждение: фраза крупно на заливке акцентного цвета,
 * на фоне медленно дышат плоские формы. Без 3D.
 */
export const StatementScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const exitAt = duration - 26;
  const ink = inkOn(palette.accent);
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const bar = interpolate(frame, [30, 56], [0, 1], {...clamp, easing: ease.out});
  const barOut = interpolate(frame, [exitAt, exitAt + 16], [0, 1], {...clamp, easing: ease.in});
  const shapesA = useMemo(() => [blob(300, 'st-a', 0.25), blob(300, 'st-b', 0.3), blob(300, 'st-c', 0.22)], []);
  const shapesB = useMemo(() => [blob(220, 'st-d', 0.3), blob(220, 'st-e', 0.25), blob(220, 'st-f', 0.28)], []);
  const cycle = Math.max(30, Math.round(duration / 3));
  const clip = !!scene.lines?.length && !!palette.clip;
  const shot = clip ? shotOf(scene.lines, scene.words, voiceDelay, duration, frame) : null;

  const spoken = !!scene.lines?.length;
  if (spoken) {
    const glow = interpolate(frame, [0, 30], [0, 1], {...clamp, easing: ease.out});
    return (
      <AbsoluteFill style={{background: palette.bg, overflow: 'hidden'}}>
        <AbsoluteFill style={{opacity: glow, background: `radial-gradient(ellipse 60% 55% at 50% 50%, ${alpha(palette.accent, 0.32)}, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 85%, ${alpha(palette.accent2, 0.22)}, transparent 70%)`}} />
        <AbsoluteFill style={{left: -260, top: -240, opacity: 0.5}}>
          <MorphShape shapes={shapesA} size={900} hold={cycle - 40} morph={40} fill={alpha(palette.accent, 0.18)} rotate={(f) => f * 0.15} style={{filter: 'blur(40px)'}} />
        </AbsoluteFill>
        <Camera duration={duration} from={{zoom: 1.04, x: -10}} to={{zoom: 1.0, x: 10}} shake={1}>
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '0 140px'}}>
            <SpokenStack lines={scene.lines!} words={scene.words} offset={voiceDelay} duration={duration} maxWidth={1600} sizes={clip ? [170] : [150, 116, 92, 78]} cuts={clip} onAccent="#fff" />
          </AbsoluteFill>
        </Camera>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{background: palette.accent, overflow: 'hidden'}}>
      <AbsoluteFill style={{left: -260, top: -240}}>
        <MorphShape shapes={shapesA} size={900} hold={cycle - 40} morph={40} fill={alpha(palette.accent2, 0.35)} rotate={(f) => f * 0.15} />
      </AbsoluteFill>
      <AbsoluteFill style={{left: 1300, top: 560}}>
        <MorphShape shapes={shapesB} size={700} hold={cycle - 40} morph={40} delay={12} fill={alpha(ink, 0.08)} rotate={(f) => -f * 0.2} />
      </AbsoluteFill>
      <Camera duration={duration} from={{zoom: 1.06, x: -20}} to={{zoom: 1.0, x: 20}} shake={3}>
        {scene.lines?.length ? (
          <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', padding: '0 140px'}}>
            <SpokenStack
              lines={scene.lines}
              words={scene.words}
              offset={voiceDelay}
              duration={duration}
              maxWidth={1600}
              sizes={clip ? [180] : [150, 116, 92, 78]}
              cuts={clip}
              color={ink}
              accent={ink}
              accent2={ink}
              onAccent={palette.accent}
              accentInk={palette.bg}
            />
          </AbsoluteFill>
        ) : (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 34, padding: '0 140px 130px'}}>
          {scene.kicker ? (
            <FitKinetic text={scene.kicker} maxWidth={1300} maxSize={44} maxLines={1} color={alpha(ink, 0.7)} mode="rise" delay={2} stagger={1} exitAt={exitAt - 4} />
          ) : null}
          <FitKinetic text={scene.text} maxWidth={1600} maxSize={170} minSize={90} maxLines={3} color={ink} mode="flip" delay={8} stagger={2} lineDelay={6} exitAt={exitAt} tracking={[0.3, 0.02]} />
          <div style={{width: 560, height: 14, marginTop: 18, borderRadius: 7, background: ink, transformOrigin: barOut > 0 ? 'right' : 'left', transform: `scaleX(${bar * (1 - barOut)})`}} />
          {scene.words?.length ? (
            <div style={{height: 180, display: 'flex', alignItems: 'flex-start', justifyContent: 'center'}}>
              {scene.headline || scene.subline ? (
                scene.subline ? (
                  <Headline subline={scene.subline} words={scene.words} offset={voiceDelay} duration={duration} variant="hero" maxWidth={1400} from={40} color={ink} accent={palette.bg} accent2={palette.bg} seed={scene.text} />
                ) : null
              ) : (
                <KeyText keys={withoutRepeats(scene.keys, [scene.text, scene.kicker]) ?? []} words={scene.words} offset={voiceDelay} duration={duration} variant="caption" maxWidth={1400} from={40} color={ink} accent={palette.bg} accent2={palette.bg} seed={scene.text} />
              )}
            </div>
          ) : scene.caption ? (
            <FitKinetic text={scene.caption} maxWidth={1400} maxSize={60} maxLines={2} color={ink} mode="rise" delay={34} stagger={1} exitAt={exitAt + 4} />
          ) : null}
        </AbsoluteFill>
        )}
      </Camera>
    </AbsoluteFill>
  );
};
