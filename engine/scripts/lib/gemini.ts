const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const TTS_MODEL = 'gemini-3.8-flash-tts';
/**
 * Если у модели озвучки кончился дневной лимит — по порядку пробуем следующие.
 * flash-lite сюда не входит: русский она произносит заметно хуже — лучше подождать сброса лимита.
 */
export const TTS_MODELS = [TTS_MODEL, 'gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts'];

/** Дневной лимит модели исчерпан — повторять сегодня бессмысленно */
export class QuotaError extends Error {
  model: string;
  constructor(model: string) {
    super(`Gemini ${model}: исчерпан дневной лимит запросов`);
    this.model = model;
  }
}
// flash составляет раскадровку за ~20 с, pro — минуты при том же качестве
export const PLANNER_MODEL = 'gemini-3.8-flash';
export const PLANNER_FALLBACK = 'gemini-pro-latest';
export const IMAGE_MODEL = 'gemini-3.1-flash-image';

const apiKey = () => {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('Нет GEMINI_API_KEY — добавьте его в файл .env');
  return k;
};

type InlinePart = {inlineData?: {mimeType: string; data: string}; text?: string; thought?: boolean};

async function generate(model: string, body: unknown, {attempts = 4, timeoutMs = 120_000} = {}): Promise<InlinePart[]> {
  for (let i = 1; ; i++) {
    let status = 0;
    let problem = '';
    try {
      const res = await fetch(`${BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: {'x-goog-api-key': apiKey(), 'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = res.status;
      const text = await res.text();
      if (res.ok && text) {
        const parts: InlinePart[] | undefined = JSON.parse(text).candidates?.[0]?.content?.parts;
        if (parts?.length) return parts;
        problem = `пустой ответ ${text.slice(0, 200)}`;
      } else {
        if (status === 429 && /per_?day|PerDay/i.test(text)) throw new QuotaError(model);
        problem = `HTTP ${status} ${(text.match(/"message":\s*"([^"]{0,160})/)?.[1] ?? text.slice(0, 160)).replace(/\s+/g, ' ')}`;
        // Ошибки запроса (кроме лимитов) повторять бессмысленно
        if (status < 500 && status !== 429) throw new Error(`Gemini ${model}: ${problem}`);
      }
    } catch (e) {
      const err = e as Error & {cause?: {code?: string}};
      if (err instanceof QuotaError || err.message.startsWith('Gemini ')) throw err;
      problem = err.name === 'TimeoutError' ? `нет ответа за ${timeoutMs / 1000} с` : `сеть: ${err.cause?.code ?? err.message}`;
    }
    if (i >= attempts) throw new Error(`Gemini ${model}: ${problem}`);
    const wait = 2000 * 2 ** (i - 1);
    console.warn(`  Gemini ${model}: ${problem} — повтор через ${wait / 1000} с`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

/** Запрос со строгой JSON-схемой ответа. */
export async function generateJson<T>(
  parts: InlinePart[],
  schema: object,
  {model = PLANNER_MODEL, system, thinking}: {model?: string; system?: string; thinking?: 'low' | 'high'} = {},
): Promise<T> {
  const body = {
    ...(system ? {systemInstruction: {parts: [{text: system}]}} : {}),
    contents: [{role: 'user', parts}],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      ...(thinking ? {thinkingConfig: {thinkingLevel: thinking}} : {}),
    },
  };
  let out: InlinePart[];
  try {
    out = await generate(model, body, {attempts: 2, timeoutMs: 150_000});
  } catch (e) {
    if (model === PLANNER_FALLBACK) throw e;
    console.warn(`  ${(e as Error).message} — пробую ${PLANNER_FALLBACK}`);
    out = await generate(PLANNER_FALLBACK, body, {attempts: 3, timeoutMs: 150_000});
  }
  const text = out
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('');
  return JSON.parse(text) as T;
}

/** Озвучка. Возвращает аудио и его mime (audio/wav или audio/L16;rate=24000). */
export async function tts(
  text: string,
  {voice = 'Charon', style, model = TTS_MODEL}: {voice?: string; style?: string; model?: string} = {},
): Promise<{data: Buffer; mime: string}> {
  // Формат «заметки режиссёра + транскрипт»: при простом «Style: … текст» модель
  // иногда зачитывает инструкцию вслух.
  // Явно говорим, что читать только транскрипт: иначе модель иногда зачитывает заметки
  // (особенно если стиль написан по-русски) или повторяет фразу.
  const prompt = [
    'Read aloud ONLY the transcript below, in Russian, exactly once, word for word.',
    'The director\'s notes describe HOW to speak. Never read the notes aloud.',
    '',
    "### DIRECTOR'S NOTES",
    'Speaker: native Russian speaker, standard Russian pronunciation, no foreign accent.',
    style ? `Style: ${style}` : '',
    '',
    '#### TRANSCRIPT',
    text,
  ]
    .filter((l, i, arr) => l !== '' || arr[i - 1] !== '')
    .join('\n');
  const parts = await generate(model, {
    contents: [{parts: [{text: prompt}]}],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {voiceConfig: {prebuiltVoiceConfig: {voiceName: voice}}},
    },
  });
  const audio = parts.find((p) => p.inlineData)?.inlineData;
  if (!audio) throw new Error('Gemini TTS не вернул аудио');
  return {data: Buffer.from(audio.data, 'base64'), mime: audio.mimeType};
}

/** Генерация картинки (для заглушек и фонов). */
export async function generateImage(
  prompt: string,
  {aspect = '4:5', model = IMAGE_MODEL, input}: {aspect?: string; model?: string; input?: {data: Buffer; mime: string}} = {},
): Promise<{data: Buffer; ext: string}> {
  const parts = await generate(model, {
    contents: [
      {
        parts: [
          ...(input ? [{inlineData: {mimeType: input.mime, data: input.data.toString('base64')}}] : []),
          {text: prompt},
        ],
      },
    ],
    generationConfig: {responseModalities: ['IMAGE'], imageConfig: {aspectRatio: aspect}},
  });
  const img = parts.find((p) => p.inlineData?.mimeType.startsWith('image/'))?.inlineData;
  if (!img) throw new Error('Gemini не вернул картинку');
  const ext = img.mimeType.includes('jpeg') ? '.jpg' : img.mimeType.includes('webp') ? '.webp' : '.png';
  return {data: Buffer.from(img.data, 'base64'), ext};
}

/** Распознавание речи — для проверки, что озвучка читает именно текст. */
export async function transcribe(wav: Buffer, model = 'gemini-3.5-flash'): Promise<string> {
  const parts = await generate(model, {
    contents: [
      {
        parts: [
          {inlineData: {mimeType: 'audio/wav', data: wav.toString('base64')}},
          {text: 'Transcribe verbatim everything spoken in this audio, in whatever language it is spoken. Return only the transcript.'},
        ],
      },
    ],
  });
  return parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
}
