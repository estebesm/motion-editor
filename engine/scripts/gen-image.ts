/**
 * Сгенерировать картинку через Gemini:
 *   npm run image -- "описание" projects/<имя>/images/file.png [--aspect=4:5]
 */
import fs from 'node:fs';
import path from 'node:path';
import {generateImage} from './lib/gemini.ts';

import {ROOT} from './lib/paths.ts';
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
const args = process.argv.slice(2);
const [prompt, out] = args.filter((a) => !a.startsWith('--'));
const aspect = args.find((a) => a.startsWith('--aspect='))?.split('=')[1] ?? '4:5';
if (!prompt || !out) {
  console.error('Использование: npm run image -- "описание" путь/к/файлу.png [--aspect=4:5]');
  process.exit(1);
}
fs.mkdirSync(path.dirname(out), {recursive: true});
const {data, ext} = await generateImage(prompt, {aspect});
// Модель сама выбирает формат — подставляем правильное расширение
const file = path.extname(out).toLowerCase() === ext ? out : out.replace(/\.[^./]+$/, '') + ext;
fs.writeFileSync(file, data);
console.log(`Сохранено: ${file}`);
