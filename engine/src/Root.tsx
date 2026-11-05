import React from 'react';
import {Composition} from 'remotion';
import './theme';
import {calculateVideoMetadata, Video} from './video/Video';
import type {VideoProps} from './video/types';

// Превью в Studio без озвучки. Реальные видео собираются через ./run.sh
const demo: VideoProps = {
  transitionFrames: 18,
  voiceDelay: 8,
  scenes: [
    {type: 'title', kicker: 'в начале было', title: 'ДВИЖЕНИЕ', subtitle: 'рождает смысл', durationInFrames: 120},
    {type: 'morph', word: 'ФОРМА', caption: 'текучая и живая', durationInFrames: 130},
    {type: 'list', title: 'что умеет генератор', items: ['ТИПОГРАФИКА', 'МОРФИНГ', 'КАМЕРА'], durationInFrames: 140},
    {type: 'statement', kicker: 'главное', text: 'СМЫСЛ ВАЖНЕЕ ЭФФЕКТОВ', caption: 'и подача — связная', durationInFrames: 150},
    {type: 'outro', title: 'КОНЕЦ', subtitle: 'сделано кодом', cta: 'смотреть ещё', durationInFrames: 120},
  ],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Video"
    component={Video}
    defaultProps={demo}
    calculateMetadata={calculateVideoMetadata}
    durationInFrames={300}
    fps={30}
    width={1920}
    height={1080}
  />
);
