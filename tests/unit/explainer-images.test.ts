import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { explainerSchema, type Explainer } from '@ove/schema';
import { compileExplainer } from '@ove/core';
import { explainerPrompt, generateExplainerImages, needsImages, type AiProvider } from '@ove/ai';

// A media scene can name a picture to draw instead of a file. The picture is drawn once, kept in the project, reused while the prompt stays the
// same, and refused with a clear reason when the provider cannot draw.
const script = (scenes: unknown[]): Explainer => explainerSchema.parse({ topic: 'T', scenes });
const drawn = { kind: 'media', prompt: 'A busy city street at dusk, seen from above', title: 'The city', say: 'A city.' };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let dir = '';
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-ximg-')); });
afterEach(() => rm(dir, { recursive: true, force: true }));

const fake = (calls: string[], canDraw = true) => ({ id: 'fake', model: 'fake', ...(canDraw ? { image: async (prompt: string) => { calls.push(prompt); return { data: png, extension: 'png' }; } } : {}) }) as unknown as AiProvider;

describe('media scene with a prompt', () => {
  it('needs exactly one of a file and a prompt', () => {
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'media', src: 'a.png' }] }).success).toBe(true);
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [drawn] }).success).toBe(true);
    const both = explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'media', src: 'a.png', prompt: 'x' }] });
    const neither = explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'media', title: 'x' }] });
    expect(both.success).toBe(false);
    expect(neither.success).toBe(false);
    expect(JSON.stringify(neither.error?.issues)).toMatch(/exactly one of/);
  });

  it('is not built until its picture exists', () => {
    expect(() => compileExplainer(script([drawn]))).toThrow(/make the pictures first/);
  });
});

describe('drawing the pictures', () => {
  it('draws each prompt into the project, points the scene at the file, and leaves the script alone', async () => {
    const spec = script([{ kind: 'title', lines: ['A'] }, drawn]), calls: string[] = [];
    expect(needsImages(spec)).toBe(true);
    const result = await generateExplainerImages(spec, fake(calls), { dir });
    expect(result).toMatchObject({ made: 1, reused: 0 });
    expect(calls).toEqual([drawn.prompt]);
    const scene = result.spec.scenes[1] as { src?: string; prompt?: string; credit?: string };
    expect(scene.src).toMatch(/^assets\/explainer-2-[0-9a-f]{8}\.png$/);
    expect(scene.prompt).toBeUndefined();
    expect(scene.credit).toBe('AI-generated picture');
    expect(await readdir(join(dir, 'assets'))).toHaveLength(1);
    expect((spec.scenes[1] as { prompt?: string }).prompt).toBe(drawn.prompt); // the original still has its prompt
    expect(needsImages(result.spec)).toBe(false);
    expect(() => compileExplainer(result.spec)).not.toThrow();
  });

  it('reuses a picture while its prompt is unchanged, and draws again when it changes', async () => {
    const calls: string[] = [], spec = script([drawn]);
    await generateExplainerImages(spec, fake(calls), { dir });
    const again = await generateExplainerImages(spec, fake(calls), { dir });
    expect(again).toMatchObject({ made: 0, reused: 1 });
    expect(calls).toHaveLength(1);
    const changed = await generateExplainerImages(script([{ ...drawn, prompt: 'A quiet harbour at dawn' }]), fake(calls), { dir });
    expect(changed.made).toBe(1);
    expect(calls).toHaveLength(2);
  });

  it('keeps a credit the script already has', async () => {
    const result = await generateExplainerImages(script([{ ...drawn, credit: 'Art: me' }]), fake([]), { dir });
    expect((result.spec.scenes[0] as { credit?: string }).credit).toBe('Art: me');
  });

  it('says so when the provider cannot draw, and does nothing when no scene needs a picture', async () => {
    await expect(generateExplainerImages(script([drawn]), fake([], false), { dir })).rejects.toThrow(/cannot draw pictures/);
    const plain = script([{ kind: 'stat', value: '1', label: 'x' }]);
    expect(await generateExplainerImages(plain, fake([], false), { dir })).toMatchObject({ spec: plain, made: 0, reused: 0 });
  });
});

describe('the script writer', () => {
  const system = (options: Parameters<typeof explainerPrompt>[1]) => explainerPrompt('Topic', options).map(message => message.content).join('\n');

  it('offers drawn pictures only when the provider can draw, and files only when there are files', () => {
    expect(system({ images: true })).toContain('media (drawn)');
    expect(system({ images: true })).not.toContain('Do not use a media scene');
    expect(system({})).not.toContain('media (drawn)');
    expect(system({})).toContain('Do not use a media scene');
    expect(system({ media: ['assets/a.png'] })).toContain('assets/a.png');
  });
});
