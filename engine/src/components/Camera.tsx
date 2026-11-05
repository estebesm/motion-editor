import {noise2D} from '@remotion/noise';
import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {ease, motion} from '../theme';

export type CamState = {
  zoom?: number;
  x?: number;
  y?: number;
  rotate?: number;
};

const DEF: Required<CamState> = {zoom: 1, x: 0, y: 0, rotate: 0};

/**
 * Виртуальная 2D-камера: плавный проезд from → to за duration кадров
 * + лёгкая «ручная» тряска на шуме Перлина.
 */
export const Camera: React.FC<{
  from: CamState;
  to: CamState;
  duration: number;
  shake?: number;
  children: React.ReactNode;
}> = ({from, to, duration, shake = 0, children}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease.cinematic,
  });
  const v = (k: keyof CamState) => {
    const a = from[k] ?? DEF[k];
    const b = to[k] ?? DEF[k];
    return a + (b - a) * p;
  };
  const k = shake * motion.shake;
  const sx = noise2D('cam-x', frame * 0.015, 0) * k;
  const sy = noise2D('cam-y', 0, frame * 0.015) * k;
  const sr = noise2D('cam-r', frame * 0.01, 1) * k * 0.08;

  return (
    <AbsoluteFill style={{overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          transform: `translate(${v('x') + sx}px, ${v('y') + sy}px) rotate(${v('rotate') + sr}deg) scale(${v('zoom')})`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
