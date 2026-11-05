import {execFileSync, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ff = (args: string[]) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], {stdio: 'inherit'});

export const durationSec = (file: string) =>
  parseFloat(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString(),
  );

/** Границы речи по silencedetect: [начало, конец] в секундах. */
const speechBounds = (file: string): [number, number] => {
  const total = durationSec(file);
  const log = spawnSync('ffmpeg', ['-i', file, '-af', 'silencedetect=noise=-42dB:d=0.12', '-f', 'null', '-']).stderr.toString();
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  let a = 0;
  let b = total;
  if (starts.length && starts[0] < 0.01 && ends.length) a = ends[0];
  const lastStart = starts[starts.length - 1];
  if (lastStart !== undefined && (starts.length > ends.length || ends[ends.length - 1] > total - 0.02)) b = lastStart;
  if (b <= a) return [0, total];
  return [Math.max(0, a - 0.04), Math.min(total, b + 0.12)];
};

/**
 * Сырой ответ TTS → чистый wav: нормализация громкости (-16 LUFS),
 * точная обрезка тишины по краям, 48 кГц стерео.
 */
export function finalizeVoice(data: Buffer, mime: string, out: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
  const raw = path.join(tmp, 'raw');
  const norm = path.join(tmp, 'norm.wav');
  fs.writeFileSync(raw, data);
  const input = mime.includes('wav')
    ? ['-i', raw]
    : ['-f', 's16le', '-ar', mime.match(/rate=(\d+)/)?.[1] ?? '24000', '-ac', '1', '-i', raw];
  ff([...input, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', '-ac', '2', norm]);
  const [a, b] = speechBounds(norm);
  ff(['-i', norm, '-af', `atrim=${a}:${b},asetpts=N/SR/TB,afade=t=out:st=${Math.max(0, b - a - 0.06)}:d=0.06`, out]);
  fs.rmSync(tmp, {recursive: true, force: true});
}

/** Грубая оценка: русская речь в спокойном темпе ~11–14 символов/с. */
export const maxPlausibleSec = (text: string) => text.length / 8 + 2;
