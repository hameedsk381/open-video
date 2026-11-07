import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readScript, runScript, scriptMarkdown } from '../../packages/cli/src/script';

// A script has to survive leaving the video and coming back: the exported block is the import format, and an imported
// claim without its quote is refused exactly like a generated one.
const content = {
  audience: 'video teams', promise: 'render more', cta: 'try it',
  sources: [{ id: 'brief', title: 'The brief', url: 'https://example.com/report', quote: 'Our platform processed 4.2 million videos last year' }],
  beats: [{
    id: 'hook', name: 'Hook', seconds: 3, narration: 'We processed 4.2 million videos last year.', onScreen: '4.2M videos',
    claim: '4.2 million videos were processed', data: [{ label: 'videos', value: '4.2M', period: '2025', sourceIds: ['brief'] }], sourceIds: ['brief'],
  }],
};
const video = (script: unknown) => ({
  version: '1.0', id: 'spot', name: 'Spot', width: 1080, height: 1920, fps: 30, durationFrames: 90,
  content: script,
  scenes: [{ id: 'hook', name: 'Hook', beat: 'hook', startFrame: 0, durationFrames: 90, layers: [{ id: 't', type: 'text', content: '4.2M videos', x: 40, y: 40, fontSize: 64 }] }],
});

describe('script export', () => {
  it('writes the spoken lines, the on-screen copy and where every figure came from', () => {
    const markdown = scriptMarkdown('Spot', content as any);
    expect(markdown).toContain('# Spot: render more');
    expect(markdown).toContain('Says: We processed 4.2 million videos last year.');
    expect(markdown).toContain('Shows: 4.2M videos');
    expect(markdown).toContain('Data: 4.2M videos, 2025 [brief]');
    expect(markdown).toContain('"Our platform processed 4.2 million videos last year"');
    expect(markdown).toContain('https://example.com/report');
  });
});

describe('script import', () => {
  it('accepts a grounded script and refuses a claim without a source or a cited source without its quote', () => {
    expect(readScript(content).beats).toHaveLength(1);
    expect(() => readScript({ ...content, beats: [{ ...content.beats[0], sourceIds: [], data: [] }] })).toThrow('makes a claim but cites no source');
    expect(() => readScript({ ...content, sources: [{ id: 'brief', title: 'The brief' }] })).toThrow('is cited but has no quote');
  });
});

describe('mr script', () => {
  let dir = '';
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-script-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('exports the block as JSON that can be imported again', async () => {
    const file = join(dir, 'composition.json');
    await writeFile(file, JSON.stringify(video(content)));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const output = join(dir, 'script.json');
    await runScript(['script', file, '--output', output]);
    expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(content);
  });

  it('replaces the script in the video and keeps the rest of the composition', async () => {
    const file = join(dir, 'composition.json');
    await writeFile(file, JSON.stringify(video(content)));
    const revised = { ...content, beats: [{ ...content.beats[0], onScreen: '4.2M videos rendered', narration: 'We rendered 4.2 million videos last year.' }] };
    const script = join(dir, 'revised.json');
    await writeFile(script, JSON.stringify(revised));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await runScript(['script', file, '--set', script]);
    const saved = JSON.parse(await readFile(file, 'utf8'));
    expect(saved.content.beats[0].onScreen).toBe('4.2M videos rendered');
    expect(saved.id).toBe('spot');
    expect(saved.scenes[0].beat).toBe('hook');
  });

  it('says so when a video has no script', async () => {
    const file = join(dir, 'composition.json');
    await writeFile(file, JSON.stringify({ ...video(undefined), content: undefined }));
    await expect(runScript(['script', file])).rejects.toThrow('has no content script');
  });
});
