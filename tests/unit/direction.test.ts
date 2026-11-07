import { describe, expect, it } from 'vitest';
import { directionSection, readDirection, writeDirection } from '@ove/ai';
import type { AiProvider, ChatMessage } from '../../packages/ai/src/providers';

const reply = (overrides: Record<string, unknown> = {}) => ({
  concept: 'A cut-paper skyline at dawn',
  art: 'Layered paper silhouettes, matte texture, one warm light source',
  type: { display: 'Fraunces', body: 'Source Sans 3', treatment: 'Tight headlines, wide body measure' },
  palette: { bg: '#1b120c', surface: '#2a1c13', text: '#f7efe4', muted: '#b9a691', accent: '#e07a3f', accent2: '#6d8f7a' },
  motion: 'Slow parallax between paper layers, cuts on the beat',
  sound: 'Soft paper rustle and a low pad',
  structure: [
    { name: 'Dawn', seconds: 2, idea: 'Paper hills slide into a warm sky' },
    { name: 'City', seconds: 3, idea: 'Building silhouettes rise in layers' },
    { name: 'Name', seconds: 1, idea: 'The name settles above the skyline' },
  ],
  avoid: ['glass cards', 'bento grids'],
  ...overrides,
});

describe('readDirection', () => {
  it('reads a full direction and scales the beats onto the requested length', () => {
    const { direction, problems } = readDirection(reply(), 9);
    expect(problems).toEqual([]);
    expect(direction).toMatchObject({
      concept: 'A cut-paper skyline at dawn',
      type: { display: 'Fraunces', body: 'Source Sans 3' },
      palette: { bg: '#1b120c', accent: '#e07a3f' },
      sound: 'Soft paper rustle and a low pad',
      avoid: ['glass cards', 'bento grids'],
    });
    expect(direction!.structure).toHaveLength(3);
    // 6 s of beats asked to fill 9 s: every beat scales by 1.5.
    expect(direction!.structure.map(beat => beat.seconds)).toEqual([3, 4.5, 1.5]);
  });

  it('splits the video evenly when the model gives no usable seconds', () => {
    const { direction } = readDirection(reply({ structure: [{ name: 'One', idea: 'A' }, { name: 'Two', idea: 'B' }] }), 8);
    expect(direction!.structure.map(beat => beat.seconds)).toEqual([4, 4]);
  });

  it('drops fonts and colours the renderer cannot use instead of failing the direction', () => {
    const { direction, problems } = readDirection(reply({
      type: { display: 'Comic Sans MS', body: 'space-grotesk' },
      palette: { bg: 'dark navy', text: '#f7efe4', accent: 'red; background: url(https://evil)' },
    }), 6);

    expect(problems).toEqual([]);
    expect(direction!.type).toEqual({ body: 'Space Grotesk' });
    expect(direction!.palette).toEqual({ text: '#f7efe4' });
  });

  it('requires a concept and at least one usable beat', () => {
    expect(readDirection({}, 6).problems.length).toBeGreaterThan(0);
    expect(readDirection({ concept: 'Only an idea' }, 6).problems[0]).toContain('"structure"');
    expect(readDirection(reply({ concept: '   ' }), 6).problems[0]).toContain('"concept"');
  });

  it('caps the beat list and the avoid list', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ name: `Beat ${index}`, seconds: 1, idea: `Idea ${index}` }));
    const { direction } = readDirection(reply({ structure: many, avoid: ['a', 'b', 'c', 'd', 'e', 'f'] }), 12);
    expect(direction!.structure).toHaveLength(8);
    expect(direction!.avoid).toHaveLength(5);
  });
});

describe('writeDirection', () => {
  it('asks for a direction with no house style and retries a malformed reply', async () => {
    const prompts: string[] = [];
    const provider: AiProvider = {
      id: 'mock-direction',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat(messages: ChatMessage[]) {
        prompts.push(messages.map(message => message.content).join('\n'));
        return prompts.length === 1 ? 'not json' : JSON.stringify(reply());
      },
    };

    const { direction, problems } = await writeDirection(provider, {
      brief: 'A luxury watch commercial', width: 1920, height: 1080, fps: 30, durationSeconds: 20,
    });

    expect(problems).toEqual([]);
    expect(direction!.concept).toBe('A cut-paper skyline at dawn');
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain('There is no house style');
    expect(prompts[0]).toContain('Do not reach for defaults');
    expect(prompts[0]).toContain('Fraunces');
    expect(prompts[1]).toContain('That direction cannot be used');
  });

  it('returns problems instead of throwing when every attempt fails', async () => {
    const provider: AiProvider = {
      id: 'mock-direction',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat() { throw new Error('gateway unavailable'); },
    };

    const { direction, problems } = await writeDirection(provider, {
      brief: 'A short film', width: 1080, height: 1920, fps: 30, durationSeconds: 6, maxAttempts: 2,
    });

    expect(direction).toBeUndefined();
    expect(problems[0]).toContain('gateway unavailable');
  });

  it('hands the planner\'s first pass to the direction stage', async () => {
    let prompt = '';
    const provider: AiProvider = {
      id: 'mock-direction',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat(messages: ChatMessage[]) {
        prompt = messages.map(message => message.content).join('\n');
        return JSON.stringify(reply());
      },
    };

    await writeDirection(provider, {
      brief: 'A launch film', width: 1920, height: 1080, fps: 30, durationSeconds: 12,
      plan: { idea: 'A calm launch', beats: [{ name: 'Hook', onScreen: 'A single line', seconds: 3 }] },
    });

    expect(prompt).toContain('The planner already made a first pass');
    expect(prompt).toContain('A calm launch');
  });
});

describe('directionSection', () => {
  it('renders the direction as the guidance the code prompt carries', () => {
    const { direction } = readDirection(reply(), 6);
    const text = directionSection(direction!);
    expect(text).toContain('Concept: A cut-paper skyline at dawn');
    expect(text).toContain('Typography: display Fraunces; body Source Sans 3;');
    expect(text).toContain('1. Dawn (2.0 s) — Paper hills slide into a warm sky');
    expect(text).toContain('Palette: bg #1b120c');
    expect(text).toContain('Avoid: glass cards; bento grids.');
  });
});
