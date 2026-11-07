// Reusable composition templates shipped with the CLI. Each folder holds a normal project (composition.json plus any
// assets) and a template.json describing how to show it. `ove init --template` copies one; `ove ai studio` previews it,
// fills its variables and writes a project. Template ids are folder names, so they never contain a path separator.
import { cp, readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadComposition, variablesSchema } from '@ove/schema';
import { listBlocks, listThemes } from './blocks';
import { reactFromPlan } from './react-video';
import { buildRegistry, composeSmart as routeComposition, type AiProvider, type ComposeOptions, type Registry, type SmartMode, type SmartResult, type TemplateChoice, type TemplateSource } from '@ove/ai';

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
 * Everything the router in @ove/ai needs that only the CLI knows: the template folders shipped with this package, the
 * themes next to them, the capability list built from both, and the copy that moves a template's own pictures and
 * sounds next to the project being written.
 */
export const cliTemplateSource: TemplateSource = {
  templates: () => templateChoices(),
  themes: () => listThemes(),
  registry: cliRegistry,
  copyAssets: async (templateId, destDir) => {
    const safe = assertTemplateId(templateId);
    const candidates = [join(templatesDir, safe), resolve(process.cwd(), 'templates', safe)];
    let lastError: NodeJS.ErrnoException | undefined;
    for (const dir of candidates) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'template.json' || entry.name === 'composition.json' || entry.name === 'composition.schema.json') continue;
          await cp(join(dir, entry.name), join(destDir, entry.name), { recursive: true, force: true });
        }
        return;
      } catch (error) {
        lastError = error as NodeJS.ErrnoException;
      }
    }
    throw lastError ?? new Error(`there is no template folder to copy "${safe}" from`);
  },
};

/**
 * Compose with this CLI's own templates and themes; the routing itself lives in @ove/ai so every host shares it.
 * `allowReact` adds the React authoring route, and only surfaces that run on the user's own machine may pass it: the
 * generated component executes JavaScript inside the renderer.
 */
export async function composeSmart(provider: AiProvider, options: ComposeOptions, mode: SmartMode = {}, allowReact = false): Promise<SmartResult> {
  return routeComposition(provider, options, allowReact
    ? { ...cliTemplateSource, react: (plan, reactOptions, reactMode) => reactFromPlan(provider, plan, reactOptions, reactMode) }
    : cliTemplateSource, mode);
}
