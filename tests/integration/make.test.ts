import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeVideo, makeReport } from '../../packages/cli/src/make';

// The one-call loop end to end on a real browser and FFmpeg: a script becomes a composition, a contact sheet of the whole video and, when asked, a
// quick draft that is smaller than the video itself.
let dir = '';
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-make-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));

const script = { topic: 'CACHES', series: 'HOW IT WORKS', handle: '@motionrender', look: 'newsprint', scenes: [
  { kind: 'title', lines: ['What is', 'A CACHE', 'really?'] },
  { kind: 'stat', value: '87%', label: 'of reads never reach the database' },
] };

describe('make, end to end', () => {
  it('builds, reviews and draws one contact sheet without rendering when no render is asked for', async () => {
    const file = join(dir, 'explainer.json');
    await writeFile(file, JSON.stringify(script));
    const result = await makeVideo({ file, voice: false });
    expect(result.ok).toBe(true);
    expect(result.summary).toMatchObject({ scenes: 2, width: 1080, height: 1920 });
    expect((await stat(result.review!.sheet)).size).toBeGreaterThan(10_000);
    expect(result.video).toBeUndefined();
    expect(makeReport(result)).toMatch(/Contact sheet of the whole video[\s\S]*render "draft"/);
  }, 180_000);

  it('renders a quick draft at half size when asked, and keeps the final for later', async () => {
    const file = join(dir, 'explainer.json');
    const result = await makeVideo({ file, voice: false, render: 'draft' });
    expect(result.ok).toBe(true);
    expect(result.video).toMatchObject({ draft: true });
    expect(result.video!.output.endsWith('draft.mp4')).toBe(true);
    expect((await stat(result.video!.output)).size).toBeGreaterThan(1_000);
    const composition = JSON.parse(await readFile(result.composition!, 'utf8'));
    expect(composition.width).toBe(1080); // the file is untouched: only the draft is smaller
    expect(makeReport(result)).toMatch(/Draft video:/);
  }, 240_000);
});
