import { describe, expect, it } from 'vitest';
import { composeSmart } from '../../packages/cli/src/templates';
import { buildRegistry, composeSmart as composeWithSource, createProvider, type AiProvider, type ChatMessage, type Registry, type TemplateChoice } from '@ove/ai';
import { loadComposition } from '@ove/schema';

// The smart composer routes a brief: the planner's answer picks the template or the full-composition path (with the beats
// as the motion plan), and a refused or failed plan falls back to the routing that always worked.
const registry: Registry = buildRegistry({
  templates: [{ id: 'intro-card', name: 'Intro card', description: 'A square title card', width: 1080, height: 1080, durationSeconds: 2, themed: true,
    variables: [{ name: 'title', type: 'string' }, { name: 'accent', type: 'color' }] }],
  themes: [{ id: 'midnight', name: 'Midnight', description: 'Dark blues' }],
});
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return typeof reply === 'string' ? reply : JSON.stringify(reply); } }; };
const composition = { version: '1.0', scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', content: 'Hello', x: 40, y: 40, fontSize: 64 }] }] };
const base = { brief: 'a quick product intro', width: 1080, height: 1080, fps: 30, durationSeconds: 2 };
const plan = { path: 'json', idea: 'Say hello', beats: [{ name: 'Hook', onScreen: 'the headline springs in', seconds: 2 }] };

describe('composeSmart routing', () => {
  it('follows the planner to json and hands its beats to the composer as the motion plan', async () => {
    const progress: string[] = [];
    const provider = scripted(plan, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, onProgress: message => progress.push(message) }, { registry });
    expect(result.template).toBeUndefined();
    expect(provider.seen).toHaveLength(2);
    expect(String(provider.seen[0]![0]!.content)).toContain('production planner');
    const composeText = provider.seen[1]!.map(message => message.content).join('\n');
    expect(composeText).toContain('Hook');
    expect(composeText).toContain('the headline springs in');
  });

  it('follows the planner to a template, and falls back to writing when no template suits', async () => {
    const progress: string[] = [];
    const provider = scripted({ path: 'template', template: 'intro-card', theme: 'midnight', beats: [{ name: 'Hook', onScreen: 'the headline', seconds: 2 }] }, { template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, onProgress: message => progress.push(message) }, { registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(String(provider.seen[1]![0]!.content)).toContain('template');
    expect(progress).toContain('No template suits this brief; writing a full composition.');
  });

  it('skips the planner with --no-plan and keeps the template-first fallback', async () => {
    const provider = scripted({ template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3 }, { noPlan: true, registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(String(provider.seen[0]![0]!.content)).toContain('template');
    expect(String(provider.seen[0]![0]!.content)).not.toContain('production planner');
  });

  it('falls back to the built-in routing when the planner cannot be trusted', async () => {
    const progress: string[] = [];
    const provider = scripted('garbage', { template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, onProgress: message => progress.push(message) }, { registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(progress.some(message => message.startsWith('No usable plan'))).toBe(true);
  });

  it('runs the whole route with the offline mock provider and no planner', async () => {
    const provider = createProvider({ provider: 'mock' });
    const result = await composeSmart(provider, { ...base, maxAttempts: 2 }, { noPlan: true });
    // The mock fills a real template end to end: a template reply, a schema-checked composition, no free-form generation.
    expect(result.composition.version).toBe('1.0');
    expect(result.template).toBeTruthy();
  });

  it('retimes a filled template to the brief\'s duration and saves it as a plain composition', async () => {
    const provider = createProvider({ provider: 'mock' });
    const result = await composeSmart(provider, { ...base, durationSeconds: 4, maxAttempts: 2 }, { noPlan: true });
    // The template the mock fills is longer than 4 s, so the resolved composition is stretched/trimmed to exactly 4 s.
    expect(result.composition.durationFrames).toBe(120);
    // Retimed timing is bespoke: no editable template source is returned, and the change is announced.
    expect(result.source).toBeUndefined();
    expect(result.warnings.some(warning => warning.includes('Retimed'))).toBe(true);
    expect(() => loadComposition(structuredClone(result.composition))).not.toThrow();
  });
});

// The routing lives in @ove/ai with the host's catalogues injected, so a job queue, an MCP server or a deployed worker
// gets the same decisions without importing the command line — and a template's files either travel or are reported.
describe('composeSmart with a host-supplied catalogue', () => {
  const card = { version: '1.0', id: 'card', name: 'Card', width: 1080, height: 1080, fps: 30, durationFrames: 60,
    variables: { title: { type: 'string', default: 'Hello there' } },
    scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', content: '{{title}}', x: 40, y: 40, fontSize: 64 }] }] };
  const choice: TemplateChoice = { id: 'square-card', name: 'Square card', description: 'A square title card', width: 1080, height: 1080, durationSeconds: 2,
    variables: [{ name: 'title', type: 'string', default: 'Hello there' }], composition: card };
  const filled = { template: 'square-card', values: { title: 'Morning Brew' } };

  it('fills from the injected templates and copies the template\'s own files next to the project', async () => {
    const copied: [string, string][] = [];
    const provider = scripted(filled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, baseDir: '/tmp/project' },
      { templates: async () => [choice], copyAssets: async (id, dir) => { copied.push([id, dir]); } }, { noPlan: true });
    expect(result.template).toBe('square-card');
    expect(copied).toEqual([['square-card', '/tmp/project']]);
    expect(result.warnings).toEqual([]);
  });

  it('reports files that could not travel instead of shipping a video with holes in it', async () => {
    const provider = scripted(filled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, baseDir: '/tmp/project' },
      { templates: async () => [choice], copyAssets: async () => { throw new Error('EACCES: permission denied, open bg.png'); } }, { noPlan: true });
    expect(result.template).toBe('square-card');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('could not be copied to /tmp/project');
    expect(result.warnings[0]).toContain('permission denied');
  });

  it('does not invent a planner when the host has no capability list', async () => {
    const provider = scripted(filled, composition);
    const progress: string[] = [];
    await composeWithSource(provider, { ...base, maxAttempts: 2, onProgress: message => progress.push(message) }, { templates: async () => [] }, {});
    expect(provider.seen.some(messages => String(messages[0]!.content).includes('production planner'))).toBe(false);
    expect(progress).toContain('No template suits this brief; writing a full composition.');
  });
});
