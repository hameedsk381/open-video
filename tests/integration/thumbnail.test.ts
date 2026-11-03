import { describe, expect, it } from 'vitest';
import { makeThumbnail, defaultThumbnailFrame } from '../../packages/cli/src/thumbnail';

// A real render (Chromium): a thumbnail is a PNG of the chosen frame, scaled to the width asked for, with the title drawn over it.
const raw = { version: '1.0', id: 't', name: 'T', width: 640, height: 360, fps: 30, durationFrames: 90, background: { type: 'linear', from: [0, 0], to: [640, 360], stops: [{ offset: 0, color: '#123456' }, { offset: 1, color: '#654321' }] },
  scenes: [{ id: 'one', name: 'One', startFrame: 0, durationFrames: 90, layers: [{ id: 'dot', type: 'circle', x: 320, y: 120, width: 120, fill: '#ffcc00' }] }] };
const isPng = (buffer: Buffer) => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const size = (buffer: Buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) });

describe('thumbnail', () => {
  it('picks a frame well into the first scene', () => {
    expect(defaultThumbnailFrame([{ id: 'a', startFrame: 0, durationFrames: 100 }, { id: 'b', startFrame: 90, durationFrames: 50 }], 140)).toBe(60);
    expect(defaultThumbnailFrame([{ id: 'narration', startFrame: 0, durationFrames: 100 }, { id: 'a', startFrame: 10, durationFrames: 50 }], 100)).toBe(40);
  });

  it('renders a PNG at the wanted width, with and without a title', async () => {
    const plain = await makeThumbnail(raw, {}, process.cwd(), { frame: 30 });
    expect(isPng(plain.png)).toBe(true); expect(size(plain.png)).toEqual({ width: 640, height: 360 }); expect(plain.frame).toBe(30);
    const titled = await makeThumbnail(raw, {}, process.cwd(), { frame: 30, title: 'Big news today', width: 320 });
    expect(size(titled.png)).toEqual({ width: 320, height: 180 }); expect(titled).toMatchObject({ width: 320, height: 180 });
    const titledFull = await makeThumbnail(raw, {}, process.cwd(), { frame: 30, title: 'Big news today' });
    expect(titledFull.png.equals(plain.png)).toBe(false);
  });

  it('refuses a frame or width that does not exist', async () => {
    await expect(makeThumbnail(raw, {}, process.cwd(), { frame: 500 })).rejects.toThrow(/--frame must be an integer from 0 to 89/);
    await expect(makeThumbnail(raw, {}, process.cwd(), { width: 10 })).rejects.toThrow(/--width/);
  });
});
