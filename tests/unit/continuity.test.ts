import { describe, expect, it } from 'vitest';
import { parseComposition } from '@ove/schema';
import { continuityIssues } from '../../packages/core/src/review';
import type { FrameReport, TextNote } from '@ove/graphics';

// The continuity oracle: text that survives a hard cut should keep its place. Pure function over sampled frame
// reports, so the cases below are synthetic — no rendering.
const note = (text: string, x0: number, y0: number, size = 40, id = text.toLowerCase().replace(/\W+/g, '-')): TextNote =>
  ({ id, kind: 'text', x0, y0, x1: x0 + text.length * size * 0.55, y1: y0 + size, size, baseSize: size, alpha: 1, color: '#ffffff', truncated: false, shrunk: false, text, words: text.split(/\s+/).length });

const report = (...texts: TextNote[]): FrameReport => ({ texts, thumb: { width: 4, height: 4, pixels: new Array(16).fill(0) } });

const composition = (scenes: Record<string, unknown>[]) => parseComposition({
  version: '1.0', id: 'c', name: 'C', width: 1000, height: 1000, fps: 30, durationFrames: 120,
  scenes: scenes.map((scene, i) => ({ id: `s${i}`, name: `S${i}`, startFrame: i * 60, durationFrames: 60, layers: [{ id: 't', type: 'text', content: 'Words', fontSize: 40 }], ...scene })),
});

// Samples every 15 frames across two 60-frame scenes (what reviewComposition samples at 30 fps).
const frames = [0, 15, 30, 45, 60, 75, 90, 105];

describe('continuityIssues', () => {
  it('flags text that teleports across a hard cut', () => {
    const c = composition([{ layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }, { layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }]);
    // The same words at rest top-left in scene one and bottom-right in scene two.
    const reports = [0, 1, 2, 3].map(() => report(note('Hold still', 100, 100, 40, 'k')))
      .concat([4, 5, 6, 7].map(() => report(note('Hold still', 600, 700, 40, 'k'))));
    const issues = continuityIssues(c as any, reports, frames, 30);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', code: 'continuity', frame: 60, layer: 'k' });
    expect(issues[0].message).toContain('"Hold still" jumps about');
    expect(issues[0].message).toContain('across the cut at 2.0 s');
  });

  it('passes text that keeps its place, and single-appearance text', () => {
    const c = composition([{ layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }, { layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }]);
    const same = [0, 1, 2, 3, 4, 5, 6, 7].map(() => report(note('Hold still', 100, 100)));
    expect(continuityIssues(c as any, same, frames, 30)).toEqual([]);
    // Different words per scene never match, however far apart they sit.
    const changed = [0, 1, 2, 3].map(() => report(note('Hold still', 100, 100)))
      .concat([4, 5, 6, 7].map(() => report(note('New words', 600, 700))));
    expect(continuityIssues(c as any, changed, frames, 30)).toEqual([]);
  });

  it('skips cuts that a transition already joins', () => {
    const c = composition([{ layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }, { transitionIn: { type: 'fade', durationFrames: 15 }, layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }]);
    const moved = [0, 1, 2, 3].map(() => report(note('Hold still', 100, 100)))
      .concat([4, 5, 6, 7].map(() => report(note('Hold still', 600, 700))));
    expect(continuityIssues(c as any, moved, frames, 30)).toEqual([]);
  });

  it('reads the resting spot through entrances and exits, and ignores a text seen once', () => {
    const c = composition([{ layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }, { layers: [{ id: 'k', type: 'text', content: 'Hold still', fontSize: 40 }] }]);
    // Scene one: the text slides in (off-rest on the first two samples), then rests. Scene two: visible at only
    // one sample — not enough to judge, so no issue even though the positions differ.
    const entering = [report(note('Hold still', 100, 300)), report(note('Hold still', 100, 200)), report(note('Hold still', 100, 100)), report(note('Hold still', 100, 100))]
      .concat([report(note('Hold still', 600, 700)), report(), report(), report()]);
    expect(continuityIssues(c as any, entering, frames, 30)).toEqual([]);
  });
});
