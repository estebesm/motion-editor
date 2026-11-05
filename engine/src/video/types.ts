/**
 * Формат проекта. Пользователь пишет projects/<имя>/video.json,
 * scripts/make.ts дополняет его служебными полями (durationInFrames, audio).
 */

/** Слово озвучки и когда оно звучит (кадры от начала голоса) */
export type WordTime = {w: string; s: number; e: number};

/**
 * Фраза диктора и надпись к ней: надпись пишется на экране, пока звучит эта фраза, и остаётся до конца сцены.
 * w0/w1 — индексы слов фразы в voice (w1 — не включая).
 */
export type SpokenLine = {
  /** Что на экране (акцент — в *звёздочках*); "" — фраза-связка без надписи */
  text: string;
  /** line — строка рассказа, head — заголовок перечисления/схемы, item — пункт, left/right — стороны сравнения */
  role: 'line' | 'head' | 'item' | 'left' | 'right';
  icon?: string;
  w0: number;
  w1: number;
};

type SceneCommon = {
  /** Фразы диктора с надписями (новый формат: всё на экране привязано к речи) */
  lines?: SpokenLine[];
  /** Текст озвучки этой сцены (как на экране) */
  voice?: string;
  /** Тот же текст для диктора: латиница и числа записаны кириллицей */
  speech?: string;
  /** Слова, которые выделить цветом, когда текст речи появляется на экране */
  highlight?: string[];
  /** Ключевые фразы на экран (дословно из озвучки), акцентное слово — в *звёздочках* */
  keys?: string[];
  /** Главный тезис сцены на экране: законченная мысль, держится всю сцену; акцент — в *звёздочках* */
  headline?: string;
  /** Дополняющая строка под тезисом: появляется, когда звучит, и остаётся */
  subline?: string;
  /** Минимальная длительность сцены в секундах (если озвучки нет или она короткая) */
  minSeconds?: number;
  // --- заполняется автоматически ---
  durationInFrames?: number;
  audio?: string;
  audioFrames?: number;
  words?: WordTime[];
};

export type TitleScene = SceneCommon & {
  type: 'title';
  kicker?: string;
  title: string;
  subtitle?: string;
};

export type MorphScene = SceneCommon & {
  type: 'morph';
  word: string;
  caption?: string;
};

export type ImageScene = SceneCommon & {
  type: 'image';
  /** Картинка или видео (путь относительно папки задачи) */
  image: string;
  title?: string;
  caption?: string;
  side?: 'left' | 'right';
  /** Для видео: с какой секунды брать фрагмент */
  clipStart?: number;
  /**
   * Как показать: static — как есть (без обрезки), kenburns — плавный наезд камеры,
   * phone — запись экрана / скриншот приложения в рамке телефона.
   */
  effect?: 'static' | 'kenburns' | 'phone';
  // --- заполняется автоматически ---
  isVideo?: boolean;
  width?: number;
  height?: number;
  orientation?: 'portrait' | 'landscape' | 'square';
  /** Длительность видеофайла, секунд */
  mediaDuration?: number;
  /** Ещё картинки в этой же сцене (показываются в ряд, например несколько логотипов) */
  more?: {image: string; width?: number; height?: number; cutout?: boolean}[];
  /** Логотип с вырезанным фоном (прозрачный PNG) — показываем без карточки */
  cutout?: boolean;
};

export type ListScene = SceneCommon & BrandLogo & {
  type: 'list';
  title?: string;
  items: string[];
  /** Иконки к пунктам (имена из ICONS) */
  icons?: string[];
};

/** Типографика в такт речи: фразы озвучки появляются на экране по словам */
/** Логотип бренда, который назван в надписи: появляется вместе с этой фразой */
export type BrandLogo = {logo?: string; logoWidth?: number; logoHeight?: number; logoCutout?: boolean; logoLine?: number};

export type KineticScene = SceneCommon &
  BrandLogo & {
    type: 'kinetic';
    kicker?: string;
    icon?: string;
  };

/** Схема: цепочка шагов (flow) или центр со связями (hub) */
export type DiagramScene = SceneCommon & {
  type: 'diagram';
  title?: string;
  layout: 'flow' | 'hub';
  nodes: {label: string; icon?: string}[];
};

/** Сравнение двух вещей */
export type CompareScene = SceneCommon & {
  type: 'compare';
  title?: string;
  left: {title: string; icon?: string; points: string[]};
  right: {title: string; icon?: string; points: string[]};
};

/** Ключевая мысль или предупреждение крупно на цветной заливке */
export type StatementScene = SceneCommon & {
  type: 'statement';
  kicker?: string;
  text: string;
  caption?: string;
};

export type OutroScene = SceneCommon & {
  type: 'outro';
  title: string;
  /** Логотип бренда из sources (вместо надписи-названия) */
  logo?: string;
  logoWidth?: number;
  logoHeight?: number;
  logoCutout?: boolean;
  subtitle?: string;
  cta?: string;
  /** Значки App Store и Google Play под текстом (в тексте финала упомянуты магазины) */
  stores?: boolean;
};

export type Scene = TitleScene | MorphScene | ImageScene | ListScene | StatementScene | OutroScene | KineticScene | DiagramScene | CompareScene;

export type VoiceSettings = {
  /** Голос Gemini TTS: Charon, Kore, Puck, Fenrir, Aoede, Orus, Zephyr... */
  name?: string;
  /** Описание манеры чтения, на английском или русском */
  style?: string;
  model?: string;
};

export type ProjectFile = {
  title?: string;
  voice?: VoiceSettings;
  /** Фоновая музыка (путь относительно папки проекта) */
  music?: string;
  musicVolume?: number;
  scenes: Scene[];
};

export type Theme = {
  /** Шрифт заголовков ролика (по умолчанию Dela Gothic One): семейство, файл и ширины глифов для подгонки */
  font?: {family: string; url: string; glyphs: Record<string, number>};
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  light: boolean;
  /** Множитель «ручной» тряски камеры */
  shake: number;
  /** Клиповый монтаж: каждая фраза — отдельный кадр */
  clip?: boolean;
  /** Фирменные ленты (диагональные полосы со «ступенькой») на фоне и диагональная шторка на склейках */
  ribbons?: boolean;
};

export type VideoProps = {
  theme?: Theme;
  /** Показывать субтитры озвучки */
  subtitles?: boolean;
  scenes: Scene[];
  music?: string;
  musicVolume?: number;
  /** Кадров на переход между сценами */
  transitionFrames: number;
  /** Задержка начала озвучки внутри сцены, кадров */
  voiceDelay: number;
  /** Звуковые эффекты на таймлайне: файл, с какого кадра, сколько кадров, громкость */
  sfx?: {src: string; from: number; frames: number; volume: number}[];
};
