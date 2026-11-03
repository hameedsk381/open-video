import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegPath, loadComposition, renderStill } from '@ove/core';
import { runBuild } from '../../packages/cli/src/build';

// A React video is mounted in a real page: canvas, WebGL, delayRender and stylesheet rules work, and frames still repeat exactly.
let dir = '', raw: any;
const pixel = async (png: Buffer, x: number, y: number) => {
  await writeFile(join(dir, 'f.png'), png);
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-i', join(dir, 'f.png'), '-vf', `crop=1:1:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const [red, green, blue] = r.stdout; return [red, green, blue];
};
const near = (got: number[], want: number[]) => got.every((value, i) => Math.abs(value - want[i]!) < 24);
const still = (frame: number) => renderStill(loadComposition(raw), { frame, baseDir: dir, allowCode: true });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ove-live-'));
  await runBuild(['build', join(process.cwd(), 'tests/integration/fixtures/live-fixture.tsx'), '--output', join(dir, 'composition.json')]);
  raw = JSON.parse(await readFile(join(dir, 'composition.json'), 'utf8'));
}, 120_000);
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('live React videos', () => {
  it('draws canvas, WebGL, late work and page stylesheet rules', async () => {
    const early = await still(5), later = await still(30);
    expect(near(await pixel(early, 50, 50), [255, 0, 0])).toBe(true);     // 2D canvas
    expect(near(await pixel(later, 50, 50), [0, 0, 255])).toBe(true);
    expect(near(await pixel(early, 160, 50), [0, 255, 0])).toBe(true);    // WebGL canvas
    expect(near(await pixel(later, 160, 50), [255, 255, 0])).toBe(true);
    expect(near(await pixel(early, 270, 50), [255, 0, 255])).toBe(true);  // finished after delayRender
    expect(near(await pixel(early, 50, 140), [0, 255, 255])).toBe(true);  // rule added with insertRule
  }, 60_000);

  it('repeats a frame exactly', async () => {
    const [a, b] = await Promise.all([still(12), still(12)]);
    expect(a.equals(b)).toBe(true);
  }, 60_000);
});
