/**
 * prompt.txt — настройки и пожелания к видео в человекочитаемом виде.
 * Строки «Ключ: значение», комментарии начинаются с «#», после строки
 * «Пожелания:» — свободный текст до конца файла.
 */
import {ACCENTS, DEFAULT_SETTINGS, DYNAMICS, isHex, MANNERS, normHex, PACES, secondAccent, type Settings, VOICES} from './settings.ts';
import type {Source} from './sources.ts';

const lc = (v: string) => v.trim().toLowerCase().replace(/ё/g, 'е');

const MANNER_WORDS: Record<string, string> = {
  преподаватель: 'teacher',
  учитель: 'teacher',
  обучающая: 'teacher',
  кинематографичная: 'cinematic',
  теплая: 'warm',
  доверительная: 'warm',
  энергичная: 'energetic',
  рекламная: 'energetic',
};
const MANNER_NAME: Record<string, string> = {teacher: 'преподаватель', cinematic: 'кинематографичная', warm: 'тёплая', energetic: 'энергичная'};
const PACE_WORDS: Record<string, Settings['pace']> = {медленный: 'slow', медленнее: 'slow', обычный: 'normal', быстрый: 'fast', быстрее: 'fast'};
const PACE_NAME = {slow: 'медленный', normal: 'обычный', fast: 'быстрый'};
const DYN_WORDS: Record<string, Settings['dynamics']> = {плавно: 'calm', сбалансированно: 'balanced', энергично: 'energetic', клипово: 'clip'};
const DYN_NAME = {calm: 'плавно', balanced: 'сбалансированно', energetic: 'энергично', clip: 'клипово'};

export function renderPrompt(s: Settings, wishes: string): string {
  const accent =
    s.accentSource === 'images' ? 'по картинкам'
    : s.accentSource === 'preset' ? (ACCENTS.find((a) => a.accent === s.accent)?.label.toLowerCase() ?? s.accent)
    : s.accent;
  const text =
    s.textMode === 'verbatim' ? 'дословно' : s.textMode === 'edit' ? 'адаптировать' : `сократить до ${s.targetSeconds ?? 30} с`;
  return `# Настройки видео. Файл можно править вручную — при следующей генерации всё подхватится.
# Строки с «#» — подсказки, генератор их не читает.

# Голос диктора: ${VOICES.map((v) => `${v.id} (${v.hint})`).join(', ')}
Голос: ${s.voice}

# Манера речи: преподаватель, кинематографичная, тёплая, энергичная — или опишите своими словами
Манера: ${s.manner === 'custom' ? (s.customManner ?? '') : MANNER_NAME[s.manner as keyof typeof MANNER_NAME]}

# Темп речи: медленный, обычный, быстрый
Темп: ${PACE_NAME[s.pace]}

# Произношение названий для диктора (на экране останется как в тексте): Слово = как читать, через запятую
Произношение: ${Object.entries(s.pronounce ?? {}).map(([a, b]) => `${a} = ${b}`).join(', ')}

# Текст сценария: адаптировать (ИИ перепишет под формат видео: связно, для уха, все факты и предупреждения сохранятся),
# дословно (озвучить как есть), сократить до 30 с (адаптировать и уложить в длительность)
Текст: ${text}

# Тема: тёмная, светлая
Тема: ${s.theme === 'light' ? 'светлая' : 'тёмная'}

# Цвет акцента: ${ACCENTS.map((a) => a.label.toLowerCase()).join(', ')}, по картинкам — или HEX, например #ff4d2e
Акцент: ${s.accentSource === 'custom' && s.accent2 !== secondAccent(s.accent) ? `${s.accent}, ${s.accent2}` : accent}

# Шрифт заголовков: Dela Gothic One, Unbounded — или имя файла шрифта из sources (.ttf/.otf), например фирменный
Шрифт: ${s.font ?? 'Dela Gothic One'}

# Цвет фона (необязательно): HEX, например #1C1B23 — иначе цвет темы
Фон: ${s.bg ?? 'по теме'}

# Фирменные ленты (диагональные полосы) на фоне и диагональная шторка на склейках: да, нет
Ленты: ${s.ribbons ? 'да' : 'нет'}

# Динамика монтажа: плавно, сбалансированно, энергично, клипово (каждая фраза — свой кадр)
Динамика: ${DYN_NAME[s.dynamics]}

# Фоновая музыка: нет — или имя аудиофайла из sources
Музыка: ${s.music ? s.music.replace(/^sources\//, '') : 'нет'}

# Звуковые эффекты — настоящие записи (Openverse, CC0): пролёты на склейках, попы на пунктах, логотип, финал: да, тихо, нет
Звуки: ${s.sfx === 'off' ? 'нет' : s.sfx === 'soft' ? 'тихо' : 'да'}

# Субтитры внизу экрана (обычно не нужны — ключевые слова и так анимируются на экране): да, нет
Субтитры: ${s.subtitles ? 'да' : 'нет'}

# Финальный экран с кнопкой: текст кнопки — или нет
Кнопка: ${s.cta ?? 'нет'}

# Качество: финал (1080p), 4K (2160p, чётче, рендер в ~3 раза дольше), черновик (540p, быстрее)
Качество: ${s.quality === 'draft' ? 'черновик' : s.quality === '4k' ? '4K' : 'финал'}

# Пожелания: что хотите видеть в видео — свободным текстом, сколько угодно строк.
# Например: «записи экрана — в рамке телефона», «предупреждение о рисках выдели отдельной сценой», «без морфинга».
Пожелания:
${wishes.trim()}
`;
}

export function parsePrompt(text: string, sources: Source[]): {settings: Settings; wishes: string; warnings: string[]} {
  const s: Settings = structuredClone(DEFAULT_SETTINGS);
  const warnings: string[] = [];
  const lines = text.split(/\r?\n/);
  const wishIdx = lines.findIndex((l) => /^\s*пожелания\s*:/i.test(l));
  const head = wishIdx >= 0 ? lines.slice(0, wishIdx) : lines;
  const wishes =
    wishIdx >= 0
      ? [lines[wishIdx].replace(/^\s*пожелания\s*:/i, ''), ...lines.slice(wishIdx + 1)]
          .filter((l) => !l.trim().startsWith('#'))
          .join('\n')
          .trim()
      : '';
  const bad = (key: string, v: string) => warnings.push(`prompt.txt: непонятное значение «${key}: ${v}» — беру по умолчанию`);

  for (const line of head) {
    const m = line.match(/^\s*([^#:][^:]*?)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = lc(m[1]);
    const raw = m[2].trim();
    const v = lc(raw);
    if (!raw) continue;
    switch (key) {
      case 'голос': {
        const known = VOICES.find((x) => lc(x.id) === v);
        if (known) s.voice = known.id;
        else if (/^[a-z]+$/i.test(raw)) s.voice = raw[0].toUpperCase() + raw.slice(1).toLowerCase();
        else bad(m[1], raw);
        break;
      }
      case 'манера':
        if (MANNER_WORDS[v]) s.manner = MANNER_WORDS[v];
        else {
          s.manner = 'custom';
          s.customManner = raw;
        }
        break;
      case 'темп':
        if (PACE_WORDS[v]) s.pace = PACE_WORDS[v];
        else bad(m[1], raw);
        break;
      case 'текст':
        if (v.startsWith('дослов')) s.textMode = 'verbatim';
        else if (v.startsWith('адапт') || v.startsWith('поправ') || v.startsWith('перепис')) s.textMode = 'edit';
        else if (v.startsWith('сократ')) {
          s.textMode = 'shorten';
          s.targetSeconds = parseInt(v.match(/\d+/)?.[0] ?? '30', 10);
        } else bad(m[1], raw);
        break;
      case 'тема':
        if (v.startsWith('свет')) s.theme = 'light';
        else if (v.startsWith('тем')) s.theme = 'dark';
        else bad(m[1], raw);
        break;
      case 'акцент': {
        const preset = ACCENTS.find((a) => lc(a.label) === v);
        if (preset) {
          s.accentSource = 'preset';
          s.accent = preset.accent;
          s.accent2 = preset.accent2;
        } else if (v.startsWith('по картин')) s.accentSource = 'images';
        else if (isHex(raw)) {
          s.accentSource = 'custom';
          s.accent = normHex(raw);
          s.accent2 = secondAccent(s.accent);
        } else if (raw.split(/[,\s]+/).filter(Boolean).length === 2 && raw.split(/[,\s]+/).filter(Boolean).every(isHex)) {
          // Два цвета: акцент и второй акцент (для градиентов), например из брендбука
          const [a, b] = raw.split(/[,\s]+/).filter(Boolean);
          s.accentSource = 'custom';
          s.accent = normHex(a);
          s.accent2 = normHex(b);
        } else bad(m[1], raw);
        break;
      }
      case 'шрифт':
        s.font = /^dela/i.test(raw) ? undefined : raw;
        break;
      case 'фон':
        if (isHex(raw)) s.bg = normHex(raw);
        else if (!v.startsWith('по тем')) bad(m[1], raw);
        break;
      case 'ленты':
        s.ribbons = v.startsWith('да');
        break;
      case 'динамика':
        if (DYN_WORDS[v]) s.dynamics = DYN_WORDS[v];
        else bad(m[1], raw);
        break;
      case 'музыка': {
        if (v === 'нет') break;
        const f = sources.find((x) => x.kind === 'audio' && (lc(x.name) === v || lc(x.file.replace(/^sources\//, '')) === v));
        if (f) s.music = f.file;
        else warnings.push(`prompt.txt: музыка «${raw}» не найдена в sources — без музыки`);
        break;
      }
      case 'произношение':
        s.pronounce = Object.fromEntries(
          raw
            .split(/[,;]/)
            .map((pair) => pair.split(/\s*(?:=|→|->|—)\s*/))
            .filter((x) => x.length === 2 && x[0].trim() && x[1].trim())
            .map(([a, b]) => [a.trim(), b.trim()]),
        );
        break;
      case 'звуки':
        s.sfx = v.startsWith('нет') ? 'off' : v.startsWith('тих') ? 'soft' : 'on';
        break;
      case 'субтитры':
        s.subtitles = v.startsWith('да');
        break;
      case 'кнопка':
        s.cta = v === 'нет' ? undefined : raw;
        break;
      case 'качество':
        s.quality = v.startsWith('чер') ? 'draft' : /^4\s*[kк]/i.test(v) ? '4k' : 'final';
        break;
      default:
        warnings.push(`prompt.txt: неизвестная настройка «${m[1]}»`);
    }
  }
  return {settings: s, wishes, warnings};
}

/** Короткое описание настроек одной строкой. */
export const describeSettings = (s: Settings) =>
  [
    `голос ${s.voice}`,
    s.manner === 'custom' ? s.customManner : MANNERS.find((m) => m.id === s.manner)?.label.toLowerCase(),
    `темп: ${PACES[s.pace].label.toLowerCase()}`,
    s.theme === 'light' ? 'светлая тема' : 'тёмная тема',
    s.accentSource === 'images' ? 'акцент по картинкам' : `акцент ${s.accent}`,
    DYNAMICS[s.dynamics].label.toLowerCase(),
    s.sfx === 'off' ? 'без звуков' : s.sfx === 'soft' ? 'звуки тихо' : 'со звуками',
    s.subtitles ? 'с субтитрами' : null,
    s.cta ? `кнопка «${s.cta}»` : null,
    s.quality === 'draft' ? 'черновик' : s.quality === '4k' ? '4K' : 'финал',
  ]
    .filter(Boolean)
    .join(' · ');
