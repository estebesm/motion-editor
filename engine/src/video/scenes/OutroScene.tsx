import React, {useMemo} from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {MorphShape} from '../../components/MorphShape';
import {SpokenStack} from '../../components/Spoken';
import {StoreBadges} from '../../components/StoreBadges';
import {BrandRibbons} from '../../components/BrandRibbons';
import {blob, circle, squircle} from '../../lib/shapes';
import {alpha, ease, FONT_FAMILY, mix, palette} from '../../theme';
import type {OutroScene as T} from '../types';

/** Финал: знак-морф, название, слоган, кнопка-призыв, уход в чёрное. */
export const OutroScene: React.FC<{scene: T; duration: number; voiceDelay?: number}> = ({scene, duration, voiceDelay = 0}) => {
  // Логотип-надпись (широкая картинка с названием): он сам и есть название — строку с названием не дублируем
  const wordmark = !!scene.logo && !!scene.logoWidth && !!scene.logoHeight && scene.logoWidth / scene.logoHeight > 2.5;
  const flat = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const lines = wordmark ? scene.lines?.filter((l) => flat(l.text) !== flat(scene.title)) : scene.lines;
  const spoken = !!scene.lines?.some((l) => l.text);
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const shapes = useMemo(() => [blob(90, 'o1', 0.4), circle(90), squircle(85, 5)], []);
  const ctaIn = spring({frame: frame - 48, fps, config: {damping: 13, stiffness: 120}});
  const fadeOut = interpolate(frame, [duration - 18, duration - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease.in,
  });

  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 50% 45%, ${mix(palette.accent, palette.bg, 0.12)} 0%, ${palette.bg} 60%)`}}>
      <Backdrop seed={scene.title} duration={duration} word={palette.ribbons ? undefined : scene.title} />
      {palette.ribbons ? (
        <>
          <BrandRibbons duration={duration + 30} side={1} seed={7} strength={0.8} />
          <BrandRibbons duration={duration + 30} side={-1} seed={11} strength={0.55} delay={6} />
        </>
      ) : null}
      <Camera duration={duration} from={{zoom: 1.12, y: 20}} to={{zoom: 1.0, y: 0}} shake={3}>
        <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', gap: 34, paddingBottom: 120}}>
          {scene.logo && wordmark ? (
            <WordmarkReveal src={staticFile(scene.logo)} width={Math.min(1000, (190 * scene.logoWidth!) / scene.logoHeight!)} height={190} />
          ) : scene.logo ? (
            <Img
              src={staticFile(scene.logo)}
              style={{
                height: 240,
                width: scene.logoWidth && scene.logoHeight ? Math.min(900, (240 * scene.logoWidth) / scene.logoHeight) : undefined,
                objectFit: 'contain',
                transform: `scale(${spring({frame: frame - 2, fps, config: {damping: 10, stiffness: 120}})}) rotate(${(1 - spring({frame: frame - 2, fps, config: {damping: 14, stiffness: 90}})) * -20}deg)`,
                filter: `drop-shadow(0 0 70px ${alpha(palette.accent, 0.55)})`,
              }}
            />
          ) : (
          <MorphShape
            shapes={shapes}
            size={200}
            delay={0}
            hold={10}
            morph={18}
            fill="url(#logoGrad)"
            rotate={(f) => f * 0.8}
            defs={
              <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={palette.accent} />
                <stop offset="100%" stopColor={palette.accent2} />
              </linearGradient>
            }
          />
          )}
          {spoken ? (
            <SpokenStack lines={lines!} words={scene.words} offset={voiceDelay} duration={duration} maxWidth={1600} sizes={wordmark ? [72, 64, 56] : [150, 76, 64, 56]} upper={false} leadSize={wordmark ? undefined : 200} />
          ) : (
            <FitKinetic text={scene.title} maxWidth={1600} maxSize={210} minSize={110} mode="scatter" delay={8} stagger={2} />
          )}
          {scene.subtitle && !spoken ? (
            <FitKinetic text={scene.subtitle} maxWidth={1300} maxSize={52} maxLines={2} color={alpha(palette.ink, 0.72)} mode="rise" delay={30} stagger={1} />
          ) : null}
          {scene.stores ? (
            <div style={{marginTop: 26}}>
              <StoreBadges at={Math.round(scene.words?.find((w) => /app|store|google|play|эпп|гугл/i.test(w.w))?.s ?? 30) + voiceDelay} scale={1.15} />
            </div>
          ) : null}
          {scene.cta ? (
            <div
              style={{
                marginTop: 20,
                padding: '24px 56px',
                borderRadius: 999,
                background: palette.accent,
                color: palette.bg,
                fontFamily: FONT_FAMILY,
                fontSize: 40,
                transform: `scale(${ctaIn})`,
                boxShadow: `0 0 ${60 * ctaIn}px ${alpha(palette.accent, 0.5)}`,
              }}
            >
              {scene.cta}
            </div>
          ) : null}
        </AbsoluteFill>
      </Camera>
      <AbsoluteFill style={{background: palette.bg, opacity: fadeOut}} />
    </AbsoluteFill>
  );
};

/**
 * Логотип-надпись проявляется шторкой слева направо (из размытия, с лёгким подъёмом),
 * затем по буквам пробегает блик; свечение мягко дышит.
 */
const WordmarkReveal: React.FC<{src: string; width: number; height: number}> = ({src, width, height}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const r = interpolate(frame, [3, 24], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.cinematic});
  const lift = spring({frame: frame - 2, fps, config: {damping: 16, stiffness: 80}});
  const sheen = interpolate(frame, [26, 52], [-0.4, 1.4], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease.cinematic});
  const glow = 0.3 + 0.08 * Math.sin(frame / 14);
  const mask = {WebkitMaskImage: `url("${src}")`, maskImage: `url("${src}")`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%'} as React.CSSProperties;
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        transform: `translateY(${(1 - lift) * 50}px) scale(${0.94 + 0.06 * lift})`,
        clipPath: `inset(-40% ${((1 - r) * 100).toFixed(2)}% -40% -10%)`,
        filter: `blur(${((1 - r) * 10).toFixed(2)}px) drop-shadow(0 0 70px ${alpha(palette.accent, glow)})`,
      }}
    >
      <Img src={src} style={{position: 'absolute', inset: 0, width, height}} />
      {sheen > -0.4 && sheen < 1.4 ? (
        <div style={{position: 'absolute', inset: 0, ...mask}}>
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '30%',
              left: `${sheen * 100 - 15}%`,
              // Белые буквы: белый блик не виден — золотистый проблеск в цвет стрелки
              background: `linear-gradient(90deg, transparent, ${alpha(palette.accent2, 0.9)}, transparent)`,
              transform: 'skewX(-20deg)',
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
