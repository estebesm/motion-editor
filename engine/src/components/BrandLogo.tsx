import React from 'react';
import {Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import type {BrandLogo as T} from '../video/types';

/** Логотип бренда: мягко проявляется к моменту, когда звучит его название */
export const BrandLogo: React.FC<{scene: T; at: number; height: number; until?: number}> = ({scene, at, height, until}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!scene.logo) return null;
  const k = spring({frame: frame - at, fps, config: {damping: 20, stiffness: 120}});
  // Логотип-надпись ниже знака: иначе он перекрикивает фразу
  const wide = !!scene.logoWidth && !!scene.logoHeight && scene.logoWidth / scene.logoHeight > 2.5;
  if (wide) height = Math.round(height * 0.62);
  const w = scene.logoWidth && scene.logoHeight ? (height * scene.logoWidth) / scene.logoHeight : height;
  return (
    <Img
      src={staticFile(scene.logo)}
      style={{
        height,
        width: Math.min(w, height * (wide ? 6 : 4)),
        objectFit: 'contain',
        borderRadius: scene.logoCutout ? 0 : height * 0.22,
        opacity: interpolate(k, [0, 1], [0, 1]) * (until === undefined ? 1 : interpolate(frame, [until - 1, until + 7], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})),
        transform: `translateY(${(1 - k) * 24}px) scale(${0.92 + 0.08 * k})`,
        flexShrink: 0,
      }}
    />
  );
};
