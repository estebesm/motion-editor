import {loadFont} from '@remotion/fonts';
import {Easing, staticFile} from 'remotion';
import type {Theme} from './video/types';

import {setGlyphs} from './lib/fit';

const DEFAULT_FONT = 'Dela Gothic One';
/** Шрифт заголовков. По умолчанию Dela Gothic One; ролик может задать свой (Theme.font) — меняется в applyTheme */
export let FONT_FAMILY = DEFAULT_FONT;
export const FONT_URL = staticFile('fonts/DelaGothicOne-Regular.ttf');

loadFont({family: DEFAULT_FONT, url: FONT_URL});
const loaded = new Set<string>();

export const DEFAULT_THEME: Theme = {
  bg: '#07070c',
  ink: '#f3efe6',
  muted: '#5c5a66',
  accent: '#ff4d2e',
  accent2: '#7b5cff',
  light: false,
  shake: 1,
};

/**
 * Текущая палитра. Меняется один раз в начале рендера через applyTheme()
 * (каждый рендер — одна тема, поэтому общий объект безопасен и детерминирован).
 */
export const palette = {...DEFAULT_THEME};
export const motion = {shake: 1};

export const applyTheme = (t?: Partial<Theme>) => {
  Object.assign(palette, DEFAULT_THEME, t ?? {});
  motion.shake = palette.shake;
  const f = t?.font;
  if (f && !loaded.has(f.family)) {
    loaded.add(f.family);
    loadFont({family: f.family, url: f.url.startsWith('http') ? f.url : staticFile(f.url)});
  }
  FONT_FAMILY = f?.family ?? DEFAULT_FONT;
  setGlyphs(f?.glyphs);
};

/** Цвет мягких пятен-подсветок: светлый второй акцент (жёлтый) полупрозрачным на тёмном фоне грязнится в оливковый */
export const glowColor = () => {
  const m = /^#([0-9a-f]{6})$/i.exec(palette.accent2.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  const luma = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return !palette.light && luma > 0.6 ? palette.accent : palette.accent2;
};

/** Цвет с прозрачностью через color-mix (работает с любым CSS-цветом). */
export const alpha = (color: string, a: number) =>
  `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
export const mix = (a: string, b: string, aShare: number) =>
  `color-mix(in srgb, ${a} ${Math.round(aShare * 100)}%, ${b})`;

// «Кинематографичные» кривые
export const ease = {
  cinematic: Easing.bezier(0.65, 0, 0.35, 1),
  out: Easing.bezier(0.16, 1, 0.3, 1),
  in: Easing.bezier(0.7, 0, 0.84, 0),
};
