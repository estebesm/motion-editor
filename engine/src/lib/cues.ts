import type {WordTime} from '../video/types';

const stem = (w: string) => w.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5);

/**
 * Когда показывать каждый пункт (кадр сцены): в момент, когда диктор произносит его ключевое слово,
 * иначе — равномерно по длине речи. Порядок всегда сохраняется.
 */
export function cueFrames(labels: string[], words: WordTime[] | undefined, voiceDelay: number, speechFrames: number): number[] {
  const n = labels.length;
  const even = labels.map((_, i) => Math.round(voiceDelay + 4 + (i * speechFrames * 0.9) / Math.max(1, n)));
  if (!words?.length) return even;
  const ws = words.map((w) => stem(w.w));
  const out: number[] = [];
  let from = 0;
  labels.forEach((label, i) => {
    const keys = label.split(/\s+/).map(stem).filter((k) => k.length >= 3);
    let hit = -1;
    for (let j = from; j < ws.length && hit < 0; j++) if (keys.some((k) => ws[j].startsWith(k.slice(0, 4)) || k.startsWith(ws[j].slice(0, 4)) && ws[j].length >= 4)) hit = j;
    const t = hit >= 0 ? voiceDelay + words[hit].s - 4 : even[i];
    const prev = out[out.length - 1] ?? -Infinity;
    out.push(Math.max(t, prev + 8));
    if (hit >= 0) from = hit + 1;
  });
  return out;
}
