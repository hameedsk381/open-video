import { describe, it, expect } from 'vitest';
import { loadComposition } from '@ove/schema';
import { planShorts, shortsCandidatePlan, type Transcript } from '@ove/ai';
import { editComposition } from '@ove/ai';

const words = (list: [string, number, number][]) => list.map(([text, start, end]) => ({ text, start, end }));
// Two strong runs of speech and one weak stretch in the middle.
const transcript: Transcript = {
  text: '',
  cues: [],
  words: [
    ...words([['Here', 0, 0.3], ['is', 0.3, 0.5], ['the', 0.5, 0.7], ['biggest', 0.7, 1.1], ['mistake', 1.1, 1.6], ['people', 1.6, 2.0], ['make.', 2.0, 2.5]]),
    ...words([['They', 2.6, 2.9], ['never', 2.9, 3.3], ['test', 3.3, 3.6], ['their', 3.6, 3.9], ['first', 3.9, 4.2], ['version.', 4.2, 4.8]]),
    ...words([['That', 4.9, 5.2], ['is', 5.2, 5.4], ['why', 5.4, 5.7], ['most', 5.7, 6.0], ['products', 6.0, 6.5], ['fail', 6.5, 6.9], ['quietly.', 6.9, 7.5]]),
    // A flat stretch: no hook words, slow, no clean ending — should score below both runs.
    ...words([['and', 8.0, 8.3], ['then', 8.3, 8.7], ['we', 8.7, 8.9], ['looked', 8.9, 9.4], ['at', 9.4, 9.6], ['the', 9.6, 9.8], ['data', 9.8, 10.2], ['again', 10.2, 10.7]]),
    ...words([['Why', 12.0, 12.3], ['does', 12.3, 12.6], ['this', 12.6, 12.9], ['matter?', 12.9, 13.4]]),
    ...words([['Because', 13.5, 13.9], ['attention', 13.9, 14.5], ['is', 14.5, 14.7], ['the', 14.7, 14.9], ['only', 14.9, 15.2], ['scarce', 15.2, 15.6], ['resource.', 15.6, 16.3]]),
    ...words([['Everything', 16.4, 17.0], ['else', 17.0, 17.4], ['is', 17.4, 17.6], ['abundant.', 17.6, 18.3]]),
  ],
};

describe('planShorts', () => {
  it('picks the strongest non-overlapping runs, best first', () => {
    const picks = planShorts(transcript, { count: 2, minSeconds: 3, maxSeconds: 10 });
    expect(picks).toHaveLength(2);
    expect(picks[0]!.text).toContain('biggest mistake'); // the hook run wins
    expect(picks[1]!.text).toContain('does this matter'); // the question run is second
    // The flat stretch is left out.
    expect(picks.every(p => !p.text.includes('looked at the data'))).toBe(true);
    expect(picks[0]!.to <= picks[1]!.from || picks[1]!.to <= picks[0]!.from).toBe(true);
  });

  it('scores a clean ending and hook language above their absence', () => {
    const [best] = planShorts(transcript, { count: 1, minSeconds: 3, maxSeconds: 10 });
    expect(best!.breakdown.endsClean).toBe(1);
    expect(best!.breakdown.hook).toBeGreaterThanOrEqual(1);
    expect(best!.breakdown.density).toBeGreaterThan(0);
  });

  it('rejects a transcript without word timings', () => {
    expect(() => planShorts({ text: '', cues: [], words: [] })).toThrow(/No word timings/);
  });
});

describe('shorts projects', () => {
  const [candidate] = planShorts(transcript, { count: 1, minSeconds: 3, maxSeconds: 10 });
  const plan = shortsCandidatePlan(candidate!, true, 0.5, false);
  const composition = editComposition({ fps: 30, width: 1080, height: 1920, src: './long.mp4', plan, captionsSrc: './assets/captions.json' });

  it('builds a valid vertical composition for the candidate window', () => {
    expect(composition.width).toBe(1080);
    expect(composition.height).toBe(1920);
    expect(() => loadComposition(structuredClone(composition))).not.toThrow();
    const clips = composition.scenes.filter(scene => scene.id.startsWith('clip-'));
    // The first kept stretch starts where the candidate starts (trimStart is in source time).
    expect(clips[0]!.layers[0]).toMatchObject({ type: 'video', trimStart: Math.round(candidate!.from * 30) });
    expect(composition.durationFrames).toBeLessThan(Math.round((candidate!.to - candidate!.from) * 30) + 30);
  });
});
