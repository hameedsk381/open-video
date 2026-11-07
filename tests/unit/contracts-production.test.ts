import { describe, expect, it } from 'vitest';
import { compileProduction, productionSummary } from '@ove/core';
import { productionSchema } from '@ove/schema';
import {
  compileProductionRequest,
  compileProductionResultSchema,
  productionStateSchema,
  productionSummarySchema,
  saveProductionRequest,
  saveProductionResultSchema,
} from '@ove/contracts';

// The studio's types for a production plan have to describe what the compiler actually reports, or the API will drift
// from the web app without either side noticing.
const production = productionSchema.parse({
  id: 'plan', name: 'Plan', brief: { prompt: 'A plan', targetDurationSeconds: 4 }, format: { width: 1080, height: 1920, fps: 30 },
  script: { beats: [{ id: 'hook', name: 'Hook', onScreen: 'Open it' }] },
  shots: [
    { id: 's1', sceneId: 'a', action: 'Opens', durationSeconds: 2, beatId: 'hook', onScreen: 'Open it' },
    { id: 's2', sceneId: 'a', action: 'Closes', durationSeconds: 2 },
  ],
});
const revision = { n: 1, file: '0001.json', at: new Date().toISOString(), kind: 'edit' as const, label: 'Started', frames: 0, scenes: 0, changes: [] };

describe('production contracts', () => {
  it('match the compiler summary field for field', () => {
    const summary = productionSummary(production);
    expect(Object.keys(productionSummarySchema.parse(summary)).sort()).toEqual(Object.keys(summary).sort());
  });

  it('describe a plan that was read, including one that does not validate', () => {
    const state = { production, valid: true, issues: [], summary: productionSummary(production), modified: 1234, base: '/files/plan/' };
    expect(productionStateSchema.parse(state)).toEqual(state);
    expect(productionStateSchema.parse({ ...state, production: null, valid: false, issues: [{ path: 'shots.0.action', message: 'Required' }], summary: null }))
      .toMatchObject({ valid: false, summary: null });
    expect(() => productionStateSchema.parse({ ...state, issues: undefined })).toThrow();
  });

  it('describe a save with the revision it recorded', () => {
    const saved = { production, valid: true, issues: [], summary: productionSummary(production), modified: 1234, base: '/files/plan/', revision };
    expect(saveProductionResultSchema.parse(saved).revision.kind).toBe('edit');
    expect(() => saveProductionResultSchema.parse({ ...saved, revision: undefined })).toThrow();
  });

  it('describe a compile dry run and an applied compile', () => {
    const compiled = compileProduction(production), summary = productionSummary(production);
    const shape = { summary, notes: compiled.notes, changes: ['scenes 0 → 1'], composition: {
      scenes: compiled.composition.scenes.length, durationFrames: compiled.composition.durationFrames, fps: compiled.composition.fps,
      width: compiled.composition.width, height: compiled.composition.height,
    } };
    expect(compileProductionResultSchema.parse({ ...shape, dryRun: true }).revision).toBeUndefined();
    expect(compileProductionResultSchema.parse({ ...shape, dryRun: false, revision: { ...revision, kind: 'compose' } }).revision?.kind).toBe('compose');
    expect(() => compileProductionResultSchema.parse({ ...shape, dryRun: false, composition: { scenes: 2 } })).toThrow();
  });

  it('parse the plan requests, defaulting a compile to a dry run', () => {
    expect(saveProductionRequest.parse({ id: 'plan', production })).toMatchObject({ id: 'plan' });
    expect(compileProductionRequest.parse({ id: 'plan' })).toEqual({ id: 'plan', dryRun: false });
    expect(compileProductionRequest.parse({ id: 'plan', dryRun: true }).dryRun).toBe(true);
    expect(() => saveProductionRequest.parse({ id: 'plan', production: [] })).toThrow();
  });
});
