import { describe, expect, it } from 'vitest';
import { layerSchema } from '@ove/schema';
import { collectCodeSources, hasCodeLayers, hasP5Layers } from '@ove/graphics';

// A p5 layer is checked like a code layer, counts as one (it runs the composition's JavaScript), and is the only kind that needs p5.js loaded.
const p5 = (extra: Record<string, unknown> = {}) => ({ id: 'sk', type: 'p5', width: 200, height: 100, code: 'function draw(p) {}', ...extra });

describe('p5 layer', () => {
  it('has a size, one source and a seed', () => {
    expect(layerSchema.parse(p5())).toMatchObject({ seed: 1, resolution: 1, props: {} });
    expect(layerSchema.safeParse({ id: 'x', type: 'p5', code: 'function draw(p) {}' }).success).toBe(false);
    expect(layerSchema.safeParse(p5({ src: 'a.js' })).success).toBe(false);
    expect(layerSchema.safeParse(p5({ code: undefined })).success).toBe(false);
    expect(layerSchema.safeParse(p5({ code: undefined, src: 'sketch.js', seed: 4, resolution: 2 })).success).toBe(true);
    expect(layerSchema.safeParse(p5({ resolution: 9 })).success).toBe(false);
  });

  it('counts as code, and its file is one to load', () => {
    const layers = [p5({ code: undefined, src: 'sketch.js' }), { id: 'g', type: 'group', children: [p5({ id: 'inner' })] }];
    expect(hasCodeLayers(layers)).toBe(true);
    expect(collectCodeSources(layers)).toEqual(['sketch.js']);
  });

  it('is the only thing that asks for p5.js to be loaded', () => {
    expect(hasP5Layers([{ id: 'a', type: 'rect', width: 1, height: 1 }, { id: 'c', type: 'code', code: 'function draw() {}', width: 1, height: 1 }])).toBe(false);
    expect(hasP5Layers([{ id: 'g', type: 'group', children: [p5()] }])).toBe(true);
  });
});
