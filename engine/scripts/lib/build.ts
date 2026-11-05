import {execFileSync, spawn} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {Scene, VideoProps} from '../../src/video/types.ts';
import {durationSec} from './audio.ts';
import {ENGINE, PROJECT_DIR, ROOT} from './paths.ts';
import {ensureLibrary, planSfx, typedCues} from './sfx.ts';
import {finishSound} from './sound-finish.ts';
import {glyphWidths} from './glyphs.ts';
import {buildTheme, DYNAMICS, PACES, type Settings, voiceStyle} from './settings.ts';
import {NEEDS_CONVERT, scanSources} from './sources.ts';
import {cutoutLogo} from './cutout.ts';
import {clipPath, pool, voiceClip, wordTimings} from './voice.ts';
import {QuotaError, TTS_MODELS} from './gemini.ts';

const FPS = 30;
const VOICE_DELAY = 8;
const MIN_SCENE = 3;

export type Log = (msg: string) => void;
export type Progress = (stage: string, pct?: number) => void;

/**
 * Готовит всё для рендера: медиа в public/, озвучка, длительности.
 * Возвращает путь к props.json.
 */
export async function prepare(
  taskDir: string,
  scenesIn: Scene[],
  settings: Settings,
  {log, progress}: {log: Log; progress: Progress},
): Promise<{propsPath: string; pubDir: string; seconds: number}> {
  const id = crypto.createHash('sha1').update(taskDir).digest('hex').slice(0, 10);
  const pubRel = `generated/${id}`;
  const pubDir = path.join(ENGINE, 'public', pubRel);
  const projDir = path.join(taskDir, PROJECT_DIR);
  fs.rmSync(pubDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(pubDir, 'voice'), {recursive: true});

  const sources = new Map(scanSources(taskDir).map((s) => [s.file, s]));
  let mediaN = 0;
  const big = (rel: string) => {
    const s = sources.get(rel);
    return s?.kind === 'image' && (s.width ?? 0) > 2600;
  };
  const hasAlpha = (file: string) =>
    /a/.test(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=pix_fmt', '-of', 'csv=p=0', file]).toString().replace('gray', ''));
  /** Копирует файл задачи в public/ под безопасным именем, возвращает путь для staticFile(). */
  const publish = (rel: string) => {
    const src = path.join(taskDir, rel);
    if (!fs.existsSync(src)) throw new Error(`Файл не найден: ${rel}`);
    const ext = path.extname(rel).toLowerCase();
    const conv = NEEDS_CONVERT[ext];
    const name = `media/${String(++mediaN).padStart(2, '0')}${conv ?? ext}`;
    const dst = path.join(pubDir, name);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    // .ico может содержать несколько размеров — берём самый крупный поток
    if (conv) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-frames:v', '1', dst]);
    else if (big(rel)) {
      // Огромные фото (4–5K, десятки МБ) тормозят рендер — уменьшаем до 2400 px по ширине
      const ext2 = hasAlpha(src) ? '.png' : '.jpg';
      const out = dst.replace(/\.[a-z0-9]+$/i, ext2);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', 'scale=2400:-2', '-q:v', '2', out]);
      return `${pubRel}/${name.replace(/\.[a-z0-9]+$/i, ext2)}`;
    } else fs.copyFileSync(src, dst);
    return `${pubRel}/${name}`;
  };
  /** Логотип: вырезаем фон и поля; если фон не однотонный — публикуем как есть */
  const isLogoFile = (rel: string) => /логотип|лого|logo/i.test(path.basename(rel));
  const publishLogo = (rel: string): {image: string; width?: number; height?: number; cutout?: boolean} => {
    const name = `media/${String(++mediaN).padStart(2, '0')}.png`;
    const dst = path.join(pubDir, name);
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    try {
      const dims = cutoutLogo(path.join(taskDir, rel), dst, {darkTheme: settings.theme === 'dark'});
      if (dims) return {image: `${pubRel}/${name}`, ...dims, cutout: true};
    } catch (e) {
      log(`Не удалось вырезать фон у «${path.basename(rel)}»: ${(e as Error).message.slice(0, 120)}`);
    }
    return {image: publish(rel)};
  };

  const dyn = DYNAMICS[settings.dynamics];
  const style = voiceStyle(settings);
  const scenes: Scene[] = [];

  for (const [i, original] of scenesIn.entries()) {
    const scene: Scene = structuredClone(original);
    const n = String(i + 1).padStart(2, '0');
    progress(`Сцена ${n}/${scenesIn.length}: подготовка`);

    if (scene.type === 'image') {
      const src = sources.get(scene.image);
      if (!src) throw new Error(`Сцена ${n}: файл не найден — ${scene.image}`);
      scene.isVideo = src.kind === 'video';
      scene.width = src.width;
      scene.height = src.height;
      scene.orientation = src.orientation;
      scene.mediaDuration = src.duration;
      if (src.kind === 'image' && isLogoFile(scene.image)) {
        const l = publishLogo(scene.image);
        scene.image = l.image;
        if (l.cutout) Object.assign(scene, {width: l.width, height: l.height, cutout: true});
      } else scene.image = publish(scene.image);
      scene.more = scene.more?.map((m) => {
        const ms = sources.get(m.image);
        if (isLogoFile(m.image)) {
          const l = publishLogo(m.image);
          return l.cutout ? l : {image: l.image, width: ms?.width, height: ms?.height};
        }
        return {image: publish(m.image), width: ms?.width, height: ms?.height};
      });
    }

    if ((scene.type === 'outro' || scene.type === 'kinetic' || scene.type === 'list') && scene.logo) {
      const l = isLogoFile(scene.logo) ? publishLogo(scene.logo) : {image: publish(scene.logo)};
      const ms = sources.get(scene.logo);
      Object.assign(scene, {logo: l.image, logoWidth: l.width ?? ms?.width, logoHeight: l.height ?? ms?.height, logoCutout: !!l.cutout});
    }

    scenes.push(scene);
  }

  // Озвучка: параллельно, с проверкой распознаванием; затем тайминги слов для анимации текста
  const cacheDir = path.join(projDir, 'tts');
  const pron = Object.fromEntries(Object.entries(settings.pronounce ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  // Если у модели озвучки кончился дневной лимит — всё видео переозвучиваем следующей моделью,
  // чтобы голос в ролике был одинаковым
  // Сначала — модель, которой уже озвучена большая часть ролика: доозвучиваем ей только новые фразы,
  // и голос не меняется от версии к версии
  const speeches = scenes.map((x) => x.speech?.trim() || x.voice?.trim()).filter((x): x is string => !!x);
  const cached = (m: string) => speeches.filter((sp) => fs.existsSync(clipPath(sp, {voice: settings.voice, style, model: m, cacheDir}))).length;
  const models = [...TTS_MODELS].sort((a, b) => cached(b) - cached(a));
  if (cached(models[0]) > 0) log(`Озвучка: ${cached(models[0])}/${speeches.length} фраз уже озвучены моделью ${models[0]} — доозвучиваю ей же`);
  // Без озвучки: каждое слово «звучит» по темпу речи, на знаках препинания — паузы, как у диктора
  if (settings.silent) {
    const cps = PACES[settings.pace].cps * 1.1;
    for (const scene of scenes) {
      const text = scene.voice?.trim();
      if (!text) continue;
      let t = 0;
      scene.words = text.split(/\s+/).map((w) => {
        const s = t;
        t += Math.max(0.16, (w.replace(/[^\p{L}\p{N}]/gu, '').length + 1) / cps);
        const e = t;
        if (/[.!?…]$/.test(w)) t += 0.42;
        else if (/[,:;—–-]$/.test(w) || /^[—–]$/.test(w)) t += 0.2;
        return {w, s: Math.round(s * FPS), e: Math.round(e * FPS)};
      });
      scene.audioFrames = Math.ceil(t * FPS);
    }
  }
  for (const [mi, model] of settings.silent ? [] : models.entries()) {
    let done = 0;
    try {
      await pool(scenes, 4, async (scene, i) => {
        const text = scene.voice?.trim();
        const speech = scene.speech?.trim() || text;
        if (!text || !speech) return;
        const clip = await voiceClip(speech, {voice: settings.voice, style, model, cacheDir, log, display: text});
        progress(`Озвучка: ${++done}/${scenes.length}`);
        const n = String(i + 1).padStart(2, '0');
        const out = path.join(pubDir, 'voice', `${n}.wav`);
        fs.copyFileSync(clip, out);
        scene.audio = `${pubRel}/voice/${n}.wav`;
        scene.audioFrames = Math.ceil(durationSec(out) * FPS);
        scene.words = wordTimings(out, text, pron).map((w) => ({w: w.w, s: Math.round(w.s * FPS), e: Math.round(w.e * FPS)}));
      });
      break;
    } catch (e) {
      if (e instanceof QuotaError && mi === models.length - 1)
        throw new Error('У всех моделей озвучки исчерпан дневной лимит Gemini — попробуйте через несколько часов. Готовая озвучка из кэша не пропадёт.');
      if (!(e instanceof QuotaError)) throw e;
      log(`${e.message} — озвучиваю моделью ${models[mi + 1]}`);
    }
  }
  for (const scene of scenes) {
    const minFrames = Math.round((scene.minSeconds ?? MIN_SCENE) * FPS);
    scene.durationInFrames = Math.max(minFrames, scene.audioFrames ? VOICE_DELAY + scene.audioFrames + dyn.tail : 0);
  }

  // Звуковые эффекты: библиотека настоящих записей (общая для всех видео) → на кадры событий
  let sfx: VideoProps['sfx'];
  if (settings.sfx !== 'off' && !settings.silent) {
    const libDir = path.join(ROOT, 'sfx', 'library');
    try {
      const lib = await ensureLibrary(libDir, log);
      const published = new Map<string, string>();
      const pub = (e: {file: string}) => {
        if (!published.has(e.file)) {
          const name = `sfx/${e.file.replace(/[\\/]/g, '_')}`;
          fs.mkdirSync(path.join(pubDir, 'sfx'), {recursive: true});
          fs.copyFileSync(path.join(libDir, e.file), path.join(pubDir, name));
          published.set(e.file, `${pubRel}/${name}`);
        }
        return published.get(e.file)!;
      };
      sfx = planSfx(scenes, {fps: FPS, transition: dyn.transition, voiceDelay: VOICE_DELAY, gain: settings.sfx === 'soft' ? 0.6 : 1}, lib, pub);
      fs.mkdirSync(projDir, {recursive: true});
      fs.writeFileSync(path.join(projDir, 'sfx-cues.json'), JSON.stringify(typedCues(sfx, FPS, dyn.transition), null, 1));
      progress(`Звуки: ${sfx.length} эффектов`);
    } catch (e) {
      log(`Звуки пропущены: ${(e as Error).message.slice(0, 160)}`);
    }
  }

  // Дорожка одного голоса (без эффектов) — для real-sfx и earshot
  if (!settings.silent) try {
    const inputs: string[] = [];
    const parts: string[] = [];
    let at = 0;
    scenes.forEach((x) => {
      if (x.audio) {
        const ms = Math.round(((at + VOICE_DELAY) / FPS) * 1000);
        inputs.push('-i', path.join(ENGINE, 'public', x.audio));
        parts.push(`[${parts.length}]adelay=${ms}|${ms}[v${parts.length}]`);
      }
      at += (x.durationInFrames ?? 0) - dyn.transition;
    });
    const total = (at + dyn.transition) / FPS;
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', `${parts.join(';')};${parts.map((_, i) => `[v${i}]`).join('')}amix=inputs=${parts.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}[o]`, '-map', '[o]', '-ar', '48000', '-ac', '2', path.join(projDir, 'voice-stem.wav')]);
  } catch (e) {
    log(`Дорожка голоса не собрана: ${(e as Error).message.slice(0, 120)}`);
  }

  /** Шрифт заголовков: файл из sources (публикуется) или встроенный из engine/public/fonts; ширины глифов — для подгонки текста */
  const headFont = (name: string) => {
    const BUILTIN: Record<string, string> = {unbounded: 'Unbounded-SemiBold.ttf'};
    const builtin = BUILTIN[name.toLowerCase()] ?? (fs.existsSync(path.join(ENGINE, 'public', 'fonts', name)) ? name : null);
    const rel = builtin ? null : [name, `sources/${name}`].find((r) => fs.existsSync(path.join(taskDir, r)));
    if (!builtin && !rel) throw new Error(`Шрифт «${name}» не найден ни в sources, ни в engine/public/fonts`);
    const file = builtin ? path.join(ENGINE, 'public', 'fonts', builtin) : path.join(taskDir, rel!);
    return {family: `Head ${path.basename(file).replace(/\.[a-z0-9]+$/i, '')}`, url: builtin ? `fonts/${builtin}` : publish(rel!), glyphs: glyphWidths(file)};
  };

  const props: VideoProps = {
    sfx,
    scenes,
    theme: {...buildTheme(settings), ...(settings.font ? {font: headFont(settings.font)} : {})},
    subtitles: settings.subtitles,
    music: settings.music ? publish(settings.music) : undefined,
    transitionFrames: dyn.transition,
    voiceDelay: VOICE_DELAY,
  };
  fs.mkdirSync(projDir, {recursive: true});
  const propsPath = path.join(projDir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));
  const frames = scenes.reduce((s, x) => s + x.durationInFrames!, 0) - dyn.transition * (scenes.length - 1);
  return {propsPath, pubDir, seconds: frames / FPS};
}

/** Рендер через Remotion CLI с разбором прогресса. */
export function render(propsPath: string, out: string, quality: Settings['quality'], progress: Progress, muted = false): Promise<void> {
  fs.mkdirSync(path.dirname(out), {recursive: true});
  const args = ['remotion', 'render', 'Video', out, `--props=${propsPath}`, '--crf=16', ...(quality === 'draft' ? ['--scale=0.5'] : quality === '4k' ? ['--scale=2', '--jpeg-quality=95'] : ['--jpeg-quality=95']), ...(muted ? ['--muted'] : [])];
  return new Promise((resolve, reject) => {
    const p = spawn('npx', args, {cwd: ENGINE});
    let tail = '';
    const onData = (b: Buffer) => {
      const t = b.toString();
      tail = (tail + t).slice(-4000);
      const r = [...t.matchAll(/(Rendered|Encoded) (\d+)\/(\d+)/g)].pop();
      if (r) progress(r[1] === 'Rendered' ? 'Рендер кадров' : 'Кодирование', Math.round((+r[2] / +r[3]) * 100));
      else if (/Bundling/.test(t)) progress('Сборка проекта');
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Рендер упал (код ${code}):\n${tail}`))));
  });
}

/** Подготовка + рендер + уборка временных файлов. */
export async function buildVideo(
  taskDir: string,
  scenes: Scene[],
  settings: Settings,
  out: string,
  cb: {log: Log; progress: Progress},
) {
  const {propsPath, pubDir, seconds} = await prepare(taskDir, scenes, settings, cb);
  try {
    await render(propsPath, out, settings.quality, cb.progress, settings.silent);
    if (!settings.silent) finishSound(taskDir, out, settings, cb);
  } finally {
    fs.rmSync(pubDir, {recursive: true, force: true});
  }
  return {seconds};
}

/** Открыть превью в браузере (Remotion Studio). Блокирует, пока не закрыть Ctrl+C. */
export async function studio(taskDir: string, scenes: Scene[], settings: Settings, cb: {log: Log; progress: Progress}) {
  const {propsPath, pubDir} = await prepare(taskDir, scenes, settings, cb);
  await new Promise<void>((resolve) => {
    const p = spawn('npx', ['remotion', 'studio', `--props=${propsPath}`], {cwd: ENGINE, stdio: 'inherit'});
    p.on('close', () => resolve());
  });
  fs.rmSync(pubDir, {recursive: true, force: true});
}
