import React from 'react';
import {interpolate, random, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {fitText} from '../lib/fit';
import {ease, FONT_FAMILY, palette} from '../theme';
import type {WordTime} from '../video/types';
import {chunkWords} from './SpeechText';

/**
 * Ключевые фразы на экране вместо субтитров: 1–3 фразы на сцену, каждая появляется,
 * когда диктор её произносит, и держится, пока не придёт следующая (не меньше ~1,4 с).
 * Акцентное слово фразы пишется в *звёздочках*.
 */

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const bare = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '');
const stem = (w: string) => (w.length > 5 ? w.slice(0, Math.max(4, w.length - 3)) : w);
const same = (a: string, b: string) => !!a && !!b && (a === b || stem(a) === stem(b));

export type KeyCue = {text: string; at: number; end: number; idx: number};

/** Фразы автоматически (если ИИ их не задал): куски речи покрупнее */
const autoKeys = (words: WordTime[]) => chunkWords(words, {maxWords: 5, maxChars: 34}).map((c) => c.text.replace(/[.,:;!?…—–]+$/, ''));

/**
 * Когда показывать каждую фразу (кадры сцены). Фраза привязывается к моменту,
 * когда звучит её первое слово; слишком частые фразы сдвигаются или отбрасываются.
 */
export function keyCues(
  keysIn: string[] | undefined,
  words: WordTime[] | undefined,
  {offset, duration, from = 0, minHold = 42, tail = 14}: {offset: number; duration: number; from?: number; minHold?: number; tail?: number},
): KeyCue[] {
  const w = words ?? [];
  // undefined — фраз не задали, берём куски речи; [] — намеренно без фраз
  const keys = (keysIn ?? autoKeys(w)).map((k) => k.trim()).filter(Boolean);
  if (!keys.length) return [];
  const wb = w.map((x) => bare(x.w));
  const lastWord = w.length ? w[w.length - 1].e + offset : duration - tail;
  let pos = 0;
  const raw: (number | undefined)[] = keys.map((k) => {
    const kt = k.replace(/\*/g, '').split(/\s+/).map(bare).filter(Boolean);
    for (let t = 0; t < Math.min(2, kt.length); t++) {
      const j = wb.findIndex((x, i) => i >= pos && same(x, kt[t]));
      if (j >= 0) {
        pos = j + 1;
        return w[Math.max(0, j - t)].s + offset - 3;
      }
    }
    return undefined;
  });
  // Ненайденные — равномерно между соседями
  const at = raw.map((v, i) => {
    if (v !== undefined) return v;
    const prev = [...raw.slice(0, i)].reverse().find((x) => x !== undefined) ?? from;
    const nextI = raw.findIndex((x, j) => j > i && x !== undefined);
    const next = nextI >= 0 ? raw[nextI]! : lastWord;
    const span = (nextI >= 0 ? nextI : keys.length) - i + 1;
    return prev + (next - prev) / span;
  });
  const out: KeyCue[] = [];
  keys.forEach((text, i) => {
    let a = at[i];
    // Первая фраза — не позже чем через секунду после начала, чтобы кадр не пустовал
    if (!out.length) a = Math.min(a, from + 30);
    a = Math.max(a, from, out.length ? out[out.length - 1].at + minHold : 0);
    if (a > duration - tail - minHold * 0.7) return;
    out.push({text, at: Math.round(a), end: 0, idx: i});
  });
  out.forEach((c, i) => (c.end = i + 1 < out.length ? out[i + 1].at : duration - tail));
  return out;
}

type Tok = {t: string; acc: boolean};
/** «Сохраните *эту копию* сейчас» → слова с пометкой акцента */
const parse = (text: string, auto = true): Tok[] => {
  const out: Tok[] = [];
  let acc = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const open = raw.startsWith('*');
    const close = raw.replace(/[.,:;!?…»"]+$/, '').endsWith('*') && (raw.length > 1 || !open);
    if (open) acc = true;
    out.push({t: raw.replace(/\*/g, ''), acc});
    if (close) acc = false;
  }
  if (auto && !out.some((x) => x.acc) && out.length >= 2) {
    // Без пометки — акцент на самом длинном слове
    const L = out.reduce((b, x, i) => (bare(x.t).length > bare(out[b].t).length ? i : b), 0);
    out[L].acc = true;
  }
  return out;
};

type Pattern = 'slab' | 'mask' | 'pop' | 'wipe';
const HERO: Pattern[] = ['slab', 'mask', 'pop', 'wipe'];
const CAPTION: Pattern[] = ['mask', 'wipe'];

/** Лучи-«вспышка» вокруг акцентного слова */
const Burst: React.FC<{f: number; color: string}> = ({f, color}) => {
  const p = interpolate(f, [4, 22], [0, 1], {...clamp, easing: ease.out});
  if (p <= 0 || p >= 1) return null;
  return (
    <svg viewBox="-100 -100 200 200" style={{position: 'absolute', left: '50%', top: '50%', width: '170%', height: '260%', transform: 'translate(-50%, -50%)', overflow: 'visible', zIndex: -1}}>
      {Array.from({length: 10}, (_, i) => {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const r0 = 52 + p * 30;
        const r1 = r0 + 18 * (1 - p);
        return (
          <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0 * 0.6} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1 * 0.6} stroke={color} strokeWidth={4} strokeLinecap="round" opacity={1 - p * 0.6} />
        );
      })}
      <ellipse cx={0} cy={0} rx={40 + p * 60} ry={24 + p * 36} fill="none" stroke={color} strokeWidth={3 * (1 - p)} opacity={0.8 * (1 - p)} />
    </svg>
  );
};

const Phrase: React.FC<{
  cue: KeyCue;
  pattern: Pattern;
  hero: boolean;
  maxWidth: number;
  align: 'center' | 'left';
  ink: string;
  acc: string;
  acc2: string;
  /** Когда выделить акцентное слово (кадры от начала фразы) — в момент, когда оно звучит */
  accentAt?: number;
  size?: {max: number; min: number; lines: number};
  /** Без явного *акцента* ничего не подсвечивать (для второстепенных строк) */
  noAutoAccent?: boolean;
}> = ({cue, pattern, hero, maxWidth, align, ink, acc, acc2, accentAt, size: sz, noAutoAccent}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const f = frame - cue.at;
  const total = cue.end - cue.at;
  const toks = parse(cue.text, !noAutoAccent);
  const plain = toks.map((x) => x.t).join(' ').toUpperCase();
  const fit = fitText(plain, sz ? {maxWidth, maxSize: sz.max, minSize: sz.min, maxLines: sz.lines} : {maxWidth, maxSize: hero ? 190 : 86, minSize: hero ? 92 : 50, maxLines: hero ? 2 : 3});
  const size = fit.size;
  // Раскладываем слова по строкам fitText
  let k = 0;
  const lines = fit.lines.map((l) => l.split(' ').map(() => toks[k++] ?? {t: '', acc: false}));
  const exitLen = pattern === 'slab' ? 12 : 8;
  const ex = interpolate(f, [total - exitLen, total], [0, 1], {...clamp, easing: ease.in});
  const justify = align === 'center' ? 'center' : 'flex-start';

  // Акцентное слово: плашка или градиент с толстой полосой
  const accentWord = (tok: Tok, key: string, atDefault: number, li: number, wi: number) => {
    const at = accentAt ?? atDefault;
    const m = interpolate(f, [at, at + 9], [0, 1], {...clamp, easing: ease.out});
    const style = pattern === 'slab' ? 'block' : 'grad';
    if (style === 'block')
      return (
        <span key={key} style={{position: 'relative', display: 'inline-block', isolation: 'isolate', color: m > 0.5 ? palette.bg : acc}}>
          <span
            style={{
              position: 'absolute',
              left: '-0.12em',
              right: '-0.12em',
              top: '0.02em',
              bottom: '-0.04em',
              background: acc,
              transformOrigin: (li + wi) % 2 ? 'right' : 'left',
              transform: `scaleX(${m}) skewX(-8deg)`,
              zIndex: -1,
              borderRadius: '0.06em',
            }}
          />
          {tok.t.toUpperCase()}
        </span>
      );
    return (
      <span key={key} style={{position: 'relative', display: 'inline-block'}}>
        <span
          style={{
            background: `linear-gradient(90deg, ${acc}, ${acc2})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          {tok.t.toUpperCase()}
        </span>
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '-0.1em',
            height: '0.13em',
            borderRadius: '0.07em',
            background: `linear-gradient(90deg, ${acc}, ${acc2})`,
            transformOrigin: 'left',
            transform: `scaleX(${m})`,
          }}
        />
      </span>
    );
  };

  const box: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: justify,
    gap: size * 0.06,
    fontFamily: FONT_FAMILY,
    fontSize: size,
    lineHeight: 1.08,
    color: ink,
  };
  const gap = size * 0.26;

  if (pattern === 'slab') {
    // Плашка закрывает место, под ней появляется текст, плашка уезжает; на выходе — наоборот
    const inA = interpolate(f, [0, 7], [0, 1], {...clamp, easing: ease.in});
    const inB = interpolate(f, [7, 15], [0, 1], {...clamp, easing: ease.out});
    const outA = interpolate(f, [total - 12, total - 6], [0, 1], {...clamp, easing: ease.in});
    const outB = interpolate(f, [total - 6, total], [0, 1], {...clamp, easing: ease.out});
    const covering = outA > 0;
    const scale = covering ? (outB > 0 ? 1 - outB : outA) : inB > 0 ? 1 - inB : inA;
    const origin = covering ? (outB > 0 ? 'right' : 'left') : inB > 0 ? 'right' : 'left';
    const visible = f >= 7 && !(outB > 0);
    return (
      <div style={box}>
        <div style={{display: 'flex', flexDirection: 'column', alignItems: justify, gap: size * 0.06, opacity: visible ? 1 : 0}}>
          {lines.map((line, li) => (
            <div key={li} style={{display: 'flex', gap, whiteSpace: 'pre'}}>
              {line.map((tok, wi) => (tok.acc ? accentWord(tok, `${li}-${wi}`, 12 + li * 3, li, wi) : <span key={`${li}-${wi}`}>{tok.t.toUpperCase()}</span>))}
            </div>
          ))}
        </div>
        <div style={{position: 'absolute', inset: '-0.06em -0.18em', background: `linear-gradient(90deg, ${acc}, ${acc2})`, transformOrigin: origin, transform: `scaleX(${scale})`}} />
      </div>
    );
  }

  if (pattern === 'mask') {
    return (
      <div style={box}>
        {lines.map((line, li) => {
          const s = spring({frame: f - li * 4, fps, config: {damping: 16, stiffness: 170, mass: 0.8}});
          const o = interpolate(f, [total - 8 + li * 2, total + li * 2], [0, 1], {...clamp, easing: ease.in});
          return (
            <div key={li} style={{overflow: 'hidden', padding: '0.06em 0.2em 0.16em', margin: '-0.06em -0.2em -0.16em'}}>
              <div style={{display: 'flex', gap, whiteSpace: 'pre', transform: `translateY(${(1 - s) * 115 - o * 115}%) rotate(${(1 - s) * 4}deg)`, transformOrigin: 'left bottom'}}>
                {line.map((tok, wi) => (tok.acc ? accentWord(tok, `${li}-${wi}`, 8 + li * 4, li, wi) : <span key={`${li}-${wi}`}>{tok.t.toUpperCase()}</span>))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (pattern === 'pop') {
    let c = 0;
    return (
      <div style={{...box, opacity: 1 - ex, transform: `scale(${1 - ex * 0.15})`, filter: ex > 0.02 ? `blur(${ex * 12}px)` : undefined}}>
        {lines.map((line, li) => (
          <div key={li} style={{display: 'flex', gap, whiteSpace: 'pre'}}>
            {line.map((tok, wi) => {
              const letters = Array.from(tok.t.toUpperCase()).map((ch) => {
                const d = c++ * 0.9;
                const s = spring({frame: f - d, fps, config: {damping: 9, stiffness: 230, mass: 0.6}});
                return (
                  <span key={d} style={{display: 'inline-block', transform: `translateY(${(1 - s) * 0.5}em) scale(${s}) rotate(${(1 - s) * -25}deg)`, opacity: Math.min(1, s * 2)}}>
                    {ch}
                  </span>
                );
              });
              return tok.acc ? (
                <PopAccent key={`${li}-${wi}`} f={f} at={accentAt ?? c * 0.9} acc={acc2}>
                  {letters}
                </PopAccent>
              ) : (
                <span key={`${li}-${wi}`} style={{display: 'inline-flex'}}>
                  {letters}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // wipe: текст открывается шторкой слева направо, по краю едет яркая полоса
  const w = interpolate(f, [0, 14], [0, 1], {...clamp, easing: ease.out});
  const wo = interpolate(f, [total - 8, total], [0, 1], {...clamp, easing: ease.in});
  return (
    <div style={box}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: justify, gap: size * 0.06, clipPath: `inset(-0.3em ${(1 - w) * 100}% -0.3em ${wo * 100}%)`}}>
        {lines.map((line, li) => (
          <div key={li} style={{display: 'flex', gap, whiteSpace: 'pre'}}>
            {line.map((tok, wi) => (tok.acc ? accentWord(tok, `${li}-${wi}`, 12, li, wi) : <span key={`${li}-${wi}`}>{tok.t.toUpperCase()}</span>))}
          </div>
        ))}
      </div>
      {f >= 0 && (w < 1 || wo > 0) ? (
        <div
          style={{
            position: 'absolute',
            top: '-0.1em',
            bottom: '-0.1em',
            width: '0.14em',
            left: `${(w < 1 ? w : wo) * 100}%`,
            background: acc2,
            boxShadow: `0 0 30px ${acc2}`,
            opacity: wo > 0 ? 1 - wo * 0.3 : interpolate(f, [9, 14], [1, 0], clamp),
          }}
        />
      ) : null}
    </div>
  );
};

/** Акцентное слово в «поп»-фразе: цветная плашка за буквами и вспышка лучей */
const PopAccent: React.FC<{f: number; at: number; acc: string; children: React.ReactNode}> = ({f, at, acc, children}) => {
  const m = interpolate(f, [at + 2, at + 10], [0, 1], {...clamp, easing: ease.out});
  return (
    <span style={{position: 'relative', display: 'inline-flex', isolation: 'isolate', color: m > 0.5 ? palette.bg : acc}}>
      <span style={{position: 'absolute', left: '-0.12em', right: '-0.12em', top: '0.02em', bottom: '-0.04em', background: acc, transform: `scale(${m}) rotate(${(1 - m) * -6}deg)`, zIndex: -1, borderRadius: '0.08em'}} />
      <Burst f={f - at} color={acc} />
      {children}
    </span>
  );
};

export const KeyText: React.FC<{
  keys?: string[];
  words?: WordTime[];
  offset: number;
  duration: number;
  /** Не раньше этого кадра сцены */
  from?: number;
  variant?: 'hero' | 'caption';
  maxWidth: number;
  align?: 'center' | 'left';
  seed?: string;
  color?: string;
  accent?: string;
  accent2?: string;
  /** Показывать только фразы, начавшиеся до этого кадра (дальше сцена показывает своё) */
  until?: number;
}> = ({keys, words, offset, duration, from = 0, variant = 'hero', maxWidth, align = 'center', seed = 'k', color, accent, accent2, until}) => {
  const frame = useCurrentFrame();
  const hero = variant === 'hero';
  let cues = keyCues(keys, words, {offset, duration, from});
  if (until !== undefined) {
    cues = cues.filter((c) => c.at < until - 20);
    if (cues.length) cues[cues.length - 1].end = Math.min(cues[cues.length - 1].end, until);
  }
  const cue = cues.find((c) => frame >= c.at && frame < c.end);
  if (!cue) return null;
  const set = hero ? HERO : CAPTION;
  const base = Math.floor(random(`${seed}-p`) * set.length);
  const pattern = set[(base + cues.indexOf(cue)) % set.length];
  return (
    <Phrase
      key={cue.at}
      cue={cue}
      pattern={pattern}
      hero={hero}
      maxWidth={maxWidth}
      align={align}
      ink={color ?? palette.ink}
      acc={accent ?? palette.accent}
      acc2={accent2 ?? palette.accent2}
    />
  );
};

/** Моменты появления фраз — для «толчков» камеры */
export const keyStarts = (keys: string[] | undefined, words: WordTime[] | undefined, offset: number, duration: number, from = 0) =>
  keyCues(keys, words, {offset, duration, from}).map((c) => c.at);


/** Убирает фразы, которые повторяют уже показанный крупный текст (заголовок, тезис) */
export const withoutRepeats = (keys: string[] | undefined, shown: (string | undefined)[]) => {
  if (!keys?.length) return keys;
  const seen = new Set(shown.filter(Boolean).join(' ').split(/\s+/).map(bare).filter((x) => x.length > 2).map(stem));
  const out = keys.filter((k) => {
    const ws = k.replace(/\*/g, '').split(/\s+/).map(bare).filter((x) => x.length > 2);
    return !ws.length || ws.filter((w) => seen.has(stem(w))).length / ws.length < 0.6;
  });
  return out.length ? out : undefined;
};

/**
 * Пока пункты списка/схемы ещё не прозвучали — ключевые фразы диктора по центру,
 * чтобы кадр не стоял пустым. Исчезает перед первым пунктом.
 */
export const PreRoll: React.FC<{keys?: string[]; words?: WordTime[]; voiceDelay: number; duration: number; until: number; seed?: string}> = ({
  keys,
  words,
  voiceDelay,
  duration,
  until,
  seed,
}) => {
  if (!words?.length || until - voiceDelay < 35) return null;
  return (
    <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
      <KeyText keys={keys} words={words} offset={voiceDelay} duration={duration} until={until} maxWidth={1500} seed={seed} />
    </div>
  );
};

/** Кадр сцены, когда звучит первое акцентное слово фразы */
const accentFrame = (text: string, words: WordTime[] | undefined, offset: number, from: number) => {
  const acc = parse(text).find((t) => t.acc);
  if (!acc || !words?.length) return undefined;
  const b = bare(acc.t);
  const w = words.find((x) => same(bare(x.w), b));
  return w ? w.s + offset - 2 : undefined;
};

/**
 * Структурированный текст сцены: главный тезис (законченная мысль) появляется в начале
 * и держится всю сцену, акцентное слово выделяется, когда диктор его произносит.
 * Под ним — дополняющая строка, когда она звучит. Ничего не перетирается и не накладывается.
 */
export const Headline: React.FC<{
  headline?: string;
  subline?: string;
  words?: WordTime[];
  offset: number;
  duration: number;
  from?: number;
  variant?: 'hero' | 'caption';
  maxWidth: number;
  align?: 'center' | 'left';
  seed?: string;
  color?: string;
  subColor?: string;
  accent?: string;
  accent2?: string;
  tail?: number;
}> = ({headline, subline, words, offset, duration, from = 4, variant = 'hero', maxWidth, align = 'center', seed = 'h', color, subColor, accent, accent2, tail = 14}) => {
  const hero = variant === 'hero';
  const end = duration - tail;
  const ink = color ?? palette.ink;
  const acc = accent ?? palette.accent;
  const acc2 = accent2 ?? palette.accent2;
  const hAt = from;
  const pattern = HERO[Math.floor(random(`${seed}-hp`) * HERO.length)];
  const hAccent = headline ? accentFrame(headline, words, offset, hAt) : undefined;
  const subCue = subline ? keyCues([subline], words, {offset, duration, from: headline ? hAt + 26 : from, minHold: 30, tail})[0] : undefined;
  const sAccent = subline && subCue ? accentFrame(subline, words, offset, subCue.at) : undefined;
  const hSize = hero ? {max: subline ? 150 : 180, min: 80, lines: 2} : {max: 92, min: 54, lines: 3};
  const sSize = hero ? {max: 64, min: 40, lines: 2} : {max: 52, min: 34, lines: 2};
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: hero ? 36 : 26}}>
      {headline ? (
        <Phrase
          cue={{text: headline, at: hAt, end, idx: 0}}
          pattern={pattern}
          hero={hero}
          maxWidth={maxWidth}
          align={align}
          ink={ink}
          acc={acc}
          acc2={acc2}
          accentAt={hAccent !== undefined ? Math.max(12, hAccent - hAt) : undefined}
          size={hSize}
        />
      ) : null}
      {subline && subCue ? (
        <Phrase
          cue={{...subCue, end}}
          pattern={random(`${seed}-sp`) > 0.5 ? 'mask' : 'wipe'}
          hero={false}
          maxWidth={maxWidth}
          align={align}
          ink={subColor ?? ink}
          acc={acc}
          acc2={acc2}
          accentAt={sAccent !== undefined ? Math.max(8, sAccent - subCue.at) : undefined}
          size={sSize}
          noAutoAccent
        />
      ) : null}
    </div>
  );
};

/** Моменты, когда стоит «толкнуть» камеру: появление тезиса, строки под ним, акцент */
export const headlineBeats = (headline: string | undefined, subline: string | undefined, words: WordTime[] | undefined, offset: number, duration: number, from = 4) => {
  const out = [from];
  const a = headline ? accentFrame(headline, words, offset, from) : undefined;
  if (a !== undefined && a > from + 12) out.push(a);
  const sc = subline ? keyCues([subline], words, {offset, duration, from: from + 26, minHold: 30})[0] : undefined;
  if (sc) out.push(sc.at);
  return out.sort((x, y) => x - y);
};
