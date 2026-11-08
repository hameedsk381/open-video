import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadComposition } from '@ove/core';
import { applyFixes, composeFromTemplate, composeVideo, isFixReply, templatesFor, writeCompositionProject, type AiProvider, type ChatMessage, type TemplateChoice } from '@ove/ai';

// Template mode and patch repair: the model's reply is small, wrong replies are corrected from short feedback, and anything the
// templates cannot cover falls back to writing a full composition.
const card = { version: '1.0', id: 'card', name: 'Card', width: 1080, height: 1080, fps: 30, durationFrames: 60,
  variables: { title: { type: 'string', default: 'Hello there' }, accent: { type: 'color', default: '#22d3ee' } },
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 60, layers: [{ id: 't', type: 'text', content: '{{title}}', x: 40, y: 40, fontSize: 64, color: '{{accent}}' }] }] };
const wide = { ...card, id: 'wide', width: 1920, height: 1080 };
const choice = (id: string, composition: any): TemplateChoice => ({ id, name: id, description: `A ${id}`, width: composition.width, height: composition.height, durationSeconds: 2,
  variables: [{ name: 'title', type: 'string', default: 'Hello there' }, { name: 'accent', type: 'color', default: '#22d3ee' }], composition });
const templates = [choice('square-card', card), choice('wide-card', wide)];
const scripted = (...replies: unknown[]): AiProvider & { seen: ChatMessage[][] } => { const seen: ChatMessage[][] = []; let at = 0;
  return { id: 'fake', model: 'fake-1', baseUrl: 'fake://', seen, chat: async messages => { seen.push(structuredClone(messages)); const reply = replies[Math.min(at++, replies.length - 1)]; return typeof reply === 'string' ? reply : JSON.stringify(reply); } }; };
const base = { brief: 'a coffee promo', width: 1080, height: 1080, maxAttempts: 3 };

describe('template mode', () => {
  it('only offers templates of the wanted shape', () => {
    expect(templatesFor(templates, { width: 1080, height: 1080 }).map(t => t.id)).toEqual(['square-card']);
    expect(templatesFor(templates, { width: 1080, height: 1920 })).toEqual([]);
  });

  it('turns a few values into a finished composition', async () => {
    const provider = scripted({ template: 'square-card', values: { title: 'Morning Brew', accent: '#f4d58d' } });
    const result = (await composeFromTemplate(provider, templates, base))!;
    expect(result.template).toBe('square-card'); expect(result.attempts).toBe(1);
    expect(JSON.stringify(result.composition)).toContain('Morning Brew'); expect(JSON.stringify(result.composition)).toContain('#f4d58d');
    expect(String(provider.seen[0]![1]!.content)).not.toContain('wide-card');
  });

  it('sends back what was wrong and accepts the corrected values', async () => {
    const provider = scripted({ template: 'square-card', values: { title: 'x'.repeat(400), nope: 1, accent: 'red' } }, { template: 'square-card', values: { title: 'Fine' } });
    const result = (await composeFromTemplate(provider, templates, base))!;
    expect(result.attempts).toBe(2);
    const feedback = String(provider.seen[1]!.at(-1)!.content);
    expect(feedback).toMatch(/too long/); expect(feedback).toMatch(/"nope" is not a variable/); expect(feedback).toMatch(/"accent" must be a colour/);
  });

  it('returns nothing when no template suits, so the caller writes a full composition', async () => {
    expect(await composeFromTemplate(scripted({ template: 'none' }), templates, base)).toBeUndefined();
    expect(await composeFromTemplate(scripted({ template: 'square-card', values: {} }), templates, { ...base, width: 1080, height: 1920 })).toBeUndefined();
  });

  it('does not accept a reply with next to no copy, and finds values placed beside the template name', async () => {
    const provider = scripted({ template: 'square-card', values: {} }, { template: 'square-card', title: 'Beside it' });
    const result = (await composeFromTemplate(provider, templates, base))!;
    expect(result.attempts).toBe(2); expect(String(provider.seen[1]!.at(-1)!.content)).toMatch(/gives 0 of 1 texts/);
    expect(JSON.stringify(result.composition)).toContain('Beside it');
  });

  it('leaves the colours of a themed template to its theme', async () => {
    const themed = { ...choice('themed-card', card), themed: true, variables: [...choice('x', card).variables, { name: 'bg', type: 'color', default: '#000000' }] };
    const provider = scripted({ template: 'themed-card', values: { title: 'Hello', bg: '#ff0000' } });
    const result = (await composeFromTemplate(provider, [themed], base))!;
    expect(String(provider.seen[0]![1]!.content)).not.toContain('- bg (');
    expect(Object.keys(result.values)).toEqual(['title']);
  });

  it('gives up after the attempts with the last problem', async () => {
    await expect(composeFromTemplate(scripted({ template: 'ghost' }), templates, { ...base, maxAttempts: 2 })).rejects.toThrow(/"template" must be one of square-card/);
  });
});

describe('template pictures', () => {
  const withPicture = { ...card, variables: { ...card.variables, image: { type: 'string', default: '' } }, scenes: [{ ...card.scenes[0], layers: [...card.scenes[0].layers, { if: '{{image}}', id: 'pic', type: 'image', src: '{{image}}', x: 0, y: 0, width: 100, height: 100 }] }] };
  const pictured = { ...choice('pictured', withPicture), variables: [...choice('x', card).variables, { name: 'image', type: 'string', default: '' }] };
  const logo = { id: 'logo', type: 'image', src: 'assets/logo.png' };

  it('accepts a supplied picture id and declares it as an asset', async () => {
    const provider = scripted({ template: 'pictured', values: { title: 'Hi', image: 'logo' } });
    const result = (await composeFromTemplate(provider, [pictured], { ...base, assets: [logo] }))!;
    expect(result.composition.assets).toMatchObject([{ id: 'logo', src: 'assets/logo.png' }]);
    expect(JSON.stringify(result.composition)).toContain('"src":"logo"');
    expect(String(provider.seen[0]![1]!.content)).toContain('Pictures you can use (ids): logo');
  });

  it('refuses invented picture ids, and any picture when none were supplied', async () => {
    const invented = scripted({ template: 'pictured', values: { title: 'Hi', image: 'stock-photo' } }, { template: 'pictured', values: { title: 'Hi', image: '' } });
    expect((await composeFromTemplate(invented, [pictured], { ...base, assets: [logo] }))!.attempts).toBe(2);
    expect(String(invented.seen[1]!.at(-1)!.content)).toMatch(/"image" must be one of logo/);
    const none = scripted({ template: 'pictured', values: { title: 'Hi', image: 'logo' } }, { template: 'pictured', values: { title: 'Hi' } });
    expect((await composeFromTemplate(none, [pictured], base))!.attempts).toBe(2);
    expect(String(none.seen[1]!.at(-1)!.content)).toMatch(/no pictures were supplied/);
  });
});

describe('saving a filled template', () => {
  it('keeps the script and each scene\'s beat beside the variables, so the saved project still has its narration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-template-'));
    try {
      const composition = loadComposition({ ...structuredClone(card),
        content: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Hello' }] },
        scenes: [{ ...card.scenes[0], beat: 'hook' }] });
      const path = (await writeCompositionProject(dir, composition, { source: structuredClone(card) })).composition;
      const saved = JSON.parse(await readFile(path, 'utf8'));
      expect(saved.variables.title.default).toBe('Hello there');
      expect(saved.content.beats[0].id).toBe('hook');
      expect(saved.scenes[0].beat).toBe('hook');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('repair by patch', () => {
  const broken = { ...card, scenes: [{ ...card.scenes[0], layers: [{ id: 't', type: 'text', content: 'Hi', x: 1, y: 1, fontSize: 64, animations: [{ split: { by: 'words' } }] }] }] };
  const compose = { width: 1080, height: 1080, fps: 30, durationSeconds: 2, brief: 'test', maxAttempts: 3 };

  it('applies path, layer and remove fixes to a copy', () => {
    const fixed = applyFixes(card, [{ path: 'scenes[0].layers[0].fontSize', value: 80 }, { layer: 't', set: { color: '#fff' } }, { path: 'variables.accent', remove: true }]);
    expect(fixed.scenes[0].layers[0]).toMatchObject({ fontSize: 80, color: '#fff' }); expect(fixed.variables.accent).toBeUndefined(); expect(card.scenes[0].layers[0].fontSize).toBe(64);
    expect(isFixReply({ fixes: [] })).toBe(true); expect(isFixReply(card)).toBe(false);
  });

  it('refuses fixes that cannot be placed', () => {
    expect(() => applyFixes(card, [{ path: 'scenes[5].layers[0]', value: {} }])).toThrow(/nothing at/);
    expect(() => applyFixes(card, [{ layer: 'missing', set: { x: 1 } }])).toThrow(/no layer "missing"/);
    expect(() => applyFixes(undefined, [{ path: 'a', value: 1 }])).toThrow(/no earlier composition/);
  });

  it('repairs with a short reply and a trimmed history', async () => {
    const provider = scripted(broken, { fixes: [{ path: 'scenes[0].layers[0].animations', remove: true }] });
    const result = await composeVideo(provider, compose);
    expect(result.attempts).toBe(2); expect(JSON.stringify(result.composition)).not.toContain('split');
    const retry = provider.seen[1]!; expect(retry).toHaveLength(4);
    expect(String(retry.at(-1)!.content)).toMatch(/Reply with only the changes/);
  });

  it('still accepts a full composition as the repair, and a fix that does not fit', async () => {
    expect((await composeVideo(scripted(broken, card), compose)).attempts).toBe(2);
    const provider = scripted(broken, { fixes: [{ path: 'scenes[9].layers[0]', value: {} }] }, card);
    expect((await composeVideo(provider, compose)).attempts).toBe(3);
    expect(String(provider.seen[2]!.at(-1)!.content)).toMatch(/nothing at/);
  });
});
