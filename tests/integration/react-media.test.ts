import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBuild } from '../../packages/cli/src/build';

// Audio and Video components become audio and video layers when the video is built; imported CSS is bundled with the component.
let dir = '', raw: any;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ove-media-'));
  await runBuild(['build', join(process.cwd(), 'tests/integration/fixtures/media-fixture.tsx'), '--output', join(dir, 'composition.json')]);
  raw = JSON.parse(await readFile(join(dir, 'composition.json'), 'utf8'));
}, 120_000);
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('Audio and Video components', () => {
  it('turn runs of frames into layers: footage under the component, sound after it', () => {
    const layers = raw.scenes[0].layers as any[];
    expect(layers.map(layer => layer.type)).toEqual(['video', 'react', 'audio', 'audio']);
    expect(layers[0]).toMatchObject({ src: 'clip', startFrame: 0, endFrame: 60, volume: 0.5, x: 0, y: 0, width: 320, height: 180, objectFit: 'cover' });
    expect(layers[2]).toMatchObject({ src: 'sfx:whoosh', startFrame: 0, endFrame: 60, volume: 1, trimStart: 0 });
    expect(layers[3]).toMatchObject({ src: 'sfx:ding', startFrame: 20, endFrame: 35, volume: 2, trimStart: 3 });
  });
  it('bundles imported CSS into the component bundle', async () => {
    expect(await readFile(join(dir, 'media-fixture.bundle.js'), 'utf8')).toContain('#123456');
  });
});
