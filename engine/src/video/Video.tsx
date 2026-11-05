import {linearTiming, TransitionSeries} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill, CalculateMetadataFunction, Html5Audio, interpolate, Sequence, staticFile, useVideoConfig} from 'remotion';
import {FilmLook} from '../components/FilmLook';
import {Subtitles} from '../components/Subtitles';
import {applyTheme, ease, palette} from '../theme';
import {ImageScene} from './scenes/ImageScene';
import {ListScene} from './scenes/ListScene';
import {MorphScene} from './scenes/MorphScene';
import {OutroScene} from './scenes/OutroScene';
import {StatementScene} from './scenes/StatementScene';
import {TitleScene} from './scenes/TitleScene';
import {KineticScene} from './scenes/KineticScene';
import {DiagramScene} from './scenes/DiagramScene';
import {CompareScene} from './scenes/CompareScene';
import {brandWipe, dissolve, push} from './transitions';
import type {Scene, VideoProps} from './types';

const DEFAULT_SCENE = 120;
const dur = (s: Scene) => s.durationInFrames ?? DEFAULT_SCENE;

/** Начало каждой сцены на общей шкале (с учётом наложения переходов). */
export const sceneStarts = (props: VideoProps) => {
  let t = 0;
  return props.scenes.map((s) => {
    const start = t;
    t += dur(s) - props.transitionFrames;
    return start;
  });
};

export const calculateVideoMetadata: CalculateMetadataFunction<VideoProps> = ({props}) => ({
  durationInFrames: Math.max(
    1,
    props.scenes.reduce((sum, s) => sum + dur(s), 0) - props.transitionFrames * Math.max(0, props.scenes.length - 1),
  ),
});

const SceneView: React.FC<{scene: Scene; voiceDelay: number}> = ({scene, voiceDelay}) => {
  const d = dur(scene);
  const v = voiceDelay;
  switch (scene.type) {
    case 'title':
      return <TitleScene scene={scene} duration={d} voiceDelay={v} />;
    case 'morph':
      return <MorphScene scene={scene} duration={d} voiceDelay={v} />;
    case 'image':
      return <ImageScene scene={scene} duration={d} voiceDelay={v} />;
    case 'list':
      return <ListScene scene={scene} duration={d} voiceDelay={v} />;
    case 'statement':
      return <StatementScene scene={scene} duration={d} voiceDelay={v} />;
    case 'kinetic':
      return <KineticScene scene={scene} duration={d} voiceDelay={v} />;
    case 'diagram':
      return <DiagramScene scene={scene} duration={d} voiceDelay={v} />;
    case 'compare':
      return <CompareScene scene={scene} duration={d} voiceDelay={v} />;
    case 'outro':
      return <OutroScene scene={scene} duration={d} voiceDelay={v} />;
  }
};

/** Переход к сцене i: только плавные — сдвиг или растворение (круг убран: дёргался и мерцал). */
const pickTransition = (scenes: Scene[], i: number, width: number, height: number) => {
  const to = scenes[i];
  // Фирменный стиль: все склейки — диагональная шторка с лентой
  if (palette.ribbons) return brandWipe();
  if (to.type === 'statement' || to.type === 'outro') return dissolve();
  // По кругу, чтобы соседние переходы не повторялись
  return [push, dissolve][i % 2]();
};

export const Video: React.FC<VideoProps> = (props) => {
  const {scenes, transitionFrames, voiceDelay, music, musicVolume = 0.22, subtitles} = props;
  applyTheme(props.theme);
  const {width, height, durationInFrames} = useVideoConfig();
  const starts = sceneStarts(props);

  const timing = linearTiming({durationInFrames: transitionFrames, easing: ease.cinematic});

  const series: React.ReactNode[] = [];
  scenes.forEach((s, i) => {
    if (i > 0) {
      series.push(<TransitionSeries.Transition key={`t${i}`} presentation={pickTransition(scenes, i, width, height) as never} timing={timing} />);
    }
    series.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={dur(s)}>
        <SceneView scene={s} voiceDelay={voiceDelay} />
      </TransitionSeries.Sequence>,
    );
  });

  // Приглушение музыки под голос
  const voiceRanges = scenes
    .map((s, i) => (s.audio ? [starts[i] + voiceDelay, starts[i] + voiceDelay + (s.audioFrames ?? 0)] : null))
    .filter((r): r is number[] => r !== null);
  const musicVol = (f: number) => {
    const ducked = voiceRanges.some(([a, b]) => f > a - 8 && f < b + 8);
    const fadeIo = Math.min(
      interpolate(f, [0, 30], [0, 1], {extrapolateRight: 'clamp'}),
      interpolate(f, [durationInFrames - 45, durationInFrames], [1, 0], {extrapolateLeft: 'clamp'}),
    );
    return (ducked ? musicVolume * 0.35 : musicVolume) * fadeIo;
  };

  return (
    <AbsoluteFill style={{background: palette.bg}}>
      <TransitionSeries>{series}</TransitionSeries>
      {scenes.map((s, i) =>
        s.audio ? (
          <Sequence key={`a${i}`} from={starts[i] + voiceDelay} durationInFrames={s.audioFrames} layout="none">
            <Html5Audio src={staticFile(s.audio)} />
          </Sequence>
        ) : null,
      )}
      {subtitles
        ? scenes.map((s, i) =>
            s.audio && s.voice ? (
              <Sequence key={`sub${i}`} from={starts[i] + voiceDelay} durationInFrames={s.audioFrames}>
                <Subtitles text={s.voice} frames={s.audioFrames ?? 1} />
              </Sequence>
            ) : null,
          )
        : null}
      {music ? <Html5Audio src={staticFile(music)} volume={musicVol} loop /> : null}
      {(props.sfx ?? []).map((c, i) => (
        <Sequence key={`sfx${i}`} from={c.from} durationInFrames={Math.max(1, c.frames)} layout="none">
          <Html5Audio src={staticFile(c.src)} volume={c.volume} />
        </Sequence>
      ))}
      <FilmLook />
    </AbsoluteFill>
  );
};
