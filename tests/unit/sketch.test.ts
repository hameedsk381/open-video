import { describe, expect, it } from 'vitest';
import { compositionSchema, loadComposition, sketchSchema } from '@ove/schema';
import { compileExplainer } from '@ove/core';
import { explainerSchema } from '@ove/schema';

// The sketch settings are checked like any other layer setting, and a whole-video sketch is handed to the shapes when the video loads.
const base = { version: '1.0', id: 'v', name: 'V', width: 320, height: 180, fps: 30, durationFrames: 30 };
const scene = (layers: unknown[]) => ({ id: 's', name: 'S', durationFrames: 30, layers });

describe('sketch settings', () => {
  it('have sensible defaults, and refuse nonsense', () => {
    expect(sketchSchema.parse({})).toEqual({ roughness: 1.2, bowing: 1, fillStyle: 'solid', hachureAngle: -41, boil: 0 });
    for (const bad of [{ roughness: 9 }, { fillStyle: 'crayon' }, { boil: -1 }, { boil: 1.5 }, { hachureGap: 0 }]) expect(sketchSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it('are allowed on rectangles and circles, and set to false to opt out', () => {
    const ok = compositionSchema.safeParse({ ...base, scenes: [scene([{ id: 'a', type: 'rect', width: 10, height: 10, sketch: {} }, { id: 'b', type: 'circle', width: 10, sketch: false }])] });
    expect(ok.success).toBe(true);
    const bad = compositionSchema.safeParse({ ...base, scenes: [scene([{ id: 'a', type: 'rect', width: 10, height: 10, sketch: { roughness: 12 } }])] });
    expect(bad.success).toBe(false);
  });

  it('reach every rectangle and circle when the whole video is sketched', () => {
    const loaded = loadComposition({ ...base, sketch: { boil: 4 }, scenes: [scene([
      { id: 'a', type: 'rect', width: 10, height: 10 }, { id: 'b', type: 'circle', width: 10, sketch: false }, { id: 'c', type: 'rect', width: 10, height: 10, sketch: { roughness: 3 } },
      { id: 'g', type: 'group', children: [{ id: 'd', type: 'circle', width: 10 }, { id: 't', type: 'text', content: 'hi' }] },
    ])] }) as any;
    const [a, b, c, g] = loaded.scenes[0].layers;
    expect(a.sketch).toMatchObject({ boil: 4, roughness: 1.2 }); expect(b.sketch).toBe(false); expect(c.sketch.roughness).toBe(3);
    expect(g.children[0].sketch).toMatchObject({ boil: 4 }); expect(g.children[1].sketch).toBeUndefined();
  });

  it('leave a video alone that does not use them', () => {
    const loaded = loadComposition({ ...base, scenes: [scene([{ id: 'a', type: 'rect', width: 10, height: 10 }])] }) as any;
    expect(loaded.scenes[0].layers[0].sketch).toBeUndefined();
  });

  it('can be switched on for a whole explainer', () => {
    const spec = explainerSchema.parse({ topic: 'T', sketch: true, scenes: [{ kind: 'closing', title: 'x' }] });
    const { composition } = compileExplainer(spec) as { composition: any };
    expect(composition.sketch).toMatchObject({ roughness: 1.3, boil: 6 });
    const loaded = loadComposition(composition) as any;
    expect(loaded.scenes.flatMap((s: any) => s.layers).some((layer: any) => layer.type === 'rect' && layer.sketch)).toBe(true);
    expect((compileExplainer(explainerSchema.parse({ topic: 'T', scenes: [{ kind: 'closing', title: 'x' }] })).composition as any).sketch).toBeUndefined();
  });
});
