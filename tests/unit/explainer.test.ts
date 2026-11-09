import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { explainerSchema, loadComposition, type Explainer } from '@ove/schema';
import { compileExplainer } from '@ove/core';
import { readExplainer, wavSeconds } from '../../packages/cli/src/explainer';

// An explainer script is what a person or an AI writes: scenes and spoken lines. It must compile to a valid, readable composition for any
// topic, with the same header on every scene, and each scene as long as its line.
const example = (name: string) => JSON.parse(readFileSync(new URL(`../../examples/${name}/spec.json`, import.meta.url), 'utf8'));
const parse = (raw: unknown): Explainer => explainerSchema.parse(raw);
const wav = (seconds: number, rate = 24000) => {
  const data = rate * 2 * seconds, bytes = new Uint8Array(44 + data), view = new DataView(bytes.buffer);
  bytes.set([...'RIFF'].map(c => c.charCodeAt(0)), 0); view.setUint32(4, 36 + data, true); bytes.set([...'WAVEfmt '].map(c => c.charCodeAt(0)), 8);
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  bytes.set([...'data'].map(c => c.charCodeAt(0)), 36); view.setUint32(40, data, true);
  return bytes;
};

describe('the explainer script', () => {
  it('accepts the example scripts', () => {
    for (const name of ['uber-heatmap', 'url-shortener']) expect(() => readExplainer(example(name)), name).not.toThrow();
  });

  it('says every problem at once, in the script\'s own terms', () => {
    const bad = { topic: 'T', scenes: [{ kind: 'flow', sources: ['one'] }, { kind: 'hologram' }, { kind: 'title', lines: [] }] };
    let message = ''; try { readExplainer(bad); } catch (error) { message = (error as Error).message; }
    expect(message).toMatch(/scenes\.0\.sources/); expect(message).toMatch(/scenes\.1/); expect(message).toMatch(/scenes\.2\.lines/);
  });

  it('keeps scripts small enough to draw', () => {
    const scenes = Array.from({ length: 17 }, () => ({ kind: 'closing', title: 'x' }));
    expect(explainerSchema.safeParse({ topic: 'T', scenes }).success).toBe(false);
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'steps', items: [{ title: 'a' }] }] }).success).toBe(false);
    expect(explainerSchema.safeParse({ topic: 'T', scenes: [{ kind: 'grid', mode: 'counters', rows: 40 }] }).success).toBe(false);
  });
});

describe('compiling a script', () => {
  const everything = parse({
    topic: 'KITCHEN SINK', handle: '@me',
    scenes: [
      { kind: 'title', lines: ['One line only'] },
      { kind: 'title', brand: 'Name', chip: 'CHIP', lines: ['a', 'b'], highlight: 1 },
      { kind: 'flow', sources: ['a', 'b'], buffer: 'LOAD BALANCER', sink: 'DB', spike: '2× SPIKE', note: { text: 'NOTE', tone: 'red' }, result: { text: 'DONE ✓', tone: 'mint' }, caption: 'Caption.' },
      { kind: 'grid', mode: 'counters', rows: 3, cols: 3, hot: { row: 8, col: 7 } },
      { kind: 'grid', mode: 'heatmap', rows: 9, cols: 8, callout: 'HOT HERE', result: 'Heatmap', resultNote: 'note' },
      { kind: 'grid', mode: 'heatmap', rows: 4, cols: 4 },
      { kind: 'steps', items: [{ title: 'one' }, { title: 'two', detail: 'more' }, { title: 'three' }, { title: 'four' }, { title: 'five', detail: 'last' }], caption: 'Steps.' },
      { kind: 'compare', left: { title: 'BAD', points: ['a', 'b', 'c', 'd'] }, right: { title: 'GOOD', points: ['e'] } },
      { kind: 'closing', title: 'The takeaway', points: ['x', 'y', 'z'], cta: 'Follow' },
    ],
  });

  it('makes a valid composition for every kind of scene, whatever its size', () => {
    const { composition } = compileExplainer(everything);
    const loaded = loadComposition(composition);
    // The header and footer become one last scene named overlay when a composition loads.
    expect(loaded.scenes.length).toBe(everything.scenes.length + 1);
    expect(loaded).toMatchObject({ width: 1080, height: 1920, fps: 30 });
  });

  it('gives every scene unique layer names, and the same header and footer over all of them', () => {
    const { composition } = compileExplainer(everything) as { composition: any };
    for (const scene of composition.scenes) {
      const ids = scene.layers.map((layer: any) => layer.id);
      expect(new Set(ids).size, scene.id).toBe(ids.length);
    }
    expect(composition.overlay.map((layer: any) => layer.id)).toEqual(['header-kind', 'header-topic', 'header-handle', 'follow']);
    expect(composition.variables.topic.default).toBe('KITCHEN SINK'); expect(composition.variables.handle.default).toBe('@me');
    expect(composition.variables.bg.default).toMatch(/^#/);
  });

  it('works for the example scripts too', () => {
    for (const name of ['uber-heatmap', 'url-shortener']) expect(() => loadComposition(compileExplainer(parse(example(name))).composition), name).not.toThrow();
  });

  it('makes a scene as long as its spoken line, never shorter than its pictures need', () => {
    const quick = compileExplainer(everything).composition as any;
    const spoken = compileExplainer(everything, { audio: [undefined, undefined, { src: 'assets/voice-3.wav', seconds: 14 }, { src: 'assets/voice-4.wav', seconds: 0.5 }] });
    const scenes = spoken.composition.scenes as any[];
    expect(scenes[2].durationFrames).toBe(Math.ceil(14.6 * 30) + 8);
    expect(scenes[2].layers.find((layer: any) => layer.id === 'voice')).toMatchObject({ type: 'audio', src: 'assets/voice-3.wav' });
    expect(scenes[3].durationFrames).toBe(quick.scenes[3].durationFrames);
    expect(scenes[0].layers.some((layer: any) => layer.id === 'voice')).toBe(false);
    expect(spoken.notes).toEqual([expect.stringMatching(/Scene 3 \(flow\) runs 14\.\d s/)]);
  });

  it('keeps long scenes busy: more packets flow when a scene runs longer', () => {
    const short = (compileExplainer(everything).composition as any).scenes[2].layers.length;
    const long = (compileExplainer(everything, { audio: [undefined, undefined, { src: 'a.wav', seconds: 14 }] }).composition as any).scenes[2].layers.length;
    expect(long).toBeGreaterThan(short);
  });
});

describe('reading a recording', () => {
  it('knows how long a WAV file is from its header', () => {
    expect(wavSeconds(wav(1))).toBeCloseTo(1, 3); expect(wavSeconds(wav(7.5, 48000))).toBeCloseTo(7.5, 3);
  });
  it('refuses anything else', () => {
    expect(() => wavSeconds(new Uint8Array(10))).toThrow(/not a WAV/);
    expect(() => wavSeconds(new Uint8Array(100))).toThrow(/not a WAV/);
  });
});
