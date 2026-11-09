import { describe, expect, it } from 'vitest';
import { compositionSchema, layerSchema } from '@ove/schema';

// A physics layer is checked like any other layer: its world has a size, and what it makes is bounded.
const layer = (extra: Record<string, unknown> = {}) => ({ id: 'w', type: 'physics', width: 400, height: 300, ...extra });
const scene = (layers: unknown[]) => ({ id: 's', name: 'S', durationFrames: 30, layers });
const base = { version: '1.0', id: 'v', name: 'V', width: 320, height: 180, fps: 30, durationFrames: 30 };

describe('physics layer', () => {
  it('has a world that needs a size, and sensible defaults', () => {
    expect(layerSchema.safeParse({ id: 'w', type: 'physics' }).success).toBe(false);
    const parsed = layerSchema.parse(layer());
    expect(parsed).toMatchObject({ gravity: { x: 0, y: 1 }, walls: 'box', seed: 1, substeps: 2, bodies: [], emit: [] });
  });

  it('takes set bodies and emitters, with one colour or several', () => {
    const parsed = layerSchema.parse(layer({
      bodies: [{ shape: 'rect', x: 100, y: 250, width: 200, height: 20, static: true }, { shape: 'circle', x: 50, y: 10, width: 24, restitution: 0.8 }],
      emit: [{ shape: 'circle', x: 200, y: 0, width: 20, count: 12, fill: ['#f4c542', '#37d3a3'] }, { shape: 'rect', x: 100, y: 0, width: 16, count: 3, fill: '#ffffff', every: 10 }],
    }));
    expect(parsed.bodies[1]).toMatchObject({ restitution: 0.8, friction: 0.1, at: 0, static: false });
    expect(parsed.emit[0]).toMatchObject({ every: 6, spread: 0, widthJitter: 0 }); expect(parsed.emit[1].every).toBe(10);
    expect(compositionSchema.safeParse({ ...base, scenes: [scene([layer()])] }).success).toBe(true);
  });

  it('refuses what cannot be simulated', () => {
    for (const bad of [
      { bodies: [{ shape: 'triangle', x: 0, y: 0, width: 10 }] }, { bodies: [{ shape: 'circle', x: 0, y: 0, width: -3 }] }, { bodies: [{ shape: 'circle', x: 0, y: 0, width: 10, restitution: 2 }] },
      { emit: [{ shape: 'circle', x: 0, y: 0, width: 10, count: 0 }] }, { emit: [{ shape: 'circle', x: 0, y: 0, width: 10, count: 9999 }] }, { walls: 'moat' }, { substeps: 0 },
      { emit: Array.from({ length: 3 }, () => ({ shape: 'circle', x: 0, y: 0, width: 10, count: 200 })) },
    ]) expect(layerSchema.safeParse(layer(bad)).success, JSON.stringify(bad).slice(0, 80)).toBe(false);
  });

  it('can be drawn by hand like any shape', () => {
    expect(layerSchema.parse(layer({ sketch: { boil: 4 } })).sketch).toMatchObject({ boil: 4, roughness: 1.2 });
  });
});
