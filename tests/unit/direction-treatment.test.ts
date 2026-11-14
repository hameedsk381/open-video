import { describe, expect, it } from 'vitest';
import { directionSection, directionShape, readDirection, writeDirection, type AiProvider } from '@ove/ai';
import { agentArgs } from '../../packages/cli/src/agent-cli';

// The agent's direction stage weighs three shapes for the video before it decides the structure, and is steered away from the shapes of videos
// already made. Repeating a shape costs one retry, never the direction.
const treatment = { candidates: [{ structure: 'one journey' }, { structure: 'a before and after' }, { structure: 'a countdown' }], chosen: 1, logline: 'You see why it is faster.', signature: 'The two lanes merge at 6 s.' };
const reply = (names: string[], extra: Record<string, unknown> = {}) => ({ concept: 'A calm launch film.', art: 'Quiet paper.', structure: names.map(name => ({ name, seconds: 3, idea: `${name} on screen` })), avoid: [], treatment, ...extra });
const stand = (...replies: unknown[]) => {
  const seen: any[][] = [];
  const provider: AiProvider = { id: 'stand-in', model: 'x', baseUrl: '', async chat(messages) { seen.push(messages.map(m => ({ ...m }))); return JSON.stringify(replies[Math.min(seen.length - 1, replies.length - 1)]); } };
  return { provider, seen };
};
const options = { brief: 'a launch', width: 1080, height: 1920, fps: 30, durationSeconds: 6 };

describe('the direction treatment', () => {
  it('is asked for before the structure, with the three-shape rule', async () => {
    const { provider, seen } = stand(reply(['Hook', 'Reveal']));
    await writeDirection(provider, options);
    const system = String(seen[0]![0]!.content);
    expect(system).toContain('Treatment first');
    expect(system).toContain('"treatment"');
    expect(system).toMatch(/three genuinely different shapes/);
    expect(system.indexOf('"treatment"')).toBeLessThan(system.indexOf('"concept"'));
  });

  it('reads the treatment, and drops one that cannot be used instead of failing the direction', () => {
    expect(readDirection(reply(['Hook', 'Reveal']), 6).direction?.treatment?.chosen).toBe(1);
    expect(readDirection(reply(['Hook', 'Reveal'], { treatment: { ...treatment, chosen: 7 } }), 6).direction).toBeDefined();
    expect(readDirection(reply(['Hook', 'Reveal'], { treatment: { ...treatment, chosen: 7 } }), 6).direction?.treatment).toBeUndefined();
    expect(readDirection(reply(['Hook', 'Reveal'], { treatment: { ...treatment, candidates: [{ structure: 'only one' }] } }), 6).direction?.treatment).toBeUndefined();
    expect(readDirection(reply(['Hook', 'Reveal'], { treatment: undefined }), 6).direction?.treatment).toBeUndefined();
  });

  it('tells the coding pass the chosen shape and the signature moment', () => {
    const section = directionSection(readDirection(reply(['Hook', 'Reveal']), 6).direction!);
    expect(section).toContain('Chosen shape: a before and after — You see why it is faster.');
    expect(section).toContain('Signature moment');
    expect(section).toContain('The two lanes merge at 6 s.');
  });
});

describe('a direction that repeats a shape', () => {
  it('fingerprints the structure by its beat names in order', () => {
    expect(directionShape(readDirection(reply(['Hook', ' Reveal ', 'CTA']), 9).direction!)).toBe('hook > reveal > cta');
  });

  it('is sent back once and the different one is taken', async () => {
    const { provider, seen } = stand(reply(['Hook', 'Reveal', 'CTA']), reply(['Question', 'Demo', 'Proof']));
    const { direction, problems } = await writeDirection(provider, { ...options, avoidShapes: ['hook > reveal > cta'] });
    expect(direction?.structure.map(beat => beat.name)).toEqual(['Question', 'Demo', 'Proof']);
    expect(problems).toEqual([]);
    expect(String(seen[1]!.at(-1)!.content)).toMatch(/same as a video that was already made/);
    expect(String(seen[0]![0]!.content)).toContain('hook > reveal > cta');
  });

  it('is still kept when the model repeats it again, because a direction beats none', async () => {
    const { provider } = stand(reply(['Hook', 'Reveal', 'CTA']));
    const { direction, problems } = await writeDirection(provider, { ...options, avoidShapes: ['hook > reveal > cta'] });
    expect(direction?.structure).toHaveLength(3);
    expect(problems[0]).toMatch(/repeats a video that was already made/);
  });
});

describe('ove agent --avoid', () => {
  it('is parsed as a list and its value is not taken for the brief or the folder', () => {
    const args = agentArgs(['agent', 'A launch reel', '--avoid', 'reel-a,reel-b', 'out-dir']);
    expect(args.avoid).toEqual(['reel-a', 'reel-b']);
    expect(args.brief).toBe('A launch reel');
    expect(args.dir).toBe('out-dir');
  });

  it('defaults to nothing to avoid', () => {
    expect(agentArgs(['agent', 'A launch reel']).avoid).toEqual([]);
  });
});
