import { describe, expect, it } from 'vitest';
import { productionSchema } from '@ove/schema';
import { productionCoverage, productionSummary } from '@ove/core';
import { summaryText } from '../../packages/cli/src/production';

// Slice 3 of docs/content-and-assets.md: the plan says what it needs before a file exists, and stays unfinished until an approved asset fills it.
const assets = [
  { id: 'side', type: 'image', src: 'a/side.png' }, { id: 'office', type: 'image', src: 'a/office.png' }, { id: 'clip', type: 'video', src: 'a/clip.mp4' },
  { id: 'song', type: 'audio', src: 'a/song.mp3' }, { id: 'logo', type: 'svg', src: 'a/logo.svg', provenance: { origin: 'retrieved' } },
  { id: 'fake-logo', type: 'image', src: 'a/fake.png', provenance: { origin: 'generated', provider: 'mock' } },
  { id: 'old', type: 'image', src: 'a/old.png', status: 'superseded' },
];
const base = (requirements: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id: 'p', name: 'Film', brief: { prompt: 'a film' }, assets,
  script: { beats: [{ id: 'b1', name: 'Hook', onScreen: 'Hello' }, { id: 'b2', name: 'Turn', onScreen: 'Then' }, { id: 'b3', name: 'End', onScreen: 'Bye' }] },
  characters: [{ id: 'may', name: 'May', description: 'an engineer' }],
  environments: [{ id: 'lab', name: 'Lab' }],
  shots: [
    { id: 's1', sceneId: 'a', action: 'May enters', durationSeconds: 3, characterIds: ['may'], environmentId: 'lab', beatId: 'b1' },
    { id: 's2', sceneId: 'a', action: 'May works', durationSeconds: 3, characterIds: ['may'], beatId: 'b2' },
    { id: 's3', sceneId: 'b', action: 'The lab at night', durationSeconds: 3, environmentId: 'lab' },
  ],
  requirements, ...extra,
});
const req = (extra: Record<string, unknown>) => ({ id: 'r', purpose: { shotId: 's1' }, role: 'footage', strategy: 'generate', status: 'missing', ...extra });
const problems = (raw: unknown) => { const r = productionSchema.safeParse(raw); return r.success ? [] : r.error.issues.map(i => i.message); };

describe('requirements in the production schema', () => {
  it('keeps every existing production valid, with an empty list', () => {
    expect(productionSchema.parse(base()).requirements).toEqual([]);
  });

  it('defaults a requirement to missing and needs something to be for', () => {
    expect(productionSchema.parse(base([{ id: 'r', purpose: { shotId: 's1' }, role: 'footage', strategy: 'generate' }])).requirements[0]!.status).toBe('missing');
    expect(productionSchema.safeParse(base([{ id: 'r', purpose: {}, role: 'footage', strategy: 'generate' }])).success).toBe(false);
  });

  it('points only at things that exist', () => {
    expect(problems(base([req({ purpose: { shotId: 'nope' } })]))).toEqual(['Requirement "r" is for shot "nope", which is not in shots']);
    expect(problems(base([req({ purpose: { entityId: 'nope' } })]))).toEqual(['Requirement "r" is for "nope", which is not a character, environment or prop']);
    expect(problems(base([req({ purpose: { beatId: 'nope' } })]))).toEqual(['Requirement "r" is for beat "nope", which is not in script.beats']);
    expect(problems(base([req({}), req({})]))).toEqual(['Requirement id "r" is used twice']);
  });

  it('is honest about status: filled means an asset, missing means none', () => {
    expect(problems(base([req({ status: 'approved' })]))).toEqual(['Requirement "r" is approved but names no asset']);
    expect(problems(base([req({ status: 'missing', assetId: 'clip' })]))).toEqual(['Requirement "r" names an asset but is marked missing']);
    expect(problems(base([req({ status: 'approved', assetId: 'nope' })]))).toEqual(['Requirement "r" is filled by asset "nope", which is not in assets']);
  });

  it('wants the right kind of file for the role', () => {
    expect(problems(base([req({ role: 'footage', status: 'candidate', assetId: 'side' })]))).toEqual(['Requirement "r" needs video for footage, but asset "side" is image']);
    expect(problems(base([req({ role: 'music', status: 'candidate', assetId: 'side' })]))).toEqual(['Requirement "r" needs audio for music, but asset "side" is image']);
    expect(problems(base([req({ role: 'first_frame', status: 'candidate', assetId: 'song' })])).length).toBe(1);
    expect(problems(base([req({ role: 'footage', status: 'approved', assetId: 'clip' }), req({ id: 'r2', role: 'audio', status: 'approved', assetId: 'song' })]))).toEqual([]);
  });

  it('will not approve an asset that was rejected or superseded', () => {
    expect(problems(base([req({ role: 'image', status: 'approved', assetId: 'old' })]))).toEqual(['Requirement "r" is approved with asset "old", which is superseded']);
  });

  it('does not let a generated picture stand in for the real thing', () => {
    expect(problems(base([req({ role: 'graphic', strategy: 'retrieve', status: 'approved', assetId: 'fake-logo' })]))).toEqual(['Requirement "r" asks to retrieve the real thing, but asset "fake-logo" was generated']);
    expect(problems(base([req({ role: 'graphic', strategy: 'retrieve', status: 'approved', assetId: 'logo' })]))).toEqual([]);
    expect(problems(base([req({ role: 'image', strategy: 'generate', status: 'approved', assetId: 'fake-logo' })]))).toEqual([]);
  });
});

describe('coverage', () => {
  const coverageOf = (requirements: unknown[]) => productionCoverage(productionSchema.parse(base(requirements)));

  it('is not "ready" while nothing is required, and has no percentage to show', () => {
    const coverage = coverageOf([]);
    expect(coverage.total).toBe(0);
    expect(coverage.percent).toBeUndefined();
    expect(coverage.shots.every(shot => shot.state === 'none')).toBe(true);
  });

  it('counts approvals, not files: a candidate is not ready', () => {
    const coverage = coverageOf([
      req({ id: 'a', status: 'approved', assetId: 'clip' }),
      req({ id: 'b', role: 'image', purpose: { shotId: 's2' }, status: 'candidate', assetId: 'side' }),
      req({ id: 'c', role: 'environment', purpose: { shotId: 's3' } }),
      req({ id: 'd', role: 'audio', purpose: { beatId: 'b1' }, status: 'approved', assetId: 'song' }),
    ]);
    expect([coverage.total, coverage.approved, coverage.candidate, coverage.missing, coverage.percent]).toEqual([4, 2, 1, 1, 50]);
    const byShot = Object.fromEntries(coverage.shots.map(shot => [shot.shotId, shot.state]));
    expect(byShot).toEqual({ s1: 'ready', s2: 'review', s3: 'blocked' });
  });

  it('applies a need of a character or place to every shot that uses it, and a need of a beat to the shot rendering it', () => {
    const coverage = coverageOf([req({ id: 'lab-ref', role: 'environment', purpose: { entityId: 'lab' } }), req({ id: 'hook', role: 'audio', purpose: { beatId: 'b2' } })]);
    const needs = Object.fromEntries(coverage.shots.map(shot => [shot.shotId, shot.needs.map(n => n.requirementId)]));
    expect(needs).toEqual({ s1: ['lab-ref'], s2: ['hook'], s3: ['lab-ref'] });
    expect(coverage.entities.find(e => e.id === 'lab')).toMatchObject({ kind: 'environment', required: 1, missing: 1, approved: 0 });
    expect(coverage.entities.find(e => e.id === 'may')).toMatchObject({ required: 0 });
  });

  it('lists what is outstanding with the missing first, and the beats nothing is aimed at', () => {
    const coverage = coverageOf([
      req({ id: 'cand', role: 'image', purpose: { shotId: 's2' }, status: 'candidate', assetId: 'side' }),
      req({ id: 'miss', purpose: { shotId: 's1' }, instruction: 'the lab at dusk' }),
      req({ id: 'done', role: 'audio', purpose: { shotId: 's1' }, status: 'approved', assetId: 'song' }),
    ]);
    expect(coverage.outstanding.map(o => `${o.status}:${o.requirementId}`)).toEqual(['missing:miss', 'candidate:cand']);
    expect(coverage.outstanding[0]!.instruction).toBe('the lab at dusk');
    expect(coverage.beatsWithoutRequirements).toEqual(['b3']);                 // b1 via s1, b2 via s2; nothing renders or targets b3
  });

  it('reaches 100 only when every requirement is approved', () => {
    expect(coverageOf([req({ status: 'approved', assetId: 'clip' })]).percent).toBe(100);
  });
});

describe('what the CLI and the summary say', () => {
  it('puts coverage in the summary and prints what is missing in the words a person would use', () => {
    const production = productionSchema.parse(base([
      req({ id: 'miss', role: 'environment', purpose: { shotId: 's3' }, strategy: 'retrieve', instruction: 'the client\'s lab photos' }),
      req({ id: 'done', role: 'audio', purpose: { shotId: 's1' }, status: 'approved', assetId: 'song' }),
    ]));
    expect(productionSummary(production).coverage.percent).toBe(50);
    const text = summaryText(production);
    expect(text).toContain('Assets: 1 of 2 required approved (50%), 1 missing');
    expect(text).toContain('missing: environment for shot s3 (retrieve) — the client\'s lab photos');
    expect(text).toContain('Beats with no asset requirement: b2, b3');
  });

  it('says nothing about assets when nothing is required', () => {
    expect(summaryText(productionSchema.parse(base()))).not.toContain('Assets:');
  });
});
