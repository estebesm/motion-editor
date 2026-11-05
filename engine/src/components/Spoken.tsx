import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fitText} from '../lib/fit';
import {ease, FONT_FAMILY, palette} from '../theme';
import type {SpokenLine, WordTime} from '../video/types';

/**
 * Текст, привязанный к речи: каждая надпись появляется, когда диктор произносит свою фразу,
 * пишется по словам в темп речи (слово — когда оно звучит) и остаётся на экране до конца сцены.
 */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const bare = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
const stem = (w: string) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 3)) : w);
const same = (a: string, b: string) => !!a && !!b && a.length >= 2 && (a === b || stem(a) === stem(b) || (a.length >= 4 && b.startsWith(a.slice(0, 4)) && a.startsWith(b.slice(0, 4))));

/** Когда звучит фраза: [начало, конец] в кадрах сцены */
export function lineSpan(line: Pick<SpokenLine, 'w0' | 'w1'>, words: WordTime[] | undefined, offset: number, fallbackEnd: number): [number, number] {
  const w = words ?? [];
  if (!w.length) return [offset + 4, fallbackEnd];
  const a = w[Math.min(line.w0, w.length - 1)];
  const b = w[Math.min(Math.max(line.w0, line.w1 - 1), w.length - 1)];
  return [Math.max(0, a.s + offset - 2), b.e + offset];
}

export const lineStarts = (lines: SpokenLine[] | undefined, words: WordTime[] | undefined, offset: number, duration: number) =>
  (lines ?? []).filter((l) => l.text).map((l) => lineSpan(l, words, offset, duration)[0]);

/** acc — выделение цветом (*слово*), strong — плашкой (**слово**), только для самого важного */
type Tok = {t: string; acc: boolean; strong: boolean; tone?: 'up' | 'down'};
/** Цвета смысла: +слово+ — рост (зелёный), ~слово~ — падение (красный) */
export const TONES = {up: '#3EE08F', down: '#FF5A6A'};
const parse = (text: string): Tok[] => {
  const out: Tok[] = [];
  let acc = false;
  let strong = false;
  let tone: Tok['tone'];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const core = raw.replace(/^[«"(]+/, '');
    const tail = raw.replace(/[.,:;!?…»")]+$/, '');
    if (core.startsWith('**')) (acc = true), (strong = true);
    else if (core.startsWith('*')) acc = true;
    if (core.startsWith('+')) tone = 'up';
    else if (core.startsWith('~')) tone = 'down';
    out.push({t: raw.replace(/[*+~]/g, ''), acc, strong, tone});
    if (tail.endsWith('*') && (tail.replace(/^[«"(]+/, '').length > 1 || !core.startsWith('*'))) acc = strong = false;
    if (/[+~]$/.test(tail)) tone = undefined;
  }
  return out;
};
export const plainText = (text: string) => text.replace(/[*+~]/g, '');

/**
 * Кадр появления каждого слова надписи: совпавшие с речью слова — когда звучат,
 * остальные — равномерно между соседями. Вся надпись дописывается к концу фразы.
 */
function tokenTimes(toks: Tok[], line: Pick<SpokenLine, 'w0' | 'w1'>, words: WordTime[] | undefined, offset: number, span: [number, number]): number[] {
  const [at, end] = span;
  const last = Math.max(at + 6, at + Math.min(end - at, Math.max(14, (end - at) * 0.8)));
  const w = (words ?? []).slice(line.w0, line.w1);
  const wb = w.map((x) => bare(x.w));
  let pos = 0;
  const hit: (number | undefined)[] = toks.map((tk) => {
    const b = bare(tk.t);
    const j = wb.findIndex((x, i) => i >= pos && same(x, b));
    if (j < 0) return undefined;
    pos = j + 1;
    return Math.min(last, w[j].s + offset - 2);
  });
  // Первое слово — когда оно звучит (а не в начале всей фразы), иначе словосочетание рвётся
  if (hit[0] === undefined) hit[0] = at;
  const out = hit.map((v, i) => {
    if (v !== undefined) return v;
    const pi = hit.slice(0, i).reduce<number>((acc, x, k) => (x !== undefined ? k : acc), 0);
    const ni = hit.findIndex((x, k) => k > i && x !== undefined);
    const pv = hit[pi]!;
    const nv = ni >= 0 ? hit[ni]! : last;
    const nk = ni >= 0 ? ni : toks.length;
    return pv + ((nv - pv) * (i - pi)) / (nk - pi);
  });
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + 3);
  return out;
}

/**
 * Одна надпись, которая пишется по словам: слово выезжает из-под маски, акцентное слово
 * накрывается цветной плашкой, пока надпись пишется — у последнего слова мигает курсор.
 */
export const Written: React.FC<{
  text: string;
  line: Pick<SpokenLine, 'w0' | 'w1'>;
  words?: WordTime[];
  offset: number;
  duration: number;
  size: number;
  maxWidth: number;
  maxLines?: number;
  align?: 'center' | 'left';
  color?: string;
  accent?: string;
  accent2?: string;
  /** Цвет букв на плашке акцента */
  onAccent?: string;
  /** Цвет слова, выделенного цветом (по умолчанию — градиент акцента) */
  accentInk?: string;
  /** К этому кадру все анимации надписи должны закончиться (дальше — следующий кадр/сцена) */
  until?: number;
  /** 0..1 — насколько приглушить (надпись уже сказана, говорят следующую) */
  dim?: number;
  upper?: boolean;
}> = ({text, line, words, offset, duration, size, maxWidth, maxLines = 2, align = 'center', color, accent, accent2, onAccent, accentInk, until, dim = 0, upper = true}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const toks = parse(upper ? text.toUpperCase() : text);
  const span = lineSpan(line, words, offset, duration - 20);
  const times = tokenTimes(toks, line, words, offset, span);
  const fit = fitText(toks.map((x) => x.t).join(' '), {maxWidth, maxSize: size, minSize: size * 0.92, maxLines});
  const fs = Math.min(size, fit.size);
  let k = 0;
  const rows = fit.lines.map((l) => l.split(' ').map(() => k++));
  const acc = accent ?? palette.accent;
  const acc2 = accent2 ?? palette.accent2;
  const ink = color ?? palette.ink;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: fs * 0.04,
        fontFamily: FONT_FAMILY,
        fontSize: fs,
        lineHeight: 1.1,
        color: ink,
        opacity: 1 - dim * 0.3,
      }}
    >
      {rows.map((row, ri) => (
        <div key={ri} style={{display: 'flex', gap: fs * 0.26, whiteSpace: 'pre'}}>
          {row.map((i) => {
            const tk = toks[i];
            const t = times[i];
            // Слово влетает пружиной (лёгкий перелёт) и проявляется из размытия
            const p = spring({frame: frame - t, fps, config: {damping: 13, stiffness: 190, mass: 0.7}});
            const sharp = interpolate(frame, [t, t + 7], [0, 1], {...clamp, easing: ease.out});
            // Плашка и цвет букв меняются одной плавной шторкой слева направо, после того как слово появилось
            // …и всегда успевает до следующего кадра
            const deadline = (until ?? duration - 16) - 9;
            const wEnd = Math.max(t + 6, Math.min(t + 18, deadline));
            const wStart = Math.max(t + 1, Math.min(t + 5, wEnd - 8));
            const m = tk.strong ? interpolate(frame, [wStart, wEnd], [0, 1], {...clamp, easing: ease.cinematic}) : 0;
            const wipe = `inset(-0.3em ${((1 - m) * 100).toFixed(2)}% -0.3em -0.3em)`;
            return (
              <span key={i} style={{position: 'relative', display: 'inline-block', isolation: 'isolate'}}>
                {tk.strong ? (
                  <span
                    style={{
                      position: 'absolute',
                      left: '-0.12em',
                      right: '-0.12em',
                      top: '0.04em',
                      bottom: '-0.02em',
                      background: `linear-gradient(90deg, ${acc}, ${acc2})`,
                      clipPath: wipe,
                      borderRadius: '0.08em',
                      zIndex: -1,
                    }}
                  />
                ) : null}
                <span style={{display: 'inline-block', overflow: 'hidden', padding: '0.08em 0.02em 0.12em', margin: '-0.08em -0.02em -0.12em', verticalAlign: 'bottom'}}>
                  <span
                    style={{
                      display: 'inline-block',
                      transform: `translateY(${Math.max(-0.03, 1 - p) * 110}%) rotate(${(1 - p) * 8}deg) scale(${0.92 + 0.08 * p})`,
                      transformOrigin: 'left bottom',
                      filter: sharp < 1 ? `blur(${((1 - sharp) * 9).toFixed(2)}px)` : undefined,
                      position: 'relative',
                      ...(tk.tone
                        ? {color: TONES[tk.tone]}
                        : tk.strong
                        ? {color: acc}
                        : tk.acc
                          ? accentInk
                            ? {color: accentInk}
                            : {
                                // Градиент медленно переливается по слову
                                backgroundImage: `linear-gradient(90deg, ${acc}, ${acc2}, ${acc})`,
                                backgroundSize: '220% 100%',
                                backgroundPosition: `${(50 + Math.sin((frame - t) / 22) * 50).toFixed(1)}% 0`,
                                WebkitBackgroundClip: 'text',
                                backgroundClip: 'text',
                                color: 'transparent',
                              }
                          : {}),
                    }}
                  >
                    {tk.t}
                    {tk.strong && m > 0 ? (
                      <span style={{position: 'absolute', left: 0, top: 0, color: onAccent ?? palette.bg, clipPath: wipe}}>{tk.t}</span>
                    ) : null}
                  </span>
                </span>

              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Размер надписи, чтобы самая длинная из них влезла */
export const commonSize = (texts: string[], maxWidth: number, maxSize: number, maxLines = 3) =>
  Math.min(maxSize, ...texts.map((t) => fitText(plainText(t).toUpperCase(), {maxWidth, maxSize, minSize: maxSize * 0.92, maxLines}).size));

/**
 * Рассказ строками: каждая строка пишется, когда звучит её фраза, и остаётся; уже сказанные — чуть тише.
 * Блок плавно растёт от центра, ничего не наезжает друг на друга.
 */
export const SpokenStack: React.FC<{
  lines: SpokenLine[];
  words?: WordTime[];
  offset: number;
  duration: number;
  maxWidth: number;
  align?: 'center' | 'left';
  /** Максимальный размер шрифта при 1, 2, 3, 4 строках */
  sizes?: number[];
  color?: string;
  accent?: string;
  accent2?: string;
  onAccent?: string;
  upper?: boolean;
  /** Отдельный (крупный) размер первой строки — например, название бренда в финале */
  leadSize?: number;
  /** Клип: на экране только текущая фраза, крупно, со «склейкой» на каждой новой */
  cuts?: boolean;
  /** Цвета для кадра по номеру (клип: чередование фона) */
  shotColors?: (i: number) => {color?: string; accent?: string; accent2?: string; onAccent?: string};
  accentInk?: string;
}> = ({lines: all, words, offset, duration, maxWidth, align = 'center', sizes = [150, 118, 96, 80], color, accent, accent2, onAccent, upper = true, leadSize, cuts, shotColors, accentInk}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const lines = all.filter((l) => l.text.trim());
  if (!lines.length) return null;
  if (cuts) {
    const starts = lines.map((l) => lineSpan(l, words, offset, duration - 20)[0]);
    const i = Math.max(0, starts.reduce((c, s, k) => (frame >= s - 1 ? k : c), 0));
    const l = lines[i];
    const big = i === 0 && leadSize ? leadSize : sizes[0];
    const size = commonSize([l.text], maxWidth, big, 4);
    // Смена фразы — плавно: новая фраза пишется по словам, без ударов и вспышек
    const c = shotColors?.(i) ?? {};
    const prev = i > 0 ? lines[i - 1] : null;
    const q = prev ? interpolate(frame, [starts[i] - 1, starts[i] + 7], [0, 1], {...clamp, easing: ease.out}) : 1;
    return (
      <div style={{position: 'relative'}}>
        {prev && q < 1 ? (
          <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : 'flex-start', opacity: 1 - q, transform: `translateY(${-q * 60}px) scale(${1 - q * 0.05})`, filter: `blur(${(q * 8).toFixed(2)}px)`}}>
            <Written text={prev.text} line={prev} words={words} offset={offset} duration={duration} size={commonSize([prev.text], maxWidth, sizes[0], 4)} maxWidth={maxWidth} maxLines={4} align={align} color={color} accent={accent} accent2={accent2} onAccent={onAccent} upper={upper} />
          </div>
        ) : null}
      <div key={i}>
        <Written
          text={l.text}
          line={l}
          words={words}
          offset={offset}
          duration={duration}
          size={size}
          maxWidth={maxWidth}
          maxLines={4}
          align={align}
          color={c.color ?? color}
          accent={c.accent ?? accent}
          accent2={c.accent2 ?? accent2}
          onAccent={c.onAccent ?? onAccent}
          accentInk={accentInk}
          until={starts[i + 1]}
          upper={upper}
        />
      </div>
      </div>
    );
  }
  const maxSize = sizes[Math.min(lines.length, sizes.length) - 1];
  const lead = !!leadSize && lines.length > 1;
  const common = commonSize((lead ? lines.slice(1) : lines).map((l) => l.text), maxWidth, maxSize);
  const sizeOf = (i: number) => (lead && i === 0 ? commonSize([lines[0].text], maxWidth, leadSize!) : common);
  const fits = lines.map((l, i) => fitText(plainText(l.text).toUpperCase(), {maxWidth, maxSize: sizeOf(i), minSize: sizeOf(i) * 0.92, maxLines: 3}));
  const gap = common * 0.42;
  const hs = fits.map((f, i) => f.lines.length * Math.min(sizeOf(i), f.size) * 1.1);
  const starts = lines.map((l) => lineSpan(l, words, offset, duration - 20)[0]);
  const fullH = hs.reduce((a, b) => a + b, 0) + gap * (lines.length - 1);
  const visH = hs.reduce((acc, h, i) => {
    const p = i === 0 ? 1 : spring({frame: frame - starts[i] + 2, fps, config: {damping: 18, stiffness: 120}});
    return acc + (h + (i ? gap : 0)) * p;
  }, 0);
  const shift = (fullH - visH) / 2;
  const current = starts.reduce((c, s, i) => (frame >= s ? i : c), 0);

  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap, transform: `translateY(${shift}px)`}}>
      {lines.map((l, i) => (
        <Written
          key={i}
          text={l.text}
          line={l}
          words={words}
          offset={offset}
          duration={duration}
          size={sizeOf(i)}
          maxWidth={maxWidth}
          maxLines={3}
          align={align}
          color={color}
          accent={accent}
          accent2={accent2}
          onAccent={onAccent}
          accentInk={accentInk}
          upper={upper}
          dim={i < current ? interpolate(frame, [starts[i + 1], starts[i + 1] + 10], [0, 1], clamp) : 0}
        />
      ))}
    </div>
  );
};

/** Номер текущего кадра-фразы (клип) и моменты склеек */
export const shotOf = (lines: SpokenLine[] | undefined, words: WordTime[] | undefined, offset: number, duration: number, frame: number) => {
  const starts = (lines ?? []).filter((l) => l.text.trim()).map((l) => lineSpan(l, words, offset, duration - 20)[0]);
  const i = Math.max(0, starts.reduce((c, s, k) => (frame >= s - 1 ? k : c), 0));
  return {i, starts, at: starts[i] ?? 0};
};

/** Вспышка на склейке между фразами */
export const CutFlash: React.FC<{starts: number[]; color?: string}> = ({starts, color = '#fff'}) => {
  const frame = useCurrentFrame();
  const at = [...starts.slice(1)].reverse().find((s) => frame >= s - 1);
  if (at === undefined) return null;
  const o = interpolate(frame, [at - 1, at + 1, at + 5], [0, 0.3, 0], clamp);
  return o > 0 ? <div style={{position: 'absolute', inset: 0, background: color, opacity: o, mixBlendMode: 'screen', pointerEvents: 'none'}} /> : null;
};

/** Надписи сцены по ролям */
export const byRole = (lines: SpokenLine[] | undefined, role: SpokenLine['role']) => (lines ?? []).filter((l) => l.role === role && l.text.trim());
