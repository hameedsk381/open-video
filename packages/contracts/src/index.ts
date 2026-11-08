// The studio's API as data: what the server sends and accepts, written once. The server checks what it sends against these in its tests, and
// the web app imports the types (import type, so no zod reaches the browser bundle). Nothing here runs anything: no filesystem, no queue.
import { z } from 'zod';

export const errorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof errorSchema>;

/* Projects */
export const projectModeSchema = z.enum(['template', 'finished']);
export const projectSchema = z.object({
  id: z.string(), name: z.string(), width: z.number(), height: z.number(), fps: z.number(), durationFrames: z.number(), seconds: z.number(),
  scenes: z.number(), modified: z.number(), revisions: z.number(), mode: projectModeSchema,
});
export type Project = z.infer<typeof projectSchema>;
export const projectListSchema = z.object({ projects: z.array(projectSchema) });

export const variableSchema = z.object({ name: z.string(), type: z.enum(['string', 'number', 'boolean', 'color', 'list']), description: z.string().optional(), items: z.unknown().optional(), value: z.unknown() });
export type Variable = z.infer<typeof variableSchema>;
export const textLayerSchema = z.object({ path: z.string(), scene: z.string(), id: z.string(), content: z.string(), fontSize: z.number() });
export type TextLayer = z.infer<typeof textLayerSchema>;
export const assetSchema = z.object({ name: z.string(), path: z.string(), kind: z.string(), bytes: z.number(), sha256: z.string().optional(), addedAt: z.string().optional() });
export type Asset = z.infer<typeof assetSchema>;
export const sceneSummarySchema = z.object({ id: z.string(), name: z.string(), startFrame: z.number(), durationFrames: z.number() });
export type Scene = z.infer<typeof sceneSummarySchema>;

export const detailSchema = z.object({
  id: z.string(), name: z.string(), width: z.number(), height: z.number(), fps: z.number(), durationFrames: z.number(), mode: projectModeSchema,
  scenes: z.array(sceneSummarySchema), variables: z.array(variableSchema), theme: z.record(z.string(), z.union([z.string(), z.number()])), texts: z.array(textLayerSchema),
  assets: z.array(assetSchema), revisions: z.number(),
  /** What the browser Player needs: the composition as written, its measured media, and the URL its relative files are served under. */
  source: z.object({ raw: z.unknown(), media: z.record(z.string(), z.unknown()), base: z.string() }),
});
export type Detail = z.infer<typeof detailSchema>;

export const revisionSchema = z.object({
  n: z.number(), file: z.string(), at: z.string(), kind: z.enum(['baseline', 'compose', 'refine', 'edit', 'import', 'restore']), label: z.string(), brief: z.string().optional(),
  provider: z.string().optional(), model: z.string().optional(), template: z.string().optional(), attempts: z.number().optional(), frames: z.number(), scenes: z.number(), changes: z.array(z.string()), restoredFrom: z.number().optional(),
});
export type Revision = z.infer<typeof revisionSchema>;
export const historySchema = z.object({ revisions: z.array(revisionSchema) });

/* Production plan */
export type { Production, ProductionCharacter, ProductionEnvironment, ProductionShot, ProductionStyle } from '@ove/schema';

/** One reason a manifest cannot be compiled, with the path the studio should point at. */
export const productionIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ProductionIssue = z.infer<typeof productionIssueSchema>;

/** What the plan adds up to, before it is compiled. */
const requirementState = z.enum(['missing', 'candidate', 'approved']);
const count = z.number().int().nonnegative();
export const productionCoverageSchema = z.object({
  total: count, approved: count, candidate: count, missing: count, percent: z.number().optional(),
  shots: z.array(z.object({ shotId: z.string(), required: count, approved: count, candidate: count, missing: count, state: z.enum(['none', 'blocked', 'review', 'ready']), needs: z.array(z.object({ requirementId: z.string(), role: z.string(), status: requirementState, instruction: z.string().optional() })) })),
  entities: z.array(z.object({ id: z.string(), kind: z.enum(['character', 'environment', 'prop']), references: count, required: count, approved: count, missing: count })),
  beatsWithoutRequirements: z.array(z.string()),
  outstanding: z.array(z.object({ requirementId: z.string(), role: z.string(), strategy: z.string(), status: requirementState, instruction: z.string().optional(), shotId: z.string().optional(), entityId: z.string().optional(), beatId: z.string().optional() })),
});
export type ProductionCoverageState = z.infer<typeof productionCoverageSchema>;

export const productionSummarySchema = z.object({
  shots: z.number().int().nonnegative(),
  scenes: z.array(z.string()),
  characters: z.number().int().nonnegative(),
  environments: z.number().int().nonnegative(),
  plannedSeconds: z.number(),
  targetSeconds: z.number().optional(),
  readyShots: z.number().int().nonnegative(),
  approvedShots: z.number().int().nonnegative(),
  pendingShots: z.number().int().nonnegative(),
  beats: z.number().int().nonnegative(),
  unusedBeats: z.array(z.string()),
  coverage: productionCoverageSchema.optional(),
});
export type ProductionSummaryState = z.infer<typeof productionSummarySchema>;

/**
 * A project's plan as read: the raw file (so an invalid one can be repaired), whether it validates,
 * every issue when it does not, and the summary only when it does.
 */
export const productionStateSchema = z.object({
  production: z.unknown().nullable(),
  valid: z.boolean(),
  issues: z.array(productionIssueSchema),
  summary: productionSummarySchema.nullable(),
  modified: z.number(),
  /** URL prefix the storyboard resolves media against, the same one the Player uses. */
  base: z.string(),
});
export type ProductionState = z.infer<typeof productionStateSchema>;

/** A save returns the canonical plan the server kept, with the revision it recorded. */
export const saveProductionResultSchema = productionStateSchema.extend({ revision: revisionSchema });
export type SaveProductionResult = z.infer<typeof saveProductionResultSchema>;

/** A dry run compiles in memory; applying it also writes the timeline and returns that revision. */
export const compileProductionResultSchema = z.object({
  dryRun: z.boolean(),
  summary: productionSummarySchema,
  notes: z.array(z.string()),
  changes: z.array(z.string()),
  composition: z.object({ scenes: z.number().int().nonnegative(), durationFrames: z.number().int().nonnegative(), fps: z.number().positive(), width: z.number().int().positive(), height: z.number().int().positive() }),
  revision: revisionSchema.optional(),
});
export type CompileProductionResult = z.infer<typeof compileProductionResultSchema>;

/* Library */
export const blockSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), category: z.string(), kind: z.enum(['scene', 'overlay']), durationFrames: z.number() }).passthrough();
export type Block = z.infer<typeof blockSchema>;
export const themeSchema = z.object({ id: z.string(), name: z.string(), description: z.string(), variables: z.record(z.string(), z.union([z.string(), z.number()])) });
export type Theme = z.infer<typeof themeSchema>;
export const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  durationFrames: z.number().optional(),
  durationSeconds: z.number().optional(),
  previewFrame: z.number().optional(),
}).passthrough();
export type TemplateSummary = z.infer<typeof templateSummarySchema>;
export const librarySchema = z.object({ blocks: z.array(blockSchema), themes: z.array(themeSchema), templates: z.array(templateSummarySchema), fonts: z.array(z.string()).optional() });
export type Library = z.infer<typeof librarySchema>;

/* Jobs and status */
export const jobKindSchema = z.enum(['thumbnail', 'compose', 'render', 'review', 'narrate', 'transcribe', 'image', 'batch', 'refine', 'import']);
export type JobKind = z.infer<typeof jobKindSchema>;
export const jobSchema = z.object({
  id: z.string(), kind: jobKindSchema, status: z.enum(['queued', 'running', 'done', 'error']), messages: z.array(z.string()), result: z.unknown().optional(),
  error: z.string().optional(), startedAt: z.number().optional(), endedAt: z.number().optional(),
});
export type Job = z.infer<typeof jobSchema>;
export const jobEnvelopeSchema = z.object({ job: jobSchema });
export const statusSchema = z.object({
  outDir: z.string(), jobs: z.array(jobSchema), error: z.string().nullable(),
  provider: z.object({ id: z.string(), model: z.string(), baseUrl: z.string(), capabilities: z.record(z.string(), z.boolean()) }).nullable(),
});
export type Status = z.infer<typeof statusSchema>;
/** What a finished job that wrote a file reports. */
export const resultFileSchema = z.object({ file: z.string(), relative: z.string(), url: z.string() });
export type ResultFile = z.infer<typeof resultFileSchema>;

/* Requests that change a project */
const id = z.string().min(1, 'project is required');
export const newProjectRequest = z.object({ name: z.string().trim().min(1, 'name is required'), kind: z.string().optional(), aspect: z.string().optional(), duration: z.union([z.string(), z.number()]).optional(), fps: z.union([z.string(), z.number()]).optional() });
export const renameRequest = z.object({ id, name: z.string().trim().min(1, 'name is required').max(120) });
export const idRequest = z.object({ id });
export const variablesRequest = z.object({ id, values: z.record(z.string(), z.unknown()) });
export const themeRequest = z.object({ id, theme: z.string().min(1, 'theme is required') });
export const textRequest = z.object({ id, path: z.string().min(1, 'path is required'), content: z.string().min(1, 'text is required') });
export const addBlockRequest = z.object({ id, block: z.string().min(1, 'block is required'), at: z.union([z.string(), z.number()]).optional(), frames: z.union([z.string(), z.number()]).optional(), scene: z.string().optional(), set: z.record(z.string(), z.unknown()).optional() });
export const restoreRequest = z.object({ file: z.string().min(1), n: z.number().int().min(1) });
export type NewProjectRequest = z.infer<typeof newProjectRequest>;

/* Production plan requests */
export const initProductionRequest = z.object({ id });
export const saveProductionRequest = z.object({
  id,
  production: z.record(z.string(), z.unknown()),
  /** The plan's modified time when it was read; a mismatch means another tab saved first. */
  baseModified: z.number().optional(),
});
export const compileProductionRequest = z.object({ id, dryRun: z.boolean().default(false) });

/** The first problem in a request, in the words the studio shows. */
export function parseRequest<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // A field that is missing altogether reads as "name is required", like one that is present but empty.
    if (issue && issue.code === 'invalid_type' && /received undefined/.test(issue.message)) throw new Error(`${issue.path.join('.') || 'request'} is required`);
    throw new Error(issue?.message ?? 'The request is not valid');
  }
  return parsed.data;
}
