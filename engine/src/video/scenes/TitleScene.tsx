import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {KeyText, withoutRepeats} from '../../components/KeyText';
import {ease, palette} from '../../theme';
import type {TitleScene as T} from '../types';

export const TitleScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  // Заголовок держится 2.5–3.5 с, дальше — фразы речи (если сцена длинная)
  // Структурированные сцены: заголовок и есть тезис — фразы речи после него не нужны
  const keys = scene.headline || scene.subline ? undefined : withoutRepeats(scene.keys, [scene.title, scene.subtitle, scene.kicker]);
  const speechAfter = duration > 170 && scene.words?.length && keys ? Math.round(Math.min(105, Math.max(75, duration * 0.35))) : null;
  const exitAt = speechAfter ?? duration - 26;
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const bar = interpolate(frame, [40, 66], [0, 1], {...clamp, easing: ease.out});
  const barOut = interpolate(frame, [exitAt, exitAt + 16], [0, 1], {...clamp, easing: ease.in});

  return (
    <AbsoluteFill style={{background: palette.bg}}>
      <Backdrop seed={scene.title} duration={duration} word={scene.kicker} />
      <Camera
        duration={duration}
        from={{zoom: 0.96, rotate: -1.5, y: 20}}
        to={{zoom: 1.1, rotate: 1, y: -10}}
        shake={5}
      >
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 30, paddingBottom: 120}}>
          {scene.kicker ? (
            <FitKinetic text={scene.kicker} maxWidth={1300} maxSize={44} maxLines={1} color={palette.accent} mode="rise" delay={2} stagger={1} exitAt={exitAt - 4} />
          ) : null}
          <FitKinetic text={scene.title} maxWidth={1700} maxSize={250} minSize={110} maxLines={2} mode="flip" delay={10} stagger={3} exitAt={exitAt} tracking={[0.4, 0.02]} />
          {scene.subtitle ? (
            <div style={{display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch', gap: 18}}>
              <FitKinetic text={scene.subtitle} maxWidth={1500} maxSize={84} maxLines={2} color={palette.accent} mode="scatter" delay={36} stagger={1.5} exitAt={exitAt + 4} />
              <div
                style={{
                  height: 10,
                  borderRadius: 5,
                  background: `linear-gradient(90deg, ${palette.accent}, ${palette.accent2})`,
                  transformOrigin: barOut > 0 ? 'right' : 'left',
                  transform: `scaleX(${bar * (1 - barOut)})`,
                }}
              />
            </div>
          ) : null}
        </AbsoluteFill>
      </Camera>
      {speechAfter ? (
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', paddingBottom: 40}}>
          <KeyText keys={keys} words={scene.words} offset={voiceDelay} duration={duration} maxWidth={1560} from={speechAfter + 10} seed={scene.title} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
