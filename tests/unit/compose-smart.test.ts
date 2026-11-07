import { describe, expect, it, vi } from 'vitest';
import { composeSmart } from '../../packages/cli/src/templates';
import { buildRegistry, composeSmart as composeWithSource, createProvider, type AiProvider, type ChatMessage, type Registry, type TemplateChoice } from '@ove/ai';
import { loadComposition } from '@ove/schema';

// A filled template still has to face the renderer: the review is stubbed here so the assertion is about what the router
// does with its verdict, not about the pixels of a fixture composition.
vi.mock('@ove/core', async importOriginal => {
  const core = await importOriginal<Record<string, unknown>>();
  return {
    ...core,
    reviewComposition: vi.fn(async () => ({
      issues: [
        { severity: 'error', message: 'the quote is cut short', frame: 30, layer: 'quote' },
        { severity: 'warning', message: '2 text colours (#ffffff, #a78bfa): use a heading colour, a body colour and one or two accents' },
      ],
      sheet: Buffer.alloc(0), sheetFrames: [], sampledFrames: 4,
    })),
  };
});

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
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false, onProgress: message => progress.push(message) }, { registry });
    expect(result.template).toBeUndefined();
    expect(provider.seen).toHaveLength(2);
    expect(String(provider.seen[0]![0]!.content)).toContain('creative director');
    const composeText = provider.seen[1]!.map(message => message.content).join('\n');
    expect(composeText).toContain('Hook');
    expect(composeText).toContain('the headline springs in');
  });

  it('follows the planner to a template, and falls back to writing when no template suits', async () => {
    const progress: string[] = [];
    const provider = scripted({ path: 'template', template: 'intro-card', theme: 'midnight', beats: [{ name: 'Hook', onScreen: 'the headline', seconds: 2 }] }, { template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false, onProgress: message => progress.push(message) }, { registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(String(provider.seen[1]![0]!.content)).toContain('template');
    expect(progress).toContain('No template suits this brief; writing a full composition.');
  });

  it('skips the planner with --no-plan and keeps the template-first fallback', async () => {
    const provider = scripted({ template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false }, { noPlan: true, registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(String(provider.seen[0]![0]!.content)).toContain('template');
    expect(String(provider.seen[0]![0]!.content)).not.toContain('production planner');
  });

  it('falls back to the built-in routing when the planner cannot be trusted', async () => {
    const progress: string[] = [];
    const provider = scripted('garbage', { template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, content: false, onProgress: message => progress.push(message) }, { registry });
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(progress.some(message => message.startsWith('No usable plan'))).toBe(true);
  });

  it('writes the script before design and carries it into the video', async () => {
    const script = { audience: 'builders', promise: 'ship faster', cta: 'try it', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 1, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
      { id: 'point', name: 'Point', seconds: 1, narration: 'It is made of motion.', onScreen: 'Designed motion', data: [], sourceIds: [] },
    ] };
    const progress: string[] = [];
    const provider = scripted(script, plan, composition);
    const result = await composeSmart(provider, { ...base, maxAttempts: 3, research: false, onProgress: message => progress.push(message) }, { registry });
    // The script is the first call; the planner and the composer both receive it so neither invents copy.
    expect(String(provider.seen[0]![0]!.content)).toContain('script editor');
    expect(String(provider.seen[1]![0]!.content)).toContain('content script is already written');
    expect(provider.seen[2]!.map(message => String(message.content)).join('\n')).toContain('Designed motion');
    expect(result.composition.content?.beats.map(beat => beat.id)).toEqual(['hook', 'point']);
    expect(progress).toContain('Script ready: 2 beats, 0 sources.');
  });

  it('takes a supplied script instead of writing another', async () => {
    const script = { audience: 'builders', promise: 'ship faster', cta: 'try it', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 2, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
    ] };
    const provider = scripted({ template: 'none' }, composition);
    const result = await composeSmart(provider, { ...base, content: script, maxAttempts: 2 }, { noPlan: true, registry });
    expect(provider.seen).toHaveLength(2);
    expect(result.composition.content?.beats[0]?.id).toBe('hook');
  });

  it('runs the whole route with the offline mock provider and no planner', async () => {
    const provider = createProvider({ provider: 'mock' });
    const result = await composeSmart(provider, { ...base, maxAttempts: 2 }, { noPlan: true });
    // The mock fills a real template end to end: a script it wrote, a template reply, a schema-checked composition.
    expect(result.composition.version).toBe('1.0');
    expect(result.composition.content?.beats.length).toBeGreaterThan(0);
    expect(result.template).toBeTruthy();
  });

  it('retimes a filled template to the brief\'s duration and saves it as a plain composition', async () => {
    const provider = createProvider({ provider: 'mock' });
    const result = await composeSmart(provider, { ...base, durationSeconds: 4, maxAttempts: 2 }, { noPlan: true });
    // The template the mock fills is longer than 4 s, so the resolved composition is stretched/trimmed to exactly 4 s.
    expect(result.composition.durationFrames).toBe(120);
    // Retimed timing is bespoke: no editable template source is returned, and the change is announced.
    expect(result.source).toBeUndefined();
    expect(result.composition.content?.beats.length).toBeGreaterThan(0);
    expect(result.warnings.some(warning => warning.includes('Retimed'))).toBe(true);
    expect(() => loadComposition(structuredClone(result.composition))).not.toThrow();
  });
});

// A brief no template or block layout carries can be written as React code — but only by a host that will run that code
// itself. The router asks the planner for React only when the source offers a builder, and a failed build falls back to a
// written composition instead of losing the job.
describe('composeSmart with React authoring', () => {
  const choice: TemplateChoice = { id: 'square-card', name: 'Square card', description: 'A square title card', width: 1080, height: 1080, durationSeconds: 2,
    variables: [], composition: { version: '1.0', id: 'card', name: 'Card', width: 1080, height: 1080, fps: 30, durationFrames: 60, scenes: [{ id: 's', name: 'S', layers: [] }] } };
  const reactPlan = { path: 'react', idea: 'Liquid chrome type', look: { motion: 'blur' }, beats: [{ name: 'Hook', onScreen: 'chrome letters form', seconds: 2 }] };
  const builtByReact = loadComposition({ version: '1.0', id: 'react-video', name: 'React video', width: 1080, height: 1080, fps: 30, durationFrames: 60,
    scenes: [{ id: 'main', name: 'Main', durationFrames: 60, layers: [{ id: 'react', type: 'react', src: 'video.bundle.js', width: 1080, height: 1080, durationInFrames: 60 }] }] });

  it('writes a planned React video through the host builder and names the route', async () => {
    const progress: string[] = [];
    const provider = scripted(reactPlan);
    let received: { idea?: string } = {};
    const result = await composeWithSource(provider,
      { ...base, maxAttempts: 2, content: false, baseDir: '/tmp/project', onProgress: message => progress.push(message) },
      { templates: async () => [choice], react: async plan => { received = plan; return { composition: builtByReact, attempts: 2, issues: [], warnings: ['the component was repaired once'] }; } },
      { registry });
    expect(result.route).toBe('react');
    expect(received.idea).toBe('Liquid chrome type');
    // One planner call and two code attempts: the count covers the whole route, like the template path does.
    expect(result.attempts).toBe(3);
    expect(result.warnings).toEqual(['the component was repaired once']);
    expect(String(provider.seen[0]![0]!.content)).toContain('template | json | react');
    expect(progress).toContain('Writing this video as React motion code…');
  });

  it('does not offer the planner a React route the host cannot run', async () => {
    const provider = scripted(plan, composition);
    await composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, { templates: async () => [choice] }, { registry });
    expect(String(provider.seen[0]![0]!.content)).toContain('Reply with "path" set to one of: template | json.');
  });

  it('falls back to a written composition when React authoring fails', async () => {
    const progress: string[] = [];
    const provider = scripted(reactPlan, composition);
    const result = await composeWithSource(provider,
      { ...base, maxAttempts: 2, content: false, onProgress: message => progress.push(message) },
      { templates: async () => [choice], react: async () => { throw new Error('delayRender() was not released within 28 seconds'); } },
      { registry });
    expect(result.route).toBe('json');
    expect(result.composition.scenes[0].layers[0].content).toBe('Hello');
    expect(progress.some(message => message.startsWith('React authoring failed'))).toBe(true);
  });

  it('keeps a supplied script in a React composition', async () => {
    const script = { audience: 'builders', promise: 'ship faster', sources: [], beats: [
      { id: 'hook', name: 'Hook', seconds: 2, narration: 'A quick product intro.', onScreen: 'Hello', data: [], sourceIds: [] },
    ] };
    const provider = scripted(reactPlan);
    let sawContent = false;
    const result = await composeWithSource(provider, { ...base, content: script, maxAttempts: 2, baseDir: '/tmp/project' },
      { templates: async () => [choice], react: async (_plan, options) => { sawContent = options.content !== false && options.content?.beats[0]?.id === 'hook'; return { composition: builtByReact, attempts: 1, issues: [], warnings: [] }; } },
      { registry });
    expect(sawContent).toBe(true);
    expect(result.composition.content?.beats[0]?.id).toBe('hook');
    // The script was supplied, so nothing was written: the only model call is the planner.
    expect(provider.seen).toHaveLength(1);
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
  const wideCard = { ...card, id: 'wide-card', name: 'Wide card', width: 1920, height: 1080 };
  const wideChoice: TemplateChoice = { id: 'wide-card', name: 'Wide card', description: 'A wide title card', width: 1920, height: 1080, durationSeconds: 2,
    variables: [{ name: 'title', type: 'string', default: 'Hello there' }], composition: wideCard };
  const wideFilled = { template: 'wide-card', values: { title: 'Morning Brew' } };

  it('fills from the injected templates and copies the template\'s own files next to the project', async () => {
    const copied: [string, string][] = [];
    const provider = scripted(filled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, content: false, baseDir: '/tmp/project' },
      { templates: async () => [choice], copyAssets: async (id, dir) => { copied.push([id, dir]); } }, { noPlan: true });
    expect(result.template).toBe('square-card');
    expect(copied).toEqual([['square-card', '/tmp/project']]);
    expect(result.warnings).toEqual([]);
  });

  it('reports files that could not travel instead of shipping a video with holes in it', async () => {
    const provider = scripted(filled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, content: false, baseDir: '/tmp/project' },
      { templates: async () => [choice], copyAssets: async () => { throw new Error('EACCES: permission denied, open bg.png'); } }, { noPlan: true });
    expect(result.template).toBe('square-card');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('could not be copied to /tmp/project');
    expect(result.warnings[0]).toContain('permission denied');
  });

  it('reviews a filled template and returns its faults instead of a clean run', async () => {
    const provider = scripted(filled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, content: false, review: true }, { templates: async () => [choice] }, { noPlan: true });
    expect(result.template).toBe('square-card');
    expect(result.issues.map(issue => issue.severity)).toEqual(['error', 'warning']);
    expect(result.issues[0]!.message).toBe('the quote is cut short');
    // The warning is also in the notes, which is all a surface that ignores `issues` reads.
    expect(result.warnings).toContain('2 text colours (#ffffff, #a78bfa): use a heading colour, a body colour and one or two accents');
  });

  it('fills an explicitly chosen template at its own canvas instead of filtering it out', async () => {
    const provider = scripted(wideFilled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, { templates: async () => [choice, wideChoice] }, { noPlan: true, template: 'wide-card' });
    expect(result.template).toBe('wide-card');
    expect(result.composition.width).toBe(1920);
    expect(result.composition.height).toBe(1080);
  });

  it('does not let the model decline an explicitly chosen template', async () => {
    const provider = scripted({ template: 'none' }, wideFilled);
    const result = await composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, { templates: async () => [choice, wideChoice] }, { noPlan: true, template: 'wide-card' });
    expect(result.template).toBe('wide-card');
    expect(provider.seen).toHaveLength(2);
  });

  it('does not substitute another template when the named one does not exist', async () => {
    const provider = scripted(filled);
    await expect(composeWithSource(provider, { ...base, maxAttempts: 2, content: false }, { templates: async () => [choice] }, { noPlan: true, template: 'nope' }))
      .rejects.toThrow('There is no template "nope". Available templates: square-card.');
  });

  it('does not invent a planner when the host has no capability list', async () => {
    const provider = scripted(filled, composition);
    const progress: string[] = [];
    await composeWithSource(provider, { ...base, maxAttempts: 2, content: false, onProgress: message => progress.push(message) }, { templates: async () => [] }, {});
    expect(provider.seen.some(messages => String(messages[0]!.content).includes('production planner'))).toBe(false);
    expect(progress).toContain('No template suits this brief; writing a full composition.');
  });
});
