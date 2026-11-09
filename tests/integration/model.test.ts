import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadComposition, renderStill } from '@ove/core';
import { decodePng, makeGlb } from './glb';

// A model layer draws a glTF binary with three.js, fitted to its box and turned by the frame. A frame depends only on its number, so it repeats
// exactly. A model file is data, so no --allow-code is needed.
let dir = '';
const comp = (layer: Record<string, unknown>, extra: Record<string, unknown> = {}) => loadComposition({ version: '1.0', id: 'm', name: 'M', width: 320, height: 180, fps: 30, durationFrames: 60, background: '#102030',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 'box', type: 'model', src: 'box.glb', width: 320, height: 180, ...layer }] }], ...extra });
const still = (layer: Record<string, unknown>, frame = 0) => renderStill(comp(layer), { frame, baseDir: dir });
const redPixels = (png: Buffer) => { const { data } = decodePng(png); let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i]! > 120 && data[i + 1]! < 80 && data[i + 2]! < 80) n++; return n; };
// How wide the model's red shows, from its left-most to its right-most red pixel.
const redWidth = (png: Buffer) => { const { data, width, height } = decodePng(png); let lo = width, hi = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (data[i]! > 120 && data[i + 1]! < 80 && data[i + 2]! < 80) { lo = Math.min(lo, x); hi = Math.max(hi, x); } } return hi - lo; };

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-model-')); await writeFile(join(dir, 'box.glb'), makeGlb()); await writeFile(join(dir, 'plain.glb'), makeGlb({ animated: false })); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('model layer', () => {
  it('draws the model in the box, without allowing code', async () => {
    expect(redPixels(await still({}))).toBeGreaterThan(1500);
  }, 120_000);

  it('turns with yaw and spin, and shows the same frame every time', async () => {
    const [front, side, again, spun0, spun] = await Promise.all([still({}), still({ yaw: 90 }), still({}), still({ spin: 90 }, 0), still({ spin: 90 }, 30)]);
    expect(front.equals(again)).toBe(true);
    expect(redWidth(side)).toBeLessThan(redWidth(front) * 0.8); // the long side faces the camera, then the short end
    expect(spun0.equals(spun)).toBe(false);
  }, 120_000);

  it('takes yaw from an animated variable', async () => {
    const turned = await renderStill(comp({ animations: [{ property: '--yaw', keyframes: [{ frame: 0, value: 0 }, { frame: 59, value: 90 }] }] }), { frame: 59, baseDir: dir });
    expect(redWidth(turned)).toBeLessThan(redWidth(await still({})) * 0.8);
  }, 120_000);

  it('plays one of the model\'s own animations by name or number, at a time set by the frame', async () => {
    const [start, half, byNumber, same] = await Promise.all([still({ animation: 'Turn' }, 0), still({ animation: 'Turn' }, 8), still({ animation: 0 }, 8), still({ animation: 'Turn' }, 8)]);
    expect(start.equals(half)).toBe(false);
    expect(half.equals(byNumber)).toBe(true);
    expect(half.equals(same)).toBe(true);
  }, 120_000);

  it('says which animations exist when the name is wrong, and when there are none', async () => {
    await expect(still({ animation: 'Fly' })).rejects.toThrow(/Layer "box" \(model\).*animation "Fly".*Turn/);
    await expect(still({ src: 'plain.glb', animation: 0 })).rejects.toThrow(/no animations/);
  }, 120_000);

  it('names the layer when the file is missing or not a model', async () => {
    await writeFile(join(dir, 'bad.glb'), Buffer.from('not a model'));
    await expect(still({ src: 'missing.glb' })).rejects.toThrow(/missing\.glb/);
    await expect(still({ src: 'bad.glb' })).rejects.toThrow(/Layer "box" \(model\)/);
  }, 120_000);
});
