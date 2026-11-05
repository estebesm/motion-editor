import fs from 'node:fs';
import path from 'node:path';
import type {Beat} from './writer.ts';
import type {Scene} from '../../src/video/types.ts';
import {PROJECT_DIR, VIDEOS} from './paths.ts';
import type {Settings} from './settings.ts';

export type VideoItem = {
  name: string;
  dir: string;
  hasPrompt: boolean;
  /** Готовые файлы в outputs/ */
  videos: string[];
};

/** Все папки videos/<название>/ со scenario.txt: сначала новые, потом готовые (свежие сверху). */
export function findVideos(): VideoItem[] {
  fs.mkdirSync(VIDEOS, {recursive: true});
  const items = fs
    .readdirSync(VIDEOS, {withFileTypes: true})
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(path.join(VIDEOS, e.name, 'scenario.txt')))
    .map((e): VideoItem => {
      const dir = path.join(VIDEOS, e.name);
      const vdir = path.join(dir, 'outputs');
      return {
        name: e.name,
        dir,
        hasPrompt: fs.existsSync(path.join(dir, 'prompt.txt')),
        videos: fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((f) => f.endsWith('.mp4')).sort() : [],
      };
    });
  const mtime = (d: string) => fs.statSync(d).mtimeMs;
  return items.sort((a, b) => Number(!!a.videos.length) - Number(!!b.videos.length) || mtime(b.dir) - mtime(a.dir));
}

export const readScenario = (dir: string) => fs.readFileSync(path.join(dir, 'scenario.txt'), 'utf8');
export const readPrompt = (dir: string) => {
  const f = path.join(dir, 'prompt.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
};

type CachedPlan = {key: string; scenes: Scene[]; accent?: string};

/** Раскадровка из кэша, если сценарий, пожелания и файлы не менялись. */
export function cachedPlan(dir: string, key: string): CachedPlan | null {
  const f = path.join(dir, PROJECT_DIR, 'plan.json');
  if (!fs.existsSync(f)) return null;
  try {
    const p = JSON.parse(fs.readFileSync(f, 'utf8')) as CachedPlan;
    return p.key === key ? p : null;
  } catch {
    return null;
  }
}

/** Текст озвучки (биты) из кэша — чтобы перестройка раскадровки не меняла текст и не требовала новой озвучки. */
export function cachedScript(dir: string, key: string): Beat[] | null {
  const f = path.join(dir, PROJECT_DIR, 'script.json');
  if (!fs.existsSync(f)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(f, 'utf8')) as {key: string; beats: Beat[]};
    return s.key === key && s.beats?.length ? s.beats : null;
  } catch {
    return null;
  }
}

export function saveScript(dir: string, key: string, beats: Beat[]) {
  const p = path.join(dir, PROJECT_DIR);
  fs.mkdirSync(p, {recursive: true});
  fs.writeFileSync(path.join(p, 'script.json'), JSON.stringify({key, beats}, null, 2));
  // Человекочитаемая копия — посмотреть, что озвучит диктор
  fs.writeFileSync(path.join(p, 'script.txt'), beats.map((b) => b.text).join('\n\n') + '\n');
}

export function saveProject(dir: string, settings: Settings, plan: CachedPlan) {
  const p = path.join(dir, PROJECT_DIR);
  fs.mkdirSync(p, {recursive: true});
  fs.writeFileSync(path.join(p, 'settings.json'), JSON.stringify(settings, null, 2));
  fs.writeFileSync(path.join(p, 'plan.json'), JSON.stringify(plan, null, 2));
}

/** Следующее свободное имя версии: name.mp4, name-v2.mp4, … */
export function nextVideoPath(dir: string, name: string) {
  const vdir = path.join(dir, 'outputs');
  for (let v = 1; ; v++) {
    const f = path.join(vdir, v === 1 ? `${name}.mp4` : `${name}-v${v}.mp4`);
    // Номер занят и версией без звука («…-v3 (без звука).mp4») — не перезаписываем её
    if (!fs.existsSync(f) && !fs.existsSync(f.replace(/\.mp4$/, ' (без звука).mp4'))) return f;
  }
}
