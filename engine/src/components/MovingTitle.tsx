import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {ease} from '../theme';

/**
 * Заголовок списка/схемы: пока пункты не прозвучали — крупно по центру кадра,
 * к первому пункту плавно уезжает в «шапку» и уменьшается. Так кадр не пустует,
 * а тексты никогда не накладываются друг на друга.
 */
export const MovingTitle: React.FC<{
  /** Кадр, когда появляется первый пункт */
  cue: number;
  /** Положение «шапки» (верх заголовка, px) */
  top: number;
  align?: 'center' | 'left';
  left?: number;
  /** Во сколько раз крупнее по центру */
  zoom?: number;
  children: React.ReactNode;
}> = ({cue, top, align = 'center', left = 200, zoom = 1.9, children}) => {
  const frame = useCurrentFrame();
  const centered = cue > 40;
  const p = centered ? interpolate(frame, [cue - 14, cue + 2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.cinematic}) : 1;
  const dy = (540 - top - 40) * (1 - p);
  const k = 1 + (zoom - 1) * (1 - p);
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: align === 'left' ? left : 0,
        right: align === 'left' ? undefined : 0,
        display: 'flex',
        justifyContent: align === 'left' ? 'flex-start' : 'center',
        transformOrigin: align === 'left' ? 'left top' : 'center top',
        transform: `translateY(${dy}px) scale(${k})`,
        zIndex: 2,
      }}
    >
      {children}
    </div>
  );
};
