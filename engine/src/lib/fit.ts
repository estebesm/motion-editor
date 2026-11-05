import widths from './glyph-widths.json';

let W = widths as Record<string, number>;
/** Свой шрифт ролика — свои ширины глифов (по умолчанию Dela Gothic One) */
export const setGlyphs = (g?: Record<string, number>) => {
  W = g ?? (widths as Record<string, number>);
};
const FALLBACK = 0.75;

/** Ширина строки в em (Dela Gothic One) с учётом трекинга. */
export const textWidthEm = (text: string, tracking = 0) => {
  const chars = Array.from(text);
  return chars.reduce((s, c) => s + (W[c] ?? FALLBACK), 0) + chars.length * tracking;
};

/**
 * Подбирает размер шрифта, чтобы текст влез в maxWidth.
 * Если при одной строке шрифт меньше minSize — разбивает на строки по словам.
 */
export const fitText = (
  text: string,
  {maxWidth, maxSize, minSize = maxSize * 0.45, maxLines = 3, tracking = 0.02}: {
    maxWidth: number;
    maxSize: number;
    minSize?: number;
    maxLines?: number;
    tracking?: number;
  },
): {lines: string[]; size: number} => {
  const words = text.trim().split(/\s+/);
  // Перебираем 1..maxLines строк; лишнюю строку добавляем, только если шрифт
  // становится заметно крупнее (>15%) или иначе не влезаем в minSize.
  let best: {lines: string[]; size: number} | null = null;
  for (let n = 1; n <= Math.min(maxLines, words.length); n++) {
    const lines = splitBalanced(words, n);
    const widest = Math.max(...lines.map((l) => textWidthEm(l, tracking)));
    const size = Math.min(maxSize, maxWidth / widest);
    if (!best || best.size < minSize || size > best.size * 1.15) best = {lines, size};
    if (size >= maxSize) break;
  }
  return {lines: best!.lines, size: Math.floor(best!.size)};
};

/** Делит слова на n строк так, чтобы самая длинная строка была минимальной. */
const splitBalanced = (words: string[], n: number): string[] => {
  if (n === 1) return [words.join(' ')];
  let best: string[] = [];
  let bestW = Infinity;
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const w = Math.max(...lines.map((l) => textWidthEm(l)));
      if (w < bestW) {
        bestW = w;
        best = lines;
      }
      return;
    }
    for (let i = start + 1; i <= words.length - left + 1; i++) {
      rec(i, left - 1, [...acc, words.slice(start, i).join(' ')]);
    }
  };
  rec(0, n, []);
  return best;
};
