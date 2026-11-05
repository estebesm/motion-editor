import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {palette} from '../theme';

/** Плёночное зерно + виньетка поверх всего кадра. */
export const FilmLook: React.FC<{grain?: number; vignette?: number}> = ({
  grain = 0.09,
  vignette = 0.65,
}) => {
  const frame = useCurrentFrame();
  // На светлой теме тёмная виньетка выглядит грязно — ослабляем
  const v = palette.light ? vignette * 0.25 : vignette;
  const g = palette.light ? grain * 0.6 : grain;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${v}) 100%)`,
        }}
      />
      <svg width="100%" height="100%" style={{position: 'absolute', opacity: g, mixBlendMode: 'overlay'}}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 24} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
