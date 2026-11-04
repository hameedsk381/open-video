// Reusable composition templates shipped with the CLI. Each folder holds a normal project (composition.json plus any
// assets) and a template.json describing how to show it. `ove init --template` copies one; `ove ai studio` previews it,
// fills its variables and writes a project. Template ids are folder names, so they never contain a path separator.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadComposition, variablesSchema } from '@ove/schema';
import { listBlocks, listThemes } from './blocks';
import { buildRegistry, composeFromTemplate, composeVideo, narrate, narrateScenes, planBuild, type BuildPlan, type NarrateOptions, type NarrateResult, type AiProvider, type ComposeOptions, type ComposeResult, type Registry, type TemplateChoice } from '@ove/ai';

export const templatesDir = fileURLToPath(new URL('../templates', import.meta.url));

export type TemplateVariable = {
  name: string;
  type: string;
  default?: unknown;
  description?: string;
  /** list variables: the fields each item has, so a form can show one input per field */
  items?: Record<string, { type: string; default?: unknown; description?: string }>;
};
export type TemplateInfo = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  brief?: string;
  width: number;
  height: number;
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  previewFrame: number;
  variables: TemplateVariable[];
  order: number;
};
export type TemplateFile = { dir: string; info: TemplateInfo; composition: Record<string, unknown> };

const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));

/** Template ids name a folder, so anything with a separator or a dot is refused before it can reach the filesystem. */
export function assertTemplateId(id: string): string {
  if (!idPattern.test(id)) throw new Error(`Template ids use lowercase letters, digits and dashes, not "${id}"`);
  return id;
}

function infoFrom(id: string, meta: any, composition: any): TemplateInfo {
  // Resolving the defaults checks the whole template and turns "durationFrames": "auto" into the real length.
  let resolved;
  try { resolved = loadComposition(composition); }
  catch (error) { throw new Error(`Template "${id}" is not a valid composition: ${(error as Error).message}`); }
  const { width, height, fps, durationFrames } = resolved;
  if (!(width > 0 && height > 0 && fps > 0 && durationFrames > 0)) throw new Error(`Template "${id}" has no valid width, height, fps or durationFrames`);
  const declarations = variablesSchema.parse(composition?.variables ?? {});
  const variables: TemplateVariable[] = Object.entries(declarations).map(([name, declaration]) => ({
    name, type: declaration.type, default: declaration.default, description: declaration.description,
    items: declaration.type === 'list' ? declaration.items : undefined,
  }));
  const preview = Number(meta?.previewFrame);
  return {
    id,
    name: typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : id,
    description: typeof meta?.description === 'string' ? meta.description : '',
    tags: Array.isArray(meta?.tags) ? meta.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
    brief: typeof meta?.brief === 'string' ? meta.brief : undefined,
    width, height, fps, durationFrames,
    durationSeconds: durationFrames / fps,
    previewFrame: Number.isInteger(preview) ? Math.min(Math.max(0, preview), durationFrames - 1) : Math.floor(durationFrames / 2),
    variables,
    order: Number.isFinite(Number(meta?.order)) ? Number(meta.order) : 100,
  };
}

/** Reads one template. `template.json` is required, so the starter project (which has none) is not listed as a template. */
export async function readTemplate(id: string, root = templatesDir): Promise<TemplateFile> {
  const safe = assertTemplateId(id);
  const dir = join(root, safe);
  const [meta, composition] = await Promise.all([readJson(join(dir, 'template.json')), readJson(join(dir, 'composition.json'))]);
  return { dir, info: infoFrom(safe, meta, composition), composition: composition as Record<string, unknown> };
}

/** Every template folder that has a template.json, in catalogue order. */
export async function listTemplates(root = templatesDir): Promise<TemplateInfo[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const ids = entries.filter(entry => entry.isDirectory() && idPattern.test(entry.name)).map(entry => entry.name);
  const templates: TemplateInfo[] = [];
  for (const id of ids) {
    try { templates.push((await readTemplate(id, root)).info); }
    catch (error) {
      // The starter and any folder without template.json are ordinary projects, not catalogue entries.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
  }
  return templates.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** Every template with its composition, in the shape `composeFromTemplate` reads. */
export async function templateChoices(root = templatesDir): Promise<TemplateChoice[]> {
  const infos = await listTemplates(root);
  return Promise.all(infos.map(async info => {
    const { composition } = await readTemplate(info.id, root);
    const declared = (composition.variables ?? {}) as Record<string, unknown>;
    return { themed: 'bg' in declared && 'accent2' in declared, id: info.id, name: info.name, description: info.description, width: info.width, height: info.height, durationSeconds: info.durationSeconds, variables: info.variables, composition };
  }));
}

/**
 * The capability registry built from this package's own catalogues: templates, themes and blocks plus the built-in
 * effects, sounds and the React kit that @ove/ai adds by itself. Read by the planner and `ove ai capabilities`.
 */
export async function cliRegistry(): Promise<Registry> {
  const [choices, themes, blocks] = await Promise.all([templateChoices(), listThemes(), listBlocks()]);
  return buildRegistry({
    templates: choices.map(choice => ({ id: choice.id, name: choice.name, description: choice.description, width: choice.width, height: choice.height, durationSeconds: choice.durationSeconds, themed: choice.themed,
      variables: choice.variables.map(variable => ({ name: variable.name, type: variable.type, description: variable.description })) })),
    themes: themes.map(theme => ({ id: theme.id, name: theme.name, description: theme.description })),
    blocks: blocks.map(block => ({ id: block.id, name: block.name, description: block.description, category: block.category, kind: block.kind, durationFrames: block.durationFrames })),
  });
}

/**
 * Compose by filling a ready-made template — the primary path, chosen whenever a template's kind and aspect fit the
 * brief — and write the whole composition only when that cannot work: `full` was asked for, assets or batch fields
 * were supplied (templates use neither), no template has the wanted shape, or the model finds none that suits the
 * brief. Before either path, the planner (plan.ts) decides the route and, for a JSON video, supplies the beats the
 * composition must follow. Planning failure or `--no-plan` keeps the same template-first routing.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, mode: { full?: boolean; noPlan?: boolean; registry?: Registry } = {}): Promise<ComposeResult & { template?: string; source?: Record<string, unknown> }> {
  // Templates take pictures but not sounds or clips, and have no batch fields; anything else needs a full composition.
  const needsFull = mode.full || !!options.fields?.length || (options.assets ?? []).some(asset => asset.type !== 'image');
  let plan: BuildPlan | undefined;
  if (!mode.noPlan) {
    const registry = mode.registry ?? await cliRegistry();
    try { plan = await planBuild(provider, { ...options, registry, maxAttempts: Math.min(options.maxAttempts ?? 2, 2) }); }
    catch (error) { options.onProgress?.(`Planning skipped (${(error as Error).message.split('\n')[0]}); using the built-in routing.`); }
  }
  // A refusal to plan keeps the safest pre-planner behaviour: try the template catalogue first, else write from scratch.
  const templatePath = plan ? plan.path === 'template' : !needsFull;
  if (templatePath && !needsFull) {
    try {
      const choices = await templateChoices();
      const picked = plan?.template ? choices.filter(choice => choice.id === plan.template) : choices;
      const themes = plan?.theme ? (await listThemes()).filter(theme => theme.id === plan!.theme) : await listThemes();
      const filled = await composeFromTemplate(provider, picked.length ? picked : choices, { ...options, themes });
      if (filled) {
        return { composition: filled.composition, source: filled.source, attempts: filled.attempts + (plan ? 1 : 0), issues: [], warnings: filled.warnings, template: filled.template };
      }
      options.onProgress?.('No template suits this brief; writing a full composition.');
    } catch (error) {
      options.onProgress?.(`Template mode failed (${(error as Error).message.split('\n')[0]}); writing a full composition.`);
    }
  }
  // The planner's beats become the motion plan the composition must follow, so planning is never wasted.
  const motionPlan = plan && plan.path !== 'template' ? { idea: plan.idea, beats: plan.beats } : undefined;
  return composeVideo(provider, { ...options, plan: options.plan || motionPlan !== undefined, motionPlan });
}

/**
 * Narrate a composed video. A template video is cut to the voiceover (one spoken line per scene, scenes as long as their line);
 * a free-form composition gets one script over the whole video, as before.
 */
export async function narrateSmart(provider: AiProvider, composed: { template?: string }, options: NarrateOptions & { brief: string; composition: NonNullable<NarrateOptions['composition']> }): Promise<NarrateResult> {
  if (composed.template) {
    try {
      const voiced = await narrateScenes(provider, options.composition, { brief: options.brief, outDir: options.outDir, compositionPath: options.compositionPath, voice: options.voice, language: options.language, signal: options.signal, onProgress: options.onProgress });
      return { audio: voiced.audio, captions: voiced.captions, durationSeconds: voiced.durationSeconds, words: voiced.words, composition: voiced.composition, text: voiced.text };
    } catch (error) {
      options.onProgress?.(`Scene-by-scene voiceover failed (${(error as Error).message.split('\n')[0]}); narrating one script over the video.`);
    }
  }
  return narrate(provider, options);
}
