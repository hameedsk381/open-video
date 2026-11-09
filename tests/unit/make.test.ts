import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { draftSettings, kindOfFile, makeReport, makeVideo } from '../../packages/cli/src/make';

// `mr make` is the one-call loop for agents. The pieces that need no browser: telling the two kinds of file apart, reporting every problem
// at once without touching anything else, and the shape of the report an agent reads.
let dir = '';
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-make-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('make', () => {
  it('tells a composition from an explainer script', () => {
    expect(kindOfFile({ version: '1.0', scenes: [] })).toBe('composition');
    expect(kindOfFile({ topic: 'CACHES', scenes: [{ kind: 'title' }] })).toBe('explainer');
  });

  it('lists every problem in a script at once and stops before building or rendering anything', async () => {
    const file = join(dir, 'bad.json');
    await writeFile(file, JSON.stringify({ topic: 'X', scenes: [{ kind: 'hex', columns: 9 }, { kind: 'phone', app: 'A', messages: [] }] }));
    const result = await makeVideo({ file, render: 'draft' });
    expect(result.ok).toBe(false);
    expect(result.problems.join('\n')).toMatch(/scenes\.0\.columns[\s\S]*scenes\.1\.messages/);
    expect(result.composition).toBeUndefined();
    expect(result.video).toBeUndefined();
    expect(makeReport(result)).toMatch(/Could not build the explainer:[\s\S]*scenes\.0\.columns[\s\S]*run make again/i);
  });

  it('refuses a composition that is not valid, with the reason', async () => {
    const file = join(dir, 'broken.json');
    await writeFile(file, JSON.stringify({ version: '1.0', id: 'x', name: 'X', width: -1, height: 100, fps: 30, durationFrames: 30, scenes: [] }));
    const result = await makeVideo({ file });
    expect(result.ok).toBe(false);
    expect(result.kind).toBe('composition');
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('asks before running code layers', async () => {
    const file = join(dir, 'code.json');
    await writeFile(file, JSON.stringify({ version: '1.0', id: 'c', name: 'C', width: 100, height: 100, fps: 30, durationFrames: 30,
      scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'r', type: 'react', src: 'video.bundle.js', width: 100, height: 100, durationInFrames: 30 }] }] }));
    const result = await makeVideo({ file });
    expect(result.ok).toBe(false);
    expect(result.problems[0]).toMatch(/allowCode/);
  });

  it('makes the draft much cheaper than the final render', () => {
    expect(draftSettings).toMatchObject({ scale: 0.5, preset: 'ultrafast', motionBlur: false });
    expect(draftSettings.crf).toBeGreaterThan(28);
  });

  it('writes a short report: what was built, what is wrong, where the files are, what to do next', () => {
    const text = makeReport({
      ok: false, kind: 'explainer', problems: [], composition: '/p/composition.json', summary: { scenes: 5, seconds: 31.2, width: 1080, height: 1920, fps: 30, spoken: 5 },
      review: { sheet: '/p/review.png', sheetFrames: [0, 30], errors: [{ severity: 'error', code: 'off-frame', message: 'text runs off the frame', frame: 120, layer: 'title' } as any], warnings: [], notes: [] },
      notes: [], timings: { build: 1.2, review: 14 }, next: ['Fix the review errors (see "errors"), then run make again.'],
    });
    expect(text).toContain('Built, with errors: /p/composition.json (5 scenes, 31.2 s, 1080x1920, 5 spoken lines)');
    expect(text).toContain('1 error, 0 warnings, 0 notes. Contact sheet of the whole video: /p/review.png');
    expect(text).toContain('ERROR frame 120: text runs off the frame [title]');
    expect(text).toContain('Time: build 1.2 s, review 14 s');
  });
});
