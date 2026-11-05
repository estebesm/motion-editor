import React from 'react';
import {interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';

/**
 * Значки магазинов приложений в духе официальных: чёрная плашка с тонкой серой рамкой, знак и подпись в две строки.
 * Знак Apple — из simple-icons (CC0); треугольник Google Play — четыре цветные грани.
 */
const APPLE = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

const Badge: React.FC<{icon: React.ReactNode; top: string; name: string; at: number; scale: number}> = ({icon, top, name, at, scale}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const v = spring({frame: f - at, fps, config: {damping: 16, stiffness: 120}});
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18 * scale,
        height: 96 * scale,
        padding: `0 ${34 * scale}px 0 ${26 * scale}px`,
        borderRadius: 18 * scale,
        background: '#000',
        border: `${2 * scale}px solid #A6A6A6`,
        color: '#fff',
        fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", Inter, Arial, sans-serif',
        opacity: interpolate(v, [0, 0.4], [0, 1], {extrapolateRight: 'clamp'}),
        transform: `translateY(${(1 - v) * 40}px) scale(${0.9 + 0.1 * v})`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
      }}
    >
      {icon}
      <div style={{display: 'flex', flexDirection: 'column', lineHeight: 1}}>
        <span style={{fontSize: 20 * scale, fontWeight: 500, letterSpacing: 0.3 * scale}}>{top}</span>
        <span style={{fontSize: 44 * scale, fontWeight: 600, letterSpacing: -0.5 * scale, marginTop: 4 * scale}}>{name}</span>
      </div>
    </div>
  );
};

export const StoreBadges: React.FC<{at: number; scale?: number}> = ({at, scale = 1}) => (
  <div style={{display: 'flex', gap: 28 * scale, alignItems: 'center', justifyContent: 'center'}}>
    <Badge
      at={at}
      scale={scale}
      top="Доступно в"
      name="App Store"
      icon={
        <svg width={52 * scale} height={52 * scale} viewBox="0 0 24 24">
          <path d={APPLE} fill="#fff" />
        </svg>
      }
    />
    <Badge
      at={at + 6}
      scale={scale}
      top="ДОСТУПНО В"
      name="Google Play"
      icon={
        <svg width={50 * scale} height={54 * scale} viewBox="0 0 30 33">
          {/* Грани: синяя (слева), зелёная (сверху), жёлтая (справа), красная (снизу) */}
          <path d="M1.2 1.1 16.6 16.5 1.2 31.9C.8 31.5.6 30.9.6 30.2V2.8C.6 2.1.8 1.5 1.2 1.1Z" fill="#00A0FF" />
          <path d="M21.7 11.4 16.6 16.5 1.2 1.1C1.8.5 2.8.4 3.9 1L21.7 11.4Z" fill="#00D46E" />
          <path d="M28 15.1C29.4 15.9 29.4 17.1 28 17.9L21.8 21.6 16.6 16.5 21.7 11.4 28 15.1Z" fill="#FFC400" />
          <path d="M21.8 21.6 3.9 32C2.8 32.6 1.8 32.5 1.2 31.9L16.6 16.5 21.8 21.6Z" fill="#FF3A44" />
        </svg>
      }
    />
  </div>
);
