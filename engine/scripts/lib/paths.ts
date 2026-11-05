import path from 'node:path';

export const ENGINE = path.resolve(import.meta.dirname, '..', '..');
export const ROOT = path.resolve(ENGINE, '..');
/** videos/<название>/{scenario.txt, sources/, outputs/} */
export const VIDEOS = path.join(ROOT, 'videos');
/** Служебные данные видео (план, настройки, кэш озвучки) */
export const PROJECT_DIR = '.project';
