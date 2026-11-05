import {execFileSync} from 'node:child_process';

/**
 * Вырезает однотонный светлый фон у логотипа и обрезает поля.
 * Фон — светлые пиксели, связанные с краем картинки (заливка от краёв), поэтому
 * белые детали внутри логотипа (буква на цветной плашке) не страдают.
 * Сглаженные края переводятся в полупрозрачность («цвет в альфу»).
 * На тёмной теме тёмно-серые надписи перекрашиваются в светлые, иначе их не видно.
 * Возвращает размеры результата или null, если фон не однотонный (оставляем как есть).
 */
export function cutoutLogo(src: string, dst: string, {darkTheme, ink = [243, 239, 230]}: {darkTheme: boolean; ink?: number[]}): {width: number; height: number} | null {
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]).toString().trim().split('\n');
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', src, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], {maxBuffer: 1 << 28});
  // У .ico несколько размеров — находим тот, что совпал по объёму
  const dims = probe.map((l) => l.split(',').map(Number)).find(([w, h]) => w * h * 4 === buf.length);
  if (!dims) return null;
  const [W, H] = dims;
  const px = new Uint8ClampedArray(buf);
  const at = (x: number, y: number) => (y * W + x) * 4;
  // Картинка в основном прозрачная (логотип-надпись с белыми буквами) — фоном считаем только прозрачное,
  // иначе заливка от краёв съест белые буквы, касающиеся края
  let alphaOnly = false;
  const isBg = (i: number) => {
    const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
    return a < 24 || (!alphaOnly && Math.min(r, g, b) > 190 && Math.max(r, g, b) - Math.min(r, g, b) < 50);
  };

  // Фон должен занимать большую часть рамки — иначе это не логотип на фоне
  let edge = 0;
  let edgeBg = 0;
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) (edge++, isBg(at(x, y)) && edgeBg++);
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) (edge++, isBg(at(x, y)) && edgeBg++);
  // Иконка с прозрачными углами (app icon) — тоже без карточки
  const cornersClear = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)].every((i) => px[i + 3] < 24);
  if (edgeBg / edge < 0.85 && !cornersClear) return null;
  // Фон уже прозрачный — только убираем рамку/поля, сглаженные края не трогаем
  let clear = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 24) clear++;
  const transparentBg = cornersClear || clear / (W * H) > 0.2;
  alphaOnly = clear / (W * H) > 0.35;

  // Заливка от краёв
  const bg = new Uint8Array(W * H);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const k = y * W + x;
    if (x < 0 || y < 0 || x >= W || y >= H || bg[k] || !isBg(k * 4)) return;
    bg[k] = 1;
    stack.push(k);
  };
  for (let x = 0; x < W; x++) (push(x, 0), push(x, H - 1));
  for (let y = 0; y < H; y++) (push(0, y), push(W - 1, y));
  while (stack.length) {
    const k = stack.pop()!;
    const x = k % W;
    const y = (k / W) | 0;
    push(x + 1, y), push(x - 1, y), push(x, y + 1), push(x, y - 1);
  }
  const alreadyTransparent = (k: number) => px[k * 4 + 3] < 24;

  // Пиксели рядом с фоном (до 2 px) — сглаживание: светлое → прозрачное
  const nearBg = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && bg[yy * W + xx]) return true;
      }
    return false;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const i = k * 4;
      if (bg[k]) {
        px[i + 3] = 0;
        continue;
      }
      if (transparentBg || !nearBg(x, y) || alreadyTransparent(k)) continue;
      const aw = Math.max(255 - px[i], 255 - px[i + 1], 255 - px[i + 2]) / 255;
      if (aw <= 0.01) {
        px[i + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) px[i + c] = 255 - (255 - px[i + c]) / aw;
      px[i + 3] = Math.round(px[i + 3] * aw);
    }

  // Тёмные ненасыщенные части (чёрный текст) — светлыми на тёмной теме
  if (darkTheme)
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] === 0) continue;
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 50 && lum < 110) [px[i], px[i + 1], px[i + 2]] = ink;
    }

  // Обрезаем пустые поля
  let [x0, y0, x1, y1] = [W, H, -1, -1];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (px[at(x, y) + 3] > 16) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
  [x0, y0, x1, y1] = [Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(W - 1, x1 + pad), Math.min(H - 1, y1 + pad)];
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) Buffer.from(px.buffer, at(x0, y0 + y), w * 4).copy(out, y * w * 4);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', dst], {input: out});
  return {width: w, height: h};
}
