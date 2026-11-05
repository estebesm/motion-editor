import type {Theme} from '../../src/video/types.ts';

export type Settings = {
  textMode: 'verbatim' | 'edit' | 'shorten';
  targetSeconds?: number;
  voice: string;
  manner: string; // id из MANNERS или 'custom'
  customManner?: string;
  pace: keyof typeof PACES;
  theme: 'dark' | 'light';
  accentSource: 'preset' | 'custom' | 'images';
  accent: string;
  accent2: string;
  dynamics: keyof typeof DYNAMICS;
  music?: string; // путь относительно папки задачи
  subtitles: boolean;
  /** Звуковые эффекты (пролёты на склейках, попы на пунктах, логотип, финал): да / тихо / нет */
  sfx?: 'on' | 'soft' | 'off';
  cta?: string;
  quality: 'draft' | 'final' | '4k';
  /** Как диктору произносить названия: «Excel» → «Эксель» */
  pronounce?: Record<string, string>;
  /** Шрифт заголовков: файл из sources или engine/public/fonts (по умолчанию Dela Gothic One) */
  font?: string;
  /** Свой цвет фона (HEX) вместо цвета темы */
  bg?: string;
  /** Фирменные ленты на фоне и диагональная шторка на склейках */
  ribbons?: boolean;
  /** Без озвучки (флаг --без-звука): тайминги слов — по темпу речи, звука в ролике нет */
  silent?: boolean;
};

export const VOICES = [
  {id: 'Charon', label: 'Charon', hint: 'мужской, низкий, повествовательный'},
  {id: 'Orus', label: 'Orus', hint: 'мужской, твёрдый, уверенный'},
  {id: 'Puck', label: 'Puck', hint: 'мужской, бодрый'},
  {id: 'Sadachbia', label: 'Sadachbia', hint: 'мужской, живой'},
  {id: 'Fenrir', label: 'Fenrir', hint: 'мужской, азартный'},
  {id: 'Achird', label: 'Achird', hint: 'мужской, дружелюбный'},
  {id: 'Iapetus', label: 'Iapetus', hint: 'мужской, чистый'},
  {id: 'Zephyr', label: 'Zephyr', hint: 'женский, яркий'},
  {id: 'Laomedeia', label: 'Laomedeia', hint: 'женский, бодрый'},
  {id: 'Leda', label: 'Leda', hint: 'женский, молодой'},
  {id: 'Kore', label: 'Kore', hint: 'женский, уверенный'},
  {id: 'Aoede', label: 'Aoede', hint: 'женский, лёгкий'},
  {id: 'Sulafat', label: 'Sulafat', hint: 'женский, тёплый'},
];

export const MANNERS = [
  {id: 'teacher', label: 'Как преподаватель: ясно и дружелюбно', style: 'clear, friendly and engaging teacher explaining step by step, confident and warm'},
  {id: 'cinematic', label: 'Спокойная кинематографичная', style: 'calm, confident and warm cinematic voice-over'},
  {id: 'warm', label: 'Доверительная, тёплая', style: 'intimate, warm and sincere, like talking to a close friend'},
  {id: 'energetic', label: 'Энергичная', style: 'energetic, upbeat and lively voice-over, smiling'},
];

export const PACES = {
  slow: {label: 'Медленнее', style: 'slow, unhurried pace with noticeable pauses', cps: 10},
  normal: {label: 'Обычный', style: 'natural pace', cps: 13},
  fast: {label: 'Быстрее', style: 'brisk, fast pace', cps: 16},
};

export const ACCENTS = [
  {id: 'fire', label: 'Огненный', accent: '#ff4d2e', accent2: '#7b5cff'},
  {id: 'violet', label: 'Фиолетовый', accent: '#8b5cff', accent2: '#ff4fa3'},
  {id: 'lime', label: 'Лаймовый', accent: '#b8f53a', accent2: '#2ee6a6'},
  {id: 'sky', label: 'Голубой', accent: '#3db8ff', accent2: '#7b5cff'},
  {id: 'gold', label: 'Золотой', accent: '#ffb627', accent2: '#ff4d2e'},
];

export const DYNAMICS = {
  calm: {label: 'Плавно', hint: 'медленные переходы, почти без тряски', transition: 24, tail: 36, shake: 0.5},
  balanced: {label: 'Сбалансированно', hint: 'средний темп монтажа', transition: 18, tail: 30, shake: 1},
  energetic: {label: 'Энергично', hint: 'быстрые переходы, живая камера', transition: 20, tail: 22, shake: 1.7},
  clip: {label: 'Клипово', hint: 'каждая фраза — свой кадр, монтаж в ритм речи', transition: 14, tail: 12, shake: 0.5},
};

export const DEFAULT_SETTINGS: Settings = {
  textMode: 'edit',
  voice: 'Charon',
  manner: 'teacher',
  pace: 'normal',
  theme: 'dark',
  accentSource: 'preset',
  accent: ACCENTS[0].accent,
  accent2: ACCENTS[0].accent2,
  dynamics: 'balanced',
  subtitles: false,
  quality: 'final',
};

export const voiceStyle = (s: Settings) => {
  const manner = s.manner === 'custom' ? s.customManner : MANNERS.find((m) => m.id === s.manner)?.style;
  return [manner, PACES[s.pace].style].filter(Boolean).join('; ');
};

export const isHex = (v: string) => /^#?[0-9a-fA-F]{6}$/.test(v.trim());
export const normHex = (v: string) => '#' + v.trim().replace('#', '').toLowerCase();

/** Второй акцент для градиентов: тот же цвет, повёрнутый по кругу оттенков. */
export const secondAccent = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360 + 140) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * Math.max(s, 0.6);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [rr, gg, bb] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [rr, gg, bb].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
};

export const buildTheme = (s: Settings): Theme => ({
  ...(s.theme === 'light'
    ? {bg: '#f1eee7', ink: '#0d0d12', muted: '#8a8794', light: true}
    : {bg: '#07070c', ink: '#f3efe6', muted: '#5c5a66', light: false}),
  ...(s.bg ? {bg: s.bg} : {}),
  accent: s.accent,
  accent2: s.accent2,
  shake: DYNAMICS[s.dynamics].shake,
  clip: s.dynamics === 'clip',
  ...(s.ribbons ? {ribbons: true} : {}),
});
