import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/schema';

describe('canvas in expressions', () => {
  const comp = (width: number, height: number) => ({ version: '1.0', id: 'c', name: 'C', width, height, fps: 30, durationFrames: 30,
    components: { box: { params: {}, layers: [{ id: 'r', type: 'rect', x: '{{canvas.width * 0.1}}', y: 0, width: '{{min(canvas.width, canvas.height) / 2}}', height: 10, fill: '#fff' }] } },
    scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ use: 'box', id: 'b' }] }] });
  it('lets layers and components size themselves to the canvas', () => {
    const rect = (c: any) => c.scenes[0].layers[0].children[0];
    expect(rect(loadComposition(comp(1920, 1080)))).toMatchObject({ x: 192, width: 540 });
    expect(rect(loadComposition(comp(1080, 1920)))).toMatchObject({ x: 108, width: 540 });
  });
});
