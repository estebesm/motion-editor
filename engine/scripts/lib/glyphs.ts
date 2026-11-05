import fs from 'node:fs';
// @ts-expect-error — у opentype.js нет типов
import opentype from 'opentype.js';

/** Символы, ширины которых нужны для подгонки текста (как в scripts/gen-glyph-widths.mjs) */
export const GLYPH_CHARS =
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  ' .,:;!?-–—«»"\'()+%№/&@#₽$€*';

/** Ширины глифов шрифта в долях em: текст подгоняется по размеру без измерения в браузере */
export function glyphWidths(file: string): Record<string, number> {
  const buf = fs.readFileSync(file);
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const out: Record<string, number> = {};
  for (const ch of GLYPH_CHARS) out[ch] = +(font.charToGlyph(ch).advanceWidth / font.unitsPerEm).toFixed(4);
  return out;
}
