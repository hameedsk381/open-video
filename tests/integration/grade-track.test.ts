import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, loadComposition, renderStill } from '@ove/core';
import { expandSceneGrades } from '@ove/schema';
import { labelKeyframes, trackMatte } from '../../packages/cli/src/track';

// Colour grading changes the colours it says it does, on a layer or a whole scene; tracking follows a moving matte.
let dir = '';
const pixel = async (png: Buffer, x = 50, y = 50) => { await writeFile(join(dir, 'f.png'), png);
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-i', join(dir, 'f.png'), '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); const [red, green, blue] = r.stdout; return { red: red!, green: green!, blue: blue! }; };
const comp = (grade: Record<string, unknown>, where: 'layer' | 'scene' = 'layer') => loadComposition({ version: '1.0', id: 'g', name: 'G', width: 100, height: 100, fps: 30, durationFrames: 5, background: '#000000',
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 5, ...(where === 'scene' ? { grade } : {}), layers: [{ id: 'sq', type: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#c86432', ...(where === 'layer' ? { grade } : {}) }] }] });
const still = (c: ReturnType<typeof comp>) => renderStill(c, { frame: 0, baseDir: dir });

beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-grade-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('colour grading', () => {
  it('leaves colours alone without a grade, and drains them with saturation -1', async () => {
    const plain = await pixel(await still(comp({})));
    expect(plain.red).toBeGreaterThan(plain.blue + 80);
    const grey = await pixel(await still(comp({ saturation: -1 })));
    expect(Math.abs(grey.red - grey.green)).toBeLessThan(6); expect(Math.abs(grey.green - grey.blue)).toBeLessThan(6);
  });
  it('brightens with exposure, warms with temperature and darkens with a negative exposure', async () => {
    const base = await pixel(await still(comp({}))), bright = await pixel(await still(comp({ exposure: 0.6 }))), dark = await pixel(await still(comp({ exposure: -0.8 })));
    expect(bright.red + bright.green + bright.blue).toBeGreaterThan(base.red + base.green + base.blue); expect(dark.red + dark.green + dark.blue).toBeLessThan(base.red + base.green + base.blue);
    const cool = await pixel(await still(comp({ temperature: -1 }))), warm = await pixel(await still(comp({ temperature: 1 })));
    expect(cool.blue - cool.red).toBeGreaterThan(warm.blue - warm.red);
  });
  it('applies a look, and a scene grade reaches its layers', async () => {
    const noir = await pixel(await still(comp({ look: 'noir' })));
    expect(Math.abs(noir.red - noir.blue)).toBeLessThan(8);
    const viaScene = await pixel(await still(comp({ saturation: -1 }, 'scene')));
    expect(Math.abs(viaScene.red - viaScene.blue)).toBeLessThan(6);
  });
  it('turns a scene grade into a graded group, leaving fixed layers outside it', () => {
    const expanded = expandSceneGrades({ scenes: [{ id: 's', grade: { look: 'warm' }, layers: [{ id: 'a' }, { id: 'cap', fixed: true }] }] }) as any;
    expect(expanded.scenes[0].grade).toBeUndefined();
    expect(expanded.scenes[0].layers.map((l: any) => l.id)).toEqual(['s-graded', 'cap']); expect(expanded.scenes[0].layers[0]).toMatchObject({ type: 'group', grade: { look: 'warm' }, children: [{ id: 'a' }] });
  });
});

describe('tracking a matte', () => {
  it('follows a box moving across the frame and places a label beside it', async () => {
    const file = join(dir, 'track.mp4');
    const made = spawnSync(ffmpegPath(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:r=30:d=2', '-vf', "format=gray,geq=lum='if(between(X,20+T*100,70+T*100)*between(Y,40,140),255,0)'", '-pix_fmt', 'yuv420p', file]);
    if (made.status !== 0) throw new Error(String(made.stderr));
    const points = await trackMatte(file, { fps: 30 });
    expect(points.length).toBeGreaterThanOrEqual(58);
    expect(points[0]!.cx).toBeLessThan(0.25); expect(points.at(-1)!.cx).toBeGreaterThan(points[0]!.cx + 0.3);
    expect(points[10]!.top).toBeCloseTo(40 / 180, 1); expect(points[10]!.bottom).toBeCloseTo(140 / 180, 1);
    const { xKeys, yKeys } = labelKeyframes(points, { width: 1080, height: 1920 }, { width: 324, height: 119 }, { step: 6 });
    expect(xKeys.length).toBe(yKeys.length); expect(xKeys[0]!.frame).toBe(0); expect(xKeys.at(-1)!.frame).toBe(points.length - 1);
    for (const key of xKeys) { expect(key.value).toBeGreaterThanOrEqual(0); expect(key.value).toBeLessThanOrEqual(1080 - 324); }
    expect(xKeys.at(-1)!.value).toBeGreaterThan(xKeys[0]!.value - 1);
  });
});
