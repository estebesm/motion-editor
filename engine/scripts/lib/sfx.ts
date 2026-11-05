/**
 * Звуковые эффекты: настоящие записи из Openverse (только CC0 — без атрибуции, можно в коммерческом ролике)
 * и расстановка их на точные кадры событий видео (переход, появление пункта, логотип, финал).
 *
 * Библиотека общая для всех видео: sfx/library/<вид>/*.wav + catalog.json (откуда каждый звук, автор, лицензия).
 * Скачивается один раз при первой генерации со звуками.
 */
import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type {Scene} from '../../src/video/types.ts';

export type SfxKind = 'whoosh' | 'pop' | 'hit' | 'riser' | 'sparkle';
export type SfxEntry = {
  kind: SfxKind;
  file: string;
  /** Длина и момент максимума, секунд (у «пролёта» максимум ставим точно на склейку) */
  dur: number;
  peak: number;
  /** Максимальная кратковременная громкость (LUFS, окно 400 мс) — по ней выравниваем звуки между собой */
  lufs?: number;
  title: string;
  /** openverse — настоящая запись, earshot — звук, сделанный кодом */
  origin?: 'openverse' | 'earshot';
  /** Оценка earshot: насколько звук подходит под описание нужного (калиброванный z) */
  z?: number;
  creator: string;
  license: string;
  landing: string;
};
/** at — кадр самого события (склейка, появление пункта), from — кадр начала звука */
export type SfxCue = {src: string; from: number; frames: number; volume: number; kind?: SfxKind; at?: number; g?: number};

const KINDS: Record<SfxKind, {queries: string[]; min: number; max: number; cut: number; shape: (peakAt: number) => number}> = {
  // Пролёт: нарастает и спадает — максимум ближе к середине
  whoosh: {queries: ['soft whoosh', 'transition whoosh', 'swoosh', 'air swish', 'whoosh'], min: 0.25, max: 1.6, cut: 1.2, shape: (p) => 1 - Math.abs(p - 0.45) * 1.6},
  // Щелчок/поп: мгновенная атака
  pop: {queries: ['ui pop', 'soft ui click', 'interface pop', 'ui blip'], min: 0.03, max: 0.6, cut: 0.4, shape: (p) => 1 - p * 3},
  // Удар: атака сразу, длинный хвост
  hit: {queries: ['cinematic hit', 'cinematic impact', 'logo hit', 'deep impact'], min: 0.3, max: 5, cut: 2.5, shape: (p) => 1 - p * 3},
  // Нарастание: максимум в конце
  riser: {queries: ['riser', 'uplifter', 'rising whoosh'], min: 1.2, max: 8, cut: 3, shape: (p) => p * 1.2 - 0.2},
  // Блеск для логотипа
  sparkle: {queries: ['logo sparkle', 'shimmer', 'sparkle', 'magic chime'], min: 0.4, max: 4, cut: 2, shape: (p) => 1 - p * 2},
};
const PER_KIND = 4;
/** Пролётов и попов в ролике десятки — их держим больше, чтобы не повторялись */
const perKind = (k: SfxKind) => (k === 'whoosh' || k === 'pop' ? 7 : PER_KIND);
/** Сколько записей-кандидатов оставлять, если дальше выбирает earshot */
const POOL = 14;
/** Python с установленным earshot (tools/.venv) — если его нет, отбор без него */
export const earshotPython = () => {
  const p = path.resolve(import.meta.dirname, '..', '..', '..', 'tools', '.venv', 'bin', 'python');
  return fs.existsSync(p) && fs.existsSync(path.resolve(p, '..', 'earshot')) ? p : undefined;
};
/** По названию: явно не то (голос, оружие, 8-бит, бытовые предметы) — мимо; «ui», «soft», «transition» — в плюс */
const BAD = /mouth|voice|vocal|punch|gun|shot|explos|8-?bit|chiptune|retro|game|oven|kitchen|door|alarm|scream|fart|burp|kiss|cartoon|funny|comic|laser|zap|glitch|horror|scary|distort|crash|break|glass|metal|thud|slap|bamboo|stick|sword|car|engine|water|bubbl|heart|beat|drum|loop/i;
const GOOD = /\bui\b|interface|soft|subtle|clean|smooth|transition|minimal|gentle|light|airy|cinematic|swish|swoosh|whoosh|shimmer|sparkle|uplift|riser|pop|click/i;

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: ['ignore', 'pipe', 'pipe']});
const probeDur = (f: string) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim()) || 0;

/** Громкость по 10-мс окнам, дБ — по ней находим максимум и форму звука */
function envelope(file: string): number[] {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], {maxBuffer: 64 << 20});
  const n = raw.length / 2;
  const win = 80;
  const out: number[] = [];
  for (let i = 0; i + win <= n; i += win) {
    let s = 0;
    for (let k = 0; k < win; k++) {
      const v = raw.readInt16LE((i + k) * 2) / 32768;
      s += v * v;
    }
    out.push(10 * Math.log10(s / win + 1e-12));
  }
  return out;
}

/** Самый громкий момент звука, LUFS (короткие звуки дополняем тишиной до окна измерения) */
function loudness(file: string): number {
  const {stderr} = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'apad=pad_dur=0.5,ebur128', '-f', 'null', '-'], {encoding: 'utf8'});
  const m = [...stderr.matchAll(/M:\s*(-?[\d.]+)/g)].map((x) => Number(x[1])).filter((x) => x > -70);
  return m.length ? Math.max(...m) : -20;
}

async function search(q: string): Promise<{id: string; title: string; creator: string; license: string; url: string; landing: string; duration: number}[]> {
  const u = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0&page_size=20`;
  const r = await fetch(u, {headers: {'User-Agent': 'motion-video-generator/1.0'}});
  if (!r.ok) throw new Error(`Openverse: HTTP ${r.status}`);
  const d = (await r.json()) as {results: {id: string; title: string; creator: string; license: string; url: string; foreign_landing_url: string; duration: number | null}[]};
  return d.results.map((x) => ({id: x.id, title: x.title, creator: x.creator, license: x.license, url: x.url, landing: x.foreign_landing_url, duration: (x.duration ?? 0) / 1000}));
}

/** Библиотека: если её нет — скачиваем и отбираем лучшие звуки каждого вида */
export async function ensureLibrary(dir: string, log: (m: string) => void): Promise<SfxEntry[]> {
  const catPath = path.join(dir, 'catalog.json');
  if (fs.existsSync(catPath)) {
    const cat = JSON.parse(fs.readFileSync(catPath, 'utf8')) as SfxEntry[];
    if ((Object.keys(KINDS) as SfxKind[]).every((k) => cat.some((x) => x.kind === k))) {
      if (cat.some((x) => x.lufs === undefined)) {
        for (const x of cat) x.lufs ??= loudness(path.join(dir, x.file));
        fs.writeFileSync(catPath, JSON.stringify(cat, null, 2));
      }
      return cat;
    }
  }
  log('Звуки: собираю библиотеку из Openverse (CC0) — один раз');
  const tmp = path.join(dir, '.download');
  fs.mkdirSync(tmp, {recursive: true});
  const catalog: SfxEntry[] = [];
  for (const [kind, spec] of Object.entries(KINDS) as [SfxKind, (typeof KINDS)[SfxKind]][]) {
    const seen = new Set<string>();
    const found: (SfxEntry & {score: number})[] = [];
    for (const q of spec.queries) {
      for (const r of await search(q).catch(() => [])) {
        if (seen.has(r.id) || r.license !== 'cc0' || BAD.test(r.title) || (r.duration && (r.duration < spec.min || r.duration > spec.max))) continue;
        seen.add(r.id);
        try {
          const src = path.join(tmp, `${r.id}.mp3`);
          if (!fs.existsSync(src)) {
            const res = await fetch(r.url, {headers: {'User-Agent': 'motion-video-generator/1.0'}});
            if (!res.ok) continue;
            fs.writeFileSync(src, Buffer.from(await res.arrayBuffer()));
          }
          const out = path.join(dir, kind, `${r.id}.wav`);
          fs.mkdirSync(path.dirname(out), {recursive: true});
          // Тишину в начале срезаем (звук должен начинаться на кадре события), длинный хвост — плавно гасим
          const dur0 = Math.min(spec.cut, probeDur(src));
          ff(['-i', src, '-af', `silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:${spec.cut},afade=t=out:st=${Math.max(0, dur0 - 0.12)}:d=0.12`, '-ar', '48000', '-ac', '2', out]);
          // Пиковая нормализация до −1 дБ: громкость дальше задаём уровнем в миксе
          const env = envelope(out);
          const max = Math.max(...env);
          ff(['-i', out, '-af', `volume=${(-1 - max + 3).toFixed(2)}dB,alimiter=limit=0.89`, '-ar', '48000', out + '.n.wav']);
          fs.renameSync(out + '.n.wav', out);
          const dur = probeDur(out);
          const pi = env.indexOf(max);
          const peak = pi * 0.01;
          // Звук «тянется» шумом без формы — плохой знак: доля окон в пределах 6 дБ от максимума
          const flat = env.filter((v) => v > max - 6).length / Math.max(1, env.length);
          const score = spec.shape(peak / Math.max(0.01, dur)) - flat * 0.8 + (GOOD.test(r.title) ? 0.4 : 0);
          if (dur < spec.min * 0.6) continue;
          found.push({kind, file: path.relative(dir, out), dur, peak, lufs: loudness(out), title: r.title, creator: r.creator, license: r.license, landing: r.landing, score});
        } catch {
          /* битый файл — пропускаем */
        }
      }
      if (found.length >= POOL + 2) break;
    }
    // Кандидатов оставляем с запасом: дальше их «послушает» earshot (если установлен)
    found.sort((a, b) => b.score - a.score);
    const keep = found.slice(0, earshotPython() ? POOL : perKind(kind));
    for (const x of found.slice(keep.length)) fs.rmSync(path.join(dir, x.file), {force: true});
    catalog.push(...keep.map(({score: _s, ...x}) => ({...x, origin: 'openverse' as const})));
  }
  // earshot: добавляет кандидатов, сделанных кодом, и ранжирует всех «на слух» по описанию нужного звука
  const py = earshotPython();
  if (py) {
    log('Звуки: earshot слушает кандидатов и выбирает лучших (первый раз — пара минут)');
    try {
      const out = execFileSync(py, [path.join(import.meta.dirname, '..', 'sfx_curate.py'), dir], {encoding: 'utf8', maxBuffer: 16 << 20, stdio: ['ignore', 'pipe', 'ignore'], env: {...process.env, PATH: `/opt/homebrew/opt/ffmpeg-full/bin:${process.env.PATH}`}});
      const ranked = JSON.parse(out.trim().split('\n').pop()!) as Record<SfxKind, {file: string; z: number; verdict: string; like: string}[]>;
      const picked: SfxEntry[] = [];
      for (const kind of Object.keys(KINDS) as SfxKind[]) {
        const list = (ranked[kind] ?? []).slice(0, perKind(kind));
        for (const r of list) {
          let e = catalog.find((x) => x.file === r.file);
          if (!e) {
            // Звук из банка earshot: меряем так же, как записи
            const f = path.join(dir, r.file);
            const env = envelope(f);
            e = {kind, file: r.file, dur: probeDur(f), peak: env.indexOf(Math.max(...env)) * 0.01, lufs: loudness(f), title: path.basename(r.file, '.wav').replace(/^es_/, ''), origin: 'earshot', creator: 'earshot (сделан кодом)', license: 'MIT', landing: 'https://github.com/Leonxlnx/earshot'};
          }
          picked.push({...e, z: r.z});
        }
        // Всё, что не прошло отбор, удаляем
        for (const r of (ranked[kind] ?? []).slice(perKind(kind))) fs.rmSync(path.join(dir, r.file), {force: true});
        log(`Звуки: ${kind} — ${list.map((r) => `${r.file.includes('/es_') ? 'код' : 'запись'} z${r.z}`).join(', ')}`);
      }
      catalog.splice(0, catalog.length, ...picked);
    } catch (e) {
      log(`earshot не сработал (${(e as Error).message.slice(0, 120)}) — беру отбор по названиям и форме звука`);
      const keep: SfxEntry[] = [];
      for (const kind of Object.keys(KINDS) as SfxKind[]) keep.push(...catalog.filter((x) => x.kind === kind).slice(0, perKind(kind)));
      catalog.splice(0, catalog.length, ...keep);
    }
  }
  fs.rmSync(tmp, {recursive: true, force: true});
  // type / source — колонки, которые читает real-sfx (вид звука и исходная запись: каждая — своя)
  fs.writeFileSync(catPath, JSON.stringify(catalog.map((x) => ({...x, type: x.kind, source: path.basename(x.file, '.wav')})), null, 2));
  fs.writeFileSync(
    path.join(dir, 'CREDITS.md'),
    '# Звуки библиотеки: записи — CC0 (Openverse / Freesound), остальные сделаны кодом в earshot (MIT)\n\n' +
      catalog.map((x) => `- ${x.kind}: «${x.title}» — ${x.creator} — ${x.landing}${x.z !== undefined ? ` (earshot z ${x.z})` : ''}`).join('\n') +
      '\n',
  );
  return catalog;
}

/** Уровни: звуки — фон к голосу, не поверх него */
/** Целевая громкость каждого вида, LUFS (голос ≈ −16): пролёты и попы заметно тише речи, удар финала — почти вровень */
const TARGET: Record<SfxKind, number> = {whoosh: -27, pop: -28, hit: -19, riser: -24, sparkle: -25};
const levelOf = (e: SfxEntry, k: SfxKind) => Math.min(1, 10 ** ((TARGET[k] - (e.lufs ?? -14)) / 20));

/**
 * Где звучат эффекты: склейки сцен — пролёт (максимум ровно на середине перехода), пункты списков и узлы схем — поп,
 * логотип бренда — блеск, финал — нарастание в логотип и удар. Все времена — из тех же данных, что и анимация.
 */
export function planSfx(
  scenes: Scene[],
  {fps, transition, voiceDelay, gain}: {fps: number; transition: number; voiceDelay: number; gain: number},
  lib: SfxEntry[],
  publish: (e: SfxEntry) => string,
): SfxCue[] {
  const byKind = (k: SfxKind) => lib.filter((x) => x.kind === k);
  const used: Record<string, number> = {};
  // Варианты по кругу, чтобы одинаковые события не звучали одним и тем же сэмплом
  const next = (k: SfxKind) => {
    const list = byKind(k);
    if (!list.length) return undefined;
    used[k] = (used[k] ?? -1) + 1;
    return list[used[k] % list.length];
  };
  const cues: SfxCue[] = [];
  // Где звучит голос: эффект, который на него попадает, на 6 дБ тише
  const voice: [number, number][] = [];
  {
    let t0 = 0;
    for (const s of scenes) {
      if (s.audioFrames) voice.push([t0 + voiceDelay, t0 + voiceDelay + s.audioFrames]);
      t0 += (s.durationInFrames ?? 0) - transition;
    }
  }
  const onVoice = (a: number, b: number) => voice.some(([x, y]) => Math.min(b, y) - Math.max(a, x) > 3);
  const add = (k: SfxKind, frame: number, level = 1, alignPeak = false) => {
    const e = next(k);
    if (!e) return;
    const from = Math.round(frame - (alignPeak ? e.peak * fps : 0));
    if (k !== 'pop' && onVoice(from, from + e.dur * fps)) level *= 0.5;
    cues.push({kind: k, g: +level.toFixed(2), at: Math.round(frame), src: publish(e), from: Math.max(0, from), frames: Math.ceil(e.dur * fps) + 2, volume: +(levelOf(e, k) * level * gain).toFixed(3)});
  };
  const starts: number[] = [];
  let t = 0;
  for (const s of scenes) {
    starts.push(t);
    t += (s.durationInFrames ?? 0) - transition;
  }
  const wordAt = (s: Scene, w0: number) => (s.words?.[w0] ? s.words[w0].s + voiceDelay - 2 : undefined);

  scenes.forEach((s, i) => {
    const st = starts[i];
    // Склейка: пролёт, максимум — на середине перехода
    if (i > 0 && s.type !== 'outro') add('whoosh', st + transition / 2, 1, true);
    const lines = s.lines ?? [];
    // Пункты списка, узлы схемы, стороны сравнения — короткий поп в момент появления
    if (s.type === 'list' || s.type === 'diagram' || s.type === 'compare') {
      for (const l of lines) {
        if (!l.text || l.role === 'line' || (l.role === 'head' && !(s.type === 'diagram' && s.layout === 'hub'))) continue;
        const at = wordAt(s, l.w0);
        if (at !== undefined) add('pop', st + at, l.role === 'item' ? 1 : 1.2);
      }
    }
    // Логотип бренда в текстовой сцене или в заголовке списка
    if ((s.type === 'kinetic' || s.type === 'list') && s.logo) {
      const l = lines[s.logoLine ?? 0];
      const at = l ? wordAt(s, l.w0) : undefined;
      if (at !== undefined) add('sparkle', st + at);
    }
    // Финал: нарастание к логотипу и удар на нём
    if (s.type === 'outro') {
      const hitAt = st + 4;
      const r = next('riser');
      if (r) cues.push({kind: 'riser', at: Math.max(0, Math.round(hitAt - r.peak * fps)), src: publish(r), from: Math.max(0, Math.round(hitAt - r.peak * fps)), frames: Math.ceil(r.peak * fps), volume: +(levelOf(r, 'riser') * gain).toFixed(3)});
      add('hit', hitAt);
    }
  });
  return cues.sort((a, b) => a.from - b.from);
}

/** Тот же список событий в формате real-sfx / earshot (typed cues): секунды, вид, длина */
export const typedCues = (cues: SfxCue[], fps: number, _transition?: number) =>
  cues.map((c) => ({
    // Кадр события (для склейки — середина перехода, где меняется картинка); звук к нему выравнивает сам real-sfx
    t: +((c.at ?? c.from) / fps).toFixed(3),
    type: ({whoosh: 'wipe', pop: 'pop', hit: 'hit', riser: 'riser', sparkle: 'chime'} as const)[c.kind ?? 'pop'],
    len: +(c.frames / fps).toFixed(3),
    // Громкость относительно роли: эффекты на голосе — тише (real-sfx переводит в дБ)
    ...(c.g !== undefined && c.g !== 1 ? {g: c.g} : {}),
  }));
