import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useCurrentFrame, useVideoConfig } from './index';
import { springValue, type SpringPreset } from './springs';

export type AmbientGlowOrb = {
  x: number | string;
  y: number | string;
  size?: number | string;
  color: string;
  opacity?: number;
  speed?: number;
  phase?: number;
};

export type AmbientGlowProps = {
  orbs?: AmbientGlowOrb[];
  style?: CSSProperties;
  blur?: number;
};

/**
 * Creates atmospheric floating light orbs with gentle sine wave drift.
 */
export function AmbientGlow({
  orbs = [
    { x: '20%', y: '15%', size: 600, color: '#6366f1', opacity: 0.25, speed: 0.03, phase: 0 },
    { x: '80%', y: '75%', size: 700, color: '#ec4899', opacity: 0.2, speed: 0.025, phase: 2 },
    { x: '50%', y: '90%', size: 500, color: '#06b6d4', opacity: 0.18, speed: 0.035, phase: 4 },
  ],
  style,
  blur = 100,
}: AmbientGlowProps): ReactElement {
  const frame = useCurrentFrame();

  return createElement('div', {
    style: {
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      ...style,
    },
  }, orbs.map((orb, index) => {
    const speed = orb.speed ?? 0.03;
    const phase = orb.phase ?? index * 1.5;
    const dx = Math.sin(frame * speed + phase) * 40;
    const dy = Math.cos(frame * speed * 0.8 + phase) * 35;
    const size = typeof orb.size === 'number' ? `${orb.size}px` : (orb.size ?? '500px');

    return createElement('div', {
      key: index,
      style: {
        position: 'absolute',
        left: typeof orb.x === 'number' ? `${orb.x}px` : orb.x,
        top: typeof orb.y === 'number' ? `${orb.y}px` : orb.y,
        width: size,
        height: size,
        transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`,
        background: `radial-gradient(circle, ${orb.color} 0%, rgba(0,0,0,0) 70%)`,
        opacity: orb.opacity ?? 0.2,
        filter: `blur(${blur}px)`,
        willChange: 'transform',
      },
    });
  }));
}

export type GlassCardProps = {
  children?: ReactNode;
  style?: CSSProperties;
  delay?: number;
  preset?: SpringPreset;
  interactive?: boolean;
};

/**
 * Modern frosted-glass surface with smooth spring entry and border highlight.
 */
export function GlassCard({
  children,
  style,
  delay = 0,
  preset = 'snappy',
}: GlassCardProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset, from: 0, to: 1 });
  const y = (1 - progress) * 28;
  const scale = 0.94 + progress * 0.06;
  const opacity = Math.min(1, Math.max(0, progress * 1.4));

  return createElement('div', {
    style: {
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
      borderRadius: 20,
      padding: 32,
      opacity,
      transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(3)})`,
      willChange: 'transform, opacity',
      ...style,
    },
  }, children);
}

export type KineticTextProps = {
  text: string;
  delay?: number;
  staggerDelay?: number;
  preset?: SpringPreset;
  style?: CSSProperties;
  wordStyle?: CSSProperties;
};

/**
 * Staggered kinetic typography reveal with spring physics on every word.
 */
export function KineticText({
  text,
  delay = 0,
  staggerDelay = 3,
  preset = 'bouncy',
  style,
  wordStyle,
}: KineticTextProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);

  return createElement('span', {
    style: {
      display: 'inline-flex',
      flexWrap: 'wrap',
      gap: '0.28em',
      ...style,
    },
  }, words.map((word, index) => {
    const wordDelay = delay + index * staggerDelay;
    const progress = springValue({ frame, fps, delay: wordDelay, preset, from: 0, to: 1 });
    const y = (1 - progress) * 32;
    const opacity = Math.min(1, Math.max(0, progress * 1.5));
    const scale = 0.85 + progress * 0.15;

    return createElement('span', {
      key: index,
      style: {
        display: 'inline-block',
        opacity,
        transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(3)})`,
        willChange: 'transform, opacity',
        ...wordStyle,
      },
    }, word);
  }));
}

export type NumberTickerProps = {
  value: number;
  from?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  delay?: number;
  duration?: number;
  preset?: SpringPreset;
  style?: CSSProperties;
};

/**
 * Animated metric and counter ticker with spring easing and clean number formatting.
 */
export function NumberTicker({
  value,
  from = 0,
  prefix = '',
  suffix = '',
  decimals = 0,
  delay = 0,
  preset = 'smooth',
  style,
}: NumberTickerProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset, from: 0, to: 1 });
  const current = from + (value - from) * progress;
  const formatted = current.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return createElement('span', {
    style: {
      fontVariantNumeric: 'tabular-nums',
      display: 'inline-block',
      ...style,
    },
  }, `${prefix}${formatted}${suffix}`);
}

export type BadgeProps = {
  children?: ReactNode;
  dot?: boolean;
  dotColor?: string;
  delay?: number;
  style?: CSSProperties;
};

/**
 * SaaS pill badge with status indicator and subtle entrance spring.
 */
export function Badge({
  children,
  dot = true,
  dotColor = '#10b981',
  delay = 0,
  style,
}: BadgeProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset: 'bouncy', from: 0, to: 1 });
  const scale = 0.8 + progress * 0.2;
  const opacity = Math.min(1, Math.max(0, progress * 1.5));

  return createElement('div', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 14px',
      borderRadius: 9999,
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.16)',
      color: '#f9fafb',
      fontSize: 14,
      fontWeight: 500,
      letterSpacing: '0.02em',
      opacity,
      transform: `scale(${scale.toFixed(3)})`,
      willChange: 'transform, opacity',
      ...style,
    },
  },
    dot ? createElement('span', {
      style: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: dotColor,
        boxShadow: `0 0 10px ${dotColor}`,
      },
    }) : null,
    children,
  );
}

export type DeviceFrameProps = {
  children?: ReactNode;
  title?: string;
  url?: string;
  delay?: number;
  style?: CSSProperties;
};

/**
 * Modern browser window frame with macOS traffic light controls and subtle 3D perspective tilt.
 */
export function DeviceFrame({
  children,
  title = 'Application Preview',
  url,
  delay = 0,
  style,
}: DeviceFrameProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset: 'snappy', from: 0, to: 1 });
  const y = (1 - progress) * 45;
  const scale = 0.92 + progress * 0.08;
  const opacity = Math.min(1, Math.max(0, progress * 1.3));

  return createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: '#131722',
      borderRadius: 16,
      border: '1px solid rgba(255, 255, 255, 0.1)',
      boxShadow: '0 30px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      overflow: 'hidden',
      opacity,
      transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(3)})`,
      willChange: 'transform, opacity',
      ...style,
    },
  },
    // Top bar
    createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        gap: 12,
      },
    },
      // Traffic lights
      createElement('div', { style: { display: 'flex', gap: 6 } },
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#ef4444' } }),
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' } }),
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#10b981' } }),
      ),
      // URL or Title bar
      url ? createElement('div', {
        style: {
          flex: 1,
          maxWidth: 360,
          margin: '0 auto',
          background: 'rgba(0, 0, 0, 0.25)',
          padding: '3px 12px',
          borderRadius: 6,
          fontSize: 12,
          color: '#94a3b8',
          textAlign: 'center',
          fontFamily: 'monospace',
          border: '1px solid rgba(255, 255, 255, 0.05)',
        },
      }, url) : createElement('div', {
        style: {
          flex: 1,
          textAlign: 'center',
          fontSize: 13,
          color: '#94a3b8',
          fontWeight: 500,
        },
      }, title),
    ),
    // Frame content
    createElement('div', {
      style: {
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
      },
    }, children),
  );
}

export type ProgressBarProps = {
  value: number; // 0 to 1
  delay?: number;
  color?: string;
  height?: number;
  style?: CSSProperties;
};

/**
 * Animated progress bar with glowing fill.
 */
export function ProgressBar({
  value,
  delay = 0,
  color = '#38bdf8',
  height = 8,
  style,
}: ProgressBarProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const target = Math.min(1, Math.max(0, value));
  const progress = springValue({ frame, fps, delay, preset: 'smooth', from: 0, to: target });

  return createElement('div', {
    style: {
      width: '100%',
      height,
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: 9999,
      overflow: 'hidden',
      ...style,
    },
  }, createElement('div', {
    style: {
      width: `${(progress * 100).toFixed(2)}%`,
      height: '100%',
      background: color,
      boxShadow: `0 0 12px ${color}`,
      borderRadius: 9999,
      willChange: 'width',
    },
  }));
}
