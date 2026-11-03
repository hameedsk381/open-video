import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assetProblems, type AssetPolicy } from '@ove/ai';
import { loadComposition } from '@ove/schema';
import { code, circle, createVideo, fadeIn, group, interpolate, keyframes, resolveBuildable, riseIn, rect, sample, sfx, spring, text, tween, use } from '@ove/builder';
import { runBuild } from '../../packages/cli/src/build';

// A video written as code builds the same JSON as one written by hand, with unique ids, sampled animations and code layers marked as such.
const base = () => createVideo({ id: 'demo', width: 640, height: 360, fps: 30, background: '#101820' });

describe('createVideo', () => {
  it('builds a composition the schema accepts, with seconds, layers and generated ids', () => {
    const v = base().scene('one', { seconds: 2 }, scene => { scene.add(text('Hello', { x: 20, y: 20, fontSize: 48 }), rect({ x: 0, y: 0, width: 10, height: 10, fill: '#fff' }), sfx('pop')); })
      .scene('two', { duration: 45, transitionIn: { type: 'fade', durationFrames: 10 } }, [circle({ x: 100, y: 100, width: 40, fill: '#f00' })]);
    const json = v.toJSON() as any;
    expect(json.scenes.map((s: any) => [s.id, s.durationFrames])).toEqual([['one', 60], ['two', 45]]);
    expect(json.scenes[0].layers.map((l: any) => l.id)).toEqual(['text-1', 'rect-1', 'audio-1']);
    const composition = loadComposition(json);
    expect(composition.durationFrames).toBe(60 + 45 - 10);
    expect(v.frames(1.5)).toBe(45);
  });

  it('keeps ids unique across scenes and groups, and refuses a repeated one', () => {
    const v = base().scene('a', { seconds: 1 }, scene => { scene.add(group([text('x', {}), text('y', {})], { x: 0, y: 0 }), text('z', {})); }).scene('b', { seconds: 1 }, [text('w', {})]);
    const ids: string[] = [];
    const walk = (layers: any[]) => layers.forEach(l => { ids.push(l.id); if (l.children) walk(l.children); });
    (v.toJSON() as any).scenes.forEach((s: any) => walk(s.layers));
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => base().scene('a', { seconds: 1 }, [text('x', { id: 'same' }), text('y', { id: 'same' })])).toThrow(/used twice/);
    expect(() => base().scene('a', {}, [])).toThrow(/needs a duration/);
    expect(() => base().toJSON()).toThrow(/at least one scene/);
  });

  it('carries variables, components, assets and export settings, and does not change when the output is edited', () => {
    const v = base().variable('title', { type: 'string', default: 'Hi' }).component('badge', { params: { label: { type: 'string', default: 'New' } }, layers: [text('{{label}}', { x: 0, y: 0 })] })
      .asset('logo', { type: 'image', src: 'logo.png' }).export({ loudness: -16 }).scene('s', { seconds: 1 }, [use('badge', { label: '{{title}}' }, { x: 5, y: 5 })]);
    const first = v.toJSON() as any; first.scenes[0].layers[0].with.label = 'changed';
    expect((v.toJSON() as any).scenes[0].layers[0].with.label).toBe('{{title}}');
    const composition = loadComposition(v.toJSON());
    expect(composition.export).toMatchObject({ loudness: -16 }); expect(composition.assets[0]!.id).toBe('logo');
  });
});

describe('animation helpers', () => {
  it('make keyframes, tweens and fades', () => {
    expect(keyframes('y', [[0, 40, 'land'], [18, 0]])).toEqual({ property: 'y', keyframes: [{ frame: 0, value: 40, easing: 'land' }, { frame: 18, value: 0 }] });
    expect(tween('opacity', 0, 1, { frames: 10, delay: 4 }).keyframes).toEqual([{ frame: 0, value: 0 }, { frame: 4, value: 0 }, { frame: 14, value: 1 }]);
    expect(fadeIn(12).keyframes.at(-1)).toEqual({ frame: 12, value: 1 });
    expect(riseIn(560, 30)[0]!.keyframes.map(k => k.value)).toEqual([590, 560]);
  });

  it('sample any function of the frame, including a spring that settles', () => {
    const wave = sample('x', 0, 10, f => f * 2, { step: 5 });
    expect(wave.keyframes).toEqual([{ frame: 0, value: 0 }, { frame: 5, value: 10 }, { frame: 10, value: 20 }]);
    const settle = sample('width', 0, 60, f => spring({ frame: f, from: 0, to: 100 }), { step: 3 }).keyframes;
    expect(settle[0]!.value).toBe(0); expect(Number(settle.at(-1)!.value)).toBeGreaterThan(95); expect(Number(settle.at(-1)!.value)).toBeLessThan(105);
    expect(Math.max(...settle.map(k => Number(k.value)))).toBeGreaterThan(100); // an underdamped spring overshoots
  });

  it('interpolate through ranges, clamping unless told not to', () => {
    expect(interpolate(15, [0, 30], [0, 100])).toBe(50); expect(interpolate(45, [0, 30, 60], [0, 100, 0])).toBe(50);
    expect(interpolate(99, [0, 30], [0, 100])).toBe(100); expect(interpolate(60, [0, 30], [0, 100], { clamp: false })).toBe(200);
    expect(() => interpolate(1, [0], [0])).toThrow(/two lists/);
  });
});

describe('code layers from the builder', () => {
  it('embed a function as source, and the result still passes the schema', () => {
    const layer = code((ctx, { frame, width }) => { ctx.fillRect(frame, 0, width / 10, 5); }, { id: 'sketch', width: 640, height: 360 }) as any;
    expect(layer.type).toBe('code'); expect(layer.code).toMatch(/^const draw = \(?ctx/);
    expect(() => new Function(`${layer.code}; return draw;`)()).not.toThrow();
    const v = base().scene('s', { seconds: 1 }, [layer]);
    expect((loadComposition(v.toJSON()).scenes[0]!.layers[0] as any).type).toBe('code');
  });

  it('are refused in compositions the AI layer writes or accepts', () => {
    const composition = loadComposition(base().scene('s', { seconds: 1 }, [code('function draw(ctx) {}', { id: 'sketch', width: 640, height: 360 })]).toJSON());
    const policy: AssetPolicy = { assets: new Map() };
    expect(assetProblems(composition, policy).join('\n')).toMatch(/Layer "sketch" is a code layer; AI-written and pasted compositions cannot contain code/);
  });
});

describe('ove build', () => {
  let dir = '';
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-build-')); });
  afterAll(() => rm(dir, { recursive: true, force: true }));
  const builderUrl = pathToFileURL(join(process.cwd(), 'packages/builder/src/index.ts')).href;

  it('turns a file that exports a video into validated JSON next to it', async () => {
    const file = join(dir, 'video.mjs');
    await writeFile(file, `import { createVideo, text } from '${builderUrl}';\nexport default createVideo({ id: 'built', width: 320, height: 180 }).scene('s', { seconds: 1 }, [text('Built', { x: 10, y: 10 })]);\n`);
    await runBuild(['build', file]);
    const written = JSON.parse(await readFile(join(dir, 'composition.json'), 'utf8'));
    expect(written).toMatchObject({ id: 'built', width: 320, scenes: [{ id: 's', durationFrames: 30 }] });
    expect((await readFile(join(dir, 'composition.schema.json'), 'utf8')).length).toBeGreaterThan(1000);
  });

  it('accepts a function that returns a video, and reports what is wrong with a bad one', async () => {
    const good = join(dir, 'fn.mjs');
    await writeFile(good, `import { createVideo, text } from '${builderUrl}';\nexport default async () => createVideo({ id: 'fn', width: 320, height: 180 }).scene('s', { seconds: 1 }, [text('x', {})]);\n`);
    await runBuild(['build', good, '--output', join(dir, 'fn.json')]);
    expect(JSON.parse(await readFile(join(dir, 'fn.json'), 'utf8')).id).toBe('fn');
    const bad = join(dir, 'bad.mjs');
    await writeFile(bad, `export default { version: '1.0', id: 'bad', name: 'Bad', width: -1, height: 10, fps: 30, durationFrames: 10, scenes: [] };\n`);
    await expect(runBuild(['build', bad])).rejects.toThrow(/does not pass the schema/);
    await writeFile(join(dir, 'none.mjs'), 'export const other = 1;\n');
    await expect(runBuild(['build', join(dir, 'none.mjs')])).rejects.toThrow(/must export a video/);
    await expect(resolveBuildable(42 as any)).rejects.toThrow(/must export a video/);
  });
});
