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

export type WordTrigger = { word: string; frame: number };

export type KineticTextProps = {
  text: string;
  delay?: number;
  staggerDelay?: number;
  preset?: SpringPreset;
  style?: CSSProperties;
  wordStyle?: CSSProperties;
  // NEW: per-word frame triggers from narration timestamps
  wordTriggers?: WordTrigger[];
};

/**
 * Staggered kinetic typography reveal with spring physics on every word.
 * Supports optional per-word frame triggers (from narration timestamps) via `wordTriggers`.
 */
export function KineticText({
  text,
  delay = 0,
  staggerDelay = 3,
  preset = 'bouncy',
  style,
  wordStyle,
  wordTriggers,
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
    // Determine delay: use wordTrigger frame if a matching trigger exists
    let wordDelay = delay + index * staggerDelay;
    if (wordTriggers && wordTriggers.length > 0) {
      const stripped = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const trigger = wordTriggers.find(t => t.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === stripped);
      if (trigger !== undefined) {
        wordDelay = trigger.frame;
      }
    }
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

export type BentoGridProps = {
  columns?: number | string;
  gap?: number | string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * Responsive Bento Grid container for modular layout design.
 */
export function BentoGrid({
  columns = 3,
  gap = 20,
  style,
  children,
}: BentoGridProps): ReactElement {
  const gridTemplateColumns = typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns;
  const gapValue = typeof gap === 'number' ? `${gap}px` : gap;

  return createElement('div', {
    style: {
      display: 'grid',
      gridTemplateColumns,
      gap: gapValue,
      width: '100%',
      ...style,
    },
  }, children);
}

export type BentoCardProps = {
  colSpan?: number | string;
  rowSpan?: number | string;
  title?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  delay?: number;
  preset?: SpringPreset;
  glowColor?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * Modern glassmorphic Bento card with spring reveal and optional title/badge/icon.
 */
export function BentoCard({
  colSpan = 1,
  rowSpan = 1,
  title,
  subtitle,
  badge,
  icon,
  delay = 0,
  preset = 'snappy',
  glowColor = 'rgba(99, 102, 241, 0.15)',
  style,
  children,
}: BentoCardProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset, from: 0, to: 1 });
  const y = (1 - progress) * 24;
  const scale = 0.95 + progress * 0.05;
  const opacity = Math.min(1, Math.max(0, progress * 1.4));

  const gridColumn = typeof colSpan === 'number' ? `span ${colSpan} / span ${colSpan}` : colSpan;
  const gridRow = typeof rowSpan === 'number' ? `span ${rowSpan} / span ${rowSpan}` : rowSpan;

  return createElement('div', {
    style: {
      gridColumn,
      gridRow,
      position: 'relative',
      background: 'rgba(18, 20, 29, 0.75)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: `0 12px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 40px ${glowColor}`,
      borderRadius: 20,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      opacity,
      transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(3)})`,
      willChange: 'transform, opacity',
      ...style,
    },
  },
    (title || badge || icon) ? createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: subtitle || children ? 16 : 0,
        gap: 12,
      },
    },
      createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: 10 },
      },
        icon ? createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        }, icon) : null,
        title ? createElement('div', {
          style: {
            fontSize: 18,
            fontWeight: 600,
            color: '#f8fafc',
            letterSpacing: '-0.01em',
          },
        }, title) : null,
      ),
      badge ? (typeof badge === 'string' ? createElement(Badge, null, badge) : badge) : null,
    ) : null,
    subtitle ? createElement('div', {
      style: {
        fontSize: 14,
        color: '#94a3b8',
        lineHeight: 1.5,
        marginBottom: children ? 16 : 0,
      },
    }, subtitle) : null,
    children,
  );
}

export type TypewriterProps = {
  text: string;
  delay?: number;
  speed?: number; // characters per frame
  cursor?: boolean;
  cursorChar?: string;
  cursorBlinkSpeed?: number;
  style?: CSSProperties;
  cursorStyle?: CSSProperties;
};

/**
 * Typewriter text effect with animated typing cursor and blinking cursor.
 */
export function Typewriter({
  text,
  delay = 0,
  speed = 0.75,
  cursor = true,
  cursorChar = '▍',
  cursorBlinkSpeed = 16,
  style,
  cursorStyle,
}: TypewriterProps): ReactElement {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - delay);
  const charCount = Math.min(text.length, Math.floor(elapsed * speed));
  const visibleText = text.slice(0, charCount);
  const isDone = charCount >= text.length;

  const blink = cursor && Math.floor((frame / (cursorBlinkSpeed / 2))) % 2 === 0;

  return createElement('span', {
    style: {
      display: 'inline-flex',
      alignItems: 'baseline',
      fontFamily: 'monospace',
      ...style,
    },
  },
    visibleText,
    cursor ? createElement('span', {
      style: {
        display: 'inline-block',
        marginLeft: 2,
        opacity: blink ? 1 : (isDone ? 0.3 : 0),
        color: '#38bdf8',
        willChange: 'opacity',
        ...cursorStyle,
      },
    }, cursorChar) : null,
  );
}

export type WaveformProps = {
  bars?: number;
  height?: number;
  color?: string;
  activeColor?: string;
  speed?: number;
  delay?: number;
  preset?: SpringPreset;
  style?: CSSProperties;
};

/**
 * Animated dynamic waveform audio visualizer bars.
 */
export function Waveform({
  bars = 24,
  height = 50,
  color = '#6366f1',
  activeColor = '#ec4899',
  speed = 0.12,
  delay = 0,
  preset = 'snappy',
  style,
}: WaveformProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset, from: 0, to: 1 });
  const opacity = Math.min(1, Math.max(0, progress * 1.5));

  const barElements = [];
  for (let i = 0; i < bars; i++) {
    const wave1 = Math.sin(frame * speed + i * 0.45);
    const wave2 = Math.cos(frame * speed * 0.7 + i * 0.3);
    const wave3 = Math.sin(frame * speed * 1.3 + i * 0.8);
    const combined = (wave1 + wave2 + wave3) / 3;
    const normalized = (combined + 1) / 2;
    const barHeight = Math.max(8, normalized * height * progress);

    barElements.push(createElement('div', {
      key: i,
      style: {
        width: 4,
        height: `${barHeight.toFixed(1)}px`,
        borderRadius: 9999,
        background: `linear-gradient(to top, ${color}, ${activeColor})`,
        opacity: 0.6 + normalized * 0.4,
        boxShadow: normalized > 0.65 ? `0 0 10px ${activeColor}` : undefined,
        transformOrigin: 'bottom',
        willChange: 'height',
      },
    }));
  }

  return createElement('div', {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      height,
      opacity,
      willChange: 'opacity',
      ...style,
    },
  }, barElements);
}

export type CodeEditorProps = {
  filename?: string;
  code: string;
  language?: string;
  delay?: number;
  highlightLines?: number[];
  showLineNumbers?: boolean;
  preset?: SpringPreset;
  style?: CSSProperties;
};

/**
 * Developer code terminal / editor card with line numbers and active glow.
 */
export function CodeEditor({
  filename = 'main.ts',
  code,
  language = 'typescript',
  delay = 0,
  highlightLines = [],
  showLineNumbers = true,
  preset = 'snappy',
  style,
}: CodeEditorProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = springValue({ frame, fps, delay, preset, from: 0, to: 1 });
  const y = (1 - progress) * 35;
  const scale = 0.94 + progress * 0.06;
  const opacity = Math.min(1, Math.max(0, progress * 1.4));

  const lines = code.trim().split('\n');

  return createElement('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: '#0d1117',
      borderRadius: 14,
      border: '1px solid rgba(255, 255, 255, 0.12)',
      boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
      fontFamily: 'Consolas, Monaco, "Courier New", monospace',
      fontSize: 14,
      overflow: 'hidden',
      opacity,
      transform: `translateY(${y.toFixed(2)}px) scale(${scale.toFixed(3)})`,
      willChange: 'transform, opacity',
      ...style,
    },
  },
    createElement('div', {
      style: {
        display: 'flex',
        alignItems: 'center',
        padding: '10px 16px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        gap: 12,
      },
    },
      createElement('div', { style: { display: 'flex', gap: 6 } },
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#ef4444' } }),
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' } }),
        createElement('span', { style: { width: 10, height: 10, borderRadius: '50%', background: '#10b981' } }),
      ),
      createElement('div', {
        style: {
          color: '#94a3b8',
          fontSize: 12,
          fontWeight: 500,
          margin: '0 auto',
        },
      }, filename),
      createElement('div', {
        style: {
          color: '#64748b',
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        },
      }, language),
    ),
    createElement('div', {
      style: {
        padding: '16px 0',
        overflowX: 'auto',
        lineHeight: 1.6,
      },
    }, lines.map((line, idx) => {
      const lineNum = idx + 1;
      const isHighlighted = highlightLines.includes(lineNum);

      return createElement('div', {
        key: idx,
        style: {
          display: 'flex',
          padding: '0 20px',
          background: isHighlighted ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
          borderLeft: isHighlighted ? '3px solid #38bdf8' : '3px solid transparent',
        },
      },
        showLineNumbers ? createElement('span', {
          style: {
            width: 32,
            flexShrink: 0,
            color: isHighlighted ? '#38bdf8' : '#475569',
            userSelect: 'none',
            textAlign: 'right',
            marginRight: 16,
          },
        }, lineNum) : null,
        createElement('span', {
          style: {
            color: isHighlighted ? '#f8fafc' : '#cbd5e1',
            whiteSpace: 'pre',
          },
        }, line || ' '),
      );
    })),
  );
}
