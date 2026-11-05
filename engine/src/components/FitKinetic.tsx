import React from 'react';
import {fitText} from '../lib/fit';
import {KineticMode, KineticText} from './KineticText';

/** Кинетический текст, который сам подбирает размер и переносы под ширину. */
export const FitKinetic: React.FC<{
  text: string;
  maxWidth: number;
  maxSize: number;
  minSize?: number;
  maxLines?: number;
  mode?: KineticMode;
  color?: string;
  delay?: number;
  stagger?: number;
  lineDelay?: number;
  exitAt?: number;
  align?: 'center' | 'flex-start';
  tracking?: [number, number];
}> = ({text, maxWidth, maxSize, minSize, maxLines, align = 'center', delay = 0, lineDelay = 8, ...rest}) => {
  const {lines, size} = fitText(text, {maxWidth, maxSize, minSize, maxLines});
  return (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: align, gap: size * 0.12}}>
      {lines.map((line, i) => (
        <KineticText key={i} text={line} size={size} delay={delay + i * lineDelay} {...rest} />
      ))}
    </div>
  );
};
