import { describe, expect, it } from 'vitest';
import { briefs, reportRow, scoreRun, type RunRecord } from '../../scripts/eval-briefs';

// The evaluation harness's scoring: standardized checks over a run record, and the markdown summary row.
const brief = briefs[0];
const run: RunRecord = { id: brief.id, label: brief.label, route: 'react', frames: 360, width: 1080, height: 1920,
  attempts: 1, composeSeconds: 12.4, reviewErrors: 0, reviewWarnings: [], reviewMessages: [] };

describe('scoreRun', () => {
  it('passes a clean run and names its checks', () => {
    const score = scoreRun(run, brief);
    expect(score.passed).toBe(true);
    expect(Object.keys(score.checks)).toEqual(['composed', 'duration', 'resolution', 'copy readable', 'picture moves']);
    expect(score.checks.duration).toMatchObject({ pass: true });
    expect(score.checks.duration.detail).toContain('12 s vs 12 s wanted');
    expect(score.checks['copy readable'].detail).toContain('clean');
  });

  it('holds every route to the brief length', () => {
    expect(scoreRun({ ...run, route: 'json', frames: 120 }, brief).failed).toEqual(['duration']);
    expect(scoreRun({ ...run, frames: 240 }, brief).failed).toEqual(['duration']);
  });

  it('fails when the composition is off size or the copy breaks', () => {
    expect(scoreRun({ ...run, width: 1080, height: 1080 }, brief).failed).toEqual(['resolution']);
    expect(scoreRun({ ...run, reviewErrors: 2 }, brief).failed).toEqual(['copy readable']);
    expect(scoreRun({ ...run, reviewWarnings: ['frozen'] }, brief).failed).toEqual(['picture moves']);
    expect(scoreRun({ ...run, reviewMessages: ['[off-frame] The CTA runs off the frame at 1080'] }, brief).failed).toEqual(['copy readable']);
  });

  it('reports a compose failure in one place and nothing else passes on its back', () => {
    const score = scoreRun({ ...run, error: 'compose: the model gave no composition', route: undefined, frames: undefined, width: undefined, height: undefined }, brief);
    expect(score.failed).toEqual(['composed', 'duration', 'resolution']);
    expect(score.checks.composed.detail).toContain('gave no composition');
  });

  it('scores a played file by its probed duration', () => {
    const score = scoreRun({ ...run, fileSeconds: 361 / 30, renderSeconds: 21.2 }, brief);
    expect(score.passed).toBe(true);
    expect(score.checks.duration.detail).toContain('(probed)');
  });
});

describe('reportRow', () => {
  it('is one markdown row with route, times and failed checks', () => {
    const row = reportRow(run, scoreRun(run, brief));
    expect(row).toMatch(/^\| promo-reel \(vertical promo reel\) \| ✓ \| react \| 1 \| 12\.4 s \| — s \| 0 \| — \| — \|$/);
    const failing = reportRow({ ...run, reviewWarnings: ['frozen'] }, scoreRun({ ...run, reviewWarnings: ['frozen'] }, brief));
    expect(failing).toContain('frozen');
  });
});
