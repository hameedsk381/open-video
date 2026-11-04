import { describe, expect, it } from 'vitest';
import { composeSmart } from '../../packages/cli/src/templates';
import { buildRegistry, createProvider, type AiProvider, type ChatMessage, type Registry } from '@ove/ai';
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
