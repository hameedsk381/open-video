import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProvider, critiqueFrameNumbers, critiqueVideo, readCritique, runVideoAgent, type CritiqueFrame } from '@ove/ai';
import type { AiProvider, ChatMessage } from '../../packages/ai/src/providers';

// The art-director pass: the model looks at stills of the finished build and says what a person with taste would. These
// tests pin what its answer must contain to be trusted, which stills it is shown, and that a rewrite it asks for can only
// improve the video: a rewrite that fails to build leaves the version that worked.

const frameLabels = ['1. Hook, frame 40 (1.3 s)', '2. Proof, frame 110 (3.7 s)'];
const seen = [{ label: frameLabels[0], seen: 'A centred white title on a dark navy gradient' }, { label: frameLabels[1], seen: 'Three glass cards in a row under a heading' }];
const reply = (overrides: Record<string, unknown> = {}) => ({
  frames: seen, score: 5,
  problems: [{ frame: 'all', problem: 'It is the default dark gradient with a centred title', fix: 'Set the background to the warm paper colour and left-align the headline at 140px' }],
  ready: false, ...overrides,
});

describe('readCritique', () => {
  it('turns problems into findings that name the frame, the fault and the fix', () => {
    const { critique, problems } = readCritique(reply(), frameLabels);
    expect(problems).toEqual([]);
    expect(critique).toMatchObject({ score: 5, ready: false });
    expect(critique!.problems).toEqual(['all: It is the default dark gradient with a centred title Fix: Set the background to the warm paper colour and left-align the headline at 140px']);
  });

  it('refuses an answer that does not say what it saw, because a model that cannot see images invents critiques', () => {
    expect(readCritique(reply({ frames: [] }), frameLabels).problems[0]).toContain('what is literally on screen');
    expect(readCritique(reply({ frames: [{ label: frameLabels[0], seen: 'nice' }] }), frameLabels).problems[0]).toContain('what is literally on screen');
    expect(readCritique(reply({ frames: [seen[0]] }), [...frameLabels, '3. Close, frame 170 (5.7 s)']).problems[0]).toContain('1 of 3 frames');
    expect(readCritique(reply({ score: 'high' }), frameLabels).problems[0]).toContain('"score"');
  });

  it('is ready when there is nothing to fix, or when it says so with a high score', () => {
    expect(readCritique(reply({ problems: [], score: 4, ready: false }), frameLabels).critique!.ready).toBe(true);
    expect(readCritique(reply({ score: 9, ready: true }), frameLabels).critique!.ready).toBe(true);
    // A high score alone is not approval while problems are listed.
    expect(readCritique(reply({ score: 9, ready: false }), frameLabels).critique!.ready).toBe(false);
    // Saying ready with a low score is not approval either.
    expect(readCritique(reply({ score: 6, ready: true }), frameLabels).critique!.ready).toBe(false);
  });

  it('keeps the four most important problems and clamps the score', () => {
    const many = Array.from({ length: 7 }, (_, index) => ({ frame: 'all', problem: `Problem ${index}`, fix: 'Change it' }));
    const { critique } = readCritique(reply({ problems: many, score: 42 }), frameLabels);
    expect(critique!.problems).toHaveLength(4);
    expect(critique!.problems[0]).toContain('Problem 0');
    expect(critique!.score).toBe(10);
  });
});

describe('critiqueFrameNumbers', () => {
  const scene = (id: string, startFrame: number, durationFrames: number) => ({ id, name: id.toUpperCase(), startFrame, durationFrames });
  const base = { fps: 30, durationFrames: 300 };

  it('takes a settled moment in each scene and skips narration and caption scenes', () => {
    const picks = critiqueFrameNumbers({ ...base, scenes: [scene('hook', 0, 100), scene('proof', 100, 100), scene('cta', 200, 100), scene('narration', 0, 300), scene('captions', 0, 300)] } as any);
    expect(picks.map(pick => pick.frame)).toEqual([65, 165, 265]);
    expect(picks[0]!.label).toBe('1. HOOK, frame 65 (2.2 s)');
  });

  it('spreads moments evenly through a video that is one scene, as a React video is', () => {
    const picks = critiqueFrameNumbers({ ...base, scenes: [scene('main', 0, 300)] } as any);
    expect(picks.map(pick => pick.frame)).toEqual([45, 120, 195, 270]);
  });

  it('thins a long scene list to the limit, keeping the first and the last', () => {
    const scenes = Array.from({ length: 9 }, (_, index) => scene(`s${index}`, index * 30, 30));
    const picks = critiqueFrameNumbers({ ...base, scenes } as any, 5);
    expect(picks).toHaveLength(5);
    expect(picks[0]!.label).toContain('S0');
    expect(picks[4]!.label).toContain('S8');
  });
});

describe('critiqueVideo', () => {
  const frames: CritiqueFrame[] = frameLabels.map(label => ({ label, png: Buffer.from('png-bytes') }));
  const options = { brief: 'A launch reel', width: 1080, height: 1920, frames };
  const provider = (chat: AiProvider['chat']): AiProvider => ({ id: 'test', model: 'm', baseUrl: 'http://x', chat });

  it('sends the frames as images to a vision call, with the brief and the direction', async () => {
    const calls: { messages: ChatMessage[]; task?: string }[] = [];
    const critique = await critiqueVideo(provider(async (messages, chatOptions) => { calls.push({ messages, task: chatOptions?.task }); return JSON.stringify(reply()); }),
      { ...options, direction: { concept: 'A paper skyline', art: 'Layered paper', structure: [], avoid: [] } });
    expect(critique?.score).toBe(5);
    expect(calls[0]!.task).toBe('vision');
    const user = calls[0]!.messages[1]!.content as any[];
    expect(user.filter(part => part.type === 'image_url')).toHaveLength(2);
    expect(user[0].text).toContain('Concept: A paper skyline');
    expect(user.find(part => part.type === 'image_url').image_url.url).toBe(`data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`);
  });

  it('asks again once when the answer cannot be used, then accepts a good one', async () => {
    let calls = 0;
    const critique = await critiqueVideo(provider(async () => (++calls === 1 ? JSON.stringify({ score: 3, frames: [] }) : JSON.stringify(reply()))), options);
    expect(calls).toBe(2);
    expect(critique?.score).toBe(5);
  });

  it('gives no critique, and says so, when the provider cannot take images', async () => {
    const messages: string[] = [];
    const critique = await critiqueVideo(provider(async () => { throw new Error('model does not support image input'); }), { ...options, onProgress: message => messages.push(message) });
    expect(critique).toBeUndefined();
    expect(messages[0]).toContain('could not run');
  });

  it('gives no critique after two unusable answers', async () => {
    let calls = 0;
    const critique = await critiqueVideo(provider(async () => { calls++; return 'I think it looks fine.'; }), options);
    expect(calls).toBe(2);
    expect(critique).toBeUndefined();
  });
});

describe('runVideoAgent art-director pass', () => {
  const code = (version: string) => `// ${version}\nexport const config = { id: 'x', name: 'x', width: 1080, height: 1920, fps: 30, durationInFrames: 180, props: {} };\nexport default function Video() { return null; }\n`;
  const direction = JSON.stringify({ concept: 'A quiet piece', art: 'Flat field', structure: [{ name: 'Hook', seconds: 6, idea: 'One line' }], avoid: [] });
  const compositionJson = JSON.stringify({ version: '1.0', id: 'react-video', name: 'React video', width: 1080, height: 1920, fps: 30, durationFrames: 180,
    scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: 180, layers: [{ id: 'react', type: 'react', src: 'video.bundle.js', width: 1080, height: 1920, durationInFrames: 180 }] }] });
  const stills = async () => frames;
  const frames: CritiqueFrame[] = [{ label: '1. frame 40', png: Buffer.from('a') }];
  const isDirector = (messages: ChatMessage[]) => String(messages[0]?.content).includes('You are the art director');
  const isPolish = (messages: ChatMessage[]) => String(messages[messages.length - 1]?.content).includes('An art director looked at frames');
  const verdict = (ready: boolean) => JSON.stringify(reply({ frames: [{ label: '1. frame 40', seen: 'A white title centred on a dark gradient' }], ready, ...(ready ? { problems: [], score: 9 } : {}) }));
  let dir: string;

  const setup = async () => { dir = await mkdtemp(join(tmpdir(), 'ove-critique-')); return dir; };
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  const writeComposition = async (_source: string, output: string) => { await writeFile(output, compositionJson, 'utf8'); };

  it('rewrites a clean build the art director rejects, and keeps the improved version once it approves', async () => {
    await setup();
    const calls: ChatMessage[][] = [];
    let verdicts = 0;
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) {
      calls.push(messages);
      if (String(messages[0]?.content).includes('creative director')) return direction;
      if (isDirector(messages)) return verdict(++verdicts > 1);
      return isPolish(messages) ? code('v2') : code('v1');
    } };
    const progress: string[] = [];

    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6, critiqueFrames: stills, onProgress: message => progress.push(message) }, writeComposition);

    expect(result.polished).toBe(1);
    expect(result.critique?.ready).toBe(true);
    expect(result.attempts).toBe(2);
    expect(await readFile(result.videoPath, 'utf8')).toContain('// v2');
    const polishCall = calls.find(isPolish)!;
    // The writer gets the brief, its own code and the findings, not the whole repair history.
    expect(polishCall.map(message => message.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(String(polishCall[2]!.content)).toContain('// v1');
    expect(String(polishCall[3]!.content)).toContain('default dark gradient');
    expect(progress.some(message => message.includes('Art director approved'))).toBe(true);
  });

  it('keeps the version that built when the rewrite does not, and rebuilds it', async () => {
    await setup();
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) {
      if (String(messages[0]?.content).includes('creative director')) return direction;
      if (isDirector(messages)) return verdict(false);
      return isPolish(messages) ? code('v2') : code('v1');
    } };
    const built: string[] = [];
    const build = async (source: string, output: string) => {
      const text = await readFile(source, 'utf8');
      built.push(text.includes('v2') ? 'v2' : 'v1');
      if (text.includes('v2')) throw new Error('v2 does not compile');
      await writeComposition(source, output);
    };

    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6, critiqueFrames: stills }, build);

    expect(built).toEqual(['v1', 'v2', 'v1']);
    expect(result.polished).toBeUndefined();
    expect(await readFile(result.videoPath, 'utf8')).toContain('// v1');
    expect(result.composition).toBeDefined();
    expect(result.critique?.ready).toBe(false);
  });

  it('keeps the version that built when the rewrite fails the design review', async () => {
    await setup();
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) {
      if (String(messages[0]?.content).includes('creative director')) return direction;
      if (isDirector(messages)) return verdict(false);
      return isPolish(messages) ? code('v2') : code('v1');
    } };
    let checks = 0;
    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6, critiqueFrames: stills,
      visualCheck: async () => (++checks === 1 ? { passed: true, report: '' } : { passed: false, report: 'text overflows' }) }, writeComposition);

    expect(result.polished).toBeUndefined();
    expect(await readFile(result.videoPath, 'utf8')).toContain('// v1');
  });

  it('stops after the allowed number of rewrites and reports the notes that remain', async () => {
    await setup();
    let rewrites = 0;
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) {
      if (String(messages[0]?.content).includes('creative director')) return direction;
      if (isDirector(messages)) return verdict(false);
      if (isPolish(messages)) { rewrites++; return code(`polish-${rewrites}`); }
      return code('v1');
    } };
    const progress: string[] = [];

    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6, critiqueFrames: stills, polishRounds: 1, onProgress: message => progress.push(message) }, writeComposition);

    expect(rewrites).toBe(1);
    expect(result.polished).toBe(1);
    expect(result.critique?.ready).toBe(false);
    expect(progress.some(message => message.includes("Art director's notes remain"))).toBe(true);
  });

  it('leaves the build alone when the provider cannot look at images', async () => {
    await setup();
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) {
      if (String(messages[0]?.content).includes('creative director')) return direction;
      if (isDirector(messages)) throw new Error('image input is not supported');
      return code('v1');
    } };

    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6, critiqueFrames: stills }, writeComposition);

    expect(result.critique).toBeUndefined();
    expect(result.polished).toBeUndefined();
    expect(result.attempts).toBe(1);
  });

  it('does not run without stills to look at', async () => {
    await setup();
    const calls: ChatMessage[][] = [];
    const provider: AiProvider = { id: 't', model: 'm', baseUrl: 'http://x', async chat(messages) { calls.push(messages); return String(messages[0]?.content).includes('creative director') ? direction : code('v1'); } };

    const result = await runVideoAgent(provider, { brief: 'A launch reel', dir, format: 'reel', durationSeconds: 6 }, writeComposition);

    expect(calls.some(isDirector)).toBe(false);
    expect(result.critique).toBeUndefined();
  });
});

describe('per-task model overrides', () => {
  afterEach(() => vi.unstubAllEnvs());
  const modelUsed = async (options: Parameters<AiProvider['chat']>[1], messages: ChatMessage[] = [{ role: 'user', content: 'Write the complete video.tsx file now' }]) => {
    const provider: any = createProvider({ provider: 'openai', apiKey: 'k', model: 'base-model' });
    provider.complete = vi.fn(async (model: string) => model);
    return provider.chat(messages, options) as Promise<string>;
  };

  it('uses the provider model for every task when no override is set', async () => {
    vi.stubEnv('OVE_AI_MODEL_DIRECT', '');
    expect(await modelUsed({ task: 'direct' })).toBe('base-model');
  });

  it('sends the creative stages to their own model, and leaves other calls on the base model', async () => {
    vi.stubEnv('OVE_AI_MODEL_DIRECT', 'strong-model');
    expect(await modelUsed({ task: 'direct' })).toBe('strong-model');
    expect(await modelUsed({ task: 'compose' })).toBe('base-model');
  });

  it('sends calls that carry images to the vision model', async () => {
    vi.stubEnv('OVE_AI_MODEL_VISION', 'vision-model');
    const images: ChatMessage[] = [{ role: 'user', content: [{ type: 'text', text: 'Look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AA==' } }] }];
    expect(await modelUsed({}, images)).toBe('vision-model');
  });

  it('lets an explicit model win over the override', async () => {
    vi.stubEnv('OVE_AI_MODEL_DIRECT', 'strong-model');
    expect(await modelUsed({ task: 'direct', model: 'chosen-model' })).toBe('chosen-model');
  });
});
