// Генерирует таблицу ширин глифов шрифта (в долях em) для детерминированной
// подгонки размера текста без измерения в браузере.
import fs from 'node:fs';
import opentype from 'opentype.js';

const font = opentype.parse(fs.readFileSync('public/fonts/DelaGothicOne-Regular.ttf').buffer);
const chars =
  'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' +
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' +
  ' .,:;!?-–—«»"\'()+%№/&@#₽$€*';
const widths = {};
for (const ch of chars) {
  const g = font.charToGlyph(ch);
  widths[ch] = +(g.advanceWidth / font.unitsPerEm).toFixed(4);
}
fs.writeFileSync('src/lib/glyph-widths.json', JSON.stringify(widths));
console.log('glyphs:', Object.keys(widths).length, 'Ж=', widths['Ж'], 'и=', widths['и'], 'space=', widths[' ']);
