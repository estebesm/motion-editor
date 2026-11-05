import {generateJson} from './gemini.ts';
import {MANNERS, PACES, type Settings} from './settings.ts';
import type {Source} from './sources.ts';

/**
 * Сценарист: превращает исходный текст в связную озвучку для видео,
 * сразу разбитую на «биты» — смысловые куски, каждый станет одной сценой.
 */

const SYSTEM = `Ты — сильный сценарист и редактор закадрового текста для коротких motion-видео на русском
(уроки, объясняющие ролики, инструкции). Твоя задача — из исходного текста автора сделать текст озвучки,
который приятно и понятно слушать, и разбить его на биты (сцены).

КАК ПИСАТЬ:
- Это текст для уха, а не для чтения. Короткие и средние предложения, живой разговорный язык, без канцелярита,
  без скобок, сносок, точек с запятой, перечислений через двоеточие на полстраницы.
- Подача связная: каждый бит логично вытекает из предыдущего, между частями — естественные переходы
  («Начнём с…», «А если…», «Но важно помнить…», «Дальше…»). Слушатель всегда понимает, к чему идёт рассказ.
- Начало цепляет и сразу объясняет, о чём урок. Новые термины объясняй простыми словами, когда они впервые звучат.
  Финал подводит итог: ключевые пункты одной-двумя фразами.
- Если исходный текст уже хорошо звучит — меняй минимально. Если не подходит для видео — смело перестраивай:
  меняй порядок, объединяй и разбивай мысли, убирай повторы и воду.

ЧТО НЕЛЬЗЯ:
- Терять содержание: сохрани все факты, названия, цифры, примеры, оговорки, ограничения и предупреждения
  (особенно о рисках, гарантиях, юридически значимые формулировки — их смысл не смягчай).
- Добавлять то, чего нет в исходнике: новые факты, функции, обещания, оценки («безопасно», «лучший», «удобно»,
  «выгодно»), если автор этого не говорил.

ДВЕ ВЕРСИИ КАЖДОГО БИТА:
- text — как текст покажется на экране: нормальная орфография, бренды и термины как в исходнике (Windows, Excel, USB).
- speech — то же самое слово в слово, но для диктора: всё латиницей, аббревиатуры, числа, проценты и символы
  написаны кириллицей так, как их произносят по-русски (Windows → Виндоус, Excel → Эксель, USB → Ю-Эс-Би,
  PDF → Пэ-Дэ-Эф, iPhone → айфон, 10% → десять процентов). В speech не должно остаться ни одной латинской буквы.

БИТЫ:
- Каждый бит — одна законченная мысль: 1–2 предложения, 12–30 слов (5–11 секунд речи), не длиннее 200 символов.
  Битов много: примерно один на каждые 150 символов текста.
- Если у автора есть файлы (картинки, записи экрана), бит, где речь о показанном на них, пусть описывает именно это —
  так картинка и голос совпадут. Но не пиши «на экране вы видите», если это неестественно.
- Названия брендов пиши так же, как в исходном тексте.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    beats: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {text: {type: 'STRING'}, speech: {type: 'STRING'}},
        required: ['text', 'speech'],
      },
    },
  },
  required: ['beats'],
};

/** Фрагмент озвучки: text — на экран, speech — диктору (латиница записана кириллицей). */
export type Beat = {text: string; speech: string};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Подставляет произношение из словаря автора (prompt.txt → «Произношение»). */
export function applyPronunciation(text: string, pron: Record<string, string> = {}): string {
  let out = text;
  for (const [from, to] of Object.entries(pron).sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(from)}(?![\\p{L}\\p{N}])`, 'giu'), to);
  }
  return out;
}

const sentences = (t: string) => t.split(/(?<=[.!?…])\s+(?=[«"A-ZА-ЯЁ0-9])/u).filter(Boolean);

/** Делит пару «экран/диктор» по одним и тем же границам предложений (~180 символов на кусок). */
function splitPair(text: string, speech: string, maxChars = 180): Beat[] {
  const T = sentences(text);
  const S = sentences(speech);
  if (T.length < 2 || T.length !== S.length) return [{text, speech}];
  const out: Beat[] = [];
  let ct: string[] = [];
  let cs: string[] = [];
  T.forEach((t, i) => {
    if (ct.length && [...ct, t].join(' ').length > maxChars) {
      out.push({text: ct.join(' '), speech: cs.join(' ')});
      ct = [];
      cs = [];
    }
    ct.push(t);
    cs.push(S[i]);
  });
  if (ct.length) out.push({text: ct.join(' '), speech: cs.join(' ')});
  return out;
}

/** Оценочные слова, которые ИИ любит добавлять от себя (для финансов это недопустимо) */
export const CLAIMS = ['безопасн', 'надежн', 'выгодн', 'удобн', 'лучш', 'сбалансир', 'легк', 'идеальн', 'комфортн', 'мгновенн', 'бесплатн', 'гарант', 'уникальн', 'надёжн', 'лёгк', 'эффективн', 'прибыльн', 'прозрачн', 'крупнейш', 'гигант', 'умн', 'мощн', 'прост', 'полност', 'максимальн', 'выгод', 'защищ', 'точн', 'успешн', 'современн', 'инновац', 'продвинут', 'профессиональн', 'гибк', 'нагляд', 'предельн', 'стейбл', 'популярн', 'надёжн', 'самы'];
const low = (t: string) => t.toLowerCase().replace(/ё/g, 'е');

/** Слова-оценки из текста озвучки, которых не было в исходном сценарии. */
export function addedClaims(source: string, beats: Beat[]): string[] {
  const src = low(source);
  const found = new Set<string>();
  for (const b of beats) {
    for (const w of low(b.text).match(/\p{L}+/gu) ?? []) {
      const stem = CLAIMS.map(low).find((c) => w.startsWith(c));
      if (stem && !src.includes(stem)) found.add(w);
    }
  }
  return [...found];
}

/** Дословный режим: текст не меняется, только делится; диктору — со словарём произношения. */
export function verbatimBeats(text: string, pron: Record<string, string> = {}): Beat[] {
  return splitBeats(text).map((t) => ({text: t, speech: applyPronunciation(t, pron)}));
}

/** Режем текст по предложениям в куски по ~200 символов, ничего не меняя. */
export function splitBeats(text: string, maxChars = 220): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[«"A-ZА-ЯЁ0-9])/u)
    .filter(Boolean);
  const beats: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + ' ' + s).length > maxChars) {
      beats.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) beats.push(cur);
  return beats;
}

export async function writeScript(opts: {
  scenario: string;
  sources: Source[];
  settings: Settings;
  wishes?: string;
}): Promise<Beat[]> {
  const {scenario, sources, settings: s} = opts;
  const manner = s.manner === 'custom' ? s.customManner : MANNERS.find((m) => m.id === s.manner)?.label;
  const cps = PACES[s.pace].cps;
  const length =
    s.textMode === 'shorten'
      ? `Итоговый текст должен звучать примерно ${s.targetSeconds ?? 30} секунд — это около ${Math.round((s.targetSeconds ?? 30) * cps)} символов. Оставь самое главное, но предупреждения о рисках сохрани.`
      : `Длина — примерно как у исходника или короче за счёт воды и повторов (исходник ≈ ${scenario.length} символов), но без потери содержания.`;
  const visuals = sources.filter((x) => x.kind !== 'audio');

  const parts = [
    {text: `ИСХОДНЫЙ ТЕКСТ АВТОРА:\n"""\n${scenario.trim()}\n"""`},
    {
      text: [
        'ТРЕБОВАНИЯ:',
        `- ${length}`,
        manner ? `- Манера озвучки: ${manner.toLowerCase()} — пиши текст, который ложится на такую подачу.` : '',
        s.cta ? `- Видео заканчивается призывом: «${s.cta}» — подведи к нему последний бит.` : '',
        visuals.length ? `- Файлы автора (название описывает содержимое): ${visuals.map((v) => `«${v.name}»`).join(', ')}.` : '',
        s.pronounce && Object.keys(s.pronounce).length
          ? `- Произношение (в speech пиши именно так): ${Object.entries(s.pronounce).map(([a, b]) => `${a} → ${b}`).join(', ')}.`
          : '',
        opts.wishes?.trim() ? `- ПОЖЕЛАНИЯ АВТОРА — обязательно учти:\n${opts.wishes.trim()}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const clean = (t: string) => t.replace(/\s+/g, ' ').trim();
  let feedback = '';
  let fallback: Beat[] | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const extra = feedback ? [{text: `В прошлой попытке были ошибки — исправь: ${feedback}`}] : [];
    const out = await generateJson<{beats: Beat[]}>([...parts, ...extra], SCHEMA, {system: SYSTEM});
    const beats: Beat[] = [];
    for (const b of out.beats ?? []) {
      const text = clean(b.text ?? '');
      if (!text) continue;
      const speech = applyPronunciation(clean(b.speech || text), s.pronounce);
      // Длинные биты дробим по предложениям: сцена дольше ~15 с смотрится скучно
      beats.push(...(text.length > 240 ? splitPair(text, speech) : [{text, speech}]));
    }
    if (beats.length < 2) continue;
    const added = addedClaims(scenario, beats);
    const latin = beats.filter((b) => /[a-z]/i.test(b.speech)).map((b) => b.speech.match(/[a-z][a-z0-9-]*/gi)?.join(', '));
    if (!added.length && !latin.length) return beats;
    fallback = beats;
    feedback = [
      added.length ? `добавлены оценки, которых нет в исходнике: ${added.join(', ')} — убери их` : '',
      latin.length ? `в speech осталась латиница (${latin.join('; ')}) — запиши кириллицей` : '',
    ]
      .filter(Boolean)
      .join('; ');
  }
  if (fallback) return fallback;
  throw new Error('Не удалось переписать сценарий: ИИ вернул пустой текст');
}
