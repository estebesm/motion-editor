import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {Icon} from '../../components/Icon';
import {cueFrames} from '../../lib/cues';
import {MovingTitle} from '../../components/MovingTitle';
import {lineSpan, Written} from '../../components/Spoken';
import type {SpokenLine, WordTime} from '../types';
import {fitText} from '../../lib/fit';
import {alpha, ease, FONT_FAMILY, mix, palette} from '../../theme';
import type {CompareScene as T} from '../types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

type Side = T['left'];

type Sp = {head: SpokenLine; points: SpokenLine[]; words?: WordTime[]; offset: number; duration: number};
const Card: React.FC<{side: Side; at: number; dir: 1 | -1; color: string; active: boolean; exit: number; sp?: Sp}> = ({side, at, dir, color, active, exit, sp}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = spring({frame: frame - at, fps, config: {damping: 15, stiffness: 110}});
  const t = fitText(side.title.toUpperCase(), {maxWidth: 580, maxSize: 72, minSize: 40, maxLines: 2});
  return (
    <div
      style={{
        width: 700,
        minHeight: 560,
        padding: '56px 56px 48px',
        borderRadius: 40,
        background: mix(color, palette.bg, palette.light ? 0.1 : 0.14),
        border: `3px solid ${alpha(color, active ? 0.8 : 0.3)}`,
        boxShadow: active ? `0 40px 100px ${alpha(color, 0.3)}` : 'none',
        opacity: Math.min(1, s * 1.4) * (1 - exit),
        transform: `translateX(${(1 - s) * dir * 300}px) scale(${(active ? 1 : 0.94) * (1 - exit * 0.1)})`,
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
      }}
    >
      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: color,
          transform: `rotate(${(1 - s) * dir * 40}deg)`,
        }}
      >
        <Icon name={side.icon} size={60} color="#fff" />
      </div>
      {sp ? (
        <Written text={sp.head.text} line={sp.head} words={sp.words} offset={sp.offset} duration={sp.duration} size={t.size} maxWidth={580} align="left" accent={color} />
      ) : (
        <div style={{fontFamily: FONT_FAMILY, fontSize: t.size, lineHeight: 1.05, color: palette.ink}}>
          {t.lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      <div style={{height: 6, width: 120 * interpolate(frame, [at + 10, at + 28], [0, 1], {...clamp, easing: ease.out}), background: color, borderRadius: 3}} />
      {sp
        ? sp.points.map((pt, i) => {
            const d = lineSpan(pt, sp.words, sp.offset, sp.duration - 20)[0];
            const p = interpolate(frame, [d, d + 6], [0, 1], {...clamp, easing: ease.out});
            return (
              <div key={i} style={{display: 'flex', gap: 18, alignItems: 'flex-start'}}>
                <div style={{width: 16, height: 16, borderRadius: 8, background: color, flexShrink: 0, marginTop: 46 * 0.55 - 8, transform: `scale(${p})`}} />
                <Written text={pt.text} line={pt} words={sp.words} offset={sp.offset} duration={sp.duration} size={46} maxWidth={520} maxLines={3} align="left" upper={false} accent={color} color={alpha(palette.ink, 0.9)} />
              </div>
            );
          })
        : side.points.slice(0, 3).map((pt, i) => {
        const d = at + 16 + i * 10;
        const p = interpolate(frame, [d, d + 12], [0, 1], {...clamp, easing: ease.out});
        return (
          <div key={i} style={{display: 'flex', gap: 18, alignItems: 'center', opacity: p, transform: `translateY(${(1 - p) * 20}px)`}}>
            <div style={{width: 14, height: 14, borderRadius: 7, background: color, flexShrink: 0}} />
            <div style={{fontFamily: FONT_FAMILY, fontSize: 34, lineHeight: 1.15, color: alpha(palette.ink, 0.85)}}>{pt}</div>
          </div>
        );
      })}
    </div>
  );
};

/** Сравнение двух вещей: карточки въезжают с разных сторон в такт речи, между ними — «VS». */
export const CompareScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const exitAt = duration - 22;
  const exit = interpolate(frame, [exitAt, exitAt + 16], [0, 1], {...clamp, easing: ease.in});
  // Новый формат: стороны и пункты — фразы диктора (left, item…, right, item…)
  const L = scene.lines ?? [];
  const li = L.findIndex((l) => l.role === 'left');
  const ri = L.findIndex((l) => l.role === 'right');
  const spoken = li >= 0 && ri > li;
  const sp = (from: number, to: number): Sp => ({head: L[from], points: L.slice(from + 1, to).filter((l) => l.role === 'item' && l.text).slice(0, 3), words: scene.words, offset: voiceDelay, duration});
  const spL = spoken ? sp(li, ri) : undefined;
  const spR = spoken ? sp(ri, L.length) : undefined;
  const [aAt, bAt] = spoken
    ? [lineSpan(L[li], scene.words, voiceDelay, duration - 20)[0], lineSpan(L[ri], scene.words, voiceDelay, duration - 20)[0]]
    : cueFrames([scene.left.title, scene.right.title], scene.words, voiceDelay, scene.audioFrames ?? duration - 40);
  const title = spoken ? undefined : scene.title;
  const vs = spring({frame: frame - bAt + 6, fps, config: {damping: 10, stiffness: 160}});
  const activeRight = frame >= bAt;

  return (
    <AbsoluteFill style={{background: palette.bg, overflow: 'hidden'}}>
      <Backdrop seed={scene.left.title + scene.right.title} duration={duration} strength={0.8} word={title} />
      <Camera duration={duration} from={{zoom: 1.05, x: 30}} to={{zoom: 1.0, x: -30}} shake={3}>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 40, paddingTop: title ? 80 : 0}}>
          {title ? (
            <MovingTitle cue={aAt} top={80} zoom={2.2}>
              <div style={{fontFamily: FONT_FAMILY, fontSize: 48, letterSpacing: '0.06em', color: palette.accent, opacity: interpolate(frame, [2, 14], [0, 1], clamp) * (1 - exit)}}>
                {title.toUpperCase()}
              </div>
            </MovingTitle>
          ) : null}
          <div style={{display: 'flex', alignItems: 'center', gap: 80}}>
            <Card side={scene.left} at={aAt} dir={-1} color={palette.accent} active={!activeRight} exit={exit} sp={spL} />
            <Card side={scene.right} at={bAt} dir={1} color={palette.accent2} active={activeRight} exit={exit} sp={spR} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: title ? 'calc(50% + 40px)' : '50%',
              width: 120,
              height: 120,
              marginLeft: -60,
              marginTop: -60,
              borderRadius: '50%',
              background: palette.ink,
              color: palette.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: FONT_FAMILY,
              fontSize: 44,
              transform: `scale(${vs * (1 - exit)}) rotate(${(1 - vs) * -90}deg)`,
            }}
          >
            VS
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
