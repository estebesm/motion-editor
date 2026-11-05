import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {Icon, isIcon} from '../../components/Icon';
import {KineticText} from '../../components/KineticText';
import {cueFrames} from '../../lib/cues';
import {MovingTitle} from '../../components/MovingTitle';
import {BrandLogo} from '../../components/BrandLogo';
import {byRole, lineSpan, plainText, Written} from '../../components/Spoken';
import {fitText} from '../../lib/fit';
import {ease, palette} from '../../theme';
import type {ListScene as T} from '../types';

/** Пункты появляются по очереди, равномерно по длине озвучки. */
export const ListScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const n = scene.items.length;
  const exitAt = duration - 26;
  // Пункт появляется, когда диктор его произносит
  const head = byRole(scene.lines, 'head')[0];
  const itemLines = byRole(scene.lines, 'item');
  const spoken = itemLines.length === n;
  const starts = spoken
    ? itemLines.map((l) => lineSpan(l, scene.words, voiceDelay, duration - 20)[0])
    : cueFrames(scene.items, scene.words, voiceDelay, scene.audioFrames ?? duration - 50);
  const title = spoken ? (head ? plainText(head.text) : undefined) : scene.title;
  const size = Math.min(
    ...scene.items.map((it) => fitText(it, {maxWidth: 1350, maxSize: Math.min(120, (title ? 640 : 760) / (n * 1.38)), maxLines: 1}).size),
  );
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

  return (
    <AbsoluteFill style={{background: palette.bg}}>
      <Backdrop seed={(scene.title ?? '') + scene.items.join()} duration={duration} word={title} />
      <Camera duration={duration} from={{zoom: 1.08, y: 60, rotate: -1}} to={{zoom: 1.0, y: -40, rotate: 0.5}} shake={4}>
        {spoken && head ? (
          <MovingTitle cue={starts[0]} top={110} align="left" left={200} zoom={1.8}>
            <div style={{display: 'flex', alignItems: 'center', gap: 22}}>
              {scene.logo ? <BrandLogo scene={scene} height={72} at={lineSpan(head, scene.words, voiceDelay, duration)[0]} /> : null}
              <Written text={head.text} line={head} words={scene.words} offset={voiceDelay} duration={duration} size={64} maxWidth={1500 / 1.8 - (scene.logo ? 100 : 0)} maxLines={1} align="left" color={palette.accent} accent={palette.accent} accent2={palette.accent2} />
            </div>
          </MovingTitle>
        ) : !spoken && scene.title ? (
          <MovingTitle cue={starts[0]} top={110} align="left" left={200} zoom={2}>
            <FitKinetic text={scene.title.toUpperCase()} maxWidth={1500 / 2} maxSize={60} maxLines={1} align="flex-start" color={palette.accent} mode="rise" delay={2} stagger={1} exitAt={exitAt - 6} />
          </MovingTitle>
        ) : null}
        <AbsoluteFill style={{justifyContent: 'center', paddingLeft: 200, paddingTop: title ? 120 : 0, gap: size * 0.38}}>
          {scene.items.map((item, i) => {
            const next = starts[i + 1];
            const dim = next === undefined ? 0 : interpolate(frame, [next, next + 14], [0, 1], {...clamp, easing: ease.out});
            const numIn = interpolate(frame, [starts[i], starts[i] + 12], [0, 1], {...clamp, easing: ease.out});
            return (
              <div key={i} style={{display: 'flex', alignItems: 'center', gap: 40, opacity: 1 - dim * 0.25}}>
                <div
                  style={{
                    width: size * 0.95,
                    height: size * 0.95,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: i % 2 ? palette.accent2 : palette.accent,
                    color: '#fff',
                    fontFamily: 'Dela Gothic One',
                    fontSize: size * 0.36,
                    opacity: spoken ? numIn : numIn * (frame > exitAt ? 0 : 1),
                    transform: `translateX(${(1 - numIn) * -40}px) scale(${0.6 + 0.4 * numIn})`,
                  }}
                >
                  {isIcon(scene.icons?.[i]) ? <Icon name={scene.icons![i]} size={size * 0.5} color="#fff" stroke={2.4} /> : String(i + 1).padStart(2, '0')}
                </div>
                {spoken ? (
                  <Written text={itemLines[i].text} line={itemLines[i]} words={scene.words} offset={voiceDelay} duration={duration} size={size} maxWidth={1350} maxLines={1} align="left" upper={false} />
                ) : (
                  <KineticText text={item} size={size} mode={i % 2 ? 'rise' : 'flip'} delay={starts[i]} stagger={1.6} exitAt={exitAt + i * 2} tracking={[0.2, 0.02]} />
                )}
              </div>
            );
          })}
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
