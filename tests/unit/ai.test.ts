import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captionAudio, composeVideo, createProvider, extractJson, fieldsFromRows, generateImage, narrate, planBatch, refineVideo, type AiProvider } from '@ove/ai';
import { loadComposition } from '@ove/schema';

const base = (content = 'Hello', durationFrames = 30) => ({
  version: '1.0', id: 'test', name: 'Test', width: 1080, height: 1920, fps: 30, durationFrames,
  scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames,
    layers: [{ id: 'title', type: 'text', content, x: 540, y: 700, fontSize: 72, color: '#ffffff', textAlign: 'center', maxWidth: 900 }] }],
});

function provider(responses: string[], extra: Partial<AiProvider> = {}): AiProvider {
  const queue = [...responses];
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', chat: async () => queue.length > 1 ? queue.shift()! : queue[0]!, ...extra };
}

const brief = { width: 1080, height: 1920, fps: 30, durationSeconds: 1, brief: 'test' };

describe('JSON extraction', () => {
  it('reads a fenced object and ignores prose', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 });
  });
  it('reads an object without fences', () => {
    expect(extractJson('prefix {"a":{"b":2}} suffix')).toEqual({ a: { b: 2 } });
  });
  it('handles HTML entities, backslash linebreaks and trailing commas', () => {
    const raw = '{\\\n&#x20; "version": "1.0",\\\n&#x20; "title": "Coffee",\n}';
    expect(extractJson(raw)).toEqual({ version: '1.0', title: 'Coffee' });
  });
  it('keeps entities that are part of the content and repairs only ones that break the parse', () => {
    expect(extractJson('{"copy":"Ham &amp; Cheese"}')).toEqual({ copy: 'Ham &amp; Cheese' });   // valid as written: untouched
    expect(extractJson('{&quot;copy&quot;:&quot;Ham &amp; Cheese&quot;}')).toEqual({ copy: 'Ham & Cheese' });   // only parses once unescaped
  });
  it('handles unescaped control characters like literal newlines inside strings', () => {
    const rawWithLiteralNewline = '{\n  "version": "1.0",\n  "content": "FRESH\nROASTED"\n}';
    expect(extractJson(rawWithLiteralNewline)).toEqual({ version: '1.0', content: 'FRESH\nROASTED' });
  });
  it('fails clearly without JSON', () => {
    expect(() => extractJson('no object here')).toThrow(/did not contain a valid JSON object/);
  });
});

describe('composeVideo', () => {
  it('repairs a composition after a validation error', async () => {
    const invalid = JSON.stringify({ version: '1.0', id: 'x', name: 'X', width: 1080, height: 1920, fps: 30, durationFrames: 30 });
    const result = await composeVideo(provider([invalid, JSON.stringify(base())]), brief);
    expect(result.attempts).toBe(2);
    expect(result.composition.scenes).toHaveLength(1);
    expect(result.composition.durationFrames).toBe(30);
  });

  it('normalises the canvas to what was asked for', async () => {
    const result = await composeVideo(provider([JSON.stringify({ ...base(), width: 1, height: 1, fps: 1, durationFrames: 30 })]), brief);
    expect([result.composition.width, result.composition.height, result.composition.fps]).toEqual([1080, 1920, 30]);
  });

  it('rejects text that is too small and keeps trying', async () => {
    const tiny = JSON.stringify({ ...base(), scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: 30,
      layers: [{ id: 'title', type: 'text', content: 'Hi', x: 10, y: 10, fontSize: 8, color: '#fff' }] }] });
    await expect(composeVideo(provider([tiny]), { ...brief, maxAttempts: 2 })).rejects.toThrow(/too small/);
  });

  it('requires fields to be used', async () => {
    await expect(composeVideo(provider([JSON.stringify(base())]), { ...brief, maxAttempts: 1, fields: [{ name: 'title', type: 'string' }] }))
      .rejects.toThrow(/never used/);
  });

  it('plans beats then writes the composition from the plan', async () => {
    const seen: unknown[][] = [];
    const plan = { idea: 'Warm coffee', look: { accent: '#f4d58d' }, beats: [{ name: 'hook', takeaway: 'calm', onScreen: 'Morning brew', seconds: 1 }] };
    const fake = provider([JSON.stringify(plan), JSON.stringify(base())]);
    const chat = fake.chat.bind(fake);
    fake.chat = async (messages, options) => { seen.push(messages); return chat(messages, options); };
    const result = await composeVideo(fake, { ...brief, plan: true });
    expect(result.attempts).toBe(1);
    expect(result.composition.scenes).toHaveLength(1);
    expect(JSON.stringify(seen[1])).toContain('Morning brew');
  });

  it('accepts a composition when the planning pass already wrote one', async () => {
    const result = await composeVideo(provider([JSON.stringify(base())]), { ...brief, plan: true });
    expect(result.attempts).toBe(1);
    expect(result.composition.scenes).toHaveLength(1);
  });

  it('applies grain, motion blur and loudness on a planned composition', async () => {
    const result = await composeVideo(provider([JSON.stringify(base())]), { ...brief, plan: true });
    expect(result.composition.grain).toBe(0.03);
    expect(result.composition.motionBlur).toEqual({ samples: 8, shutter: 180 });
    expect(result.composition.export.loudness).toBe(-14);
  });

  it('rejects a slideshow when planning a longer motion-graphics video', async () => {
    await expect(composeVideo(provider([JSON.stringify(base('Hello', 300))]), {
      width: 1080, height: 1920, fps: 30, durationSeconds: 10, brief: 'test', plan: true, maxAttempts: 1,
    })).rejects.toThrow(/at least 3 scenes/);
  });
});

describe('the scene strategy', () => {
  // The route the default gateway takes: one contract call, one call per scene, and a stitch that owns all timing.
  const contract = JSON.stringify({ beats: [{ name: 'Hook' }, { name: 'Craft' }, { name: 'Offer' }] });
  const scene = (headline: string) => JSON.stringify({
    layers: [{ type: 'text', content: headline, x: 540, y: 860, fontSize: 120, color: '#f8fafc', textAlign: 'center', split: { by: 'words', stagger: 4, preset: 'rise' }, animations: [{ property: 'y', keyframes: [{ frame: 0, value: 940 }, { frame: 20, value: 860, easing: 'land' }] }] }],
  });

  it('publishes exactly the requested length rather than the length its own stitch produced', async () => {
    const fake = provider([contract, scene('SLOW COFFEE'), scene('THE POUR'), scene('20% OFF')]);
    const result = await composeVideo(fake, { width: 1080, height: 1920, fps: 30, durationSeconds: 10, brief: 'a coffee launch', strategy: 'scenes', maxAttempts: 1 });
    expect(result.attempts).toBe(1);
    expect(result.composition.durationFrames).toBe(300);
    const last = result.composition.scenes[result.composition.scenes.length - 1]!;
    expect(last.startFrame + last.durationFrames).toBe(300);   // the timeline is full, not 13.7 s of a 10 s brief
    expect(result.composition.scenes[1]!.transitionIn?.durationFrames).toBe(8);
  });
});

describe('refineVideo', () => {
  it('applies an instruction and returns the updated composition', async () => {
    const original = base('Initial Headline', 60);
    const refined = { ...original, name: 'Test (refined)' };
    refined.scenes[0]!.layers[0] = { ...refined.scenes[0]!.layers[0]!, content: 'Refined Headline' } as any;
    const result = await refineVideo(provider([JSON.stringify(refined)]), original, {
      instruction: 'Change headline to Refined Headline',
    });
    expect(result.composition.name).toBe('Test (refined)');
    expect(result.composition.scenes[0]!.layers[0]!.content).toBe('Refined Headline');
    expect(result.attempts).toBe(1);
  });

  it('retries when the first response is invalid JSON', async () => {
    const original = base('Initial Headline', 60);
    const refined = { ...original, name: 'Fixed' };
    const result = await refineVideo(provider(['not json', JSON.stringify(refined)]), original, {
      instruction: 'Make it better',
      maxAttempts: 2,
    });
    expect(result.attempts).toBe(2);
    expect(result.composition.name).toBe('Fixed');
  });
});

describe('capabilities', () => {
  it('says which capability a provider lacks before doing any work', async () => {
    const chatOnly = provider([]);
    await expect(narrate(chatOnly, { text: 'Hi', outDir: join(tmpdir(), 'ove-ai-unused') })).rejects.toThrow(/cannot make speech/);
    await expect(captionAudio(chatOnly, { audio: 'missing.wav' })).rejects.toThrow(/cannot transcribe/);
    await expect(generateImage(chatOnly, { prompt: 'a sky', out: 'unused.png' })).rejects.toThrow(/cannot generate images/);
  });
});

describe('narration', () => {
  it('writes audio, captions and a full-length narration scene', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-ai-'));
    try {
      const speech = provider([JSON.stringify(base())], {
        speak: async () => ({ data: Buffer.from('fake audio'), extension: 'wav' }),
        transcribe: async () => ({ text: 'Hello world', words: [{ text: 'Hello', start: 0, end: 0.4 }, { text: 'world', start: 0.45, end: 0.9 }], cues: [] }),
      });
      const composition = loadComposition(base());
      const result = await narrate(speech, { text: 'Hello world', outDir: join(dir, 'assets'), composition, compositionPath: join(dir, 'composition.json'), tailSeconds: 1 });
      expect(result.durationSeconds).toBeCloseTo(0.9);
      expect(result.words).toBe(2);
      expect(await readFile(result.audio, 'utf8')).toBe('fake audio');
      expect(JSON.parse(await readFile(result.captions!, 'utf8')).words).toHaveLength(2);
      const last = result.composition!.scenes.at(-1)!;
      expect(last.id).toBe('narration');
      expect(last.durationFrames).toBe(57); // 0.9 s = 27 frames, plus a 1 s tail
      expect(result.composition!.assets.map(asset => asset.id)).toEqual(expect.arrayContaining(['narration', 'narration-captions']));
      const captionsLayer = last.layers.find(layer => (layer as any).id === 'narration-captions-layer') as any;
      expect(captionsLayer.y).toBe(1478); // above the bottom UI band (18% of 1920) with room for a second line
      expect(captionsLayer.maxWidth).toBe(821); // clear of the right UI band (11% of 1080)
      expect(result.composition!.scenes.find(scene => scene.id === 'main')!.durationFrames).toBe(30);
      expect(() => loadComposition(result.composition)).not.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('captions existing audio and lines the captions up at --start', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-ai-'));
    try {
      const audioFile = join(dir, 'voice.wav');
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFile(audioFile, 'fake audio');
      const speech = provider([], {
        transcribe: async () => ({ text: 'Hello world', words: [{ text: 'Hello', start: 0, end: 0.4 }, { text: 'world', start: 0.45, end: 0.9 }], cues: [] }),
      });
      const composition = loadComposition(base());
      const result = await captionAudio(speech, { audio: audioFile, outDir: join(dir, 'assets'), composition, compositionPath: join(dir, 'composition.json'), startSeconds: 1.5, tailSeconds: 1 });
      expect(result.words).toBe(2);
      expect(result.cues).toBe(0);
      expect(result.durationSeconds).toBeCloseTo(0.9);
      expect(JSON.parse(await readFile(result.captions, 'utf8')).words).toHaveLength(2);
      const last = result.composition!.scenes.at(-1)!;
      expect(last.id).toBe('captions');
      expect(last.durationFrames).toBe(102); // 1.5 s start + 0.9 s speech = 72 frames, plus a 1 s tail
      // Captions only: the audio belongs to the video already, so no narration audio asset is added.
      expect(result.composition!.assets.map(asset => asset.id)).toContain('narration-captions');
      expect(result.composition!.assets.map(asset => asset.id)).not.toContain('narration');
      const layer = last.layers.find(entry => entry.type === 'captions') as any;
      expect(layer.startFrame).toBe(45); // 1.5 s × 30 fps
      expect(() => loadComposition(result.composition)).not.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('FreeLLMAPI routing through the Vercel AI SDK', () => {
  it('createProvider selects freellmapi when FREELLMAPI_BASE_URL is set', () => {
    const orig = process.env.FREELLMAPI_BASE_URL;
    try {
      process.env.FREELLMAPI_BASE_URL = 'http://localhost:3001/v1';
      const created = createProvider({ provider: 'freellmapi' });
      expect(created.id).toBe('freellmapi');
      expect(created.baseUrl).toBe('http://localhost:3001/v1');
    } finally {
      process.env.FREELLMAPI_BASE_URL = orig;
    }
  });

  it('infers task accurately from message contents', async () => {
    const { inferChatTask } = await import('@ove/ai');
    expect(inferChatTask([{ role: 'user', content: 'You fill in ready-made video templates for our catalog' }])).toBe('template');
    expect(inferChatTask([{ role: 'user', content: 'The video compiled but the design review found these issues' }])).toBe('heal');
    expect(inferChatTask([{ role: 'user', content: 'You are the production planner for MotionRender.' }])).toBe('fast');
    expect(inferChatTask([{ role: 'user', content: 'Extract a clean BrandPack JSON from this scraped website data' }])).toBe('brand');
    expect(inferChatTask([{ role: 'user', content: 'planBatch jobs for export' }])).toBe('batch');
    expect(inferChatTask([{ role: 'user', content: 'Write the complete video.tsx file now' }])).toBe('compose');
  });

  it('honors explicit model override over auto routing', async () => {
    const { VercelAiProvider } = await import('@ove/ai');
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', model: 'custom-model' });
    expect(await provider.resolveModel('compose')).toBe('custom-model');
  });
});

describe('images and batches', () => {
  it('writes a picture and registers it as an asset', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-ai-'));
    try {
      const imageProvider = provider([], { image: async () => ({ data: Buffer.from('png-bytes'), extension: 'png' }) });
      const composition = loadComposition(base());
      const result = await generateImage(imageProvider, { prompt: 'a blue sky', out: join(dir, 'assets', 'sky.png'), composition, compositionPath: join(dir, 'composition.json'), id: 'sky' });
      expect(await readFile(result.file, 'utf8')).toBe('png-bytes');
      expect(result.composition!.assets.find(asset => asset.id === 'sky')?.src).toBe('./assets/sky.png');
      expect(() => loadComposition(result.composition)).not.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('infers typed variables from rows', () => {
    expect(fieldsFromRows([{ title: 'A', price: 12, live: true, accent: '#22d3ee' }])).toEqual([
      { name: 'title', type: 'string', example: 'A' },
      { name: 'price', type: 'number', example: 12 },
      { name: 'live', type: 'boolean', example: true },
      { name: 'accent', type: 'color', example: '#22d3ee' },
    ]);
  });

  it('checks every row and rejects duplicate output paths', async () => {
    const composition = loadComposition({ ...base(), variables: { title: { type: 'string', default: 'A' } } });
    await expect(planBatch(composition, [{ title: 'Same' }, { title: 'Same' }], 'out/{{title}}.mp4', process.cwd())).rejects.toThrow(/both write/);
    const plan = await planBatch(composition, [{ title: 'One' }, { title: 'Two' }], 'out/{{title}}.mp4', process.cwd());
    expect(plan.jobs.map(job => job.output.replace(/\\/g, '/'))).toEqual([expect.stringMatching(/out\/One\.mp4$/), expect.stringMatching(/out\/Two\.mp4$/)]);
  });
});
