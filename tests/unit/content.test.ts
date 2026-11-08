import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSchema, loadComposition, narrationText } from '@ove/schema';
import { narrateScenes, pcmToWav, readContent, writeContent, type AiProvider, type ChatMessage } from '@ove/ai';

// The script is written before design and every figure in it has to be traceable: these tests are about the checker
// refusing what it cannot verify, not about what a model happens to say.
const briefText = 'Our platform processed 4.2 million videos last year, up from 1.1 million the year before.';
const brief = { id: 'brief', title: 'The brief', text: briefText };
const grounded = {
  audience: 'video teams', promise: 'render more', cta: 'try it',
  sources: [{ id: 'brief', quote: 'Our platform processed 4.2 million videos last year' }],
  beats: [{
    id: 'hook', name: 'Hook', onScreen: '4.2M videos', narration: 'We processed 4.2 million videos last year.',
    claim: '4.2 million videos were processed', data: [{ label: 'videos', value: '4.2M', sourceIds: ['brief'] }], sourceIds: ['brief'],
  }],
};
const fake = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => {
  const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); return JSON.stringify(replies[Math.min(at++, replies.length - 1)]); } };
};
const options = { brief: briefText, durationSeconds: 10, research: false };

describe('readContent', () => {
  it('uses the URL it was given for a source, never the one the model claims, so "brief" as a url cannot sink the script', () => {
    for (const claimed of ['brief', '', 'n/a', 'www.example.com', 42]) {
      const { content, problems } = readContent({ ...grounded, sources: [{ ...grounded.sources[0]!, url: claimed }] }, [brief]);
      expect(problems, String(claimed)).toEqual([]);
      expect(content?.sources[0]?.url).toBeUndefined();
    }
    const web = { id: 'web1', title: 'Report', url: 'https://example.com/report', text: briefText };
    const { content } = readContent({ ...grounded, sources: [{ id: 'web1', quote: 'Our platform processed 4.2 million videos last year', url: 'https://elsewhere.test/x' }], beats: [{ ...grounded.beats[0]!, sourceIds: ['web1'], data: [{ label: 'videos', value: '4.2M', sourceIds: ['web1'] }] }] }, [brief, web]);
    expect(content?.sources[0]?.url).toBe('https://example.com/report');
  });

  it('keeps a script whose claim and figure are backed by a quote it could find', () => {
    const { content, problems } = readContent(grounded, [brief]);
    expect(problems).toEqual([]);
    expect(content?.sources[0]?.title).toBe('The brief');
    expect(content?.beats[0]?.data[0]?.sourceIds).toEqual(['brief']);
    expect(narrationText(content!)).toBe('We processed 4.2 million videos last year.');
  });

  it('rejects a quote the source does not contain', () => {
    const { content, problems } = readContent({ ...grounded, sources: [{ id: 'brief', quote: 'We made millions of videos for happy customers' }] }, [brief]);
    expect(content).toBeUndefined();
    expect(problems.join('\n')).toContain('is not in that source');
  });

  it('rejects a claim or figure that cites nothing', () => {
    const ungrounded = { ...grounded, sources: [], beats: [{ ...grounded.beats[0], sourceIds: [], data: [] }] };
    expect(readContent(ungrounded, [brief]).problems).toContain('beat "hook" makes a claim but cites no source');
    const figures = { ...grounded, beats: [{ ...grounded.beats[0], data: [{ label: 'views', value: 1_000_000 }] }] };
    expect(readContent(figures, [brief]).problems).toContain('"views" in beat "hook" cites no source');
  });

  it('rejects a citation of a source that was never supplied or quoted', () => {
    const invented = { ...grounded, sources: [], beats: [{ ...grounded.beats[0], data: [] }] };
    expect(readContent(invented, [brief]).problems.join('\n')).toContain('beat "hook" cites "brief", which is not a quoted source');
    const unknown = { ...grounded, beats: [{ ...grounded.beats[0], sourceIds: ['brief', 's9'], data: [] }] };
    expect(readContent(unknown, [brief]).problems.join('\n')).toContain('"s9", which is not a quoted source');
  });

  it('rejects a beat that describes the video instead of the subject', () => {
    const meta = { sources: [], beats: [{ id: 'proof', name: 'Proof', onScreen: 'Sleek sans + cyber sound', narration: 'It uses sleek sans typography and cyber sound.' }] };
    const { content, problems } = readContent(meta, [{ id: 'brief', title: 'The brief', text: 'A launch film for a pocket finance app, calm and premium' }]);
    expect(content).toBeUndefined();
    expect(problems.join('\n')).toContain('beat "proof" describes the video itself');
  });

  it('allows those words when the subject is itself about them', () => {
    const line = { sources: [], beats: [{ id: 'hook', name: 'Hook', onScreen: 'Motion smoothing for shaky footage', narration: 'Smooth the motion in every camera clip.' }] };
    const { content, problems } = readContent(line, [{ id: 'brief', title: 'The brief', text: 'A camera app for motion smoothing and steady footage' }]);
    expect(problems).toEqual([]);
    expect(content?.beats[0]?.onScreen).toBe('Motion smoothing for shaky footage');
  });

  it('requires an on-screen line and rejects duplicate source ids', () => {
    const missing = { ...grounded, beats: [{ ...grounded.beats[0], onScreen: '' }] };
    expect(readContent(missing, [brief]).problems).toContain('beat 1 has no "onScreen" line');
    const doubled = { ...grounded, sources: [...grounded.sources, ...grounded.sources] };
    expect(readContent(doubled, [brief]).problems).toContain('source "brief" is listed twice');
  });
});

describe('writeContent', () => {
  it('asks again with the exact fault when a quote cannot be found, then keeps the fixed script', async () => {
    const provider = fake({ ...grounded, sources: [{ id: 'brief', quote: 'an invented sentence that is not in the brief at all' }] }, grounded);
    const content = await writeContent(provider, options);
    expect(content?.beats[0]?.id).toBe('hook');
    expect(provider.seen).toHaveLength(2);
    expect(String(provider.seen[0]![0]!.content)).toContain('not instructions');
    expect(String(provider.seen[1]!.at(-1)!.content)).toContain('is not in that source');
  });

  it('gives up rather than keep a script it cannot ground', async () => {
    const progress: string[] = [];
    const provider = fake({ ...grounded, sources: [{ id: 'brief', quote: 'still not a sentence from the brief' }] });
    const content = await writeContent(provider, { ...options, maxAttempts: 2, onProgress: message => progress.push(message) });
    expect(content).toBeUndefined();
    expect(progress).toContain('No trustworthy content script; continuing without one');
  });

  it('grounds the script in a source the caller supplied', async () => {
    const report = { title: 'Annual report', text: 'In 2025 our platform rendered 4.2 million videos for 120,000 teams.', retrievedAt: '2026-01-02' };
    const reply = { ...grounded, sources: [{ id: 'src1', quote: 'our platform rendered 4.2 million videos' }], beats: [{ ...grounded.beats[0], sourceIds: ['src1'], data: [{ label: 'videos', value: '4.2M', sourceIds: ['src1'] }] }] };
    const content = await writeContent(fake(reply), { ...options, sources: [report] });
    expect(content?.sources[0]).toMatchObject({ id: 'src1', title: 'Annual report', retrievedAt: '2026-01-02' });
  });

  it('reads the pages it is pointed at and cites them by id', async () => {
    const page = 'In 2025 the platform rendered 4.2 million videos, according to our annual report.'.repeat(4);
    const reply = { ...grounded, sources: [{ id: 'web1', quote: 'the platform rendered 4.2 million videos' }], beats: [{ ...grounded.beats[0], sourceIds: ['web1'], data: [] }] };
    const provider = fake({ urls: [{ url: 'https://example.com/report', title: 'Report' }] }, reply);
    const progress: string[] = [];
    const reads: string[] = [];
    const content = await writeContent(provider, {
      ...options, research: true, onProgress: message => progress.push(message),
      fetchPage: async url => { reads.push(url); return page; },
    });
    expect(reads).toEqual(['https://example.com/report']);
    expect(progress).toContain('Reading https://example.com/report');
    expect(content?.sources[0]).toMatchObject({ id: 'web1', url: 'https://example.com/report', title: 'Report' });
  });

  it('skips watch pages and social posts, whose text cannot be quoted, instead of losing the whole script', async () => {
    const page = 'In 2025 the platform rendered 4.2 million videos, according to our annual report.'.repeat(4);
    const reply = { ...grounded, sources: [{ id: 'web1', quote: 'the platform rendered 4.2 million videos' }], beats: [{ ...grounded.beats[0], sourceIds: ['web1'], data: [] }] };
    const provider = fake({ urls: [{ url: 'https://www.youtube.com/watch?v=abc', title: 'A video' }, { url: 'https://example.com/report', title: 'Report' }] }, reply);
    const progress: string[] = [];
    const reads: string[] = [];
    const content = await writeContent(provider, {
      ...options, research: true, onProgress: message => progress.push(message),
      fetchPage: async url => { reads.push(url); return page; },
    });
    expect(reads).toEqual(['https://example.com/report']);
    expect(progress).toContain('Skipped https://www.youtube.com/watch?v=abc: a watch page is not text the model can quote');
    expect(content?.sources[0]).toMatchObject({ id: 'web1', url: 'https://example.com/report' });
  });
});

describe('narrateScenes', () => {
  const wav = pcmToWav(new Uint8Array(12000 * 2), 24000, 1, 16);
  const spoken = (chat: (messages: ChatMessage[]) => string) => {
    const seen: ChatMessage[][] = [];
    const provider: AiProvider = { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async messages => { seen.push(structuredClone(messages)); return chat(messages); }, speak: async () => ({ data: wav, extension: 'wav' }) };
    return { provider, seen };
  };
  const composition = (narration: boolean) => loadComposition({
    version: '1.0', id: 'welcome', name: 'Welcome', width: 1080, height: 1920, fps: 30, durationFrames: 120,
    content: { beats: [
      { id: 'hook', name: 'Hook', onScreen: 'Hello', ...(narration ? { narration: 'Say hello first.' } : {}) },
      { id: 'point', name: 'Point', onScreen: 'World', ...(narration ? { narration: 'Then say world.' } : {}) },
    ] },
    scenes: ['a', 'b'].map((id, i) => ({ id, name: id, beat: i ? 'point' : 'hook', startFrame: i * 60, durationFrames: 60,
      layers: [{ id: 't', type: 'text', content: i ? 'World' : 'Hello', x: 10, y: 10, fontSize: 40 }] })),
  });

  it('speaks the script the video already has instead of writing new lines', async () => {
    const { provider, seen } = spoken(() => { throw new Error('no line should be written'); });
    const outDir = await mkdtemp(join(tmpdir(), 'ove-content-'));
    try {
      const progress: string[] = [];
      const result = await narrateScenes(provider, composition(true), { brief: 'a welcome', outDir, onProgress: message => progress.push(message) });
      expect(seen).toEqual([]);
      expect(result.lines).toEqual(['Say hello first.', 'Then say world.']);
      expect(progress).toContain('Speaking the script…');
      expect(result.composition.content?.beats.map(beat => beat.id)).toEqual(['hook', 'point']);
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });

  it('writes lines only where the script has no narration', async () => {
    const { provider, seen } = spoken(() => JSON.stringify({ lines: ['One line.', 'Two lines.'] }));
    const outDir = await mkdtemp(join(tmpdir(), 'ove-content-'));
    try {
      const progress: string[] = [];
      const result = await narrateScenes(provider, composition(false), { brief: 'a welcome', outDir, onProgress: message => progress.push(message) });
      expect(seen).toHaveLength(1);
      expect(result.lines).toEqual(['One line.', 'Two lines.']);
      expect(progress).toContain('Writing one voiceover line per scene…');
    } finally { await rm(outDir, { recursive: true, force: true }); }
  });
});

describe('contentSchema', () => {
  it('refuses duplicate beat ids and references to a source that is not declared', () => {
    expect(contentSchema.safeParse({ beats: [{ id: 'a', name: 'Hook', onScreen: 'One' }, { id: 'a', name: 'Point', onScreen: 'Two' }] }).success).toBe(false);
    expect(contentSchema.safeParse({ beats: [{ id: 'a', name: 'Hook', onScreen: 'One', sourceIds: ['s1'] }] }).success).toBe(false);
  });

  it('accepts a minimal script and defaults its lists', () => {
    const parsed = contentSchema.safeParse({ beats: [{ id: 'a', name: 'Hook', onScreen: 'One' }] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.beats[0]!.data).toEqual([]);
    expect(parsed.success && parsed.data.sources).toEqual([]);
  });
});
