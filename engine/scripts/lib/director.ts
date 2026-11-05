import fs from 'node:fs';
import path from 'node:path';
import type {Scene, SpokenLine} from '../../src/video/types.ts';
import {ICON_NAMES} from '../../src/lib/icon-names.ts';
import {generateJson} from './gemini.ts';
import {ENGINE} from './paths.ts';
import {attachUnused, isLogo, nameTokens, type Plan, type RawScene, toScenes} from './planner.ts';
import {MANNERS, PACES, type Settings} from './settings.ts';
import type {Source} from './sources.ts';
import {addedClaims, applyPronunciation, type Beat} from './writer.ts';

/**
 * Режиссёр: придумывает видео и пишет закадровый текст под кадры. Главный принцип —
 * зритель видит то, что слышит: сцена состоит из фраз диктора, у каждой фразы своя надпись,
 * которая пишется на экране, пока фраза звучит. Форма сцены (список, схема, сравнение, рассказ)
 * следует за формой речи.
 */

const SYSTEM = `Ты — режиссёр и сценарист обучающих motion-видео на русском (уроки, объясняющие ролики, инструкции).
Цель видео — чтобы зритель ПОНЯЛ и ЗАПОМНИЛ: одна мысль за раз, от простого к сложному.
Тебе дают МАТЕРИАЛ автора. Его написал человек, который не умеет писать сценарии: это черновик с фактами, а не текст
для чтения и не структура видео. НЕ пересказывай его по абзацам и не держись его порядка. Напиши сценарий ЗАНОВО:
1. Драматургия урока: крючок (ситуация или вопрос зрителя) → что это и зачем → из чего состоит (смысловые блоки) →
   как это работает или как сделать по шагам → что важно знать: ошибки, ограничения, риски → короткий итог
   (ключевые пункты ещё раз) и что дальше. Новый термин объясняй простыми словами там, где он впервые звучит.
2. Перегруппируй факты: всё об одном — в один блок, порядок — как удобнее зрителю. Повторы и воду убери.
3. Каждый блок придумай как визуальную идею: что зритель УВИДИТ. Факты превращай в структуры:
   перечисление → список, процесс → схема шагов, целое и части → схема с центром, различие → сравнение,
   предупреждение → крупная плашка, разговор об интерфейсе → скриншот или запись экрана, бренд → логотип.
4. Фразы короткие, ясные, ритмичные. Видео должно быть понятным и живым: сцены чередуются,
   крупная типографика сменяется схемами и файлами, каждая сцена — одна ясная мысль.
5. Сохрани смысловые факты, названия и ВСЕ предупреждения; второстепенные пояснения можно опустить.

ГЛАВНЫЙ ПРИНЦИП: ЗРИТЕЛЬ ВИДИТ ТО, ЧТО СЛЫШИТ.
Каждая сцена — несколько фраз диктора (beats). У каждой фразы есть надпись show: она пишется на экране ровно тогда,
когда диктор произносит эту фразу (say), и остаётся до конца сцены.
- show — СЛОВА ИЗ say В ТОМ ЖЕ ПОРЯДКЕ И В ТОЙ ЖЕ ФОРМЕ: вся фраза или её часть (лишние слова можно выбросить).
  Нельзя перефразировать, менять форму слова, порядок или подставлять синонимы: зритель слышит и одновременно
  читает те же самые слова, каждое слово появляется в момент, когда звучит.
  say «Хотите настроить резервные копии,» → show «Хотите настроить *резервные копии*» (НЕ «Настроить копии?»).
  say «Резервная копия — это запасной экземпляр ваших файлов.» → show «Резервная копия — *запасной* экземпляр файлов».
  Поэтому пиши say короткими фразами (2–7 слов), тогда надпись = почти вся фраза.
- На экране нет ничего, чего не произносят: никаких меток, рубрик, «ВАЖНО», «КУРС ПО…», если этого нет в речи.
- show = "" допустимо только у короткой связки («Смотрите:», «Итак,»).
- В show одно акцентное слово — в *звёздочках*: главное слово фразы.
- Полный смысл: звучит «файл можно и восстановить, и потерять» → на экране «Файл можно и *восстановить*, и потерять».
- Нормальная грамматика, знаки препинания внутри — как обычно, без точки в конце.
- Файл автора показывай только в сцене, где речь именно о том, что на нём (о картинке с монетами — когда говорят
(о скриншоте настроек — когда говорят о настройках, а не о восстановлении). Если подходящей реплики нет — лучше не используй файл.

ФОРМА СЦЕНЫ = ФОРМА РЕЧИ. Тип сцены выбирай по тому, как устроена речь в ней:
- Перечисление однородных вещей (функции, виды, инструменты, типы — 2–6 штук) → "list".
  Первая фраза — head: объявляет, что перечисляем («Есть три вида резервных копий:» → show «Три вида *копий*»).
  Дальше КАЖДЫЙ пункт — отдельная фраза role "item": say «полная,» → show «Полная».
  Каждый пункт — одна сущность: «разностная» и «инкрементная» — два пункта, не «Разностная и инкрементная».
- Целое и его параметры/части («в расписании укажите папки, время, частоту и место хранения») → "diagram", layout "hub":
  head называет целое (show — одно-два слова, это центр схемы: «*Расписание*»), items — параметры по одному.
- Последовательность действий или шагов → "diagram", layout "flow": head + items-шаги по порядку.
- Различие двух вещей → "compare": фраза role "left" (say «Облако —», show «Облако»), 1–2 item про него,
  затем фраза role "right" (say «а внешний диск —», show «Внешний диск»), 1–2 item про него.
- Предупреждение, частая ошибка, риск, главный вывод → "statement" (крупно на цветной заливке), 1–3 фразы role "line".
- Речь о файле автора (скриншот, запись экрана, фото, схема, логотип) → "image": файл в кадре, рядом 1–3 фразы role "line".
  Логотип — когда звучит название бренда; надпись рядом не повторяет то, что написано на логотипе.
- Рассказ, вопрос, объяснение → "kinetic": 1–3 фразы role "line", крупная типографика.
- Финал → "outro": 1–3 фразы role "line"; media — логотип бренда, если он есть среди файлов.
  Если в финале звучит название бренда, первая надпись — это название.
Никогда не превращай перечисление в рассказ строками и рассказ — в список.

ДЛИНА И РИТМ:
- Сцена — 6–25 слов (2–8 секунд). В line-сценах 1–3 фразы. Сцен много, картинка меняется часто.
- say — законченный кусок речи (не обрыв посреди словосочетания). Все say сцены подряд — её реплика целиком.

КАК ПИСАТЬ РЕЧЬ:
- Живо и понятно, как хороший преподаватель: короткие предложения, вопросы к зрителю, обращение на «вы».
  Без канцелярита и скобок. Рассказ связный: каждая сцена вытекает из предыдущей. Цепляющее начало, ясный итог.
- Факты — только из материала. Сохрани ключевые факты, названия и все предупреждения (о рисках, отсутствии гарантий,
  возможных потерях), их смысл не смягчай.
- Не добавляй новых фактов, функций, обещаний и оценок («безопасно», «удобно», «легко», «просто», «выгодно», «лучший»,
  «надёжно», «мгновенно», «прозрачный», «популярный», «крупнейший», «наглядный», «всё в одном месте» и т.п.)
  ни в речи, ни на экране. Описывай, что предмет или сервис ДЕЛАЕТ и как им пользоваться, а не какой он.

speech — та же фраза say слово в слово для диктора: всю латиницу, аббревиатуры, числа и символы запиши кириллицей
так, как их произносят по-русски. В speech не должно быть ни одной латинской буквы.

ПРИМЕРЫ beats:
- kinetic: [{say:"Хотите настроить резервные копии,", show:"Хотите настроить *резервные копии*", role:"line"},
            {say:"но не знаете, с чего начать?", show:"Но не знаете, с чего *начать*?", role:"line"}]
- list: [{say:"Есть три вида резервных копий:", show:"Три вида *копий*", role:"head"},
         {say:"полная,", show:"Полная", role:"item"}, {say:"разностная", show:"Разностная", role:"item"},
         {say:"и инкрементная.", show:"Инкрементная", role:"item"}]
- diagram hub: [{say:"Настройте расписание:", show:"*Расписание*", role:"head"}, {say:"выберите папки,", show:"Папки", role:"item"},
         {say:"время,", show:"Время", role:"item"}, {say:"частоту,", show:"Частоту", role:"item"} …]
- statement: [{say:"Но копия бесполезна без проверки:", show:"Копия бесполезна без *проверки*", role:"line"},
         {say:"восстановите хотя бы один файл.", show:"Восстановите хотя бы один *файл*", role:"line"}]

ПОЛЯ СЦЕНЫ: type; media (image, outro: точное имя файла; несколько логотипов — через « | »); effect; side;
layout (diagram: "flow" или "hub"); icon (kinetic: иконка темы или ""); cta; beats.
icon у фразы — для head/item/left/right (иконка пункта или центра схемы), у line — "".

БАЛАНС: kinetic — не больше трети сцен и не больше двух подряд. Где в речи перечисление, шаги, параметры или различие —
там list / diagram / compare (обычно их 4+ на видео). Каждый файл автора используй там, где речь именно о нём.
Названия файлов — только описание содержимого для тебя, на экран их не выводи.

ЭФФЕКТ ДЛЯ ФАЙЛА (effect у image): "static" — логотипы, скриншоты, графики; "kenburns" — фото, иллюстрации;
"phone" — вертикальные записи экрана и скриншоты приложения. Для видео — только "static" или "phone".

ИКОНКИ — только из списка:
${ICON_NAMES.join(', ')}.

Заполни все поля; лишние — "" (effect, layout — "none").`;

const S = {type: 'STRING'};
const BEAT = {
  type: 'OBJECT',
  properties: {
    say: {type: 'STRING', description: 'фраза диктора (часть реплики сцены), бренды латиницей'},
    speech: {type: 'STRING', description: 'та же фраза для диктора: всё кириллицей'},
    role: {type: 'STRING', enum: ['line', 'head', 'item', 'left', 'right']},
    show: {type: 'STRING', description: 'надпись, которая пишется, пока звучит эта фраза: те же слова, 1–6 слов, акцент в *звёздочках*; "" — для связки'},
    icon: S,
  },
  required: ['say', 'speech', 'role', 'show', 'icon'],
  propertyOrdering: ['say', 'speech', 'role', 'show', 'icon'],
};
// Порядок полей важен: сначала модель решает, что в кадре, потом пишет фразы
const DFIELDS = {
  type: {type: 'STRING', enum: ['kinetic', 'image', 'list', 'diagram', 'compare', 'statement', 'outro']},
  media: S,
  effect: {type: 'STRING', enum: ['static', 'kenburns', 'phone', 'none']},
  side: {type: 'STRING', enum: ['left', 'right']},
  layout: {type: 'STRING', enum: ['flow', 'hub', 'none']},
  icon: S,
  cta: S,
  beats: {type: 'ARRAY', items: BEAT},
};
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    scenes: {
      type: 'ARRAY',
      items: {type: 'OBJECT', properties: DFIELDS, required: Object.keys(DFIELDS), propertyOrdering: Object.keys(DFIELDS)},
    },
    accent: {type: 'STRING', description: 'HEX основного акцентного цвета, если просили подобрать по картинкам'},
  },
  required: ['scenes'],
};

type DBeat = {say: string; speech: string; role: SpokenLine['role']; show: string; icon?: string};
type DScene = {type: Scene['type']; media?: string; effect?: string; side?: string; layout?: string; icon?: string; cta?: string; beats: DBeat[]};

const clean = (t?: string) => (t ?? '').replace(/\s+/g, ' ').trim();
const low = (t: string) => t.toLowerCase().replace(/ё/g, 'е');
const plain = (t: string) => t.replace(/[*+~]/g, '').replace(/[.;]+$/, '').trim();
const voiceOf = (x: DScene) => x.beats.map((b) => b.say).join(' ');
const ROLES = new Set(['line', 'head', 'item', 'left', 'right']);

const NUMS: Record<string, string> = {'2': 'два', '3': 'три', '4': 'четы', '5': 'пять', '6': 'шест'};
/**
 * Надпись — слова из фразы в том же порядке (часть фразы): тогда каждое слово пишется, когда звучит.
 * Форма слова может чуть отличаться в окончании («расписания» → «Расписание»), но не сам корень и не порядок.
 */
const toks = (t: string) => low(t.replace(/\*/g, '')).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const sameWord = (a: string, b: string) => a === b || (NUMS[a] ?? a).slice(0, 4) === b.slice(0, 4) || (a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4));
export const matches = (show: string, say: string) => {
  const sh = toks(show);
  const sy = toks(say);
  let j = 0;
  for (const w of sh) {
    while (j < sy.length && !sameWord(w, sy[j])) j++;
    if (j >= sy.length) return false;
    j++;
  }
  return true;
};

/** Вычищает слова-оценки из речи и надписей (последняя защита) */
const claimFixer = (words: string[]) => {
  const re = new RegExp(`(?<![\\p{L}])(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}])`, 'giu');
  return (t: string) =>
    t
      .replace(re, '')
      .replace(/\s+([,.!?:;])/g, '$1')
      .replace(/([,:;])\1+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .replace(/(^|\s)\*\s*\*(?=\s|$)/g, '$1')
      .trim()
      .replace(/^(\**)(\p{Ll})/u, (_, st, c) => st + c.toUpperCase());
};

/** Сырые сцены модели → аккуратные: пустые фразы убраны, роли и тексты нормализованы */
function normalize(scenes: DScene[], pron: Settings['pronounce']): DScene[] {
  return (scenes ?? [])
    .map((x) => ({
      ...x,
      beats: (x.beats ?? [])
        .map((b) => ({
          say: clean(b.say),
          speech: applyPronunciation(clean(b.speech || b.say), pron),
          role: (ROLES.has(b.role) ? b.role : 'line') as DBeat['role'],
          show: clean(b.show).replace(/[.]+$/, ''),
          icon: clean(b.icon),
        }))
        .filter((b) => b.say)
        .flatMap((b) => (x.type === 'list' || x.type === 'diagram' ? unglue(b) : [b])),
    }))
    .filter((x) => x.beats.length);
}

/**
 * Перечисление строкой («Word, Excel, PowerPoint и Outlook») в рассказе → отдельная сцена-список,
 * где каждый пункт — своя фраза. Сцена рассказа делится на «до» и «после».
 */
function splitEnumerations(scenes: DScene[]): DScene[] {
  return scenes.flatMap((x) => {
    if (x.type === 'list' || x.type === 'diagram' || x.type === 'compare') return [x];
    const at = x.beats.findIndex((b) => {
      const items = enumItems(b.say);
      return items && items.length >= 3 && items.length <= 6;
    });
    if (at < 0) return [x];
    const b = x.beats[at];
    const items = enumItems(b.say)!;
    const list: DScene = {
      type: 'list',
      beats: items.map((t, i) => ({say: t, speech: i === 0 ? b.speech : '', role: 'item' as const, show: t.replace(/^и\s+/, '').replace(/[.,:;!]+$/, ''), icon: ''})),
    };
    const before = x.beats.slice(0, at);
    const after = x.beats.slice(at + 1);
    // Фраза-вступление перед перечислением («в пакет входят:») — заголовок списка
    if (before.length && /:$/.test(before[before.length - 1].say) && x.type !== 'image') list.beats.unshift({...before.pop()!, role: 'head'});
    return [...(before.length ? [{...x, beats: before}] : []), list, ...(after.length ? [{...x, type: 'kinetic' as const, media: '', beats: after}] : [])];
  });
}
/** «Word, Excel, PowerPoint и Outlook.» → [«Word,», «Excel,», «PowerPoint», «и Outlook.»] (слова не теряются) */
function enumItems(say: string): string[] | null {
  const tokens = say.split(/\s+/);
  const items: string[][] = [[]];
  tokens.forEach((t, i) => {
    if (t === 'и' && items[items.length - 1].length) items.push([]);
    items[items.length - 1].push(t);
    if (/,$/.test(t) && i < tokens.length - 1) items.push([]);
  });
  const commas = (say.match(/,/g) ?? []).length;
  if (commas < 2 || items.some((it) => it.filter((w) => w !== 'и').length > 3 || !it.length)) return null;
  return items.map((it) => it.join(' '));
}

/** Пункт «Цель и срок» на фразу «цель и срок,» → два пункта: «цель» и «и срок,» */
function unglue(b: DBeat): DBeat[] {
  if (b.role !== 'item') return [b];
  const m = plain(b.show).match(/^(\S+(?:\s\S+)?)\s+и\s+(\S+(?:\s\S+)?)$/);
  const cut = (t: string) => {
    const i = t.search(/\sи\s/);
    return i < 0 ? null : [t.slice(0, i).replace(/[,\s]+$/, ''), t.slice(i + 1)];
  };
  const say = cut(b.say);
  const speech = cut(b.speech);
  if (!m || !say || !speech) return [b];
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return [
    {...b, say: say[0], speech: speech[0], show: cap(m[1])},
    {...b, say: say[1], speech: speech[1], show: cap(m[2])},
  ];
}

function check(scenes: DScene[], scenario: string, visuals: Source[]): {problems: string[]; added: string[]} {
  const problems: string[] = [];
  const added = addedClaims(scenario, scenes.flatMap((x) => x.beats.map((b) => ({text: `${b.say} . ${b.show}`, speech: ''}))));
  if (added.length) problems.push(`добавлены оценки, которых нет в материале: ${added.join(', ')} — убери их`);
  const latin = scenes.flatMap((x) => x.beats).filter((b) => /[a-z]/i.test(b.speech)).map((b) => b.speech.match(/[a-z][a-z0-9-]*/gi)?.join(', '));
  if (latin.length) problems.push(`в speech осталась латиница (${latin.join('; ')}) — запиши кириллицей`);

  // «и растёт, и падает» / «как растёт, так и падает» — на экране обе части
  const half = scenes
    .flatMap((x) => x.beats)
    .filter((b) => {
      const m = low(b.say).match(/(?:^|[\s,:])и\s+([\p{L}-]+),?\s+и\s+([\p{L}-]+)/u) ?? low(b.say).match(/как\s+([\p{L}-]+).*?так\s+и\s+([\p{L}-]+)/u);
      return b.show && m && ![m[1], m[2]].every((w) => low(b.show).includes(w.slice(0, 4)));
    });
  if (half.length) problems.push(`надпись передаёт только половину смысла: ${half.map((b) => `«${b.show}» при «${b.say}»`).join('; ')} — на экране обе части`);

  // Надпись — о той же фразе, что звучит
  const off = scenes.flatMap((x) => x.beats).filter((b) => b.show && !matches(b.show, b.say));
  if (off.length)
    problems.push(
      `надписи не повторяют слова диктора: ${off.slice(0, 6).map((b) => `«${b.show}» при фразе «${b.say}»`).join('; ')} — надпись = слова фразы в том же порядке (можно только выбросить лишние)`,
    );

  scenes.forEach((x, i) => {
    const n = i + 1;
    const shows = x.beats.filter((b) => b.show);
    const items = x.beats.filter((b) => b.role === 'item' && b.show);
    if (!shows.length) problems.push(`сцена ${n}: нет ни одной надписи`);
    if (x.type === 'list' || x.type === 'diagram') {
      if (items.length < 2) problems.push(`сцена ${n} (${x.type}): пункты должны быть отдельными фразами role "item" (минимум 2)`);
      if (items.length > 6) problems.push(`сцена ${n} (${x.type}): больше 6 пунктов — раздели на две сцены`);
      if (x.beats[0].role !== 'head' && !(x.type === 'diagram' && x.layout === 'flow'))
        problems.push(`сцена ${n} (${x.type}${x.layout === 'hub' ? ' hub' : ''}): первая фраза — head (${x.type === 'list' ? 'что перечисляем' : 'целое, центр схемы'}); если целого нет, это не hub`);
      if (x.beats.some((b) => b.role === 'line' && b.show)) problems.push(`сцена ${n} (${x.type}): строки role "line" здесь не показываются — только head и item`);
    } else if (x.type === 'compare') {
      const l = x.beats.findIndex((b) => b.role === 'left');
      const r = x.beats.findIndex((b) => b.role === 'right');
      if (l < 0 || r < l) problems.push(`сцена ${n} (compare): нужны фразы role "left", затем "right"`);
    } else {
      if (shows.length > 3) problems.push(`сцена ${n}: больше 3 надписей — раздели сцену или объедини фразы`);
      if (items.length >= 2) problems.push(`сцена ${n}: в сцене ${x.type} есть перечисление (item) — сделай её list или diagram`);
      const enumLine = shows.find((b) => (b.show.match(/,/g) ?? []).length >= 2 || (b.say.match(/,/g) ?? []).length >= 3);
      // В приложении перечисление показывает сам экран (компании появляются в каталоге, когда их называют)
      if (enumLine) problems.push(`сцена ${n}: перечисление строкой («${enumLine.say}») — перечисление показывай сценой list, каждый пункт отдельной фразой`);
    }
    const glued = items.filter((b) => /\S\s+и\s+\S/.test(b.show) && b.show.split(/\s+/).length <= 5);
    if (glued.length) problems.push(`сцена ${n}: пункты склеены через «и» (${glued.map((b) => b.show).join('; ')}) — каждая сущность отдельной фразой`);
    if (voiceOf(x).split(/\s+/).length > 30) problems.push(`сцена ${n}: реплика длиннее 30 слов — раздели на несколько сцен`);
  });

  // Логотипы обязательны: показываем бренд, когда он звучит
  const usedMedia = scenes.flatMap((x) => (x.media ?? '').split('|').map((m) => low(m.trim().replace(/\.[a-z0-9]+$/i, ''))));
  const logos = visuals.filter((v) => v.kind === 'image' && isLogo(v));
  const unusedLogos = logos.filter((v) => !usedMedia.some((m) => m && (low(v.name).includes(m) || m.includes(low(v.name)))));
  if (unusedLogos.length) problems.push(`не показаны логотипы: ${unusedLogos.map((v) => `«${v.name}»`).join(', ')} — покажи каждый сценой image, когда звучит название бренда`);
  // Файл в кадре — о том, что звучит: в реплике есть слово из его описания
  const wrongFile = scenes
    .filter((x) => x.type === 'image' && x.media)
    .flatMap((x) => {
      const v = visuals.find((f) => {
        const m = low((x.media ?? '').split('|')[0].trim().replace(/\.[a-z0-9]+$/i, ''));
        return m && (low(f.name) === m || low(f.name).includes(m) || m.includes(low(f.name)));
      });
      const tokens = v ? nameTokens(v).map((t) => t.slice(0, 4)) : [];
      const said = low(voiceOf(x));
      return v && !/обобщ/i.test(v.name) && tokens.length && !tokens.some((t) => said.includes(t)) ? [`«${v.name}» при реплике «${voiceOf(x)}»`] : [];
    });
  if (wrongFile.length) problems.push(`файл в кадре не про то, что звучит: ${wrongFile.join('; ')} — показывай файл только там, где речь именно о нём`);
  return {problems, added};
}

export async function directVideo(opts: {
  scenario: string;
  sources: Source[];
  previews: Map<string, Buffer>;
  settings: Settings;
  wishes?: string;
  model?: string;
}): Promise<Plan> {
  const {scenario, sources, previews, settings: s} = opts;
  const manner = s.manner === 'custom' ? s.customManner : MANNERS.find((m) => m.id === s.manner)?.label;
  const cps = PACES[s.pace].cps;
  const length =
    s.textMode === 'shorten'
      ? `Общая длина всех реплик — около ${Math.round((s.targetSeconds ?? 30) * cps)} символов (${s.targetSeconds ?? 30} с). Оставь главное, предупреждения о рисках сохрани.`
      : `Общая длина всех реплик — примерно ${Math.round(scenario.length * 0.55)}–${Math.round(scenario.length * 0.85)} символов: короче и плотнее черновика, без воды.`;

  const parts: {text?: string; inlineData?: {mimeType: string; data: string}}[] = [
    {text: `МАТЕРИАЛ АВТОРА:\n"""\n${scenario.trim()}\n"""`},
    {
      text: [
        'ТРЕБОВАНИЯ:',
        `- ${length}`,
        manner ? `- Манера диктора: ${manner}. Пиши реплики, которые ложатся на такую подачу.` : '',
        s.cta ? `- Последняя сцена — outro с cta «${s.cta}».` : '- Призыва к действию нет: cta не используй.',
        s.pronounce && Object.keys(s.pronounce).length
          ? `- Произношение (в speech пиши именно так): ${Object.entries(s.pronounce).map(([a, b]) => `${a} → ${b}`).join(', ')}.`
          : '',
        s.accentSource === 'images'
          ? `- Подбери accent: насыщенный HEX-цвет под картинки автора, на ${s.theme === 'light' ? 'светлом' : 'тёмном'} фоне.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
  if (opts.wishes?.trim()) parts.push({text: `ПОЖЕЛАНИЯ АВТОРА — обязательно учти:\n${opts.wishes.trim()}`});

  const visuals = sources.filter((x) => x.kind !== 'audio');
  if (visuals.length) {
    parts.push({text: 'ФАЙЛЫ АВТОРА (название описывает содержимое):'});
    for (const v of visuals) {
      const meta = [v.kind === 'video' ? `видео ${v.duration?.toFixed(1)} с` : 'картинка', v.orientation].filter(Boolean).join(', ');
      parts.push({text: `Файл: "${v.name}" (${meta})`});
      const pv = previews.get(v.file);
      if (pv) parts.push({inlineData: {mimeType: 'image/jpeg', data: pv.toString('base64')}});
    }
  } else parts.push({text: 'Файлов автора нет — сцены типа image не используй.'});

  let feedback = '';
  let fallback: {scenes: DScene[]; accent?: string; problems: string[]} | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const extra = feedback ? [{text: `В прошлой попытке были ошибки — исправь их, остальное сохрани: ${feedback}`}] : [];
    const out = await generateJson<{scenes: DScene[]; accent?: string}>([...parts, ...extra], SCHEMA, {system: SYSTEM, model: opts.model, thinking: 'low'});
    fs.mkdirSync(path.join(ENGINE, '.cache'), {recursive: true});
    fs.writeFileSync(path.join(ENGINE, '.cache', `director-attempt${attempt}.json`), JSON.stringify(out, null, 1));
    let scenes = splitEnumerations(normalize(out.scenes, s.pronounce));
    if (scenes.length < 3) {
      feedback = 'слишком мало сцен';
      continue;
    }
    const {problems, added} = check(scenes, scenario, visuals);
    if (!problems.length) return finish(scenes, out.accent, sources, visuals, []);
    if (attempt === 3) {
      if (added.length) {
        const fix = claimFixer(added);
        scenes = scenes.map((x) => ({...x, beats: x.beats.map((b) => ({...b, say: fix(b.say), speech: fix(b.speech), show: fix(b.show)})).filter((b) => b.say)}));
      }
      scenes = scenes.map((x) => ({...x, beats: x.beats.map(literal)}));
      return finish(scenes, out.accent, sources, visuals, check(scenes, scenario, visuals).problems);
    }
    fallback = {scenes, accent: out.accent, problems};
    feedback = problems.join('; ');
  }
  if (fallback) return finish(fallback.scenes, fallback.accent, sources, visuals, fallback.problems);
  throw new Error('Не удалось составить видео: ИИ вернул пустой ответ');
}

/**
 * Последняя защита принципа «видишь то, что слышишь»: если надпись не о той фразе или теряет половину смысла,
 * а фраза короткая — показываем саму фразу.
 */
function literal(b: DBeat): DBeat {
  const m = low(b.say).match(/(?:^|[\s,:])и\s+([\p{L}-]+),?\s+и\s+([\p{L}-]+)/u) ?? low(b.say).match(/как\s+([\p{L}-]+).*?так\s+и\s+([\p{L}-]+)/u);
  const half = m && ![m[1], m[2]].every((w) => low(b.show).includes(w.slice(0, 4)));
  const off = b.show && !matches(b.show, b.say);
  if (!half && !off) return b;
  const text = b.say.replace(/[.,:;!]+$/, '').replace(/^(\p{Ll})/u, (c) => c.toUpperCase());
  // Акцент — самое длинное слово
  const words = text.split(' ');
  const k = words.reduce((best, w, i) => (w.replace(/[^\p{L}]/gu, '').length > words[best].replace(/[^\p{L}]/gu, '').length ? i : best), 0);
  words[k] = `*${words[k].replace(/([,.!?:;]*)$/, '*$1')}`;
  return {...b, show: words.join(' ')};
}

/** Фразы сцены → надписи с индексами слов в реплике */
function toLines(beats: DBeat[], type: Scene['type'], layout?: string): SpokenLine[] {
  let w = 0;
  const lines = beats.map((b) => {
    const n = b.say.split(/\s+/).filter(Boolean).length;
    const line: SpokenLine = {text: b.show, role: b.role, w0: w, w1: w + n, ...(b.icon && b.icon !== 'none' ? {icon: b.icon} : {})};
    w += n;
    return line;
  });
  // В «hub» целое из head — центр схемы, поэтому оно тоже узел
  if (type === 'diagram' && layout === 'hub') for (const l of lines) if (l.role === 'head') l.role = 'item';
  // В рассказе все надписи — строки
  if (type === 'kinetic' || type === 'statement' || type === 'image' || type === 'outro') for (const l of lines) l.role = 'line';
  return lines;
}

function finish(scenes: DScene[], accentRaw: string | undefined, sources: Source[], visuals: Source[], problems: string[]): Plan {
  const script: Beat[] = scenes.map((x) => ({text: voiceOf(x), speech: x.beats.map((b) => b.speech).join(' ')}));
  const raw: RawScene[] = scenes.map((x, i) => {
    const shows = (role: string) => x.beats.filter((b) => b.role === role && b.show);
    const head = shows('head')[0];
    const firstLine = x.beats.find((b) => b.show);
    const hub = x.type === 'diagram' && x.layout === 'hub';
    const nodes = hub ? x.beats.filter((b) => (b.role === 'head' || b.role === 'item') && b.show) : shows('item');
    const li = x.beats.findIndex((b) => b.role === 'left');
    const ri = x.beats.findIndex((b) => b.role === 'right');
    const sidePoints = (a: number, b: number) =>
      x.beats
        .slice(a + 1, b < 0 ? undefined : b)
        .filter((y) => y.role === 'item' && y.show)
        .map((y) => plain(y.show))
        .join(' | ');
    return {
      beat: i + 1,
      type: x.type,
      media: x.media,
      effect: x.effect as RawScene['effect'],
      side: x.side as RawScene['side'],
      layout: x.layout as RawScene['layout'],
      icon: x.icon,
      cta: x.cta,
      title: x.type === 'outro' ? plain(firstLine?.show ?? '') : head ? plain(head.show) : '',
      text: firstLine ? plain(firstLine.show) : '',
      points: shows('item').map((b) => plain(b.show)).join(' | '),
      icons: shows('item').map((b) => b.icon || '').join(' | '),
      nodes: nodes.map((b) => plain(b.show) + (b.icon ? `: ${b.icon}` : '')).join(' | '),
      left_title: li >= 0 ? plain(x.beats[li].show) : '',
      left_icon: li >= 0 ? x.beats[li].icon : '',
      left_points: li >= 0 ? sidePoints(li, ri) : '',
      right_title: ri >= 0 ? plain(x.beats[ri].show) : '',
      right_icon: ri >= 0 ? x.beats[ri].icon : '',
      right_points: ri >= 0 ? sidePoints(ri, -1) : '',
    };
  });
  const warnings: string[] = problems.map((p) => `Режиссёр: ${p}`);
  const out = toScenes(raw, script, sources, warnings);
  out.forEach((sc, i) => {
    sc.lines = toLines(scenes[i].beats, sc.type, scenes[i].layout);
    if (sc.type === 'image' || sc.type === 'kinetic') delete (sc as {title?: string}).title;
  });
  // Бренд назван в надписи текстовой сцены или в заголовке списка — показываем его логотип
  const logos = visuals.filter((v) => v.kind === 'image' && isLogo(v));
  for (const sc of out) {
    if (sc.type !== 'kinetic' && sc.type !== 'list') continue;
    const shown = (sc.lines ?? []).map((l, i) => ({l, i})).filter(({l}) => l.text && (sc.type === 'kinetic' || l.role === 'head'));
    for (const {l, i} of shown) {
      const words = toks(l.text);
      const v = logos.find((x) => nameTokens(x).some((t) => words.includes(t)));
      if (v) {
        Object.assign(sc, {logo: v.file, logoLine: i});
        break;
      }
    }
  }
  attachUnused(out, sources);
  const used = new Set(out.flatMap((x) => (x.type === 'image' ? [x.image, ...(x.more ?? []).map((m) => m.image)] : x.type === 'outro' && x.logo ? [x.logo] : [])));
  for (const v of visuals) if (!used.has(v.file)) warnings.push(`Файл «${v.name}» не использован`);
  const accent = accentRaw && /^#?[0-9a-f]{6}$/i.test(accentRaw) ? '#' + accentRaw.replace('#', '').toLowerCase() : undefined;
  return {scenes: out, script, accent, warnings};
}

/** Сценарий написан раскадровкой («## Тип» + «фраза → надпись») — берём его как есть, без ИИ */
export const isScriptedScenario = (text: string) => /^##\s+\S/m.test(text);

const SCRIPT_TYPES: [RegExp, Scene['type'], string?][] = [
  [/^текст/i, 'kinetic'],
  [/^картинк|^файл|^видео/i, 'image'],
  [/^список/i, 'list'],
  [/^шаги/i, 'diagram', 'flow'],
  [/^схем/i, 'diagram', 'hub'],
  [/^сравнен/i, 'compare'],
  [/^важно|^ключев/i, 'statement'],
  [/^финал/i, 'outro'],
];

/**
 * Раскадровка, написанная руками: сцены «## Тип[: файл]», строки «фраза диктора → надпись [иконка]».
 * Список/Шаги/Схема: первая строка — заголовок (центр), дальше пункты. Сравнение: «А:» / «Б:» — стороны.
 */
export function scriptedVideo(text: string, sources: Source[], settings: Settings): Plan {
  const scenes: DScene[] = [];
  const errors: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('##'))) continue;
    if (line.startsWith('##')) {
      const head = line.replace(/^##\s*/, '');
      const [kind, ...rest] = head.split(':');
      const t = SCRIPT_TYPES.find(([re]) => re.test(kind.trim()));
      if (!t) errors.push(`Неизвестный тип сцены «${kind.trim()}» — сцена стала текстом`);
      scenes.push({type: t?.[1] ?? 'kinetic', layout: t?.[2] ?? '', media: rest.join(':').trim(), beats: []});
      continue;
    }
    const sc = scenes[scenes.length - 1];
    if (!sc) continue;
    // [иконка] в конце строки
    const icon = line.match(/\s*\[([a-z-]+)\]\s*$/);
    const body = icon ? line.slice(0, icon.index) : line;
    const arrow = /\s*(?:→|->)\s*/.test(body);
    let [say, show] = body.split(/\s*(?:→|->)\s*/);
    // Без «→» надпись = сама фраза (выделения — *звёздочками* прямо во фразе)
    if (!arrow) show = say;
    say = say.replace(/[*+~]/g, '');
    let role: DBeat['role'] = 'line';
    const side = say.match(/^([АБAB])\s*:\s*/);
    if (sc.type === 'compare' && side) {
      role = /[АA]/.test(side[1]) ? 'left' : 'right';
      say = say.slice(side[0].length);
      if (!arrow) show = show.replace(/^([АБAB])\s*:\s*/, '');
    } else if (sc.type === 'list' || sc.type === 'diagram') role = sc.beats.length ? 'item' : 'head';
    else if (sc.type === 'compare') role = 'item';
    show = (show ?? '').trim().replace(/[\s.,:;—–-]+$/, '').replace(/^[—–-]\s*/, '');
    if (role !== 'line') show = show.replace(/^(и|а|но)\s+/i, '');
    // Пункты и заголовки — с заглавной; строки рассказа — как во фразе (продолжение предложения не рвём)
    if (role !== 'line' || !sc.beats.length) show = show.replace(/^([*+~]*)(\p{Ll})/u, (_, st, c) => st + c.toUpperCase());
    sc.beats.push({say, speech: say, role, show, icon: icon?.[1] ?? ''});
  }
  const ready = normalize(scenes, settings.pronounce);
  const visuals = sources.filter((x) => x.kind !== 'audio');
  // Те же проверки, что у режиссёра, — как подсказки автору
  const {problems} = check(ready, '', visuals);
  const hints = problems.filter((p) => !/оценки/.test(p));
  return finish(ready, undefined, sources, visuals, [...errors, ...hints]);
}
