import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {Backdrop} from '../../components/Backdrop';
import {Camera} from '../../components/Camera';
import {FitKinetic} from '../../components/FitKinetic';
import {Icon} from '../../components/Icon';
import {Mark} from '../../components/SpeechText';
import {MovingTitle} from '../../components/MovingTitle';
import {byRole, lineSpan, plainText, Written} from '../../components/Spoken';
import {cueFrames} from '../../lib/cues';
import {fitText} from '../../lib/fit';
import {alpha, ease, FONT_FAMILY, mix, palette} from '../../theme';
import type {DiagramScene as T} from '../types';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** Точка на квадратичной кривой Безье */
const qPoint = (a: number[], c: number[], b: number[], t: number) => [
  (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t ** 2 * b[0],
  (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t ** 2 * b[1],
];

/**
 * Схема: узлы с иконками появляются, когда диктор о них говорит, связи прорисовываются линией,
 * по ним бегут точки-«данные». flow — цепочка слева направо, hub — центр и связи вокруг.
 */
export const DiagramScene: React.FC<{scene: T; duration: number; voiceDelay: number}> = ({scene, duration, voiceDelay}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nodes = scene.nodes.slice(0, 6);
  const n = nodes.length;
  const hub = scene.layout === 'hub' && n >= 3;
  const exitAt = duration - 22;
  const leave = interpolate(frame, [exitAt, exitAt + 16], [0, 1], {...clamp, easing: ease.in});
  const head = byRole(scene.lines, 'head')[0];
  const itemLines = byRole(scene.lines, 'item');
  const spoken = itemLines.length === n;
  const cues = spoken
    ? itemLines.map((l) => lineSpan(l, scene.words, voiceDelay, duration - 20)[0])
    : cueFrames(nodes.map((x) => x.label), scene.words, voiceDelay, scene.audioFrames ?? duration - 40);
  const title = spoken ? (head ? plainText(head.text) : undefined) : scene.title;
  const active = cues.reduce((acc, c, i) => (frame >= c ? i : acc), -1);

  // Геометрия
  const cy = title ? 590 : 540;
  const pos: number[][] = hub
    ? nodes.map((_, i) => {
        if (i === 0) return [960, cy];
        const k = n - 1;
        const ang = -Math.PI / 2 + ((i - 1) / k) * Math.PI * 2 + (k === 2 ? Math.PI / 2 : 0);
        return [960 + Math.cos(ang) * 600, cy + Math.sin(ang) * 290];
      })
    : nodes.map((_, i) => [960 + (i - (n - 1) / 2) * Math.min(400, 1640 / n), cy - 30]);
  const R = (i: number) => (hub && i === 0 ? 120 : n > 4 ? 78 : 92);
  const labelW = hub ? 380 : Math.min(380, 1640 / n - 30);

  const links: [number, number][] = hub ? nodes.slice(1).map((_, i) => [0, i + 1]) : nodes.slice(1).map((_, i) => [i, i + 1]);

  return (
    <AbsoluteFill style={{background: palette.bg, overflow: 'hidden'}}>
      <Backdrop seed={nodes.map((x) => x.label).join()} duration={duration} strength={0.8} word={title} />
      <Camera duration={duration} from={{zoom: 1.06, y: 20}} to={{zoom: 1.0, y: -10}} shake={3}>
        <AbsoluteFill style={{opacity: 1 - leave, transform: `scale(${1 - leave * 0.06})`}}>
          {spoken && head ? (
            <MovingTitle cue={cues[0]} top={96} zoom={1.9}>
              <Written text={head.text} line={head} words={scene.words} offset={voiceDelay} duration={duration} size={60} maxWidth={1400 / 1.9} maxLines={1} />
            </MovingTitle>
          ) : !spoken && scene.title ? (
            <MovingTitle cue={cues[0]} top={96} zoom={2.2}>
              <div style={{position: 'relative', isolation: 'isolate'}}>
                <FitKinetic text={scene.title.toUpperCase()} maxWidth={1400} maxSize={58} maxLines={1} color={palette.ink} mode="rise" delay={2} stagger={1} />
                <div style={{position: 'absolute', inset: 0, fontSize: 58}}>
                  <Mark kind="underline" p={interpolate(frame, [14, 34], [0, 1], {...clamp, easing: ease.out})} />
                </div>
              </div>
            </MovingTitle>
          ) : null}

          {/* Связи */}
          <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
            {links.map(([a, b], li) => {
              const start = cues[b] - 6;
              const p = interpolate(frame, [start, start + 16], [0, 1], {...clamp, easing: ease.out});
              if (p <= 0) return null;
              const A = pos[a];
              const B = pos[b];
              const dx = B[0] - A[0];
              const dy = B[1] - A[1];
              const len = Math.hypot(dx, dy) || 1;
              const ux = dx / len;
              const uy = dy / len;
              const a0 = [A[0] + ux * (R(a) + 14), A[1] + uy * (R(a) + 14)];
              const b0 = [B[0] - ux * (R(b) + 22), B[1] - uy * (R(b) + 22)];
              const bend = hub ? 0 : (li % 2 ? 1 : -1) * 40;
              const c = [(a0[0] + b0[0]) / 2 - uy * bend, (a0[1] + b0[1]) / 2 + ux * bend];
              const d = `M ${a0[0]} ${a0[1]} Q ${c[0]} ${c[1]} ${b0[0]} ${b0[1]}`;
              const flow = ((frame - start) / 45) % 1;
              const dots = [0, 0.5].map((o) => qPoint(a0, c, b0, (flow + o) % 1));
              // наконечник стрелки
              const tip = qPoint(a0, c, b0, 1);
              const pre = qPoint(a0, c, b0, 0.94);
              const ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
              return (
                <g key={li}>
                  <path d={d} pathLength={1} fill="none" stroke={alpha(palette.ink, 0.25)} strokeWidth={4} strokeDasharray="1" strokeDashoffset={1 - p} strokeLinecap="round" />
                  <path d={d} pathLength={1} fill="none" stroke={palette.accent} strokeWidth={4} strokeDasharray="0.02 0.03" strokeLinecap="round" opacity={0.7 * p} />
                  {p >= 1
                    ? dots.map((pt, k) => <circle key={k} cx={pt[0]} cy={pt[1]} r={7} fill={k ? palette.accent2 : palette.accent} />)
                    : null}
                  {!hub ? (
                    <path
                      d="M -16 -11 L 2 0 L -16 11"
                      fill="none"
                      stroke={palette.accent}
                      strokeWidth={5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={interpolate(p, [0.8, 1], [0, 1], clamp)}
                      transform={`translate(${tip[0]} ${tip[1]}) rotate(${(ang * 180) / Math.PI})`}
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>

          {/* Узлы */}
          {nodes.map((node, i) => {
            const s = spring({frame: frame - cues[i], fps, config: {damping: 13, stiffness: 140}});
            if (frame < cues[i] - 1) return null;
            const r = R(i);
            // В схеме «центр и связи» все появившиеся узлы остаются яркими (это набор, а не шаги)
            const isActive = hub ? frame >= cues[i] : i === active;
            const pulse = i === active ? 1 + Math.sin((frame - cues[i]) / 6) * 0.02 : 1;
            const center = hub && i === 0;
            const lab = fitText(node.label.toUpperCase(), {maxWidth: labelW, maxSize: center ? 46 : 38, minSize: 24, maxLines: 2});
            const labelBelow = !hub || center || pos[i][1] >= cy;
            return (
              <div key={i} style={{position: 'absolute', left: pos[i][0], top: pos[i][1], transform: `translate(-50%, -50%) scale(${s * pulse})`}}>
                <div
                  style={{
                    width: r * 2,
                    height: r * 2,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isActive || center ? `linear-gradient(135deg, ${palette.accent}, ${palette.accent2})` : mix(palette.accent, palette.bg, 0.14),
                    border: `3px solid ${isActive || center ? 'transparent' : alpha(palette.accent, 0.55)}`,
                    boxShadow: isActive ? `0 0 0 ${10 + Math.sin(frame / 8) * 4}px ${alpha(palette.accent, 0.18)}, 0 30px 70px ${alpha(palette.accent, 0.35)}` : 'none',
                  }}
                >
                  {node.icon || center ? (
                    <Icon name={node.icon ?? 'target'} size={r * 0.9} color={isActive || center ? '#fff' : palette.accent} stroke={2} />
                  ) : (
                    <span style={{fontFamily: FONT_FAMILY, fontSize: r * 0.7, color: isActive || center ? '#fff' : palette.accent}}>{i + 1}</span>
                  )}
                </div>
                <div
                  style={{
                    position: 'absolute',
                    left: '50%',
                    [labelBelow ? 'top' : 'bottom']: r * 2 + 22,
                    transform: 'translateX(-50%)',
                    width: labelW,
                    textAlign: 'center',
                    fontFamily: FONT_FAMILY,
                    fontSize: lab.size,
                    lineHeight: 1.1,
                    color: isActive || center ? palette.ink : alpha(palette.ink, 0.75),
                    opacity: spoken ? 1 : interpolate(frame, [cues[i] + 4, cues[i] + 14], [0, 1], clamp),
                  }}
                >
                  {spoken ? (
                    <Written text={itemLines[i].text} line={itemLines[i]} words={scene.words} offset={voiceDelay} duration={duration} size={lab.size} maxWidth={labelW} maxLines={2} />
                  ) : (
                    lab.lines.map((l, k) => <div key={k}>{l}</div>)
                  )}
                </div>
              </div>
            );
          })}
        </AbsoluteFill>
      </Camera>
    </AbsoluteFill>
  );
};
