// What a project means to the studio, read from its composition: a summary for the list, the text that can be edited, and the variables. A
// "template" project still has its variables and components, so its text and theme can be changed in place; a "finished" one has everything
// written out, so its text is edited layer by layer. Where projects are kept is @ove/storage's business, not this file's.
import type { Project } from '@ove/contracts';
import { coerceVariable, loadComposition, resolveVariables, variablesSchema, type Composition } from '@ove/schema';
import type { Principal, ProjectStore } from '@ove/storage';

export type ProjectSummary = Project;
export type TextLayer = { path: string; scene: string; id: string; content: string; fontSize: number };

const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Template when a scene still places components with `use`, so variables decide the text; finished when everything is written out. */
export function projectMode(raw: unknown): 'template' | 'finished' {
  if (!plain(raw) || !plain(raw.components)) return 'finished';
  const uses = (layers: unknown): boolean => Array.isArray(layers) && layers.some(layer => plain(layer) && ('use' in layer || uses(layer.children)));
  return Array.isArray(raw.scenes) && raw.scenes.some((scene: any) => uses(scene?.layers)) ? 'template' : 'finished';
}

export async function listProjects(store: ProjectStore, who: Principal): Promise<ProjectSummary[]> {
  const found: ProjectSummary[] = [];
  for (const id of await store.ids(who)) {
    try {
      const raw = await store.readRaw(who, id), composition = loadComposition(raw);
      found.push({ id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions').length, modified: await store.modified(who, id), revisions: (await store.revisions(who, id)).length, mode: projectMode(raw) });
    } catch { /* not a project, or one that does not load: left out of the list */ }
  }
  return found.sort((a, b) => b.modified - a.modified);
}

/** Every text layer of a finished composition, with the path to it, in drawing order. */
export function textLayers(composition: Composition): TextLayer[] {
  const rows: TextLayer[] = [];
  const walk = (layers: any[], base: string, scene: string) => layers.forEach((layer, i) => {
    const path = `${base}[${i}]`;
    if (layer.type === 'text') { const content = typeof layer.content === 'string' && layer.content ? layer.content : Array.isArray(layer.spans) ? layer.spans.map((span: any) => span.text).join('') : ''; if (content) rows.push({ path, scene, id: layer.id, content, fontSize: layer.fontSize }); }
    if (Array.isArray(layer.children)) walk(layer.children, `${path}.children`, scene);
  });
  composition.scenes.forEach((scene, i) => walk(scene.layers as any[], `scenes[${i}].layers`, scene.name));
  return rows;
}

/** The variables a template project lets you change, with their current values. */
export function projectVariables(raw: any) {
  const declarations = variablesSchema.parse(raw?.variables ?? {});
  const values = resolveVariables(declarations, {});
  return Object.entries(declarations).map(([name, declaration]) => ({ name, type: declaration.type, description: declaration.description, items: declaration.items, value: values[name] }));
}

/** A copy of the raw template with new default values for variables it declares (and nothing else changed). */
export function setVariableValues(raw: any, values: Record<string, unknown>): any {
  const next = structuredClone(raw), declarations = variablesSchema.parse(next.variables ?? {});
  for (const [name, value] of Object.entries(values)) {
    const declaration = declarations[name];
    if (!declaration) throw new Error(`"${name}" is not something this video lets you change`);
    next.variables[name] = { ...next.variables[name], default: coerceVariable(name, declaration, value) };
  }
  loadComposition(next);
  return next;
}
