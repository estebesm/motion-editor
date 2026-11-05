import React from 'react';
import {
  AbsoluteFill,
  Freeze,
  Img,
  interpolate,
  OffthreadVideo,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {Headline, KeyText, withoutRepeats} from '../../components/KeyText';
import {shotOf, SpokenStack} from '../../components/Spoken';
import {fitText} from '../../lib/fit';
import {alpha, ease, palette} from '../../theme';
import type {ImageScene as T} from '../types';

const MAX_W = 1000;
const MAX_H = 930;
/** Телефон: высота корпуса и толщина рамки */
const PHONE_H = 880;
const BEZEL = 16;

/** Рамка точно по пропорциям файла — ничего не обрезаем. */
const frameFor = (scene: T, maxW = MAX_W) => {
  const aspect =
    scene.width && scene.height
      ? scene.width / scene.height
      : scene.orientation === 'landscape' ? 16 / 9 : scene.orientation === 'square' ? 1 : 0.8;
  if (scene.effect === 'phone') {
    const h = PHONE_H - BEZEL * 2;
    const w = Math.round(h * Math.min(aspect, 0.75));
    return {w, h, textW: Math.max(480, 1920 - 220 - 90 - w - BEZEL * 2 - 40)};
  }
  let w = Math.min(maxW, MAX_H * aspect);
  // Маленькие картинки (логотипы) не раздуваем больше чем вдвое — иначе мыло
  if (!scene.isVideo && scene.width) w = Math.min(w, Math.max(scene.width * 2, 360));
  w = Math.round(w);
  const h = Math.round(w / aspect);
  return {w, h, textW: Math.max(480, 1920 - 220 - 90 - w - 40)};
};

/** Несколько картинок в ряд: общая высота, ширина по пропорциям, без раздувания маленьких */
const galleryFor = (scene: T, maxW = MAX_W) => {
  const items = [{image: scene.image, width: scene.width, height: scene.height, cutout: scene.cutout}, ...(scene.more ?? [])];
  const gap = 36;
  const aspects = items.map((m) => (m.width && m.height ? m.width / m.height : 1));
  // Вытянутые логотипы без фона в ряд выходят мелкими — ставим столбиком
  if (items.every((m) => m.cutout) && aspects.reduce((a, b) => a + b, 0) > 2.8) {
    const cards = items.map((m, i) => {
      let h = Math.min(230, 820 / items.length - gap);
      let w = h * aspects[i];
      if (w > 760) [w, h] = [760, 760 / aspects[i]];
      return {src: m.image, w: Math.round(w), h: Math.round(h), cutout: true};
    });
    const widest = Math.max(...cards.map((c) => c.w));
    return {cards, gap: 70, textW: Math.max(480, 1920 - 220 - 90 - widest - 40), column: true};
  }
  const avail = maxW - gap * (items.length - 1);
  const maxByNatural = Math.min(...items.map((m) => (m.height ? Math.max(m.height * 2, 200) : 9999)));
  const h = Math.round(Math.min(560, avail / aspects.reduce((a, b) => a + b, 0), maxByNatural));
  const cards = items.map((m, i) => ({src: m.image, w: Math.round(h * aspects[i]), h, cutout: !!m.cutout}));
  const total = cards.reduce((a, c) => a + c.w, 0) + gap * (cards.length - 1);
  return {cards, gap, textW: Math.max(480, 1920 - 220 - 90 - total - 40), column: false};
};

/**
 * Видео пользователя: начинается, когда карточка появилась, а если оно короче сцены —
 * чуть замедляется (не меньше 0.6×) и замирает на последнем кадре, вместо пустоты.
 */
const ClipVideo: React.FC<{scene: T; duration: number; style: React.CSSProperties}> = ({scene, duration, style}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const startAt = 18;
  const trim = Math.round((scene.clipStart ?? 0) * fps);
  const clipFrames = Math.max(1, Math.floor(((scene.mediaDuration ?? duration / fps) - (scene.clipStart ?? 0)) * fps) - 2);
  const room = Math.max(1, duration - startAt - 40);
  const rate = Math.min(1, Math.max(0.6, clipFrames / room));
  const local = Math.min(clipFrames - 1, Math.max(0, Math.round((frame - startAt) * rate)));
  return (
    <Freeze frame={local}>
      <OffthreadVideo src={staticFile(scene.image)} muted trimBefore={trim} style={style} />
    </Freeze>
  );
};

/**
 * Картинка или видео пользователя, всё плоское. Эффект выбирает ИИ-планировщик:
 * static — как есть, kenburns — медленный наезд внутри рамки, phone — в рамке телефона.
 */
export const ImageScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const right = (scene.side ?? 'right') === 'right';
  const dir = right ? 1 : -1;
  // Со структурным текстом (тезис + строка) колонке текста нужно не меньше ~720 px
  const spoken = !!scene.lines?.some((l) => l.text);
  const maxW = spoken || scene.headline || scene.subline ? 830 : MAX_W;
  const gallery = scene.more?.length ? galleryFor(scene, maxW) : null;
  const box = gallery ? {...frameFor(scene, maxW), textW: gallery.textW} : frameFor(scene, maxW);
  // Старые раскадровки могли содержать 3D-эффекты — показываем их наездом
  const effect = scene.effect === 'static' || scene.effect === 'phone' ? scene.effect : 'kenburns';
  const phone = effect === 'phone';
  const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
  const src = staticFile(scene.image);

  const reveal = interpolate(frame, [4, 34], [0, 1], {...clamp, easing: ease.out});
  const lift = spring({frame: frame - 4, fps, config: {damping: 18, stiffness: 70}});
  const p = interpolate(frame, [0, duration], [0, 1], {...clamp, easing: ease.cinematic});
  const leave = interpolate(frame, [duration - 26, duration - 4], [0, 1], {...clamp, easing: ease.in});
  const glare = interpolate(frame, [22, 70], [-60, 160], clamp);
  const exitAt = duration - 26;
  // Заголовок крупно ~1.5 с, потом уменьшается в «шапку», а ниже идут ключевые фразы
  const structured = !!(scene.headline || scene.subline);
  const shrinkAt = structured ? 0 : scene.words?.length && duration > 110 && !(scene.keys && !scene.keys.length) ? 44 : null;
  const tFit = scene.title ? fitText(scene.title, {maxWidth: box.textW, maxSize: 170, minSize: 70}) : null;
  const titleH = tFit ? tFit.lines.length * tFit.size * 1.12 : 0;
  const shrink = shrinkAt ? interpolate(frame, [shrinkAt, shrinkAt + 18], [0, 1], {...clamp, easing: ease.cinematic}) : 0;
  const tScale = 1 - 0.5 * shrink;

  // Наезд только у картинок с эффектом kenburns: записи экрана и «как есть» — без искажений
  const kb = effect === 'kenburns' && !scene.isVideo ? 1 : 0;
  const media = (style: React.CSSProperties) =>
    scene.isVideo ? <ClipVideo scene={scene} duration={duration} style={style} /> : <Img src={src} style={style} />;
  // Клип: на каждой фразе файл «перекадрируется» — резкая смена крупности
  const clip = spoken && !!palette.clip;
  const shot = clip ? shotOf(scene.lines, scene.words, voiceDelay, duration, frame) : null;
  const reframe = 1;
  const radius = phone ? 54 : 28;
  const floatY = phone ? Math.sin(frame / 40) * 8 : 0;

  return (
    <AbsoluteFill style={{background: palette.bg, overflow: 'hidden'}}>
      {/* Атмосферный фон из той же картинки (для видео — статичный кадр не нужен, берём цвет) */}
      {!scene.isVideo ? (
        <AbsoluteFill style={{opacity: 0.32 * reveal * (1 - leave)}}>
          <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(70px) saturate(1.3)', transform: 'scale(1.3)'}} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{background: `radial-gradient(circle at ${right ? 70 : 30}% 50%, ${alpha(palette.accent2, 0.18 * reveal)} 0%, transparent 60%)`}} />
      )}
      <AbsoluteFill style={{background: `linear-gradient(${right ? 90 : 270}deg, ${palette.bg} 25%, ${alpha(palette.bg, 0.2)} 100%)`}} />
      <Backdrop seed={scene.image} duration={duration} strength={0.85} word={spoken ? undefined : scene.title} />

      <Camera duration={duration} from={{zoom: 1.06, x: dir * 30}} to={{zoom: 1.0, x: dir * -20}} shake={3}>
        <AbsoluteFill
          style={{
            flexDirection: right ? 'row' : 'row-reverse',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 90,
            padding: '0 110px',
          }}
        >
          {spoken ? (
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}}>
              <SpokenStack lines={scene.lines!} words={scene.words} offset={voiceDelay} duration={duration} maxWidth={box.textW} align="left" sizes={clip ? [124] : [100, 84, 70, 60]} cuts={clip} />
            </div>
          ) : structured ? (
            <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 30, alignItems: 'flex-start'}}>
              {scene.title ? (
                <FitKinetic text={scene.title.toUpperCase()} maxWidth={box.textW} maxSize={40} maxLines={1} align="flex-start" color={palette.accent} mode="rise" delay={6} stagger={1} exitAt={exitAt} />
              ) : null}
              <Headline headline={scene.headline} subline={scene.subline} words={scene.words} offset={voiceDelay} duration={duration} variant="caption" maxWidth={box.textW} align="left" seed={scene.image} from={14} />
            </div>
          ) : (
          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: 34, alignItems: 'flex-start'}}>
            {scene.title ? (
              <div style={{height: titleH * tScale, position: 'relative', width: box.textW}}>
                <div style={{position: 'absolute', left: 0, top: 0, transformOrigin: 'left top', transform: `scale(${tScale})`, color: shrink > 0.5 ? palette.accent : undefined}}>
                  <FitKinetic text={scene.title} maxWidth={box.textW} maxSize={170} minSize={70} align="flex-start" mode="flip" delay={14} stagger={2.5} exitAt={exitAt} color={shrink > 0.5 ? palette.accent : palette.ink} />
                </div>
              </div>
            ) : null}
            {shrinkAt ? (
              <div style={{minHeight: 260, width: box.textW}}>
                <KeyText keys={scene.keys ? (withoutRepeats(scene.keys, [scene.title]) ?? []) : undefined} words={scene.words} offset={voiceDelay} duration={duration} variant="caption" maxWidth={box.textW} align="left" from={shrinkAt + 18} seed={scene.image} />
              </div>
            ) : scene.caption ? (
              <FitKinetic text={scene.caption} maxWidth={box.textW - 40} maxSize={60} maxLines={3} align="flex-start" color={palette.accent} mode="rise" delay={32} stagger={1} exitAt={exitAt + 4} />
            ) : null}
          </div>
          )}

          <div style={{transform: `scale(${reframe})`, transformOrigin: right ? '0% 50%' : '100% 50%'}}>
          {gallery ? (
            <div style={{display: 'flex', flexDirection: gallery.column ? 'column' : 'row', gap: gallery.gap, alignItems: 'center'}}>
              {gallery.cards.map((c, i) => {
                const d = 4 + i * 8;
                const r = interpolate(frame, [d, d + 30], [0, 1], {...clamp, easing: ease.out});
                const l = spring({frame: frame - d, fps, config: {damping: 18, stiffness: 70}});
                if (c.cutout) {
                  const pop = spring({frame: frame - d, fps, config: {damping: 10, stiffness: 140}});
                  return (
                    <div key={i} style={{width: c.w, height: c.h, transform: `scale(${pop * (1 - leave * 0.2)}) translateY(${Math.sin((frame + i * 30) / 40) * 6}px)`, opacity: Math.min(1, pop * 1.5) * (1 - leave)}}>
                      <Img src={staticFile(c.src)} style={{width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 0 40px ${alpha(palette.accent, 0.45)})`}} />
                    </div>
                  );
                }
                return (
                  <div key={i} style={{position: 'relative'}}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: '-6%',
                        borderRadius: 40,
                        background: `linear-gradient(135deg, ${i % 2 ? palette.accent2 : palette.accent}, ${i % 2 ? palette.accent : palette.accent2})`,
                        opacity: (palette.light ? 0.28 : 0.22) * r * (1 - leave),
                        transform: `translate(${(i % 2 ? 1 : -1) * 22}px, 26px) rotate(${(i % 2 ? 3 : -3)}deg)`,
                        filter: 'blur(2px)',
                      }}
                    />
                    <div
                      style={{
                        width: c.w,
                        height: c.h,
                        borderRadius: 24,
                        overflow: 'hidden',
                        background: '#fff',
                        transform: `translateY(${(1 - l) * 120 + Math.sin((frame + i * 30) / 45) * 6}px) scale(${1 - leave * 0.15})`,
                        clipPath: `inset(${(1 - r) * 100}% 0 0 0 round 24px)`,
                        boxShadow: `0 50px 100px rgba(0,0,0,${palette.light ? 0.2 : 0.55}), 0 0 0 1px ${alpha(palette.ink, 0.08)}`,
                        opacity: 1 - leave,
                      }}
                    >
                      <Img src={staticFile(c.src)} style={{width: '100%', height: '100%', objectFit: 'contain'}} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : scene.cutout ? (
            <div
              style={{
                width: box.w,
                height: box.h,
                transform: `scale(${spring({frame: frame - 4, fps, config: {damping: 10, stiffness: 140}}) * (1 - leave * 0.2)}) translateY(${Math.sin(frame / 40) * 8}px)`,
                opacity: 1 - leave,
              }}
            >
              <Img src={src} style={{width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 0 60px ${alpha(palette.accent, 0.5)})`}} />
            </div>
          ) : (
            <div style={{position: 'relative'}}>
              {/* Цветная подложка за карточкой/телефоном */}
              <div
                style={{
                  position: 'absolute',
                  inset: phone ? '-6% -26%' : '-5%',
                  borderRadius: phone ? '50%' : 48,
                  background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})`,
                  opacity: (palette.light ? 0.3 : 0.24) * reveal * (1 - leave),
                  transform: `translate(${dir * -36}px, ${30 + floatY * -0.6}px) rotate(${dir * -4 + p * dir * 3}deg) scale(${0.85 + 0.15 * lift})`,
                  filter: 'blur(2px)',
                }}
              />
              <div
                style={{
                  position: 'relative',
                  padding: phone ? BEZEL : 0,
                  borderRadius: phone ? radius + BEZEL : radius,
                  background: phone ? '#0d0d10' : palette.bg,
                  transform: `translateY(${(1 - lift) * 140 + floatY}px) scale(${1 - leave * 0.15})`,
                  clipPath: `inset(${(1 - reveal) * 100}% 0 0 0 round ${phone ? radius + BEZEL : radius}px)`,
                  boxShadow: phone
                    ? `0 70px 140px rgba(0,0,0,${palette.light ? 0.3 : 0.65}), inset 0 0 0 2px #3a3a42, 0 0 0 1px ${alpha(palette.ink, 0.12)}`
                    : `0 60px 120px rgba(0,0,0,${palette.light ? 0.25 : 0.6}), 0 0 0 1px ${alpha(palette.ink, 0.08)}`,
                  opacity: 1 - leave,
                }}
              >
                <div style={{width: box.w, height: box.h, position: 'relative', borderRadius: radius, overflow: 'hidden', background: palette.bg}}>
                  {media({
                    width: '100%',
                    height: '100%',
                    objectFit: phone ? 'contain' : 'cover',
                    transform: kb ? `scale(${1 + (0.28 - p * 0.2) * kb}) translate(${dir * (p * 30 - 15) * kb}px, ${p * -20 * kb}px)` : undefined,
                  })}
                  {phone ? (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(115deg, transparent ${glare - 20}%, rgba(255,255,255,0.12) ${glare}%, transparent ${glare + 20}%)`,
                        mixBlendMode: 'screen',
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
          </div>
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
