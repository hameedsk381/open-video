import { describe, it, expect } from 'vitest';
import { loadComposition } from '@ove/schema';
import { planCuts, editComposition, type Transcript } from '@ove/ai';

const words = (list: [string, number, number][]) => list.map(([text, start, end]) => ({ text, start, end }));
// "So um today I want to show you … [1.8 s pause] … the the whole thing."
const transcript: Transcript = {
  text: '',
  cues: [],
  words: words([
    ['So', 0.0, 0.3], ['um', 0.3, 0.5], ['today', 0.55, 0.9], ['I', 0.95, 1.05], ['want', 1.05, 1.4],
    ['to', 1.45, 1.6], ['show', 1.6, 1.95], ['you', 2.0, 2.2],
    ['the', 4.0, 4.15], ['the', 4.2, 4.35], ['whole', 4.4, 4.8], ['thing.', 4.85, 5.3],
  ]),
};

describe('planCuts', () => {
  it('cuts long silences, fillers and repeated words, and remaps the kept words', () => {
    const plan = planCuts(transcript);
    expect(plan.segments).toEqual([{ from: 0, to: 2.2 }, { from: 4.0, to: 5.6 }]); // 0.3 s padding at both ends
    expect(plan.fillers).toBe(1); // "um"
    expect(plan.words.map(w => w.text)).toEqual(['So', 'today', 'I', 'want', 'to', 'show', 'you', 'the', 'whole', 'thing.']);
    expect(plan.words.at(-1)).toEqual({ text: 'thing.', start: 3.05, end: 3.5 }); // 5.3 - 1.8 cut
    expect(plan.cut).toBeCloseTo(1.8);
  });

  it('joins speech across pauses up to maxSilence and keeps fillers when asked', () => {
    const tight = planCuts(transcript, { maxSilence: 2 });
    expect(tight.segments).toHaveLength(1);
    const kept = planCuts(transcript, { keepFillers: true });
    expect(kept.words.map(w => w.text)).toContain('um');
    expect(kept.fillers).toBe(0);
  });

  it('rejects a transcript without word timings', () => {
    expect(() => planCuts({ text: '', cues: [], words: [] })).toThrow(/No word timings/);
  });
});

describe('editComposition', () => {
  const plan = planCuts(transcript);
  const composition = editComposition({ fps: 30, width: 1080, height: 1920, src: './raw/take.mp4', plan, captionsSrc: './assets/edit-captions.json' });

  it('builds one video layer per kept stretch, with the cut source skipped by trimStart', () => {
    const clips = composition.scenes.filter(scene => scene.id.startsWith('clip-'));
    expect(clips.map(scene => scene.durationFrames)).toEqual([66, 48]); // 2.2 s and 1.6 s at 30 fps
    expect(clips[0]!.layers[0]).toMatchObject({ type: 'video', src: './raw/take.mp4', trimStart: 0, objectFit: 'cover' });
    expect(clips[1]!.layers[0]).toMatchObject({ trimStart: 120 }); // 4.0 s into the source
    expect(composition.durationFrames).toBe(114);
  });

  it('spans a captions layer over the whole edited timeline, above the platform UI band', () => {
    const captions = composition.scenes.find(scene => scene.id === 'captions')!;
    expect(captions.startFrame).toBe(0);
    expect(captions.durationFrames).toBe(114);
    expect(captions.layers[0]).toMatchObject({ type: 'captions', src: 'edit-captions', y: 1478, maxWidth: 821 });
    expect(composition.assets.map(asset => asset.id)).toEqual(expect.arrayContaining(['source-clip', 'edit-captions']));
  });

  it('produces a composition the engine validates', () => {
    expect(() => loadComposition(structuredClone(composition))).not.toThrow();
  });
});
