import { describe, expect, it, vi } from 'vitest';
import { composeSmart } from '../../packages/cli/src/compose-source';
import { buildRegistry, composeSmart as composeWithSource, createProvider, type AiProvider, type ChatMessage, type Registry } from '@ove/ai';
import { loadComposition } from '@ove/schema';

// The smart composer routes a brief: the planner's answer picks the JSON or React path (with the beats as the motion plan), and a
// refused or failed plan falls back to writing a composition straight away.
const registry: Registry = buildRegistry({});
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return typeof reply === 'string' ? reply : JSON.stringify(reply); } }; };
const composition = { version: '1.0', scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', content: 'Hello', x: 40, y: 40, fontSize: 64 }] }] };
const base = { brief: 'a quick product intro', width: 1080, height: 1080, fps: 30, durationSeconds: 2 };
const plan = { path: 'json', idea: 'Say hello', beats: [{ name: 'Hook', onScreen: 'the headline springs in', seconds: 2 }] };

describe('composeSmart routing', () => {
  it('follows the planner to json and hands its beats to the composer as the motion plan', async () => {
    const progress: string[] = [];
    const provider = scripted(plan, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false, onProgress: message => progress.push(message) }, { registry });
    expect(result.route).toBe('json');
    expect(provider.seen).toHaveLength(2);
    expect(String(provider.seen[0]![0]!.content)).toContain('creative director');
    const composeText = provider.seen[1]!.map(message => message.content).join('\n');
    expect(composeText).toContain('Hook');
    expect(composeText).toContain('the headline springs in');
  });

  it('never offers the planner a template route', async () => {
    const provider = scripted(plan, composition);
    await composeSmart(provider, { ...base, maxAttempts: 3, content: false }, { registry });
    const planner = String(provider.seen[0]![0]!.content);
    expect(planner).toContain('Reply with "path" set to one of: json.');
    expect(planner.toLowerCase()).not.toContain('template');
  });

  it('skips the planner with --no-plan and writes a composition straight away', async () => {
    const provider = scripted(composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false }, { noPlan: true, registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(provider.seen).toHaveLength(1);
    expect(String(provider.seen[0]![0]!.content)).not.toContain('production planner');
  });

  it('falls back to writing a composition when the planner cannot be trusted', async () => {
    const progress: string[] = [];
    const provider = scripted('garbage', composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false, onProgress: message => progress.push(message) }, { registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(progress.some(message => message.startsWith('No usable plan'))).toBe(true);
  });

  it('writes the script before design and carries it into the video', async () => {
    const script = { audience: 'builders', promise: 'ship faster', cta: 'try it', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 1, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
      { id: 'point', name: 'Point', seconds: 1, narration: 'It makes every intro feel instant.', onScreen: 'Faster every time', data: [], sourceIds: [] },
    ] };
    const progress: string[] = [];
    const provider = scripted(script, plan, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, research: false, onProgress: message => progress.push(message) }, { registry });
    // The script is the first call; the planner and the composer both receive it so neither invents copy.
    expect(String(provider.seen[0]![0]!.content)).toContain('script editor');
    expect(String(provider.seen[1]![0]!.content)).toContain('content script is already written');
    expect(provider.seen[2]!.map(message => String(message.content)).join('\n')).toContain('Faster every time');
    expect(result.composition.content?.beats.map(beat => beat.id)).toEqual(['hook', 'point']);
    expect(progress).toContain('Script ready: 2 beats, 0 sources.');
  });

  it('takes a supplied script instead of writing another', async () => {
    const script = { audience: 'builders', promise: 'ship faster', cta: 'try it', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 2, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
    ] };
    const provider = scripted(composition);
    const result = await composeSmart(provider, { ...base, content: script, maxAttempts: 2 }, { noPlan: true, registry });
    expect(provider.seen).toHaveLength(1);
    expect(result.composition.content?.beats[0]?.id).toBe('hook');
  });

  it('runs the whole route with the offline mock provider and no planner', async () => {
    const provider = createProvider({ provider: 'mock' });
    const result = await composeSmart(provider, { ...base, maxAttempts: 2 }, { noPlan: true });
    expect(result.composition.version).toBe('1.0');
    expect(result.composition.content?.beats.length).toBeGreaterThan(0);
    expect(result.route).toBe('json');
    expect(() => loadComposition(structuredClone(result.composition))).not.toThrow();
  });
});

// A brief no block layout carries can be written as React code, but only by a host that will run that code itself. The router asks the
// planner for React only when the source offers a builder, and a failed build falls back to a written composition instead of losing the job.
describe('composeSmart with React authoring', () => {
  const reactPlan = { path: 'react', idea: 'Liquid chrome type', look: { motion: 'blur' }, beats: [{ name: 'Hook', onScreen: 'chrome letters form', seconds: 2 }] };
  const builtByReact = loadComposition({ version: '1.0', id: 'react-video', name: 'React video', width: 1080, height: 1080, fps: 30, durationFrames: 60,
    scenes: [{ id: 'main', name: 'Main', durationFrames: 60, layers: [{ id: 'react', type: 'react', src: 'video.bundle.js', width: 1080, height: 1080, durationInFrames: 60 }] }] });

  it('writes a planned React video through the host builder and names the route', async () => {
    const progress: string[] = [];
    const provider = scripted(reactPlan);
    let received: { idea?: string } = {};
    const result = await composeWithSource(provider,
      { ...base, maxAttempts: 2, content: false, baseDir: '/tmp/project', onProgress: message => progress.push(message) },
      { react: async plan => { received = plan; return { composition: builtByReact, attempts: 2, issues: [], warnings: ['the component was repaired once'] }; } },
      { registry });
    expect(result.route).toBe('react');
    expect(received.idea).toBe('Liquid chrome type');
    // One planner call and two code attempts: the count covers the whole route.
    expect(result.attempts).toBe(3);
    expect(result.warnings).toEqual(['the component was repaired once']);
    expect(String(provider.seen[0]![0]!.content)).toContain('json | react');
    expect(progress).toContain('Writing this video as React motion code…');
  });

  it('does not offer the planner a React route the host cannot run', async () => {
    const provider = scripted(plan, composition);
    await composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, {}, { registry });
    expect(String(provider.seen[0]![0]!.content)).toContain('Reply with "path" set to one of: json.');
  });

  it('reports a failed React build instead of quietly writing a composition', async () => {
    const provider = scripted(reactPlan, composition);
    await expect(composeWithSource(provider,
      { ...base, maxAttempts: 2, content: false },
      { react: async () => { throw new Error('delayRender() was not released within 28 seconds'); } },
      { registry })).rejects.toThrow(/React authoring failed: delayRender\(\) was not released/);
  });

  it('keeps a supplied script in a React composition', async () => {
    const script = { audience: 'builders', promise: 'ship faster', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 2, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
    ] };
    const provider = scripted(reactPlan);
    let sawContent = false;
    const result = await composeWithSource(provider, { ...base, content: script, maxAttempts: 2, baseDir: '/tmp/project' },
      { react: async (_plan, options) => { sawContent = options.content !== false && options.content?.beats[0]?.id === 'hook'; return { composition: builtByReact, attempts: 1, issues: [], warnings: [] }; } },
      { registry });
    expect(sawContent).toBe(true);
    expect(result.composition.content?.beats[0]?.id).toBe('hook');
    // The script was supplied, so nothing was written: the only model call is the planner.
    expect(provider.seen).toHaveLength(1);
  });
});

// The routing lives in @ove/ai with the host's capabilities injected, so a job queue, an MCP server or a deployed worker gets the same
// decisions without importing the command line. A weak planner answers "json" for almost everything, so a host that can write React
// makes designed videos in React unless asked not to.
describe('composeSmart route default', () => {
  const builtByReact = loadComposition({ version: '1.0', id: 'react-video', name: 'React video', width: 1080, height: 1080, fps: 30, durationFrames: 60,
    scenes: [{ id: 'main', name: 'Main', durationFrames: 60, layers: [{ id: 'react', type: 'react', src: 'video.bundle.js', width: 1080, height: 1080, durationInFrames: 60 }] }] });
  const square = { ...base, width: 1080, height: 1080, maxAttempts: 2, content: false as const };
  const withReact = (calls: string[]) => ({ react: async () => { calls.push('react'); return { composition: builtByReact, attempts: 1, issues: [], warnings: [] }; } });
  const jsonPlan = { path: 'json', idea: 'Say hello', beats: [{ name: 'Hook', onScreen: 'the headline', seconds: 2 }] };

  it('writes a video the planner gave to json as React', async () => {
    const calls: string[] = [], progress: string[] = [];
    const result = await composeWithSource(scripted(jsonPlan, composition), { ...square, onProgress: message => progress.push(message) }, withReact(calls), { registry });
    expect(calls).toEqual(['react']); expect(result.route).toBe('react');
    expect(progress).toContain('Writing this video as React motion code…');
  });

  it('ignores OVE_AI_ROUTE: there is no setting that brings back json authoring', async () => {
    for (const setting of ['planner', 'json']) {
      vi.stubEnv('OVE_AI_ROUTE', setting);
      const calls: string[] = [];
      const result = await composeWithSource(scripted(jsonPlan, composition), square, withReact(calls), { registry });
      expect(calls, setting).toEqual(['react']); expect(result.route, setting).toBe('react');
      vi.unstubAllEnvs();
    }
  });

  it('writes React even when no plan was made, from the script or the brief', async () => {
    const calls: string[] = [];
    const result = await composeWithSource(scripted(composition), square, withReact(calls), { noPlan: true, registry });
    expect(calls).toEqual(['react']); expect(result.route).toBe('react');
  });

  it('does not take a video away from an explicit full composition', async () => {
    const calls: string[] = [];
    const full = await composeWithSource(scripted(composition), square, withReact(calls), { full: true, registry });
    expect(full.route).toBe('json'); expect(calls).toEqual([]);
  });

  it('does not offer React to a host that cannot run code', async () => {
    const noCode = await composeWithSource(scripted(jsonPlan, composition), square, {}, { registry });
    expect(noCode.route).toBe('json');
  });

  it('does not invent a planner when the host has no capability list', async () => {
    const provider = scripted(composition);
    await composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, {}, {});
    expect(provider.seen.some(messages => String(messages[0]!.content).includes('production planner'))).toBe(false);
  });
});
