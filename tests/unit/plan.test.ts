import { describe, expect, it } from 'vitest';
import { buildRegistry, planBuild, readBuildPlan, type AiProvider, type BuildPlan, type ChatMessage, type PlanOptions } from '@ove/ai';

// The planner: its answer is checked against the capability registry, the model is sent the exact problems and asked to
// correct, and an untrustworthy answer becomes undefined so the caller falls back to the routing that always worked.
const registry = buildRegistry({
  templates: [{ id: 'intro-card', name: 'Intro card', description: 'A square title card', width: 1080, height: 1080, durationSeconds: 6, themed: true,
    variables: [{ name: 'title', type: 'string' }, { name: 'accent', type: 'color' }] },
    { id: 'wide-reel', name: 'Wide reel', description: 'A widescreen reel', width: 1920, height: 1080, durationSeconds: 8,
      variables: [{ name: 'title', type: 'string' }] }],
  themes: [{ id: 'midnight', name: 'Midnight', description: 'Dark blues' }],
});
const beat = (over: Record<string, unknown> = {}) => ({ name: 'Hook', onScreen: 'the headline springs in over a glow', seconds: 3, ...over });
const options: PlanOptions = { brief: 'a product intro', width: 1080, height: 1080, fps: 30, durationSeconds: 6, registry };
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return typeof reply === 'string' ? reply : JSON.stringify(reply); } }; };

describe('readBuildPlan', () => {
  it('accepts a template plan that names a listed fitting template and covers the video', () => {
    const { plan, problems } = readBuildPlan({ path: 'template', template: 'intro-card', theme: 'midnight', idea: 'Say hello', beats: [beat({ seconds: 2 }), beat({ name: 'Outro', onScreen: 'the tagline', seconds: 4 })], reasons: ['fastest path'] }, options);
    expect(problems).toEqual([]);
    expect(plan).toMatchObject({ path: 'template', template: 'intro-card', theme: 'midnight' } satisfies Partial<BuildPlan>);
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

  it('sends back precise problems instead of guessing: unknown template, wrong shape, unthemed theme, invented theme', () => {
    expect(readBuildPlan({ path: 'template', template: 'ghost', beats: [beat()] }, options).problems).toContain('"template" must be a listed template that fits the 1080x1080 canvas');
    expect(readBuildPlan({ path: 'template', template: 'wide-reel', beats: [beat()] }, options).problems).toContain('"template" must be a listed template that fits the 1080x1080 canvas');
    expect(readBuildPlan({ path: 'template', template: 'intro-card', theme: 'nope', beats: [beat()] }, options).problems).toContain('"theme" must be a listed theme, not "nope"');
    expect(readBuildPlan({ path: 'template', template: 'wide-reel', theme: 'midnight', beats: [beat()] }, { ...options, width: 1920, height: 1080 }).problems).toContain('"theme" only applies to a template that takes a theme');
    expect(readBuildPlan({ path: 'json', template: 'intro-card', beats: [beat()] }, options).problems).toContain('"template" only makes sense with path "template"');
  });

  it('demands concrete pictures and a real path', () => {
    expect(readBuildPlan({ path: 'json', beats: [beat({ onScreen: '' })] }, options).problems[0]).toMatch(/onScreen/);
    expect(readBuildPlan({ path: 'json', beats: [] }, options).problems[0]).toMatch(/"beats" must be a list/);
    expect(readBuildPlan({ path: 'slideshow', beats: [beat()] }, options).problems[0]).toMatch(/"path" must be one of/);
  });

  it('refuses react unless the caller allowed it, even when the path list says otherwise', () => {
    expect(readBuildPlan({ path: 'react', beats: [beat()] }, options).problems[0]).toBe('"path" must be one of: template, json');
    const agent = readBuildPlan({ path: 'react', beats: [beat({ seconds: 6 })] }, { ...options, allowReact: true, paths: ['template', 'json'] });
    expect(agent.problems[0]).toMatch(/"path" must be one of: template, json/);
    expect(readBuildPlan({ path: 'react', beats: [beat()] }, { ...options, allowReact: true }).plan).toMatchObject({ path: 'react' });
  });
});

describe('planBuild', () => {
  it('returns the first validated plan', async () => {
    const provider = scripted({ path: 'json', beats: [beat({ seconds: 6 })], reasons: ['bespoke needs'] });
    const plan = await planBuild(provider, options);
    expect(plan).toMatchObject({ path: 'json', reasons: ['bespoke needs'] });
    expect(String(provider.seen[0]![0]!.content)).toContain('Available capabilities:');
    expect(String(provider.seen[0]![0]!.content)).toContain('- intro-card:');
  });

  it('shows the planner how wrong its answer was, then accepts the corrected one', async () => {
    const provider = scripted({ path: 'template', template: 'ghost', beats: [beat({ seconds: 6 })] }, { path: 'template', template: 'intro-card', theme: 'midnight', beats: [beat({ seconds: 6 })] });
    const plan = await planBuild(provider, options)!;
    expect(plan!.path).toBe('template');
    const feedback = String(provider.seen[1]!.at(-1)!.content);
    expect(feedback).toMatch(/"template" must be a listed template that fits the 1080x1080 canvas/);
    expect(provider.seen[1]).toHaveLength(4);
  });

  it('returns undefined after the attempt budget instead of an unusable plan', async () => {
    const progress: string[] = [];
    const provider = scripted('not json at all', { path: 'ghost', beats: [beat()] });
    expect(await planBuild(provider, { ...options, maxAttempts: 2, onProgress: message => progress.push(message) })).toBeUndefined();
    expect(progress.at(-1)).toMatch(/No usable plan/);
  });
});
