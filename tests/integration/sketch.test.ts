import { describe, expect, it } from 'vitest';
import { loadComposition, renderStill } from '@ove/core';

// Hand-drawn shapes (rough.js): a sketch layer is drawn with loose lines that differ from the clean shape, but the same lines on every
// render. With `boil` the lines are redrawn every few frames. A shape that says sketch: false stays clean in a sketched video.
const video = (layers: Record<string, unknown>[], extra: Record<string, unknown> = {}) => loadComposition({
  version: '1.0', id: 's', name: 'S', width: 320, height: 180, fps: 30, durationFrames: 60, background: '#101820', ...extra,
  scenes: [{ id: 's1', name: 'S1', startFrame: 0, durationFrames: 60, layers }],
});
const box = (extra: Record<string, unknown> = {}) => ({ id: 'box', type: 'rect', x: 60, y: 40, width: 200, height: 100, radius: 12, fill: '#ffcc00', stroke: '#ffffff', strokeWidth: 3, ...extra });
const png = (composition: ReturnType<typeof video>, frame = 0) => renderStill(composition, { frame });
const same = (a: Buffer, b: Buffer) => a.equals(b);

describe('sketch layers', () => {
  it('draw loose lines that differ from the clean shape, and the same lines every time', async () => {
    const [clean, hand, again] = await Promise.all([png(video([box()])), png(video([box({ sketch: {} })])), png(video([box({ sketch: {} })]))]);
    expect(same(clean, hand)).toBe(false);
    expect(same(hand, again)).toBe(true);
  });

  it('draw a circle and a rounded box by hand, solid or hatched', async () => {
    const stills = await Promise.all([
      png(video([{ id: 'dot', type: 'circle', x: 160, y: 90, width: 100, fill: '#37d3a3', sketch: {} }])),
      png(video([box({ sketch: { fillStyle: 'hachure', hachureGap: 8, fillWeight: 3 } })])),
      png(video([box({ sketch: { fillStyle: 'cross-hatch' } })])),
    ]);
    expect(new Set(stills.map(still => still.toString('base64'))).size).toBe(3);
  });

  it('give each layer its own lines, so two shapes do not wobble alike', async () => {
    const a = await png(video([box({ id: 'one', sketch: {} })])), b = await png(video([box({ id: 'two', sketch: {} })])), seeded = await png(video([box({ id: 'two', sketch: { seed: 5 } })]));
    expect(same(a, b)).toBe(false);
    expect(same(await png(video([box({ id: 'one', sketch: { seed: 5 } })])), seeded)).toBe(true);
  });

  it('boil: redraw the lines every few frames, and hold them in between', async () => {
    const boiling = video([box({ sketch: { boil: 6 } })]);
    const [f0, f3, f6] = await Promise.all([png(boiling, 0), png(boiling, 3), png(boiling, 6)]);
    expect(same(f0, f3)).toBe(true);
    expect(same(f0, f6)).toBe(false);
  });

  it('a sketch on the whole video reaches every rectangle and circle, including inside groups, unless a layer says false', async () => {
    const wholly = video([{ id: 'g', type: 'group', x: 0, y: 0, children: [box({ id: 'inner' })] }, box({ id: 'plain', sketch: false, y: 150, height: 20 })], { sketch: { roughness: 2 } }) as any;
    expect(wholly.scenes[0].layers[0].children[0].sketch).toMatchObject({ roughness: 2 });
    expect(wholly.scenes[0].layers[1].sketch).toBe(false);
    const clean = video([{ id: 'g', type: 'group', x: 0, y: 0, children: [box({ id: 'inner' })] }, box({ id: 'plain', y: 150, height: 20 })]);
    expect(same(await png(wholly), await png(clean))).toBe(false);
  });
});

describe('sketch on paths and labels on physics bodies', () => {
  const path = (extra: Record<string, unknown> = {}) => ({ id: 'tri', type: 'path', x: 60, y: 30, d: 'M0 120 L100 0 L200 120 Z', fill: '#ffcc00', stroke: '#ffffff', strokeWidth: 3, ...extra });
  it('draws a path by hand, the same every time', async () => {
    const [clean, hand, again] = await Promise.all([png(video([path()])), png(video([path({ sketch: {} })])), png(video([path({ sketch: {} })]))]);
    expect(same(clean, hand)).toBe(false);
    expect(same(hand, again)).toBe(true);
  });

  it('reaches paths when the whole video is sketched, unless one opts out', async () => {
    const [whole, hand, clean] = await Promise.all([png(video([path()], { sketch: {} })), png(video([path({ sketch: {} })])), png(video([path({ sketch: false })], { sketch: {} }))]);
    expect(same(whole, hand)).toBe(true);
    expect(same(clean, whole)).toBe(false);
  });

  it('writes a label on a body', async () => {
    const world = (label?: string) => video([{ id: 'w', type: 'physics', x: 0, y: 0, width: 320, height: 180, bodies: [{ shape: 'rect', x: 160, y: 140, width: 120, height: 60, static: true, fill: '#cc3333', ...(label ? { label } : {}) }] }]);
    const [plain, labelled] = await Promise.all([png(world(), 10), png(world('LOAD'), 10)]);
    expect(same(plain, labelled)).toBe(false);
  });
});
