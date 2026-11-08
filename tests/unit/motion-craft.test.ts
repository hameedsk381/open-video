import { describe, expect, it } from 'vitest';
import { ease, evaluateAnimation, wiggleOffset } from '@ove/animation';
import { compositionSchema, easingSchema, loadComposition } from '@ove/schema';

describe('anticipate and bounce easings', () => {
  it('anticipate winds back, launches past the target and settles on it', () => {
    const samples = Array.from({ length: 101 }, (_, i) => ease(i / 100, 'anticipate'));
    expect(Math.min(...samples)).toBeLessThan(-0.05);          // the wind-up
    expect(Math.max(...samples)).toBeGreaterThan(1.05);        // the follow-through
    expect(samples[0]).toBe(0); expect(samples[100]).toBe(1);
  });
  it('bounce lands, rebounds and never overshoots', () => {
    const samples = Array.from({ length: 101 }, (_, i) => ease(i / 100, 'bounce'));
    expect(Math.max(...samples)).toBeLessThanOrEqual(1.0001);
    expect(samples.some((value, i) => i > 0 && value < samples[i - 1]! - 0.02)).toBe(true);   // it comes back up off the floor
    expect(samples[100]).toBe(1);
  });
  it('are accepted by the composition schema', () => { for (const name of ['anticipate', 'bounce']) expect(easingSchema.safeParse(name).success).toBe(true); });
});

describe('wiggle', () => {
  const wiggle = { amount: 10, every: 6, seed: 3 };
  it('is the same every time and stays within its amount', () => {
    for (let frame = 0; frame < 120; frame++) { expect(wiggleOffset(wiggle, frame)).toBe(wiggleOffset(wiggle, frame)); expect(Math.abs(wiggleOffset(wiggle, frame))).toBeLessThanOrEqual(10); }
  });
  it('moves, and moves differently for a different seed', () => {
    const run = (seed: number) => Array.from({ length: 60 }, (_, f) => wiggleOffset({ ...wiggle, seed }, f));
    expect(new Set(run(3)).size).toBeGreaterThan(20);
    expect(run(3)).not.toEqual(run(4));
  });
  it('holds each value for `every` frames when it is a boil, so it jumps instead of gliding', () => {
    const boil = { amount: 3, every: 5, seed: 1, hold: true };
    for (let k = 0; k < 10; k++) { const first = wiggleOffset(boil, k * 5); for (let i = 1; i < 5; i++) expect(wiggleOffset(boil, k * 5 + i)).toBe(first); }
    expect(new Set(Array.from({ length: 10 }, (_, k) => wiggleOffset(boil, k * 5))).size).toBeGreaterThan(5);
  });
  it('adds to the animated value and leaves colours alone', () => {
    const base = { property: 'x', keyframes: [{ frame: 0, value: 100 }] } as any;
    expect(evaluateAnimation(base, 17)).toBe(100);
    expect(evaluateAnimation({ ...base, wiggle }, 17)).toBe(100 + wiggleOffset(wiggle, 17));
    expect(evaluateAnimation({ property: 'fill', keyframes: [{ frame: 0, value: '#ff0000' }], wiggle } as any, 17)).toBe('#ff0000');
  });
});

describe('squash and stretch and wiggle in a composition', () => {
  const composition = (animations: unknown[]) => ({ version: '1.0', id: 't', name: 't', width: 320, height: 180, fps: 30, durationFrames: 30, background: '#000000',
    scenes: [{ id: 's', name: 'S', durationFrames: 30, layers: [{ id: 'ball', type: 'circle', x: 100, y: 90, width: 40, fill: '#ff0000', scaleX: 1.2, scaleY: 0.8, animations }] }] });
  it('accepts scaleX, scaleY and a wiggle, and keeps their defaults', () => {
    const parsed = loadComposition(composition([
      { property: 'scaleY', keyframes: [{ frame: 0, value: 1.3 }, { frame: 10, value: 0.7, easing: 'bounce' }] },
      { property: 'rotation', keyframes: [{ frame: 0, value: 0 }], wiggle: { amount: 2 } },
    ]));
    const layer = parsed.scenes[0]!.layers[0]! as any;
    expect(layer.scaleX).toBe(1.2); expect(layer.animations[1].wiggle).toEqual({ amount: 2, every: 12, seed: 0, hold: false });
    expect(compositionSchema.safeParse(composition([])).success).toBe(true);
  });
  it('defaults the stretch to 1 when it is not given', () => {
    const plain = composition([]); delete (plain.scenes[0]!.layers[0] as any).scaleX; delete (plain.scenes[0]!.layers[0] as any).scaleY;
    expect((loadComposition(plain).scenes[0]!.layers[0] as any).scaleX).toBe(1);
  });
});
