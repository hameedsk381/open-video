import { spring } from '@ove/builder';

export type SpringPreset = 'bouncy' | 'snappy' | 'smooth' | 'wobbly' | 'gentle';

export const springPresets: Record<SpringPreset, { damping: number; stiffness: number; mass: number }> = {
  bouncy: { damping: 10, stiffness: 120, mass: 0.8 },
  snappy: { damping: 18, stiffness: 180, mass: 0.5 },
  smooth: { damping: 20, stiffness: 90, mass: 1 },
  wobbly: { damping: 7, stiffness: 85, mass: 1 },
  gentle: { damping: 24, stiffness: 70, mass: 1.2 },
};

export type SpringOptions = {
  frame: number;
  fps?: number;
  preset?: SpringPreset;
  damping?: number;
  stiffness?: number;
  mass?: number;
  from?: number;
  to?: number;
  delay?: number;
};

/**
 * Calculates a spring animation value from a frame with preset or custom damping physics.
 */
export function springValue(options: SpringOptions): number {
  const { frame, fps = 30, from = 0, to = 1, delay = 0 } = options;
  const currentFrame = frame - delay;
  if (currentFrame <= 0) return from;

  const presetConfig = options.preset ? springPresets[options.preset] : springPresets.bouncy;
  const damping = options.damping ?? presetConfig.damping;
  const stiffness = options.stiffness ?? presetConfig.stiffness;
  const mass = options.mass ?? presetConfig.mass;

  return spring({ frame: currentFrame, fps, damping, stiffness, mass, from, to });
}

/**
 * Calculates the frame offset for staggered item animations in a list.
 */
export function stagger(index: number, framesPerItem = 3, startDelay = 0): number {
  return startDelay + Math.max(0, index) * framesPerItem;
}

