import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export type Source = {
  /** Путь относительно папки задачи: sources/... */
  file: string;
  /** Имя файла без расширения — по нему ИИ понимает, что это */
  name: string;
  kind: 'image' | 'video' | 'audio';
  width?: number;
  height?: number;
  duration?: number;
  orientation?: 'portrait' | 'landscape' | 'square';
};

const IMAGE = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.heic', '.heif', '.bmp', '.tif', '.tiff', '.ico'];
const VIDEO = ['.mp4', '.mov', '.webm', '.m4v', '.mkv', '.avi'];
const AUDIO = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac'];
/** Форматы, которые лучше не отдавать браузеру напрямую — конвертируем (с прозрачностью → png) */
export const NEEDS_CONVERT: Record<string, string> = {'.heic': '.jpg', '.heif': '.jpg', '.bmp': '.jpg', '.tif': '.png', '.tiff': '.png', '.ico': '.png'};

const probe = (file: string) => {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', file,
    ]).toString();
    const j = JSON.parse(out);
    const v = j.streams?.find((s: {codec_type: string}) => s.codec_type === 'video');
    return {width: v?.width as number | undefined, height: v?.height as number | undefined, duration: parseFloat(j.format?.duration) || undefined};
  } catch {
    return {};
  }
};

const walk = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, {withFileTypes: true}).flatMap((e) =>
        e.name.startsWith('.') ? [] : e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
      )
    : [];

export function scanSources(taskDir: string): Source[] {
  return walk(path.join(taskDir, 'sources'))
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .flatMap((abs) => {
      const ext = path.extname(abs).toLowerCase();
      const kind = IMAGE.includes(ext) ? 'image' : VIDEO.includes(ext) ? 'video' : AUDIO.includes(ext) ? 'audio' : null;
      if (!kind) return [];
      const info = probe(abs);
      const {width, height} = info;
      const orientation =
        width && height ? (width / height > 1.15 ? 'landscape' : width / height < 0.87 ? 'portrait' : 'square') : undefined;
      return [
        {
          file: path.relative(taskDir, abs),
          name: path.basename(abs, ext),
          kind,
          width,
          height,
          duration: kind === 'image' ? undefined : info.duration,
          orientation,
        } as Source,
      ];
    });
}

/** Уменьшенное превью (jpeg) — чтобы ИИ видел, что на картинке или в видео. */
export function previewJpeg(taskDir: string, s: Source): Buffer | null {
  if (s.kind === 'audio') return null;
  const at = s.kind === 'video' ? Math.min(1, (s.duration ?? 2) / 2) : 0;
  try {
    return execFileSync('ffmpeg', [
      '-v', 'error', ...(s.kind === 'video' ? ['-ss', String(at)] : []), '-i', path.join(taskDir, s.file),
      '-frames:v', '1', '-vf', 'scale=512:-2', '-f', 'image2', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1',
    ]);
  } catch {
    return null;
  }
}
