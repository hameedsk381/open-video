import { describe, expect, it } from 'vitest';
import { loadComposition, renderStill } from '@ove/core';

// Physics layers (matter.js): bodies fall, bounce and pile up. The world is stepped from the layer's first frame, so a frame drawn on its own
// is the same as that frame reached by playing, and the same description always makes the same fall.
const video = (physics: Record<string, unknown>, extra: Record<string, unknown> = {}) => loadComposition({
  version: '1.0', id: 'p', name: 'P', width: 320, height: 180, fps: 30, durationFrames: 240, background: '#101820', ...extra,
  scenes: [{ id: 's1', name: 'S1', startFrame: 0, durationFrames: 240, layers: [{ id: 'world', type: 'physics', x: 0, y: 0, width: 320, height: 180, ...physics }] }],
});
const rain = { emit: [{ shape: 'circle', x: 160, y: -40, spread: 70, width: 22, widthJitter: 6, count: 10, every: 4, fill: ['#f4c542', '#37d3a3', '#ff5d6c'] }] };
const still = (composition: ReturnType<typeof video>, frame: number) => renderStill(composition, { frame });
const same = (a: Buffer, b: Buffer) => a.equals(b);

describe('physics layer', () => {
  it('moves: nothing has fallen yet at the start, and the bodies have come to rest lower down later', async () => {
    const world = video(rain), empty = video({});
    const [start, falling, settled] = await Promise.all([still(world, 0), still(world, 40), still(world, 200)]);
    expect(same(start, await still(empty, 0))).toBe(true);
    expect(same(start, falling)).toBe(false); expect(same(falling, settled)).toBe(false);
  });

  it('draws the same fall every time, whichever frame is asked for first', async () => {
    const world = video(rain);
    const [a, b] = await Promise.all([still(world, 90), still(world, 90)]);
    expect(same(a, b)).toBe(true);
    const [late, early, lateAgain] = [await still(world, 150), await still(world, 20), await still(world, 150)];
    expect(same(late, lateAgain)).toBe(true); expect(same(late, early)).toBe(false);
  });

  it('changes with the seed, the gravity and the walls', async () => {
    const base = await still(video(rain), 60);
    expect(same(base, await still(video({ ...rain, seed: 2 }), 60))).toBe(false);
    expect(same(base, await still(video({ ...rain, gravity: { x: 0, y: 0.3 } }), 60))).toBe(false);
    expect(same(base, await still(video({ ...rain, walls: 'none' }), 120))).toBe(false);
  });

  it('lets bodies fall out of the world when there are no walls', async () => {
    const away = await still(video({ ...rain, walls: 'none' }), 230);
    expect(same(away, await still(video({}), 230))).toBe(true);
  });

  it('draws set bodies, tilted rectangles and hand-drawn bodies', async () => {
    const shapes = { bodies: [{ shape: 'rect', x: 160, y: 150, width: 140, height: 14, angle: 12, static: true, fill: '#8ea3c9' }, { shape: 'circle', x: 150, y: 20, width: 30, restitution: 0.7, fill: '#37d3a3', stroke: '#ffffff' }, { shape: 'rect', x: 190, y: 0, width: 24, at: 10 }] };
    const [clean, hand, handAgain] = await Promise.all([still(video(shapes), 70), still(video({ ...shapes, sketch: {} }), 70), still(video({ ...shapes, sketch: {} }), 70)]);
    expect(same(clean, hand)).toBe(false); expect(same(hand, handAgain)).toBe(true);
    expect(same(await still(video(shapes), 5), await still(video({ bodies: shapes.bodies.slice(0, 2) }), 5))).toBe(true);
  });
});
