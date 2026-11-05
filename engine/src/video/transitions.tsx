import type {TransitionPresentation, TransitionPresentationComponentProps} from '@remotion/transitions';
import React from 'react';
import {AbsoluteFill, Easing, interpolate} from 'remotion';
import {alpha, palette} from '../theme';

/**
 * Переходы в стиле моушн-дизайна. Почти все — «склейка под перекрытием»: графика
 * (плашки, круг, вспышка) полностью накрывает кадр, в этот момент сцена меняется.
 * Новая сцена рисуется поверх старой, поэтому графику рисует входящая сцена.
 */

type P = Record<string, never>;
type C = React.FC<TransitionPresentationComponentProps<P>>;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const inOut = Easing.bezier(0.77, 0, 0.18, 1);

/** Старая сцена видна до середины перехода, новая — после */
const cut = (dir: string, p: number, children: React.ReactNode, mid = 0.5) =>
  dir === 'exiting' ? (p < mid ? <AbsoluteFill>{children}</AbsoluteFill> : null) : p >= mid ? <AbsoluteFill>{children}</AbsoluteFill> : null;

/** Три наклонные цветные плашки проносятся по кадру одна за другой */
const Panels: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  if (dir === 'exiting') return cut(dir, p, children);
  const colors = [palette.accent2, palette.accent, palette.ink];
  return (
    <AbsoluteFill>
      {cut(dir, p, children)}
      {colors.map((c, i) => {
        const q = interpolate(p, [i * 0.1, 0.8 + i * 0.1], [0, 1], {...clamp, easing: inOut});
        const x = -140 + q * 280;
        return (
          <AbsoluteFill
            key={i}
            style={{
              background: c,
              transform: `translateX(${x}%) skewX(-18deg)`,
              width: '130%',
              left: '-15%',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Вертикальные полосы поднимаются снизу, закрывают кадр и уходят вверх «лесенкой» */
const Bars: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  if (dir === 'exiting') return cut(dir, p, children);
  const n = 6;
  return (
    <AbsoluteFill>
      {cut(dir, p, children)}
      {Array.from({length: n}, (_, i) => {
        const d = i * 0.05;
        const a = interpolate(p, [d, 0.5], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
        const b = interpolate(p, [0.5 + d, 1], [0, 1], {...clamp, easing: Easing.in(Easing.cubic)});
        const top = (1 - a) * 100;
        const bottom = b * 100;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${(i / n) * 100}%`,
              width: `${100 / n + 0.2}%`,
              top: 0,
              bottom: 0,
              background: i % 2 ? palette.accent : palette.accent2,
              clipPath: `inset(${top}% 0 ${bottom}% 0)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Цветной круг растёт из центра, новая сцена раскрывается кругом с кольцом по краю */
const Circle: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  if (dir === 'exiting') return cut(dir, p, children);
  if (p < 0.5) {
    const r = interpolate(p, [0, 0.5], [0, 75], {...clamp, easing: Easing.in(Easing.cubic)});
    return (
      <AbsoluteFill>
        <AbsoluteFill style={{background: palette.accent2, clipPath: `circle(${r * 1.1}% at 50% 50%)`}} />
        <AbsoluteFill style={{background: palette.accent, clipPath: `circle(${r}% at 50% 50%)`}} />
      </AbsoluteFill>
    );
  }
  const r = interpolate(p, [0.5, 1], [0, 80], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill style={{background: palette.accent}}>
      <AbsoluteFill style={{clipPath: `circle(${r}% at 50% 50%)`}}>{children}</AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 50%, transparent calc(${r * 0.92}vmax - 2px), ${palette.accent2} calc(${r * 0.92}vmax), transparent calc(${r * 0.92}vmax + 26px))`,
          opacity: 1 - interpolate(p, [0.8, 1], [0, 1], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

/** Наезд со вспышкой: старая сцена улетает на камеру, вспышка, новая «выпрыгивает» из глубины */
const ZoomFlash: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  if (dir === 'exiting') {
    if (p >= 0.5) return null;
    const q = p / 0.5;
    return <AbsoluteFill style={{transform: `scale(${1 + q * q * 1.4})`, filter: `blur(${q * 16}px)`}}>{children}</AbsoluteFill>;
  }
  const flash = 1 - Math.abs(p - 0.5) / 0.22;
  const q = interpolate(p, [0.5, 1], [0, 1], {...clamp, easing: Easing.out(Easing.cubic)});
  return (
    <AbsoluteFill>
      {p >= 0.5 ? <AbsoluteFill style={{transform: `scale(${1.35 - q * 0.35})`, filter: q < 0.98 ? `blur(${(1 - q) * 14}px)` : undefined}}>{children}</AbsoluteFill> : null}
      {flash > 0 ? (
        <AbsoluteFill style={{background: `radial-gradient(circle, ${palette.ink} 0%, ${alpha(palette.accent, 0.9)} 60%, ${palette.accent2} 100%)`, opacity: Math.min(1, flash * 1.3)}} />
      ) : null}
    </AbsoluteFill>
  );
};

/** Резкий «смаз» камеры вбок со световыми полосами */
const Whip: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  const e = inOut(p);
  const blur = Math.sin(p * Math.PI) * 40;
  if (dir === 'exiting') return <AbsoluteFill style={{transform: `translateX(${-e * 100}%) scaleX(${1 + Math.sin(p * Math.PI) * 0.15})`, filter: `blur(${blur}px)`}}>{children}</AbsoluteFill>;
  const streak = Math.sin(p * Math.PI);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{transform: `translateX(${(1 - e) * 100}%) scaleX(${1 + streak * 0.15})`, filter: blur > 1 ? `blur(${blur}px)` : undefined}}>{children}</AbsoluteFill>
      {[0.22, 0.48, 0.71].map((y, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            top: `${y * 100}%`,
            left: `${(1 - e) * 140 - 40 - i * 8}%`,
            width: '60%',
            height: 10 + i * 6,
            borderRadius: 20,
            background: `linear-gradient(90deg, transparent, ${i % 2 ? palette.accent2 : palette.accent}, transparent)`,
            opacity: streak,
            filter: 'blur(2px)',
          }}
        />
      ))}
    </AbsoluteFill>
  );
};

/** Сдвиг: новая сцена плавно въезжает сбоку, старая уходит в другую сторону и гаснет */
const Push: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  const q = inOut(p);
  return dir === 'exiting' ? (
    <AbsoluteFill style={{transform: `translateX(${-q * 18}%)`, opacity: 1 - q}}>{children}</AbsoluteFill>
  ) : (
    <AbsoluteFill style={{transform: `translateX(${(1 - q) * 100}%)`}}>{children}</AbsoluteFill>
  );
};

/** Мягкое растворение с лёгким подъёмом новой сцены */
const Dissolve: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  const q = inOut(p);
  return dir === 'exiting' ? (
    <AbsoluteFill style={{opacity: 1 - q}}>{children}</AbsoluteFill>
  ) : (
    <AbsoluteFill style={{opacity: q, transform: `translateY(${(1 - q) * 40}px)`}}>{children}</AbsoluteFill>
  );
};

const make = (component: C): TransitionPresentation<P> => ({component, props: {}});
/**
 * Фирменная диагональная шторка: новая сцена открывается наклонным краем, по краю едет широкая
 * фиолетовая лента с жёлтой кромкой (как «M»-полосы дизайнбука). Старая сцена чуть уезжает и темнеет.
 */
const BrandWipe: C = ({children, presentationDirection: dir, presentationProgress: p}) => {
  const q = interpolate(p, [0, 1], [0, 1], {...clamp, easing: inOut});
  if (dir === 'exiting') {
    return (
      <AbsoluteFill style={{transform: `translateX(${-q * 6}%) scale(${1 - q * 0.04})`, filter: `brightness(${1 - q * 0.45})`}}>{children}</AbsoluteFill>
    );
  }
  // Край шторки: наклонная линия, идёт справа налево (x — доля ширины по верхнему краю)
  const skew = 0.32;
  const x = 1.25 - q * (1.3 + skew);
  const poly = (from: number) => `polygon(${from * 100}% 0, 140% 0, 140% 100%, ${(from + skew) * 100}% 100%)`;
  const band = 0.14;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{clipPath: poly(x + band * 0.6), transform: `translateX(${(1 - q) * 4}%)`}}>{children}</AbsoluteFill>
      {/* Лента по краю: своя плашка, наклонённая как край шторки; жёлтая кромка — с ведущей стороны */}
      <div
        style={{
          position: 'absolute',
          left: `${x * 100}%`,
          top: 0,
          width: `${band * 100}%`,
          height: '100%',
          transformOrigin: '0 0',
          transform: `skewX(${(Math.atan((skew * 1920) / 1080) * 180) / Math.PI}deg)`,
          background: `linear-gradient(90deg, ${palette.accent2} 0%, ${palette.accent2} 10%, ${palette.accent} 12%, ${alpha(palette.accent, 0.9)} 70%, ${alpha(palette.accent, 0)} 100%)`,
          boxShadow: `0 0 80px ${alpha(palette.accent, 0.6)}`,
          opacity: interpolate(p, [0, 0.06, 0.92, 1], [0, 1, 1, 0], clamp),
        }}
      />
    </AbsoluteFill>
  );
};

export const brandWipe = () => make(BrandWipe);
export const push = () => make(Push);
export const dissolve = () => make(Dissolve);
export const panels = () => make(Panels);
export const bars = () => make(Bars);
export const circle = () => make(Circle);
export const zoomFlash = () => make(ZoomFlash);
export const whip = () => make(Whip);
// Старые имена — для совместимости
export const shapeReveal = circle;
export const zoomThrough = zoomFlash;
export const barWipe = panels;
