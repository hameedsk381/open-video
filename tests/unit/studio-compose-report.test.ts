import { describe, expect, it } from 'vitest';
import { composeReport } from '../../apps/studio/src/composeReport';

// The making page redirects to the player unless the compose job said something worth stopping for, so the gate that decides
// that is worth pinning: an empty or oddly shaped result must not hold the user on a page for a video that finished clean.
describe('what the making page stops for', () => {
  it('says nothing when the job reported nothing', () => {
    expect(composeReport(undefined)).toBeUndefined();
    expect(composeReport(null)).toBeUndefined();
    expect(composeReport('/projects/a/composition.json')).toBeUndefined();
    expect(composeReport({ warnings: [], issues: [] })).toBeUndefined();
    expect(composeReport({ warnings: ['', '   '], issues: [4, null] })).toBeUndefined();
  });

  it('keeps repairs as notes and review faults as errors', () => {
    const report = composeReport({
      warnings: ['scene 1 ("Hook"): text layer 1: the animation on "glow" was dropped.'],
      issues: ['"title" sits in the bottom UI band.'],
    })!;
    expect(report.errors).toEqual(['"title" sits in the bottom UI band.']);
    expect(report.notes).toEqual(['scene 1 ("Hook"): text layer 1: the animation on "glow" was dropped.']);
  });

  it('stops for a video that was only repaired, with no fault left standing', () => {
    expect(composeReport({ warnings: ["The template's own files could not be copied"], issues: [] })).toEqual({ notes: ["The template's own files could not be copied"], errors: [] });
  });
});
