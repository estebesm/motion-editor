import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {alpha, FONT_FAMILY, palette} from '../theme';

const MAX_CHARS = 42;

/** Разбивает текст на короткие фразы для субтитров. */
const chunk = (text: string) => {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    let cur = '';
    for (const w of sentence.split(/\s+/)) {
      if ((cur + ' ' + w).trim().length > MAX_CHARS && cur) {
        out.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    if (cur) out.push(cur);
  }
  return out;
};

/**
 * Субтитры одной фразы озвучки. Точных таймкодов слов у TTS нет,
 * поэтому время делится пропорционально длине кусков.
 */
export const Subtitles: React.FC<{text: string; frames: number}> = ({text, frames}) => {
  const frame = useCurrentFrame();
  const parts = chunk(text);
  const total = parts.reduce((s, p) => s + p.length, 0);
  let acc = 0;
  const spans = parts.map((p) => {
    const a = (acc / total) * frames;
    acc += p.length;
    return {p, a, b: (acc / total) * frames};
  });
  const cur = spans.find((s) => frame >= s.a && frame < s.b) ?? spans[spans.length - 1];
  const o = interpolate(frame, [cur.a, cur.a + 4, cur.b - 3, cur.b], [0, 1, 1, cur === spans[spans.length - 1] ? 0 : 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 34}}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: 34,
          color: palette.ink,
          background: alpha(palette.bg, 0.72),
          padding: '10px 22px',
          borderRadius: 12,
          opacity: o,
        }}
      >
        {cur.p}
      </div>
    </AbsoluteFill>
  );
};
