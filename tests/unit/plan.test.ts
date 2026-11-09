import { describe, expect, it } from 'vitest';
import { buildRegistry, planBuild, readBuildPlan, type AiProvider, type BuildPlan, type ChatMessage, type PlanOptions } from '@ove/ai';

// The planner: its answer is checked against the capability registry, the model is sent the exact problems and asked to
// correct, and an untrustworthy answer becomes undefined so the caller falls back to the routing that always worked.
const registry = buildRegistry({
  blocks: [{ id: 'title-bar', name: 'Title bar', description: 'A lower third', category: 'titles', kind: 'overlay', durationFrames: 90 }],
});
const beat = (over: Record<string, unknown> = {}) => ({ name: 'Hook', onScreen: 'the headline springs in over a glow', seconds: 3, ...over });
const options: PlanOptions = { brief: 'a product intro', width: 1080, height: 1080, fps: 30, durationSeconds: 6, registry };
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return typeof reply === 'string' ? reply : JSON.stringify(reply); } }; };

describe('readBuildPlan', () => {
  it('accepts a json plan that covers the video', () => {
    const { plan, problems } = readBuildPlan({ path: 'json', idea: 'Say hello', beats: [beat({ seconds: 2 }), beat({ name: 'Outro', onScreen: 'the tagline', seconds: 4 })], reasons: ['fastest path'] }, options);
    expect(problems).toEqual([]);
    expect(plan).toMatchObject({ path: 'json', idea: 'Say hello' } satisfies Partial<BuildPlan>);
    expect(plan!.beats.map(beatOf => beatOf.seconds)).toEqual([2, 4]);
  });

  it('rescales beats that do not add up to the wanted length', () => {
    const { plan } = readBuildPlan({ path: 'json', beats: [beat({ seconds: 3 }), beat({ name: 'Outro', onScreen: 'the tagline', seconds: 3 })] }, options)!;
    expect(plan!.beats.map(beatOf => beatOf.seconds)).toEqual([3, 3]);
    const long = readBuildPlan({ path: 'json', beats: [beat({ seconds: 2 }), beat({ name: 'Outro', onScreen: 'the tagline', seconds: 2 })] }, { ...options, durationSeconds: 6 }).plan!;
    expect(long.beats.map(beatOf => beatOf.seconds)).toEqual([3, 3]);
  });

  it('splits the length evenly when no seconds were given at all', () => {
    const raw = beat({ seconds: undefined }); delete (raw as any).seconds;
    const { plan } = readBuildPlan({ path: 'json', beats: [raw, { name: 'Outro', onScreen: 'the tagline' }] }, options)!;
    expect(plan!.beats.map(beatOf => beatOf.seconds)).toEqual([3, 3]);
  });

  it('refuses the removed template route', () => {
    expect(readBuildPlan({ path: 'template', template: 'intro-card', beats: [beat()] }, options).problems[0]).toBe('"path" must be one of: json');
  });

  it('demands concrete pictures and a real path', () => {
    expect(readBuildPlan({ path: 'json', beats: [beat({ onScreen: '' })] }, options).problems[0]).toMatch(/onScreen/);
    expect(readBuildPlan({ path: 'json', beats: [] }, options).problems[0]).toMatch(/"beats" must be a list/);
    expect(readBuildPlan({ path: 'slideshow', beats: [beat()] }, options).problems[0]).toMatch(/"path" must be one of/);
  });

  it('refuses react unless the caller allowed it, even when the path list says otherwise', () => {
    expect(readBuildPlan({ path: 'react', beats: [beat()] }, options).problems[0]).toBe('"path" must be one of: json');
    const agent = readBuildPlan({ path: 'react', beats: [beat({ seconds: 6 })] }, { ...options, allowReact: true, paths: ['json'] });
    expect(agent.problems[0]).toMatch(/"path" must be one of: json/);
    expect(readBuildPlan({ path: 'react', beats: [beat()] }, { ...options, allowReact: true }).plan).toMatchObject({ path: 'react' });
  });
});

describe('planBuild', () => {
  it('returns the first validated plan', async () => {
    const provider = scripted({ path: 'json', beats: [beat({ seconds: 6 })], reasons: ['bespoke needs'] });
    const plan = await planBuild(provider, options);
    expect(plan).toMatchObject({ path: 'json', reasons: ['bespoke needs'] });
    expect(String(provider.seen[0]![0]!.content)).toContain('Available capabilities:');
    expect(String(provider.seen[0]![0]!.content)).toContain('- title-bar:');
  });

  it('shows the planner how wrong its answer was, then accepts the corrected one', async () => {
    const provider = scripted({ path: 'slideshow', beats: [beat({ seconds: 6 })] }, { path: 'json', beats: [beat({ seconds: 6 })] });
    const plan = await planBuild(provider, options)!;
    expect(plan!.path).toBe('json');
    const feedback = String(provider.seen[1]!.at(-1)!.content);
    expect(feedback).toMatch(/"path" must be one of: json/);
    expect(provider.seen[1]).toHaveLength(4);
  });

  it('returns undefined after the attempt budget instead of an unusable plan', async () => {
    const progress: string[] = [];
    const provider = scripted('not json at all', { path: 'ghost', beats: [beat()] });
    expect(await planBuild(provider, { ...options, maxAttempts: 2, onProgress: message => progress.push(message) })).toBeUndefined();
    expect(progress.at(-1)).toMatch(/No usable plan/);
  });
});

describe('what the planner is told about design', () => {
  const systemOf = async (extra: Partial<PlanOptions>) => {
    const provider = scripted({ path: 'json', beats: [beat({ seconds: 6 })] });
    await planBuild(provider, { ...options, ...extra });
    return { text: String(provider.seen[0]![0]!.content), ask: provider.seen[0]![0]! };
  };

  it('offers every bundled font and the style families, with the gradient default named as one world among several', async () => {
    const { text } = await systemOf({});
    for (const family of ['Playfair Display', 'Bebas Neue', 'JetBrains Mono', 'Instrument Serif']) expect(text).toContain(family);
    for (const id of ['editorial-print', 'swiss-grid', 'brutalist-poster', 'cinematic-night', 'gradient-product']) expect(text).toContain(id);
    expect(text).toContain('fits software products only');
  });

  it('makes React the default for designed videos only when the host will run it', async () => {
    expect((await systemOf({ allowReact: true })).text).toContain('React is the default for a video that should look designed');
    expect((await systemOf({ allowReact: false })).text).not.toContain('React is the default');
    expect((await systemOf({})).text).not.toContain('React is the default');
  });

  it('asks for the planner as its own creative stage, not a fast routing call', async () => {
    const calls: { task?: string; temperature?: number }[] = [];
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async (_messages, chatOptions) => { calls.push({ task: chatOptions?.task, temperature: chatOptions?.temperature }); return JSON.stringify({ path: 'json', beats: [beat({ seconds: 6 })] }); } };
    await planBuild(provider, options);
    expect(calls[0]).toEqual({ task: 'direct', temperature: 0.7 });
  });
});
