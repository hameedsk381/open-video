import { describe, expect, it } from 'vitest';
import { composeNotesKey, composeOutcome, composeReport } from '../../apps/studio/src/composeReport';

// Only unresolved review faults stop the making page; repairs travel into the editor as a dismissible banner. The gate that
// decides that is worth pinning: an empty or oddly shaped result must not hold the user on a page for a video that finished clean.
describe('what the making page stops for', () => {
  it('says nothing when the job reported nothing', () => {
    expect(composeReport(undefined)).toBeUndefined();
    expect(composeReport(null)).toBeUndefined();
    expect(composeReport('/projects/a/composition.json')).toBeUndefined();
    expect(composeReport({ warnings: [], issues: [] })).toBeUndefined();
    expect(composeReport({ warnings: ['', '   '], issues: [4, null] })).toBeUndefined();
    expect(composeOutcome({ warnings: [], issues: [] })).toEqual({ stop: false, notes: [] });
  });

  it('keeps repairs as notes and review faults as errors', () => {
    const report = composeReport({
      warnings: ['scene 1 ("Hook"): text layer 1: the animation on "glow" was dropped.'],
      issues: ['"title" sits in the bottom UI band.'],
    })!;
    expect(report.errors).toEqual(['"title" sits in the bottom UI band.']);
    expect(report.notes).toEqual(['scene 1 ("Hook"): text layer 1: the animation on "glow" was dropped.']);
  });

  it('reports a video that was only repaired, with no fault left standing', () => {
    expect(composeReport({ warnings: ["The template's own files could not be copied"], issues: [] })).toEqual({ notes: ["The template's own files could not be copied"], errors: [] });
  });

  it('continues into the editor when the engine only repaired things', () => {
    expect(composeOutcome({ warnings: ["The template's own files could not be copied"], issues: [] })).toEqual({
      stop: false,
      notes: ["The template's own files could not be copied"],
    });
  });

  it('stops when the review still faults the video, keeping both lists', () => {
    expect(composeOutcome({ warnings: ['retimed'], issues: ['"title" sits in the bottom UI band.'] })).toEqual({
      stop: true,
      report: { notes: ['retimed'], errors: ['"title" sits in the bottom UI band.'] },
    });
  });

  it('leaves the notes under a key that belongs to the project', () => {
    expect(composeNotesKey('pocket')).toBe('ove-compose-notes:pocket');
  });
});
