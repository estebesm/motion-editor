/**
 * Генератор. Запускается из run.sh.
 *   1. Создать проект — вопросы → videos/<название>/ с prompt.txt
 *   2. Начать генерацию — выбрать видео, всё остальное берётся из prompt.txt
 *
 *   --auto           без меню: сгенерировать первое новое видео
 *   --video=<имя>    какое видео взять в режиме --auto
 *   --draft          черновое качество (540p)
 *   --plan-only      только раскадровка (без озвучки и рендера)
 *   --без-звука      без озвучки и звуков: тайминги по темпу речи (когда кончился лимит озвучки)
 */
import * as p from '@clack/prompts';
import {spawn, spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {Scene} from '../src/video/types.ts';
import {finalizeVoice} from './lib/audio.ts';
import {buildVideo} from './lib/build.ts';
import {tts} from './lib/gemini.ts';
import {ENGINE, ROOT, VIDEOS} from './lib/paths.ts';
import {planVideo} from './lib/planner.ts';
import {directVideo, isScriptedScenario, scriptedVideo} from './lib/director.ts';
import {addedClaims, verbatimBeats, writeScript} from './lib/writer.ts';
import {describeSettings, parsePrompt, renderPrompt} from './lib/prompt-file.ts';
import {
  ACCENTS,
  DEFAULT_SETTINGS,
  DYNAMICS,
  isHex,
  MANNERS,
  normHex,
  PACES,
  secondAccent,
  type Settings,
  VOICES,
  voiceStyle,
} from './lib/settings.ts';
import {previewJpeg, scanSources, type Source} from './lib/sources.ts';
import {
  cachedPlan,
  cachedScript,
  findVideos,
  nextVideoPath,
  readPrompt,
  readScenario,
  saveProject,
  saveScript,
  type VideoItem,
} from './lib/tasks.ts';

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const AUTO = args.includes('--auto');
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

/** Ответ или выход при Ctrl+C / Esc. */
async function ask<T>(q: Promise<T>): Promise<Exclude<T, symbol>> {
  const r = await q;
  if (p.isCancel(r)) {
    p.cancel('Отменено');
    process.exit(0);
  }
  return r as Exclude<T, symbol>;
}

const rel = (f: string) => path.relative(ROOT, f);
const TYPE_LABEL: Record<Scene['type'], string> = {
  title: 'Заголовок',
  morph: 'Морфинг',
  image: 'Картинка',
  list: 'Список',
  statement: 'Ключевая мысль',
  kinetic: 'Типографика',
  diagram: 'Схема',
  compare: 'Сравнение',
  outro: 'Финал',
};
const EFFECT_LABEL = {static: 'как есть', kenburns: 'наезд камеры', phone: 'в рамке телефона'};
/** Меняются при изменении логики сценариста / раскадровщика — старые результаты пересоздаются */
const SCRIPT_VERSION = 3;
const PLANNER_VERSION = 5;
const DIRECTOR_VERSION = 8;
const SAMPLE_TEXT = 'Привет! Так будет звучать голос в вашем видео.';

// ================================================================ создание проекта

async function playSamples(s: Settings) {
  const dir = path.join(ENGINE, '.cache', 'samples');
  fs.mkdirSync(dir, {recursive: true});
  const spin = p.spinner();
  spin.start('Готовлю образцы голосов');
  const files: {v: (typeof VOICES)[number]; f: string}[] = [];
  for (const v of VOICES) {
    const style = voiceStyle(s);
    const key = crypto.createHash('sha1').update(JSON.stringify([v.id, style, SAMPLE_TEXT])).digest('hex').slice(0, 12);
    const f = path.join(dir, `${v.id}-${key}.wav`);
    if (!fs.existsSync(f)) {
      spin.message(`Готовлю образец: ${v.label}`);
      const {data, mime} = await tts(SAMPLE_TEXT, {voice: v.id, style});
      finalizeVoice(data, mime, f);
    }
    files.push({v, f});
  }
  spin.stop('Образцы готовы');
  const player = process.platform === 'darwin' ? 'afplay' : 'ffplay';
  for (const {v, f} of files) {
    p.log.step(`▶ ${v.label} — ${v.hint}`);
    spawnSync(player, player === 'ffplay' ? ['-nodisp', '-autoexit', '-loglevel', 'quiet', f] : [f], {stdio: 'ignore'});
  }
}

async function askSettings(): Promise<Settings> {
  const s: Settings = structuredClone(DEFAULT_SETTINGS);

  s.textMode = await ask(
    p.select({
      message: 'Что делать с текстом сценария?',
      initialValue: s.textMode,
      options: [
        {value: 'edit', label: 'ИИ адаптирует под видео', hint: 'рекомендую: связная подача, факты сохраняются'},
        {value: 'verbatim', label: 'Озвучить дословно'},
        {value: 'shorten', label: 'Адаптировать и сократить до нужной длины'},
      ],
    }),
  );
  if (s.textMode === 'shorten') {
    s.targetSeconds = await ask(
      p.select({message: 'До какой длины?', initialValue: 30, options: [15, 30, 45, 60, 90].map((v) => ({value: v, label: `${v} секунд`}))}),
    );
  }

  s.manner = await ask(
    p.select({
      message: 'Манера речи',
      initialValue: s.manner,
      options: [...MANNERS.map((m) => ({value: m.id, label: m.label})), {value: 'custom', label: 'Описать своими словами'}],
    }),
  );
  if (s.manner === 'custom') {
    s.customManner = await ask(
      p.text({
        message: 'Как должен звучать голос?',
        placeholder: 'например: ироничный, с лёгкой улыбкой, как стендап',
        validate: (v) => (v?.trim() ? undefined : 'Опишите манеру'),
      }),
    );
  }
  s.pace = await ask(
    p.select({
      message: 'Темп речи',
      initialValue: s.pace,
      options: Object.entries(PACES).map(([k, v]) => ({value: k as Settings['pace'], label: v.label})),
    }),
  );

  for (;;) {
    const v = await ask(
      p.select({
        message: 'Голос диктора',
        initialValue: s.voice,
        options: [
          ...VOICES.map((v) => ({value: v.id, label: v.label, hint: v.hint})),
          {value: '__samples', label: '🔊 Прослушать образцы', hint: 'в выбранной манере и темпе'},
        ],
      }),
    );
    if (v !== '__samples') {
      s.voice = v;
      break;
    }
    await playSamples(s);
  }

  s.theme = await ask(
    p.select({
      message: 'Тема',
      initialValue: s.theme,
      options: [
        {value: 'dark', label: 'Тёмная'},
        {value: 'light', label: 'Светлая'},
      ],
    }),
  );
  const accent = await ask(
    p.select({
      message: 'Цвет акцента',
      options: [
        ...ACCENTS.map((a) => ({value: a.id, label: a.label, hint: a.accent})),
        {value: 'images', label: 'Подобрать по моим картинкам', hint: 'выберет ИИ'},
        {value: 'custom', label: 'Свой цвет (HEX)'},
      ],
    }),
  );
  if (accent === 'custom') {
    const hex = await ask(
      p.text({message: 'Цвет в формате HEX', placeholder: '#ff4d2e', validate: (v) => (v && isHex(v) ? undefined : 'Нужен цвет вида #ff4d2e')}),
    );
    s.accentSource = 'custom';
    s.accent = normHex(hex);
    s.accent2 = secondAccent(s.accent);
  } else if (accent === 'images') {
    s.accentSource = 'images';
  } else {
    const a = ACCENTS.find((x) => x.id === accent)!;
    s.accentSource = 'preset';
    s.accent = a.accent;
    s.accent2 = a.accent2;
  }

  s.dynamics = await ask(
    p.select({
      message: 'Динамика монтажа',
      initialValue: s.dynamics,
      options: Object.entries(DYNAMICS).map(([k, v]) => ({value: k as Settings['dynamics'], label: v.label, hint: v.hint})),
    }),
  );

  const music = await ask(
    p.text({message: 'Фоновая музыка: имя аудиофайла из sources', placeholder: 'Enter — без музыки', defaultValue: ''}),
  );
  s.music = music.trim() ? `sources/${music.trim()}` : undefined;

  s.subtitles = await ask(
    p.select({
      message: 'Текст на экране',
      initialValue: s.subtitles,
      options: [
        {value: false, label: 'Только ключевые слова'},
        {value: true, label: 'Ключевые слова + субтитры'},
      ],
    }),
  );

  const cta = await ask(p.text({message: 'Кнопка в финале: текст призыва', placeholder: 'Enter — без кнопки', defaultValue: ''}));
  s.cta = cta.trim() || undefined;

  s.quality = await ask(
    p.select({
      message: 'Качество',
      initialValue: s.quality,
      options: [
        {value: 'final', label: 'Финал', hint: '1080p'},
        {value: '4k', label: '4K', hint: '2160p, чётче, рендер в ~3 раза дольше'},
        {value: 'draft', label: 'Черновик', hint: '540p, в 2–3 раза быстрее'},
      ],
    }),
  );
  return s;
}

async function createProject() {
  const name = await ask(
    p.text({
      message: 'Название видео (так будет называться папка)',
      placeholder: 'урок-1-введение',
      validate: (v) => (!v?.trim() ? 'Введите название' : /[/\\:]/.test(v) ? 'Без символов / \\ :' : undefined),
    }),
  );
  const dir = path.join(VIDEOS, name.trim());
  if (fs.existsSync(path.join(dir, 'prompt.txt'))) {
    const ok = await ask(p.confirm({message: `В ${rel(dir)} уже есть prompt.txt. Перезаписать настройки?`, initialValue: false}));
    if (!ok) return p.cancel('Оставил как было');
  }

  const settings = await askSettings();
  const wishes = await ask(
    p.text({
      message: 'Пожелания: что хотите видеть в видео',
      placeholder: 'Enter — пропустить (можно дописать потом в prompt.txt)',
      defaultValue: '',
    }),
  );

  fs.mkdirSync(path.join(dir, 'sources'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'outputs'), {recursive: true});
  const scenario = path.join(dir, 'scenario.txt');
  if (!fs.existsSync(scenario)) fs.writeFileSync(scenario, '');
  fs.writeFileSync(path.join(dir, 'prompt.txt'), renderPrompt(settings, wishes));

  p.note(
    [
      `${rel(dir)}/`,
      '  scenario.txt  ← текст видео',
      '  prompt.txt    ← настройки и пожелания (можно править)',
      '  sources/      ← картинки, видео, музыка с понятными названиями',
      '  outputs/      ← сюда попадут готовые видео',
    ].join('\n'),
    'Проект создан',
  );
  if (process.platform === 'darwin' && (await ask(p.confirm({message: 'Открыть папку проекта?', initialValue: true})))) {
    spawn('open', [dir], {detached: true, stdio: 'ignore'}).unref();
  }
  p.outro('Заполните scenario.txt и sources — и запускайте генерацию');
}

// ================================================================ генерация

function showPlan(scenes: Scene[], settings: Settings, warnings: string[]) {
  const cps = PACES[settings.pace].cps;
  const lines = scenes.map((s, i) => {
    const secs = Math.max(3, Math.round((s.voice?.length ?? 0) / cps) + 1);
    const screen =
      s.type === 'title' ? [s.kicker, s.title, s.subtitle]
      : s.type === 'morph' ? [s.word, s.caption]
      : s.type === 'statement' ? [s.kicker, s.text]
      : s.type === 'kinetic' ? [s.kicker, s.icon && `[${s.icon}]`, s.highlight?.length ? `выделить: ${s.highlight.join(', ')}` : null]
      : s.type === 'diagram' ? [s.title, `${s.layout}: ${s.nodes.map((x) => x.label + (x.icon ? ` [${x.icon}]` : '')).join(' → ')}`]
      : s.type === 'compare' ? [s.title, `${s.left.title} vs ${s.right.title}`]
      : s.type === 'image' ? [s.title, s.caption]
      : s.type === 'list' ? [s.title, ...s.items]
      : [s.title, s.subtitle, s.cta && `[${s.cta}]`];
    if (s.lines?.length) {
      // Новый формат: фраза диктора → надпись, которая пишется в этот момент
      const words = (s.voice ?? '').split(/\s+/);
      const rows = s.lines.map((l) => `    «${words.slice(l.w0, l.w1).join(' ')}»  →  ${l.text ? `[${l.role}] ${l.text}` : '—'}`);
      const head = `${String(i + 1).padStart(2, '0')}  ${TYPE_LABEL[s.type]}  ~${secs} с` + (s.type === 'diagram' ? ` (${s.layout})` : '');
      const file = s.type === 'image' ? [`    файл:  ${[s.image, ...(s.more ?? []).map((m) => m.image)].map((f) => path.basename(f)).join(', ')}`] : [];
      return [head, ...rows, ...file].join('\n');
    }
    const out = [
      `${String(i + 1).padStart(2, '0')}  ${TYPE_LABEL[s.type]}  ~${secs} с`,
      `    голос: «${s.voice ?? '—'}»`,
      s.headline || s.subline ? `    в кадре: ${[s.headline, s.subline].filter(Boolean).join('  /  ')}` : s.keys?.length ? `    в кадре: ${s.keys.join(' | ')}` : null,
      `    экран: ${screen.filter(Boolean).join(' / ')}`,
    ];
    if (s.type === 'image') out.push(`    файл:  ${path.basename(s.image)}  (${EFFECT_LABEL[s.effect ?? 'kenburns'] ?? s.effect})`);
    return out.filter(Boolean).join('\n');
  });
  const total = scenes.reduce((sum, s) => sum + Math.max(3, (s.voice?.length ?? 0) / cps + 1), 0);
  p.note(lines.join('\n\n'), `Раскадровка · ${scenes.length} сцен · ~${Math.round(total)} с`);
  for (const w of warnings) p.log.warn(w);
}

const hash = (v: unknown) => crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');

/** Текст озвучки: из кэша, если сценарий/пожелания/манера не менялись, иначе — сценарист. */
async function getScript(item: VideoItem, scenario: string, wishes: string, sources: Source[], settings: Settings) {
  if (settings.textMode === 'verbatim') return verbatimBeats(scenario, settings.pronounce);
  const key = hash([
    SCRIPT_VERSION,
    scenario.trim(),
    wishes,
    settings.textMode,
    settings.targetSeconds,
    settings.manner,
    settings.customManner,
    settings.cta,
    settings.pronounce,
    sources.map((s) => s.name),
  ]);
  const cached = cachedScript(item.dir, key);
  if (cached && !addedClaims(scenario, cached).length) {
    p.log.info('Сценарий и пожелания не менялись — беру прошлый текст озвучки');
    return cached;
  }
  const spin = p.spinner();
  spin.start('ИИ адаптирует текст под видео');
  const beats = await writeScript({scenario, sources, settings, wishes});
  spin.stop(`Текст озвучки готов: ${beats.length} фрагментов`);
  saveScript(item.dir, key, beats);
  return beats;
}

/** Раскадровка: из кэша, если текст, пожелания и файлы не менялись, иначе — новая от ИИ. */
async function getPlan(item: VideoItem, scenario: string, wishes: string, sources: Source[], settings: Settings) {
  if (isScriptedScenario(scenario)) {
    // Раскадровка написана руками — ИИ не нужен, текст и надписи берутся как есть
    const key = hash([DIRECTOR_VERSION, 'script', scenario, settings.pronounce, sources.map((s) => [s.file, fs.statSync(path.join(item.dir, s.file)).size])]);
    const cached = cachedPlan(item.dir, key);
    if (cached) return {key, scenes: cached.scenes, accent: cached.accent, warnings: [] as string[]};
    const plan = scriptedVideo(scenario, sources, settings);
    p.log.info(`Сценарий — готовая раскадровка: ${plan.scenes.length} сцен, ИИ-режиссёр не нужен`);
    saveScript(item.dir, key, plan.script);
    return {key, ...plan};
  }
  if (settings.textMode !== 'verbatim') return getDirected(item, scenario, wishes, sources, settings);
  const beats = await getScript(item, scenario, wishes, sources, settings);
  const key = hash([
    PLANNER_VERSION,
    beats,
    wishes,
    settings.cta,
    settings.accentSource,
    sources.map((s) => [s.file, fs.statSync(path.join(item.dir, s.file)).size]),
  ]);
  const cached = cachedPlan(item.dir, key);
  if (cached) {
    p.log.info('Текст, пожелания и файлы не менялись — беру прошлую раскадровку');
    return {key, scenes: cached.scenes, accent: cached.accent, warnings: [] as string[]};
  }
  const previews = new Map<string, Buffer>();
  for (const s of sources) {
    const pv = previewJpeg(item.dir, s);
    if (pv) previews.set(s.file, pv);
  }
  const spin = p.spinner();
  spin.start('ИИ составляет раскадровку');
  const plan = await planVideo({beats, sources, previews, settings, wishes});
  spin.stop('Раскадровка готова');
  return {key, ...plan};
}

/**
 * Режиссёр: видео и текст вместе — сначала кадр, потом реплика под него.
 * Из кэша, если сценарий, пожелания, манера и файлы не менялись.
 */
async function getDirected(item: VideoItem, scenario: string, wishes: string, sources: Source[], settings: Settings) {
  const key = hash([
    DIRECTOR_VERSION,
    scenario.trim(),
    wishes,
    settings.textMode,
    settings.targetSeconds,
    settings.manner,
    settings.customManner,
    settings.pace,
    settings.cta,
    settings.pronounce,
    settings.accentSource,
    sources.map((s) => [s.file, fs.statSync(path.join(item.dir, s.file)).size]),
  ]);
  const cached = cachedPlan(item.dir, key);
  if (cached) {
    p.log.info('Сценарий, пожелания и файлы не менялись — беру прошлую режиссуру');
    return {key, scenes: cached.scenes, accent: cached.accent, warnings: [] as string[]};
  }
  const previews = new Map<string, Buffer>();
  for (const s of sources) {
    const pv = previewJpeg(item.dir, s);
    if (pv) previews.set(s.file, pv);
  }
  const spin = p.spinner();
  spin.start('ИИ-режиссёр придумывает видео и пишет текст под кадры');
  const plan = await directVideo({scenario, sources, previews, settings, wishes});
  spin.stop(`Готово: ${plan.scenes.length} сцен`);
  saveScript(item.dir, key, plan.script);
  writeStoryboard(item.dir, plan.scenes);
  return {key, ...plan};
}

/** Переписанный сценарий в читаемом виде: что говорит диктор и что в этот момент на экране */
function writeStoryboard(dir: string, scenes: Scene[]) {
  const out = scenes.map((s, i) => {
    const words = (s.voice ?? '').split(/\s+/);
    const file = s.type === 'image' ? ` · ${[s.image, ...(s.more ?? []).map((m) => m.image)].map((f) => path.basename(f).replace(/\.[a-z0-9]+$/i, '')).join(', ')}` : '';
    const head = `${i + 1}. ${TYPE_LABEL[s.type]}${s.type === 'diagram' ? (s.layout === 'hub' ? ' (центр и части)' : ' (шаги)') : ''}${file}`;
    const rows = (s.lines ?? []).map((l) => `   — ${words.slice(l.w0, l.w1).join(' ')}${l.text ? `\n       на экране: ${l.text.replace(/\*/g, '')}` : ''}`);
    return [head, ...(rows.length ? rows : [`   — ${s.voice ?? ''}`])].join('\n');
  });
  fs.writeFileSync(path.join(dir, 'сценарий-видео.txt'), `Сценарий, переписанный под видео (исходник — scenario.txt)\n\n${out.join('\n\n')}\n`);
}

async function generate(item: VideoItem) {
  const scenario = readScenario(item.dir);
  if (!scenario.trim()) throw new Error(`Пустой ${rel(path.join(item.dir, 'scenario.txt'))} — вставьте в него текст видео`);
  const sources = scanSources(item.dir);
  const {settings, wishes, warnings} = parsePrompt(readPrompt(item.dir), sources);
  if (args.includes('--draft')) settings.quality = 'draft';
  if (args.includes('--без-звука') || args.includes('--silent')) settings.silent = true;

  p.note(
    [
      `Сценарий: ${scenario.trim().split(/\s+/).length} слов, ~${Math.round(scenario.length / PACES[settings.pace].cps)} с озвучки`,
      item.hasPrompt ? `Настройки: ${describeSettings(settings)}` : 'prompt.txt нет — настройки по умолчанию',
      wishes ? `Пожелания: ${wishes.length > 200 ? wishes.slice(0, 200) + '…' : wishes}` : null,
      sources.length ? 'Файлы:' : 'Файлов в sources нет',
      ...sources.map((s) => `  ${s.kind === 'image' ? '🖼 ' : s.kind === 'video' ? '🎞 ' : '🎵'} ${path.basename(s.file)}`),
    ]
      .filter(Boolean)
      .join('\n'),
    item.name,
  );
  for (const w of warnings) p.log.warn(w);

  const plan = await getPlan(item, scenario, wishes, sources, settings);
  if (settings.accentSource === 'images' && plan.accent) {
    settings.accent = plan.accent;
    settings.accent2 = secondAccent(plan.accent);
  }
  showPlan(plan.scenes, settings, plan.warnings);
  saveProject(item.dir, settings, {key: plan.key, scenes: plan.scenes, accent: plan.accent});
  // Только раскадровка — посмотреть, что придумал ИИ, не тратя озвучку и рендер
  if (args.includes('--plan-only')) {
    p.log.success(`Раскадровка сохранена: ${rel(path.join(item.dir, '.project', 'plan.json'))}`);
    return;
  }

  const out = settings.silent ? nextVideoPath(item.dir, item.name).replace(/\.mp4$/, ' (без звука).mp4') : nextVideoPath(item.dir, item.name);
  const spin = p.spinner();
  spin.start('Подготовка');
  const t0 = Date.now();
  try {
    const {seconds} = await buildVideo(item.dir, plan.scenes, settings, out, {
      log: (m) => p.log.warn(m),
      progress: (stage, pct) => spin.message(pct === undefined ? stage : `${stage}: ${pct}%`),
    });
    spin.stop(`Видео готово: ${Math.round(seconds)} с, собрано за ${Math.round((Date.now() - t0) / 1000)} с`);
  } catch (e) {
    spin.error('Ошибка');
    throw e;
  }
  p.outro(`Готово: ${rel(out)}`);
}

// ================================================================ меню

async function main() {
  p.intro(' Генератор motion-видео ');
  if (!process.env.GEMINI_API_KEY) throw new Error(`Нет GEMINI_API_KEY — добавьте его в ${rel(envFile)}`);

  if (AUTO) {
    const items = findVideos();
    const name = flag('video');
    const item = name ? items.find((v) => v.name === name) : items.find((v) => !v.videos.length);
    if (!item) throw new Error('Нет подходящего видео в videos/');
    return generate(item);
  }

  const mode = await ask(
    p.select({
      message: 'Что делаем?',
      options: [
        {value: 'create', label: 'Создать проект', hint: 'вопросы → папка с prompt.txt'},
        {value: 'generate', label: 'Начать генерацию видео'},
      ],
    }),
  );
  if (mode === 'create') return createProject();

  const items = findVideos();
  if (!items.length) {
    p.note('Сначала создайте проект или папку videos/<название>/ со scenario.txt', 'Видео нет');
    return p.outro('Нечего генерировать');
  }
  const item = await ask(
    p.select({
      message: 'Какое видео генерируем?',
      options: items.map((v) => ({
        value: v,
        label: v.name,
        hint: [v.videos.length ? `готово, версий: ${v.videos.length}` : 'новое', v.hasPrompt ? null : 'без prompt.txt']
          .filter(Boolean)
          .join(', '),
      })),
    }),
  );
  await generate(item);
}

main().catch((e: Error) => {
  p.log.error(e.message);
  p.outro('Не получилось');
  process.exit(1);
});
