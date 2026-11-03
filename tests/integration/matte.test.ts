import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, loadComposition, renderStill } from '@ove/core';
import { expandMattes } from '@ove/schema';

// A matte shows a layer only where it says so. Pictures made here: a blue picture, and a matte that is white in a box on black
// (luma) or opaque in the same box on transparent (alpha). The red background shows wherever the blue is hidden.
let dir = '';
const make = (name: string, input: string, filter: string) => { const r = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', input, '-vf', filter, '-frames:v', '1', join(dir, name)]); if (r.status !== 0) throw new Error(String(r.stderr)); };
const pixel = async (png: Buffer, x: number, y: number) => { await writeFile(join(dir, 'frame.png'), png);
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-i', join(dir, 'frame.png'), '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); const [red, green, blue] = r.stdout; const snap = (v: number) => Math.round(v / 255) * 255; return { red: snap(red!), green: snap(green!), blue: snap(blue!) }; };
const comp = (matte: Record<string, unknown>) => loadComposition({ version: '1.0', id: 'm', name: 'M', width: 320, height: 180, fps: 30, durationFrames: 10, background: '#ff0000',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 10, layers: [{ id: 'pic', type: 'image', src: 'blue.png', x: 0, y: 0, width: 320, height: 180, matte }] }] });
const inside = { x: 160, y: 90 }, outside = { x: 20, y: 20 };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ove-matte-'));
  make('blue.png', 'color=c=0x0000ff:s=320x180', 'format=rgb24');
  make('luma.png', 'color=c=black:s=320x180', 'drawbox=x=80:y=30:w=160:h=120:c=white:t=fill');
  const merged = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=white:s=320x180', '-i', join(dir, 'luma.png'), '-filter_complex', '[0]format=rgb24[c];[1]format=gray[a];[c][a]alphamerge', '-frames:v', '1', join(dir, 'alpha.png')]);
  if (merged.status !== 0) throw new Error(String(merged.stderr));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('matte', () => {
  it('becomes a masking group when the composition loads', () => {
    const [layer] = comp({ src: 'luma.png' }).scenes[0]!.layers as any[];
    expect(layer).toMatchObject({ id: 'pic-masked', type: 'group', masked: { mode: 'luma', invert: false } });
    expect(layer.children.map((child: any) => [child.id, child.type])).toEqual([['pic', 'image'], ['pic-matte', 'image']]);
    const video = expandMattes({ width: 100, height: 50, scenes: [{ layers: [{ id: 'clip', type: 'video', src: 'a.mp4', trimStart: 12, playbackRate: 2, matte: { src: 'm.mp4' } }] }] }) as any;
    expect(video.scenes[0].layers[0].children[1]).toMatchObject({ type: 'video', trimStart: 12, playbackRate: 2, muted: true, width: 100, height: 50 });
  });

  it('keeps the layer where a luma matte is white', async () => {
    const png = await renderStill(comp({ src: 'luma.png' }), { frame: 0, baseDir: dir });
    expect(await pixel(png, inside.x, inside.y)).toMatchObject({ red: 0, blue: 255 });
    expect(await pixel(png, outside.x, outside.y)).toMatchObject({ red: 255, blue: 0 });
  });

  it('can keep what the matte hides instead', async () => {
    const png = await renderStill(comp({ src: 'luma.png', invert: true }), { frame: 0, baseDir: dir });
    expect(await pixel(png, inside.x, inside.y)).toMatchObject({ red: 255, blue: 0 });
    expect(await pixel(png, outside.x, outside.y)).toMatchObject({ red: 0, blue: 255 });
  });

  it('reads the transparency of an alpha matte', async () => {
    const png = await renderStill(comp({ src: 'alpha.png', mode: 'alpha' }), { frame: 0, baseDir: dir });
    expect(await pixel(png, inside.x, inside.y)).toMatchObject({ red: 0, blue: 255 });
    expect(await pixel(png, outside.x, outside.y)).toMatchObject({ red: 255, blue: 0 });
  });
});
