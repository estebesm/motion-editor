import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {durationSec, finalizeVoice, maxPlausibleSec} from './audio.ts';
import {QuotaError, transcribe, tts} from './gemini.ts';

// ------------------------------------------------------------------ проверка озвучки

const LAT: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'дж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
  p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', y: 'и', z: 'з',
};
/** Латиницу распознавания переводим в кириллицу: «Excel» ≈ «эксель» */
const translit = (t: string) => t.toLowerCase().replace(/[a-z]/g, (c) => LAT[c] ?? c);
const letters = (t: string) => translit(t).replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tokens = (t: string) => letters(t).split(' ').filter((w) => w.length >= 3);
const near = (a: string, b: string) => a.slice(0, 4) === b.slice(0, 4) || (Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));

/**
 * Насколько распознанная речь совпадает с текстом: 1 — идеально.
 * Ловит зачитанные инструкции (лишние слова), повторы (длина) и переход на английский (латиница).
 */
export function speechScore(expected: string, heard: string): number {
  const exp = tokens(expected);
  const got = tokens(heard);
  if (!exp.length || !got.length) return 0;
  const recall = exp.filter((w) => got.some((g) => near(w, g))).length / exp.length;
  const precision = got.filter((g) => exp.some((w) => near(w, g))).length / got.length;
  const lenRatio = letters(heard).length / Math.max(1, letters(expected).length);
  const lenPenalty = lenRatio > 1.25 ? Math.max(0, 1 - (lenRatio - 1.25) * 2) : 1;
  // Целые английские фразы (3+ латинских слова подряд) — диктор перешёл на английский
  // Латинские слова, которые есть в самом тексте (бренды: Excel, USB), английской речью не считаем
  const allowed = new Set((expected.match(/[a-z]+/gi) ?? []).map((w) => w.toLowerCase()));
  const foreign = heard.replace(/[a-z]+/gi, (w) => (allowed.has(w.toLowerCase()) ? '·' : w));
  const english = /([a-z]{2,}[\s,.'-]+){3,}/i.test(foreign) ? 0.4 : 1;
  return Math.min(recall, precision) * lenPenalty * english;
}

const GOOD = 0.8;
let transcribeQuotaWarned = false;

/** Где лежит озвучка фрагмента в кэше (есть ли — проверяйте fs.existsSync) */
export const clipPath = (speech: string, {voice, style, model, cacheDir}: {voice: string; style: string; model: string; cacheDir: string}) =>
  path.join(cacheDir, `${crypto.createHash('sha1').update(JSON.stringify([model, voice, style, speech, 2])).digest('hex').slice(0, 16)}.wav`);

/**
 * Озвучка фрагмента с проверкой: распознаём результат и сравниваем с текстом.
 * Если диктор сбился (зачитал заметки, повторил фразу, заговорил по-английски) — переозвучиваем.
 * Возвращает путь к готовому wav в кэше.
 */
export async function voiceClip(
  speech: string,
  {voice, style, model, cacheDir, log, display}: {
    voice: string;
    style: string;
    model: string;
    cacheDir: string;
    log?: (m: string) => void;
    /** Экранная версия текста: распознавание пишет бренды латиницей, как в ней */
    display?: string;
  },
): Promise<string> {
  const out = clipPath(speech, {voice, style, model, cacheDir});
  if (fs.existsSync(out)) return out;
  fs.mkdirSync(cacheDir, {recursive: true});

  let best = {score: -1, file: ''};
  for (let attempt = 1; attempt <= 4; attempt++) {
    const tmp = out.replace(/\.wav$/, `.try${attempt}.wav`);
    try {
      const {data, mime} = await tts(speech, {voice, style, model});
      finalizeVoice(data, mime, tmp);
      let heard: string;
      try {
        heard = await transcribe(fs.readFileSync(tmp));
      } catch (e) {
        // Лимит у модели распознавания — принимаем озвучку без проверки, а не роняем всё видео
        if (!(e instanceof QuotaError)) throw e;
        if (!transcribeQuotaWarned) log?.(`${e.message} — озвучка дальше без проверки`);
        transcribeQuotaWarned = true;
        best = {score: 1, file: tmp};
        break;
      }
      // Распознавание слышит только слова: растянутую фразу или посторонние звуки после неё ловим по длительности
      const tooLong = durationSec(tmp) > maxPlausibleSec(speech);
      const score = Math.max(speechScore(speech, heard), display ? speechScore(display, heard) : 0) * (tooLong ? 0.5 : 1);
      if (tooLong) heard = `${heard} [звучит ${durationSec(tmp).toFixed(1)} с — слишком долго]`;
      if (score > best.score) {
        if (best.file) fs.rmSync(best.file, {force: true});
        best = {score, file: tmp};
      } else fs.rmSync(tmp, {force: true});
      if (score >= GOOD) break;
      log?.(`озвучка «${speech.slice(0, 40)}…» не совпала с текстом (${Math.round(score * 100)}%: «${heard.slice(0, 60)}…») — переозвучиваю`);
    } catch (e) {
      fs.rmSync(tmp, {force: true});
      if (e instanceof QuotaError) throw e;
      if (attempt === 4 && !best.file) throw e;
    }
  }
  if (best.score < GOOD) log?.(`озвучка «${speech.slice(0, 40)}…»: лучший вариант совпал на ${Math.round(best.score * 100)}%`);
  fs.renameSync(best.file, out);
  return out;
}

/** Параллельно, но не больше `limit` задач одновременно. */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  await Promise.all(
    Array.from({length: Math.min(limit, items.length)}, async () => {
      while (next < items.length && !failed) {
        const i = next++;
        try {
          res[i] = await fn(items[i], i);
        } catch (e) {
          failed = true; // остальные не берут новые задачи
          throw e;
        }
      }
    }),
  );
  return res;
}

// ------------------------------------------------------------------ тайминг слов

export type WordTime = {w: string; s: number; e: number};

const silences = (file: string): [number, number][] => {
  const log = spawnSync('ffmpeg', ['-i', file, '-af', 'silencedetect=noise=-36dB:d=0.1', '-f', 'null', '-']).stderr.toString();
  const st = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const en = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  return st.map((a, i) => [a, en[i] ?? durationSec(file)] as [number, number]).filter(([a, b]) => b - a >= 0.1);
};

/** «Вес» слова ≈ число слогов: по гласным, для латиницы — по произношению из словаря. */
const weight = (word: string, pron: Record<string, string>) => {
  const bare = word.replace(/[^\p{L}\p{N}-]/gu, '');
  const said = pron[bare.toLowerCase()] ?? bare;
  const ru = said.match(/[аеёиоуыэюя]/giu)?.length ?? 0;
  if (ru) return ru;
  if (/^[A-Z0-9]{2,6}$/.test(said)) return said.length; // аббревиатура: буква = слог
  const en = said.match(/[aeiouy]+/gi)?.length ?? 0;
  if (en) return en;
  return /\d/.test(said) ? said.length * 1.5 : 0.5;
};

/**
 * Когда звучит каждое слово экранного текста (секунды от начала клипа).
 * Слова раскладываются по слогам на участки речи, а знаки препинания притягиваются к паузам.
 */
export function wordTimings(file: string, text: string, pron: Record<string, string> = {}): WordTime[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const total = durationSec(file);
  const sil = silences(file).filter(([a, b]) => a > 0.05 && b < total - 0.05);
  const w = words.map((x) => Math.max(0.5, weight(x, pron)));
  const cum = [0];
  for (const x of w) cum.push(cum[cum.length - 1] + x);
  const W = cum[cum.length - 1];

  // Начальная оценка: равномерно по «чистой» речи
  const speechTotal = total - sil.reduce((s, [a, b]) => s + (b - a), 0);
  const toReal = (t: number) => {
    let acc = 0;
    let prev = 0;
    for (const [a, b] of sil) {
      if (t <= acc + (a - prev)) return prev + (t - acc);
      acc += a - prev;
      prev = b;
    }
    return prev + (t - acc);
  };
  const guess = (k: number) => toReal((cum[k] / W) * speechTotal);

  // Якоря: паузы ↔ границы слов со знаком препинания
  const anchors: {k: number; a: number; b: number}[] = [];
  const used = new Set<number>();
  for (const [a, b] of sil) {
    const mid = (a + b) / 2;
    let bestK = -1;
    let bestD = 0.8;
    for (let k = 1; k < words.length; k++) {
      if (used.has(k) || !/[.,:;!?…—–)»"]$/.test(words[k - 1])) continue;
      const d = Math.abs(guess(k) - mid);
      if (d < bestD) {
        bestD = d;
        bestK = k;
      }
    }
    if (bestK > 0) {
      used.add(bestK);
      anchors.push({k: bestK, a, b});
    }
  }
  anchors.sort((x, y) => x.k - y.k);
  // Отбрасываем якоря, нарушающие порядок по времени
  const ok: typeof anchors = [];
  for (const an of anchors) if (!ok.length || an.a > ok[ok.length - 1].b) ok.push(an);

  const pts = [{k: 0, t: 0}, ...ok.flatMap((an) => [{k: an.k, t: an.a, end: true}, {k: an.k, t: an.b}]), {k: words.length, t: total}];
  const times: WordTime[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const from = pts[i];
    const to = pts[i + 1];
    const span = cum[to.k] - cum[from.k] || 1;
    for (let k = from.k; k < to.k; k++) {
      const s = from.t + ((cum[k] - cum[from.k]) / span) * (to.t - from.t);
      const e = from.t + ((cum[k + 1] - cum[from.k]) / span) * (to.t - from.t);
      times.push({w: words[k], s: +s.toFixed(3), e: +e.toFixed(3)});
    }
  }
  return times;
}
