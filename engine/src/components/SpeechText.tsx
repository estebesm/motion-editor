import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fitText} from '../lib/fit';
import {alpha, ease, FONT_FAMILY, palette} from '../theme';
import type {WordTime} from '../video/types';

export type Chunk = {words: WordTime[]; start: number; end: number; text: string};

const SHORT = /^(и|в|во|на|с|со|к|ко|о|об|от|до|по|за|из|у|а|но|не|ни|же|ли|бы|то|что|как|для|при|или)$/i;
const bare = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}-]/gu, '');

/**
 * Делит слова речи на короткие фразы для экрана: по знакам препинания, паузам и длине.
 * Предлоги и союзы не оставляем висеть в конце фразы.
 */
export function chunkWords(words: WordTime[], {maxWords = 4, maxChars = 24} = {}): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: WordTime[] = [];
  const flush = () => {
    if (!cur.length) return;
    chunks.push({words: cur, start: cur[0].s, end: cur[cur.length - 1].e, text: cur.map((w) => w.w).join(' ')});
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next) return flush();
    const len = cur.map((x) => x.w).join(' ').length;
    const punct = /[.,:;!?…—–]$/.test(w.w);
    const pause = next.s - w.e > 5;
    const dangling = SHORT.test(bare(w.w));
    if (dangling && cur.length < maxWords + 1) return;
    if ((punct && cur.length >= 2) || pause || cur.length >= maxWords || len + next.w.length + 1 > maxChars) flush();
    else if (/[.!?…]$/.test(w.w)) flush();
  });
  flush();
  return chunks;
}

type MarkKind = 'marker' | 'underline' | 'box' | 'circle';
const MARKS: MarkKind[] = ['marker', 'underline', 'box', 'circle'];

/** Выделение ключевого слова: маркер, подчёркивание, рамка или обводка «от руки». p — прогресс 0..1. */
export const Mark: React.FC<{kind: MarkKind; p: number}> = ({kind, p}) => {
  if (p <= 0) return null;
  if (kind === 'marker')
    return (
      <span
        style={{
          position: 'absolute',
          left: '-0.1em',
          right: '-0.1em',
          top: '0.18em',
          bottom: '0.02em',
          borderRadius: '0.1em',
          background: alpha(palette.accent2, 0.32),
          transformOrigin: 'left',
          transform: `scaleX(${p}) skewX(-8deg)`,
          zIndex: -1,
        }}
      />
    );
  if (kind === 'underline')
    return (
      <span
        style={{
          position: 'absolute',
          left: '-0.04em',
          right: '-0.04em',
          bottom: '-0.12em',
          height: '0.12em',
          borderRadius: '0.06em',
          background: `linear-gradient(90deg, ${palette.accent2}, ${palette.accent})`,
          transformOrigin: 'left',
          transform: `scaleX(${p})`,
        }}
      />
    );
  if (kind === 'box')
    return (
      <span
        style={{
          position: 'absolute',
          left: '-0.16em',
          right: '-0.16em',
          top: '-0.06em',
          bottom: '-0.06em',
          borderRadius: '0.14em',
          border: `0.06em solid ${palette.accent2}`,
          clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        }}
      />
    );
  // Обводка «от руки»: без vector-effect, иначе пунктир из pathLength ломается
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{position: 'absolute', left: '-0.3em', top: '-0.22em', width: 'calc(100% + 0.6em)', height: 'calc(100% + 0.44em)', overflow: 'visible'}}>
      <path d="M60 4 C 20 0, 0 25, 3 55 C 6 88, 50 99, 80 92 C 102 85, 101 40, 85 20 C 72 6, 45 2, 30 10" pathLength={1} fill="none" stroke={palette.accent2} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="1 1" strokeDashoffset={1 - p} />
    </svg>
  );
};

const isHighlight = (w: string, hl: string[]) => {
  const b = bare(w);
  if (b.length < 3) return false;
  return hl.some((h) =>
    h
      .split(/\s+/)
      .map(bare)
      .some((x) => x.length >= 3 && (b === x || (b.length >= 5 && x.length >= 5 && b.slice(0, 5) === x.slice(0, 5)))),
  );
};

/**
 * Текст речи на экране в такт озвучке: фраза за фразой, слово появляется, когда его произносят.
 * hero — крупно по центру (сцены-типографика), caption — средний размер сбоку от картинки.
 */
export const SpeechText: React.FC<{
  words: WordTime[];
  /** Кадр начала голоса внутри сцены */
  offset: number;
  highlight?: string[];
  variant?: 'hero' | 'caption';
  maxWidth: number;
  align?: 'center' | 'left';
  exitAt?: number;
  seed?: string;
  /** Не показывать фразы раньше этого кадра сцены (пока на экране заголовок) */
  from?: number;
  color?: string;
  accent?: string;
}> = ({words, offset, highlight = [], variant = 'hero', maxWidth, align = 'center', exitAt, seed = 's', from = 0, color, accent}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const hero = variant === 'hero';
  const chunks = chunkWords(words, hero ? {maxWords: 4, maxChars: 26} : {maxWords: 6, maxChars: 44});
  const f = frame - offset;
  if (!chunks.length || frame < from) return null;
  const ink = color ?? palette.ink;
  const acc = accent ?? palette.accent;

  // Текущая фраза: последняя, которая уже началась (появляется чуть раньше слова)
  const lead = 3;
  let idx = chunks.findIndex((c, i) => f >= c.start - lead && (i === chunks.length - 1 || f < chunks[i + 1].start - lead));
  if (idx < 0) idx = f < chunks[0].start ? -1 : chunks.length - 1;
  if (idx < 0) return null;
  const chunk = chunks[idx];
  const nextStart = idx + 1 < chunks.length ? chunks[idx + 1].start - lead : Infinity;
  const fit = fitText(chunk.text.toUpperCase(), {
    maxWidth,
    maxSize: hero ? 168 : 76,
    minSize: hero ? 84 : 50,
    maxLines: hero ? 2 : 3,
  });
  const style = hero ? Math.floor(random(`${seed}-${idx}`) * 4) : 0;
  const markKind = MARKS[Math.floor(random(`${seed}-m${idx}`) * MARKS.length)];
  const exitLocal = Math.min(nextStart, exitAt !== undefined ? exitAt - offset : Infinity);
  const out = interpolate(f, [exitLocal - 5, exitLocal], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.in});

  let k = 0;
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: fit.size * 0.08,
        fontFamily: FONT_FAMILY,
        fontSize: fit.size,
        lineHeight: 1.05,
        color: ink,
        opacity: 1 - out,
        transform: `translateY(${-out * fit.size * 0.4}px)`,
        filter: out > 0.02 ? `blur(${out * 10}px)` : undefined,
      }}
    >
      {fit.lines.map((line, li) => (
        <div key={li} style={{display: 'flex', gap: fit.size * 0.26, whiteSpace: 'pre'}}>
          {line.split(' ').map((txt) => {
            const w = chunk.words[k++] ?? chunk.words[chunk.words.length - 1];
            // Первое слово фразы стартует сразу при смене фразы — без пустого кадра между ними
            const at = Math.max(w === chunk.words[0] ? chunk.start - lead - 3 : w.s - 2, from - offset);
            const s = spring({frame: f - at, fps, config: {damping: 14, stiffness: 160, mass: 0.7}});
            const inv = 1 - s;
            const hl = isHighlight(w.w, highlight);
            const speaking = f >= w.s && f < w.e;
            let transform = '';
            if (style === 0) transform = `translateY(${inv * fit.size * 0.7}px)`;
            else if (style === 1) transform = `scale(${1 + inv * 0.8})`;
            else if (style === 2) transform = `translateX(${inv * -fit.size * 0.8}px) skewX(${inv * -14}deg)`;
            else transform = `translateY(${inv * fit.size * 0.3}px) scale(${0.7 + 0.3 * s})`;
            const mark = hl ? interpolate(f, [at + 3, at + 14], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.out}) : 0;
            return (
              <span
                key={`${idx}-${txt}-${k}`}
                style={{
                  position: 'relative',
                  isolation: 'isolate',
                  display: 'inline-block',
                  opacity: Math.min(1, s * 1.5),
                  transform,
                  filter: inv > 0.05 ? `blur(${inv * 8}px)` : undefined,
                  color: hl ? acc : speaking || !hero ? ink : alpha(ink, 0.92),
                }}
              >
                {hl ? <Mark kind={markKind} p={mark} /> : null}
                {txt}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Начала фраз — чтобы сцена могла «подталкивать» камеру в такт. */
export const chunkStarts = (words: WordTime[], variant: 'hero' | 'caption' = 'hero') =>
  chunkWords(words, variant === 'hero' ? {maxWords: 4, maxChars: 26} : {maxWords: 6, maxChars: 44}).map((c) => c.start);

/**
 * Пока пункты списка/схемы ещё не прозвучали — показываем слова диктора,
 * чтобы кадр не стоял пустым. Исчезает перед первым пунктом.
 */
export const PreRoll: React.FC<{words?: WordTime[]; voiceDelay: number; until: number; highlight?: string[]; seed?: string}> = ({
  words,
  voiceDelay,
  until,
  highlight,
  seed,
}) => {
  if (!words?.length || until - voiceDelay < 35) return null;
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <SpeechText words={words} offset={voiceDelay} highlight={highlight} maxWidth={1500} exitAt={until - 2} seed={seed} />
    </div>
  );
};
