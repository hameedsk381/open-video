import { describe, expect, it } from 'vitest';
import { explainerPrompt, sceneKinds, structureProblems, writeExplainer, type AiProvider } from '@ove/ai';
import { explainerSchema } from '@ove/schema';

// Before it writes a scene, the model weighs three shapes for the video and picks one, because the first shape that comes to mind is the
// cliché. A batch of videos can also be told which scene sequences are taken, so they do not share one skeleton.
const scene = (kind: string) => kind === 'title' ? { kind, lines: ['A', 'B'], say: 'x' } : kind === 'closing' ? { kind, title: 'End', say: 'y' } : { kind: 'stat', value: '1', label: 'one', say: 'z' };
const script = (...kinds: string[]) => ({ version: '1.0', topic: 'T', scenes: kinds.map(scene) });
const treatment = { candidates: [{ structure: 'a worked example' }, { structure: 'a before and after' }, { structure: 'a countdown' }], chosen: 1, logline: 'You will know how it works.' };
const model = (...replies: string[]) => {
  const seen: any[][] = [];
  const provider: AiProvider = { id: 'stand-in', model: 'x', baseUrl: '', async chat(messages) { seen.push(messages.map(m => ({ ...m }))); return replies[Math.min(seen.length - 1, replies.length - 1)]!; } };
  return { provider, seen };
};

describe('the treatment step', () => {
  it('asks for three different shapes and a choice before any scene', () => {
    const system = explainerPrompt('How a cache works')[0]!.content as string;
    expect(system).toContain('Treatment first');
    expect(system).toMatch(/3, genuinely different/);
    expect(system).toMatch(/cliché/);
    expect(system).toContain('"treatment":{...}');
    expect(system.indexOf('Treatment first')).toBeLessThan(system.indexOf('Scene kinds'));
  });

  it('keeps a treatment in the script, and refuses a choice that is not one of the candidates', () => {
    expect(explainerSchema.parse({ ...script('title', 'closing'), treatment }).treatment?.chosen).toBe(1);
    const parsed = explainerSchema.safeParse({ ...script('title', 'closing'), treatment: { ...treatment, chosen: 3 } });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify((parsed as any).error.issues)).toMatch(/only 3 candidates/);
  });

  it('is optional, so older scripts still load', () => {
    expect(explainerSchema.safeParse(script('title', 'closing')).success).toBe(true);
  });
});

describe('structure that repeats', () => {
  it('reads a script\'s structure as its scene kinds in order', () => {
    expect(sceneKinds(script('title', 'stat', 'closing'))).toEqual(['title', 'stat', 'closing']);
  });

  it('names a script that has the same sequence as a video already made', () => {
    expect(structureProblems(script('title', 'stat', 'closing'), [['title', 'stat', 'closing']])[0]).toMatch(/same as a video that was already made/);
    expect(structureProblems(script('title', 'stat', 'closing'), [['title', 'closing']])).toEqual([]);
    expect(structureProblems(script('title', 'stat', 'closing'))).toEqual([]);
  });

  it('tells the model which sequences are taken', () => {
    const system = explainerPrompt('caches', { avoid: [['title', 'compare', 'closing']] })[0]!.content as string;
    expect(system).toContain('title > compare > closing');
  });

  it('sends a repeated skeleton back with the reason, and takes the corrected shape', async () => {
    const { provider, seen } = model(JSON.stringify(script('title', 'stat', 'closing')), JSON.stringify({ ...script('title', 'stat', 'stat', 'closing'), treatment }));
    const { explainer, attempts } = await writeExplainer(provider, 'caches', { avoid: [['title', 'stat', 'closing']] });
    expect(attempts).toBe(2);
    expect(sceneKinds(explainer)).toEqual(['title', 'stat', 'stat', 'closing']);
    expect(explainer.treatment?.chosen).toBe(1);
    expect(String(seen[1]!.at(-1)!.content)).toMatch(/title > stat > closing\) is the same as a video that was already made/);
  });
});
