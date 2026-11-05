import fs from 'node:fs';
import path from 'node:path';
import type {Scene} from '../../src/video/types.ts';
import {generateJson} from './gemini.ts';
import {ICON_NAMES} from '../../src/lib/icon-names.ts';
import {ENGINE} from './paths.ts';
import type {Beat} from './writer.ts';
import type {Settings} from './settings.ts';
import type {Source} from './sources.ts';

const SYSTEM = `Ты — режиссёр монтажа обучающих motion-видео на русском языке. Стиль — плоский моушн-дизайн
(никакого 3D): кинетическая типографика в такт речи, выделения ключевых слов, схемы с иконками, морфинг форм,
активная камера и разнообразные переходы. Видео должно быть живым: картинка меняется каждые 2–3 секунды.
Текст озвучки уже написан и разбит на биты. Для КАЖДОГО бита придумай одну сцену. Порядок и число сцен = биты.

ТИПЫ СЦЕН (type):
- "kinetic": ОСНОВНОЙ тип. Слова диктора появляются на экране фразами по 1–4 слова ровно в момент, когда звучат,
  ключевые слова выделяются (маркер, подчёркивание, обводка). Поля: highlight (2–4 ключевых слова бита через « | »,
  ровно как они написаны в тексте бита), kicker (1–3 слова — тема, мелко; можно ""), icon (иконка темы или "none").
  Для объяснений, рассуждений, связок, примеров — для всего, где важен сам текст.
- "title": крупный заголовок раздела, потом идут слова диктора. kicker (2–4 слова), title (1–4 слова), subtitle (2–5 слов),
  highlight. Для начала видео и начала крупных разделов.
- "image": файл автора + заголовок сбоку, затем слова диктора под ним. media (точное имя файла; несколько однотипных
  картинок, например логотипов, — через « | »), title (1–3 слова — о чём речь, НЕ название файла), effect, side, highlight.
- "list": пункты появляются по одному, когда диктор их называет. title (2–4 слова), points (2–4 пункта через « | »,
  по 1–3 слова, теми же словами, что в речи), icons (иконка к каждому пункту через « | » или "").
  Для перечислений 3+ вещей. Слова диктора здесь на экран не выводятся — пункты важнее.
- "diagram": схема с иконками и связями, узлы появляются, когда о них говорят. layout ("flow" — цепочка шагов/процесс/
  путь, "hub" — центр и то, что с ним связано), title (2–4 слова), nodes (2–5 узлов «Подпись: иконка» через « | »,
  подпись 1–3 слова; для hub первый узел — центр). Для процессов, последовательностей действий, экосистем, связей.
- "compare": сравнение двух вещей. title, left_title / right_title (1–3 слова), left_icon / right_icon,
  left_points / right_points (1–3 коротких пункта через « | »). Для «А против Б», различий.
- "statement": важное правило или предупреждение крупно на цветной заливке, под ним — слова диктора. kicker
  («ВАЖНО», «ПОМНИТЕ»…), text (2–5 слов), highlight. Не чаще раза в 5 сцен, для рисков и главных выводов.
- "morph": перетекающая абстрактная форма и одно слово, под ним слова диктора. word (1 слово), highlight.
  Редко, для абстрактных идей.
- "outro": финал. title (бренд или тема), subtitle (итог 2–5 слов), cta (только если задан призыв).

БАЛАНС:
- Примерно половина сцен — kinetic и title (текст речи на экране). Остальное — image, list, diagram, compare,
  statement. Не ставь больше двух kinetic подряд — перемежай схемами, файлами, списками.
- Схемы (diagram) и сравнения (compare) — минимум 2–3 на видео, где по смыслу есть процесс, связи или различия.
- Каждый файл автора используй хотя бы раз там, где речь именно о нём. Аудиофайлы не используй.
- Названия файлов — это только ОПИСАНИЕ содержимого для тебя. Никогда не выводи их на экран: никаких «Запись экрана»,
  «Логотип», «Картинка» в title/caption.
- Всё по теме бита: иконки, подписи и схемы должны иллюстрировать именно то, что говорит диктор.
- Текст на экране — на русском (бренды как в тексте), без кавычек и точек в конце. Если задан призыв — последняя сцена outro с cta.

ЭФФЕКТ ДЛЯ ФАЙЛА (effect у image): "static" — как есть (логотипы, скриншоты, документы, графики);
"kenburns" — медленный наезд (фотографии, иллюстрации); "phone" — в рамке смартфона (вертикальные записи экрана
и скриншоты приложения). Для видео — только "static" или "phone".

ИКОНКИ (поля icon, icons, nodes, left_icon, right_icon) — только из списка:
${ICON_NAMES.join(', ')}.

ПОЛЯ: заполни все поля схемы; поля, которые не относятся к типу сцены, — пустая строка "" (effect, layout — "none").`;

const S = {type: 'STRING'};
export const FIELDS = {
  beat: {type: 'INTEGER', description: 'номер бита, начиная с 1'},
  type: {type: 'STRING', enum: ['kinetic', 'title', 'image', 'list', 'diagram', 'compare', 'statement', 'morph', 'outro']},
  kicker: S,
  title: S,
  subtitle: S,
  text: S,
  word: S,
  highlight: {type: 'STRING', description: 'ключевые слова через « | »'},
  icon: S,
  media: S,
  effect: {type: 'STRING', enum: ['static', 'kenburns', 'phone', 'none']},
  side: {type: 'STRING', enum: ['left', 'right']},
  points: {type: 'STRING', description: 'для list: 2–6 пунктов через « | », каждый — отдельная сущность'},
  icons: S,
  layout: {type: 'STRING', enum: ['flow', 'hub', 'none']},
  nodes: {type: 'STRING', description: 'для diagram: «Подпись: иконка | …»'},
  left_title: S,
  left_icon: S,
  left_points: S,
  right_title: S,
  right_icon: S,
  right_points: S,
  cta: S,
};
const SCHEMA = {
  type: 'OBJECT',
  properties: {
    scenes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: FIELDS,
        // Все поля обязательны: иначе модель ленится и пропускает нужные. Ненужные — "" / "none".
        required: Object.keys(FIELDS),
        propertyOrdering: Object.keys(FIELDS),
      },
    },
    accent: {type: 'STRING', description: 'HEX основного акцентного цвета, если просили подобрать по картинкам'},
  },
  required: ['scenes'],
};

export type RawScene = {
  keys?: string;
  headline?: string;
  subline?: string;
  voice?: string;
  speech?: string;
  beat?: number;
  type: Scene['type'];
  kicker?: string;
  title?: string;
  subtitle?: string;
  text?: string;
  word?: string;
  caption?: string;
  highlight?: string;
  icon?: string;
  media?: string;
  effect?: 'static' | 'kenburns' | 'phone';
  side?: 'left' | 'right';
  points?: string;
  items?: string[];
  icons?: string;
  layout?: 'flow' | 'hub';
  nodes?: string;
  left_title?: string;
  left_icon?: string;
  left_points?: string;
  right_title?: string;
  right_icon?: string;
  right_points?: string;
  cta?: string;
};

export type Plan = {scenes: Scene[]; script: Beat[]; accent?: string; warnings: string[]};

/** Логотипы всегда показываем как есть */
export const isLogo = (s: Source) => /логотип|лого|logo/i.test(s.name);

/** Слова из названия файла, по которым его можно узнать в тексте (Excel, Windows, …) */
const GENERIC = /^(логотип|лого|logo|запись|экрана?|картинк\w*|изображени\w*|фото\w*|скриншот\w*|обобщ\w*|приложени\w*|детальн\w*|главн\w*)$/i;
export const nameTokens = (s: Source) =>
  s.name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !GENERIC.test(w))
    .map((w) => w.toLowerCase().replace(/ё/g, 'е'));

/**
 * Неиспользованные картинки пристраиваем туда, где о них говорят: например, логотип Excel —
 * к сцене с логотипом Word, если в её озвучке звучит «Excel».
 */
export function attachUnused(scenes: Scene[], sources: Source[]) {
  const used = new Set(scenes.flatMap((x) => (x.type === 'image' ? [x.image, ...(x.more ?? []).map((m) => m.image)] : [])));
  for (const v of sources.filter((x) => x.kind === 'image' && !used.has(x.file))) {
    const tokens = nameTokens(v);
    if (!tokens.length) continue;
    const said = (t?: string) => !!t && tokens.some((w) => t.toLowerCase().replace(/ё/g, 'е').includes(w));
    const host = scenes.find(
      (x) => x.type === 'image' && x.effect !== 'phone' && (x.more?.length ?? 0) < 3 && said(x.voice) &&
        sources.find((s) => s.file === x.image)?.kind === 'image',
    );
    if (host && host.type === 'image') {
      host.more = [...(host.more ?? []), {image: v.file}];
      host.effect = 'static';
      used.add(v.file);
    }
  }
}

const norm = (t: string) => t.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

/** Превращает ответ модели в сцены (по одной на бит), исправляя мелкие ошибки. */
const ICON_SET = new Set<string>(ICON_NAMES);
const icon = (n?: string) => {
  const v = n?.trim().toLowerCase();
  return v && ICON_SET.has(v) ? v : undefined;
};
const split = (t?: string) =>
  (t ?? '')
    .split('|')
    .map((x) => x.trim().replace(/[.;]+$/, ''))
    .filter(Boolean);
/** Слова-описания из названий файлов не должны попадать в кадр */
const FILE_WORDS = /\b(запис\w* экрана|логотип\w*|картинк\w*|скриншот\w*|изображени\w*|обобщ\w*)\b/giu;
const screenText = (t?: string) => {
  const v = t?.replace(FILE_WORDS, '').replace(/\s{2,}/g, ' ').trim();
  return v ? v : undefined;
};

/** Превращает ответ модели в сцены (по одной на бит), исправляя мелкие ошибки. */
export function toScenes(raw: RawScene[], beats: Beat[], sources: Source[], warnings: string[]): Scene[] {
  const visuals = sources.filter((s) => s.kind !== 'audio');
  const find = (name?: string) => {
    if (!name) return undefined;
    const n = norm(name.replace(/\.[a-z0-9]+$/i, ''));
    return visuals.find((s) => norm(s.name) === n) ?? visuals.find((s) => norm(s.name).includes(n) || n.includes(norm(s.name)));
  };
  // Пустые строки = поле не задано
  raw = raw.map((r) => {
    const c: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) if (v !== '' && v !== 'none' && v != null) c[k] = typeof v === 'string' ? v.trim() : v;
    return c as RawScene;
  });
  // Сцена для каждого бита: по номеру, иначе по порядку
  const byBeat = new Map<number, RawScene>();
  raw.forEach((r, i) => {
    const k = r.beat && r.beat >= 1 && r.beat <= beats.length && !byBeat.has(r.beat) ? r.beat : i + 1;
    if (!byBeat.has(k)) byBeat.set(k, r);
  });
  let side: 'left' | 'right' = 'left';
  return beats.map((beat, i): Scene => {
    const r = byBeat.get(i + 1) ?? ({type: 'kinetic'} as RawScene);
    const highlight = split(r.highlight).slice(0, 5);
    const keys = r.keys !== undefined ? split(r.keys).slice(0, 4) : undefined;
    const headline = screenText(r.headline);
    const subline = screenText(r.subline);
    const base = {
      voice: beat.text,
      speech: beat.speech,
      ...(highlight.length ? {highlight} : {}),
      ...(keys ? {keys} : {}),
      ...(headline ? {headline} : {}),
      ...(subline ? {subline} : {}),
    };
    const kinetic = (): Scene => ({...base, type: 'kinetic', kicker: screenText(r.kicker), icon: icon(r.icon)});
    switch (r.type) {
      case 'image': {
        const files = (r.media ?? '')
          .split('|')
          .map((m) => find(m.trim()))
          .filter((x): x is Source => !!x)
          .filter((x, j, arr) => arr.findIndex((y) => y.file === x.file) === j);
        const src = files[0];
        if (!src) {
          warnings.push(`Файл «${r.media}» не найден — сцена ${i + 1} стала типографикой`);
          return kinetic();
        }
        side = r.side && r.side !== side ? r.side : side === 'left' ? 'right' : 'left';
        let effect = r.effect ?? (src.kind === 'video' ? 'phone' : 'kenburns');
        if (src.kind === 'video' && effect === 'kenburns') effect = src.orientation === 'portrait' ? 'phone' : 'static';
        if (src.kind === 'image' && isLogo(src)) effect = 'static';
        // Дополнительные картинки — только к картинке (не к видео), рядом в ряд
        const more = src.kind === 'image' ? files.slice(1, 4).filter((x) => x.kind === 'image').map((x) => ({image: x.file})) : [];
        if (more.length) effect = 'static';
        return {...base, type: 'image', image: src.file, title: screenText(r.title), side, effect, ...(more.length ? {more} : {})};
      }
      case 'list': {
        const items = [...split(r.points), ...(r.items ?? [])].slice(0, 6);
        if (items.length < 2) return kinetic();
        const icons = split(r.icons).map((x) => icon(x) ?? '');
        return {...base, type: 'list', title: screenText(r.title), items, ...(icons.some(Boolean) ? {icons} : {})};
      }
      case 'diagram': {
        const nodes = split(r.nodes)
          .map((x) => {
            const m = x.match(/^(.*?)\s*[:—–-]\s*([a-z-]+)$/i);
            return m && icon(m[2]) ? {label: m[1].trim(), icon: icon(m[2])} : {label: x};
          })
          .filter((x) => x.label)
          .slice(0, 6);
        if (nodes.length < 2) return kinetic();
        return {...base, type: 'diagram', title: screenText(r.title), layout: r.layout === 'hub' ? 'hub' : 'flow', nodes};
      }
      case 'compare': {
        if (!r.left_title || !r.right_title) return kinetic();
        return {
          ...base,
          type: 'compare',
          title: screenText(r.title),
          left: {title: r.left_title, icon: icon(r.left_icon), points: split(r.left_points).slice(0, 3)},
          right: {title: r.right_title, icon: icon(r.right_icon), points: split(r.right_points).slice(0, 3)},
        };
      }
      case 'morph':
        return {...base, type: 'morph', word: r.word || r.title || '…'};
      case 'statement':
        return {...base, type: 'statement', kicker: r.kicker, text: r.text || r.headline || r.title || r.word || '…'};
      case 'outro': {
        const title = r.title || r.word || '…';
        // Логотип бренда из финала — из media или по названию файла («Логотип школы» ↔ «школа»)
        const logo =
          [find(r.media)].find((x) => x && x.kind === 'image' && isLogo(x)) ??
          visuals.find((x) => x.kind === 'image' && isLogo(x) && nameTokens(x).some((t) => norm(title).includes(norm(t))));
        const stores = /app\s*store|google\s*play/i.test(beat.text);
        return {...base, type: 'outro', title, subtitle: r.subtitle, cta: r.cta, ...(logo ? {logo: logo.file} : {}), ...(stores ? {stores} : {})};
      }
      case 'title':
        return r.title ? {...base, type: 'title', kicker: r.kicker, title: r.title, subtitle: r.subtitle} : kinetic();
      default:
        return kinetic();
    }
  });
}

export async function planVideo(opts: {
  /** Готовый текст озвучки, разбитый на биты (одна сцена на бит) */
  beats: Beat[];
  sources: Source[];
  previews: Map<string, Buffer>;
  settings: Settings;
  /** Пожелания автора из prompt.txt */
  wishes?: string;
  model?: string;
}): Promise<Plan> {
  const {beats, sources, previews, settings: s} = opts;

  const parts: {text?: string; inlineData?: {mimeType: string; data: string}}[] = [
    {text: `ТЕКСТ ОЗВУЧКИ ПО БИТАМ (${beats.length} шт.):\n${beats.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}`},
    {
      text: [
        `ТРЕБОВАНИЯ:`,
        `- Ровно ${beats.length} сцен, beat от 1 до ${beats.length}, по одной на каждый бит.`,
        s.cta ? `- Призыв к действию (cta последней сцены outro): «${s.cta}»` : '- Призыва к действию нет: cta не используй.',
        s.accentSource === 'images'
          ? `- Подбери accent: насыщенный HEX-цвет, который лучше всего сочетается с картинками автора и смотрится на ${s.theme === 'light' ? 'светлом' : 'тёмном'} фоне.`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  if (opts.wishes?.trim()) {
    parts.push({text: `ПОЖЕЛАНИЯ АВТОРА — обязательно учти:\n${opts.wishes.trim()}`});
  }

  const visuals = sources.filter((x) => x.kind !== 'audio');
  if (visuals.length) {
    parts.push({text: 'ФАЙЛЫ АВТОРА (название описывает содержимое):'});
    for (const v of visuals) {
      const meta = [v.kind === 'video' ? `видео ${v.duration?.toFixed(1)} с` : 'картинка', v.orientation].filter(Boolean).join(', ');
      parts.push({text: `Файл: "${v.name}" (${meta})`});
      const pv = previews.get(v.file);
      if (pv) parts.push({inlineData: {mimeType: 'image/jpeg', data: pv.toString('base64')}});
    }
  } else {
    parts.push({text: 'Файлов автора нет — сцены типа image не используй.'});
  }

  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const extra = lastError ? [{text: `В прошлой попытке была ошибка: ${lastError}. Исправь.`}] : [];
    const raw = await generateJson<{scenes: RawScene[]; accent?: string}>([...parts, ...extra], SCHEMA, {system: SYSTEM, model: opts.model, thinking: 'low'});
    const got = raw.scenes ?? [];
    // Сырой ответ — для отладки
    fs.mkdirSync(path.join(ENGINE, '.cache'), {recursive: true});
    fs.writeFileSync(path.join(ENGINE, '.cache', `planner-attempt${attempt}.json`), JSON.stringify(raw, null, 1));
    const problems: string[] = [];
    if (got.length !== beats.length) problems.push(`сцен ${got.length}, а битов ${beats.length} — нужно ровно по одной сцене на бит`);
    const emptyLists = got.filter(
      (x) => x.type === 'list' && [...(x.points ?? '').split('|'), ...(x.items ?? [])].filter((i) => i?.trim()).length < 2,
    ).length;
    if (emptyLists) problems.push(`у ${emptyLists} сцен(ы) type "list" не заполнен points — нужно 2–4 пункта через « | »`);
    if (problems.length && attempt < 3) {
      lastError = problems.join('; ');
      continue;
    }
    const warnings: string[] = [];
    const scenes = toScenes(got, beats, sources, warnings);
    attachUnused(scenes, sources);
    const used = new Set(scenes.flatMap((x) => (x.type === 'image' ? [x.image, ...(x.more ?? []).map((m) => m.image)] : [])));
    for (const v of visuals) if (!used.has(v.file)) warnings.push(`Файл «${v.name}» не использован`);
    const accent = raw.accent && /^#?[0-9a-f]{6}$/i.test(raw.accent) ? '#' + raw.accent.replace('#', '').toLowerCase() : undefined;
    return {scenes, script: beats, accent, warnings};
  }
  throw new Error(`Не удалось составить раскадровку: ${lastError}`);
}
