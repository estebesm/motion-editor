/**
 * Финальный звук ролика (после рендера):
 *  1. real-sfx — сводит эффекты поверх чистого голоса: настоящие записи из библиотеки, точные кадры событий,
 *     защита речи (эффекты уходят из-под голоса), выравнивание громкости по ролям. Самопроверка — critique.py.
 *  2. Мастеринг: −14 LUFS (как у роликов в интернете), пики не выше −1 dBTP.
 *  3. earshot — сравнивает звук с профессиональными роликами: оценка и что исправить, с таймкодами.
 * Отчёт — рядом с видео: <имя>-звук.md. Если real-sfx / earshot не установлены или сбились — остаётся микс движка.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PROJECT_DIR, ROOT} from './paths.ts';
import type {Settings} from './settings.ts';
import {earshotPython} from './sfx.ts';

const RSFX = path.join(os.homedir(), '.claude', 'skills', 'real-sfx');
/** ffmpeg-full (с rubberband/drawtext) — только для этих инструментов, остальная система не трогается */
const ENV = {...process.env, PATH: `/opt/homebrew/opt/ffmpeg-full/bin:${process.env.PATH}`};
const run = (cmd: string, args: string[], cwd?: string) => {
  const r = spawnSync(cmd, args, {cwd, env: ENV, encoding: 'utf8', maxBuffer: 64 << 20});
  return {ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`};
};
const mtime = (f: string) => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);

/** Двухпроходная нормализация громкости: −14 LUFS, true peak −1 dBTP; видео не перекодируется */
function master(src: string, dst: string) {
  const m = run('ffmpeg', ['-hide_banner', '-nostats', '-i', src, '-af', 'loudnorm=I=-14:TP=-1:LRA=11:print_format=json', '-f', 'null', '-']);
  const j = JSON.parse(m.out.slice(m.out.lastIndexOf('{'), m.out.lastIndexOf('}') + 1)) as Record<string, string>;
  const af = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  const r = run('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', dst]);
  if (!r.ok) throw new Error(r.out.slice(0, 200));
  return Number(j.input_i);
}

export function finishSound(taskDir: string, out: string, settings: Settings, {log, progress}: {log: (m: string) => void; progress: (m: string) => void}) {
  const proj = path.join(taskDir, PROJECT_DIR);
  const work = path.join(proj, 'sound');
  fs.rmSync(work, {recursive: true, force: true});
  fs.mkdirSync(work, {recursive: true});
  const report: string[] = [`# Звук: ${path.basename(out)}`, ''];
  let mix = out;

  // 1. real-sfx: эффекты поверх чистого голоса
  const cues = path.join(proj, 'sfx-cues.json');
  const stem = path.join(proj, 'voice-stem.wav');
  const index = path.join(RSFX, 'library_index.json');
  if (settings.sfx !== 'off' && fs.existsSync(index) && fs.existsSync(cues) && fs.existsSync(stem)) {
    progress('Звук: real-sfx сводит эффекты');
    try {
      if (mtime(path.join(ROOT, 'sfx', 'library', 'catalog.json')) > mtime(index)) run('python3', ['scripts/build_index.py'], RSFX);
      const voice = path.join(work, 'voice.mp4');
      const v = run('ffmpeg', ['-v', 'error', '-y', '-i', out, '-i', stem, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', voice]);
      if (!v.ok) throw new Error(v.out);
      // Моменты картинки: без них real-sfx путает тихие склейки (тёмный фон → тёмный фон) с появлением текста
      run('python3', ['scripts/find_moments.py', voice, '--out', path.join(work, 'moments')], RSFX);
      const mom = path.join(work, 'moments', 'moments.json');
      const fc = run('python3', ['scripts/from_cues.py', cues, '--video', voice, '--out', path.join(work, 'cues.json'), '--ui', 'library', ...(fs.existsSync(mom) ? ['--moments', mom] : [])], RSFX);
      if (!fc.ok) throw new Error(fc.out.slice(-300));
      // Список событий должен совпасть с картинкой — иначе звуки лягут мимо, лучше остаться на миксе движка
      if (/come from different cuts/.test(fc.out)) throw new Error('список событий не совпал с картинкой');
      const res = path.join(work, 'result', 'film.mp4');
      const mx = run('python3', ['scripts/mix.py', path.join(work, 'cues.json'), '--out', res, '--voice-safe'], RSFX);
      if (!mx.ok || !fs.existsSync(res)) throw new Error(mx.out.slice(-300));
      const cr = run('python3', ['scripts/critique.py', path.join(work, 'result', 'film_resolved_cues.json'), path.join(work, 'result', 'film_sfx_track.wav')], RSFX);
      const table = cr.out.slice(cr.out.indexOf('| axis'), cr.out.indexOf('Three worst') > 0 ? cr.out.indexOf('Three worst') : undefined).trim();
      const listen = cr.out.includes('Listen to these') ? cr.out.slice(cr.out.indexOf('Listen to these'), cr.out.indexOf('(--listen-out')).trim() : '';
      report.push('## real-sfx: эффекты и их самопроверка', '', table, '', listen, '');
      fs.copyFileSync(path.join(work, 'result', 'film_sfx_track.wav'), out.replace(/\.mp4$/, '-эффекты.wav'));
      mix = res;
    } catch (e) {
      log(`real-sfx не сработал (${(e as Error).message.split('\n').pop()?.slice(0, 140)}) — остаётся микс движка`);
      report.push('## real-sfx', '', `не сработал — в ролике микс движка: ${(e as Error).message.slice(0, 300)}`, '');
    }
  }

  // 2. Мастеринг
  progress('Звук: мастеринг');
  try {
    const tmp = path.join(work, 'master.mp4');
    const before = master(mix, tmp);
    fs.renameSync(tmp, out);
    report.push(`## Мастеринг`, '', `было ${before.toFixed(1)} LUFS → −14 LUFS, пики не выше −1 dBTP`, '');
  } catch (e) {
    log(`Мастеринг пропущен: ${(e as Error).message.slice(0, 140)}`);
    if (mix !== out) fs.copyFileSync(mix, out);
  }

  // 3. earshot: сравнение с профессиональными роликами
  const py = earshotPython();
  if (py) {
    progress('Звук: earshot сравнивает с профессиональными роликами');
    const json = path.join(work, 'earshot.json');
    const r = run(path.join(path.dirname(py), 'earshot'), ['critique', out, '--out', json]);
    if (r.ok && fs.existsSync(json)) {
      const c = JSON.parse(fs.readFileSync(json, 'utf8')) as {summary: string; actions?: {weight: string; action: string}[]; tips?: string[]};
      report.push('## earshot: сравнение с профессиональными роликами', '', c.summary, '', ...(c.actions ?? []).map((a) => `- [${a.weight}] ${a.action}`), '', ...(c.tips ?? []).map((t) => `- ${t}`), '');
      log(`earshot: ${c.summary.split(' - ')[1]?.split('.')[0] ?? c.summary.slice(0, 120)}`);
    } else log(`earshot не сработал: ${r.out.slice(-160)}`);
  }
  const rep = out.replace(/\.mp4$/, '-звук.md');
  fs.writeFileSync(rep, report.join('\n'));
  return rep;
}
