import { describe, expect, it } from 'vitest';
import { layerSchema } from '@ove/schema';
import { collectModelSources, hasCodeLayers, hasModelLayers } from '@ove/graphics';

// A model layer is a box with a .glb in it. It is data, not code, and it is the only kind that asks for three.js to be loaded.
const model = (extra: Record<string, unknown> = {}) => ({ id: 'm', type: 'model', src: 'robot.glb', width: 400, height: 300, ...extra });

describe('model layer', () => {
  it('has a size and a file, and sensible turning defaults', () => {
    expect(layerSchema.parse(model())).toMatchObject({ yaw: 0, pitch: 0, roll: 0, spin: 0, zoom: 1, fov: 35, light: 1, animationSpeed: 1, resolution: 1 });
    expect(layerSchema.safeParse({ id: 'x', type: 'model', src: 'a.glb' }).success).toBe(false);
    expect(layerSchema.safeParse(model({ src: '' })).success).toBe(false);
    expect(layerSchema.safeParse(model({ fov: 120 })).success).toBe(false);
    expect(layerSchema.safeParse(model({ animation: 'Walk', spin: 20 })).success).toBe(true);
    expect(layerSchema.safeParse(model({ animation: 2 })).success).toBe(true);
  });

  it('is data, not code, and its file is one to load', () => {
    const layers = [model(), { id: 'g', type: 'group', children: [model({ id: 'inner', src: 'other.glb' })] }];
    expect(hasCodeLayers(layers)).toBe(false);
    expect(collectModelSources(layers)).toEqual(['robot.glb', 'other.glb']);
  });

  it('is the only thing that asks for three.js to be loaded', () => {
    expect(hasModelLayers([{ id: 'a', type: 'rect', width: 1, height: 1 }])).toBe(false);
    expect(hasModelLayers([{ id: 'g', type: 'group', children: [model()] }])).toBe(true);
  });
});
