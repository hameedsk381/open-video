import { compileProductionRequest, initProductionRequest, parseRequest, saveProductionRequest } from '@ove/contracts';
import { compileProduction, productionSummary, scaffoldProduction } from '@ove/core';
import { assertSourcesConfined, summarizeChange } from '@ove/ai';
import { loadComposition, productionSchema } from '@ove/schema';
import type { Ctx, Route } from '../types';

const PROJECT_FILE = 'production.json';

/** The project this request names, refusing one that does not exist before any file is read. */
const existing = async (c: Ctx, value: unknown) => {
  const id = typeof value === 'string' ? value : '';
  if (!id) throw new Error('project is required');
  c.deps.store.projectDir(c.who, id);
  if (!await c.deps.store.exists(c.who, id)) throw new Error(`There is no project "${id}"`);
  return id;
};

const issuesOf = (error: { issues: { path: PropertyKey[]; message: string }[] }) => error.issues.map(issue => ({ path: issue.path.map(String).join('.'), message: issue.message }));

/** The plan as the studio reads it: raw, validated, and summarized when it validates. */
async function state(c: Ctx, id: string, raw: unknown, modified: number) {
  const parsed = productionSchema.safeParse(raw);
  return {
    production: raw, valid: parsed.success, issues: parsed.success ? [] : issuesOf(parsed.error), summary: parsed.success ? productionSummary(parsed.data) : null,
    modified, base: `/files/${id}/`,
  };
}

const revisionOf = async (c: Ctx, id: string, file?: 'composition.json' | 'production.json') => (await c.deps.store.revisions(c.who, id, file)).at(-1)!;

/** The production plan: read, scaffold from the timeline, save, and compile into a new timeline. */
export function productionRoutes(): Route[] {
  return [
    { method: 'GET', path: '/api/production', handle: async c => {
      const id = await existing(c, c.url.searchParams.get('id')), raw = await c.deps.store.readProduction(c.who, id);
      if (raw === undefined) return c.json(200, { production: null, valid: false, issues: [], summary: null, modified: 0, base: `/files/${id}/` });
      c.json(200, await state(c, id, raw, (await c.deps.store.productionModified(c.who, id)) ?? 0));
    } },

    { method: 'POST', path: '/api/production/init', handle: async c => {
      const request = parseRequest(initProductionRequest, await c.body()), id = await existing(c, request.id);
      if (await c.deps.store.productionModified(c.who, id) !== undefined) return c.json(409, { error: 'This project already has a production plan' });
      const plan = scaffoldProduction(loadComposition(await c.deps.store.readRaw(c.who, id)));
      await c.deps.store.writeProduction(c.who, id, plan, { kind: 'edit', label: 'Started a production plan' });
      c.json(200, { ...await state(c, id, plan, (await c.deps.store.productionModified(c.who, id)) ?? 0), revision: await revisionOf(c, id, PROJECT_FILE) });
    } },

    { method: 'POST', path: '/api/production', handle: async c => {
      const request = parseRequest(saveProductionRequest, await c.body()), id = await existing(c, request.id);
      const parsed = productionSchema.safeParse(request.production);
      if (!parsed.success) return c.json(400, { error: 'The plan has problems to fix before it can be saved', issues: issuesOf(parsed.error) });
      const current = await c.deps.store.productionModified(c.who, id);
      if (request.baseModified !== undefined && (current ?? 0) !== request.baseModified) return c.json(409, { error: 'The plan changed in another tab. Reload it before saving.' });
      await c.deps.store.writeProduction(c.who, id, parsed.data, { kind: 'edit', label: 'Edited the production plan' });
      c.json(200, { ...await state(c, id, parsed.data, (await c.deps.store.productionModified(c.who, id)) ?? 0), revision: await revisionOf(c, id, PROJECT_FILE) });
    } },

    { method: 'POST', path: '/api/production/compile', handle: async c => {
      const request = parseRequest(compileProductionRequest, await c.body()), id = await existing(c, request.id);
      const raw = await c.deps.store.readProduction(c.who, id);
      if (raw === undefined) return c.json(400, { error: 'This project has no production plan yet' });
      const parsed = productionSchema.safeParse(raw);
      if (!parsed.success) return c.json(400, { error: 'The plan cannot be compiled yet', issues: issuesOf(parsed.error) });

      const compiled = compileProduction(parsed.data), current = loadComposition(await c.deps.store.readRaw(c.who, id));
      if (c.deps.mode === 'hosted') assertSourcesConfined(compiled.composition);
      const result = {
        dryRun: request.dryRun, summary: productionSummary(parsed.data), notes: compiled.notes, changes: summarizeChange(current, compiled.composition),
        composition: { scenes: compiled.composition.scenes.length, durationFrames: compiled.composition.durationFrames, fps: compiled.composition.fps, width: compiled.composition.width, height: compiled.composition.height },
      };
      if (request.dryRun) return c.json(200, result);

      await c.deps.store.writeRaw(c.who, id, compiled.composition, { kind: 'compose', label: `Compiled ${parsed.data.name}` });
      c.json(200, { ...result, revision: await revisionOf(c, id) });
    } },
  ];
}
