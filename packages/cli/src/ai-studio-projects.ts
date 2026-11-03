// Project helpers for the AI Studio: what is in the out folder, how a project's text can be edited, and safe names. A project is a
// folder with a composition.json. A "template" project still has its variables and components, so its text and theme can be changed
// in place; a "finished" one has everything written out, so its text is edited layer by layer.
import { cp, mkdir, readdir, readFile, rename, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { listRevisions } from '@ove/ai';
import type { Project } from '@ove/contracts';
import { coerceVariable, loadComposition, resolveVariables, variablesSchema, type Composition } from '@ove/schema';

export type ProjectSummary = Project;
export type TextLayer = { path: string; scene: string; id: string; content: string; fontSize: number };

const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
export const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';
const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));

/** Template when a scene still places components with `use`, so variables decide the text; finished when everything is written out. */
export function projectMode(raw: unknown): 'template' | 'finished' {
  if (!plain(raw) || !plain(raw.components)) return 'finished';
  const uses = (layers: unknown): boolean => Array.isArray(layers) && layers.some(layer => plain(layer) && ('use' in layer || uses(layer.children)));
  return Array.isArray(raw.scenes) && raw.scenes.some((scene: any) => uses(scene?.layers)) ? 'template' : 'finished';
}

export async function listProjects(root: string): Promise<ProjectSummary[]> {
  const found: ProjectSummary[] = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const file = join(root, entry.name, 'composition.json');
    try {
      const [raw, info] = [await readJson(file), await stat(file)], composition = loadComposition(raw);
      found.push({ id: entry.name, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions').length, modified: info.mtimeMs, revisions: (await listRevisions(file)).length, mode: projectMode(raw) });
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

/** A folder name nobody has used yet under `root`: `name`, then `name-2`, `name-3`. */
export async function uniqueFolder(root: string, base: string): Promise<string> {
  const taken = new Set((await readdir(root).catch(() => [])).map(String));
  let id = base, n = 1;
  while (taken.has(id)) id = `${base}-${++n}`;
  return id;
}

export async function copyProject(root: string, id: string, to: string): Promise<void> {
  await cp(resolve(root, id), resolve(root, to), { recursive: true, filter: source => !/[\\/](history|\.studio)([\\/]|$)/.test(source) });
}
/** "Deleting" moves a project into .trash so it can be brought back by hand. */
export async function trashProject(root: string, id: string): Promise<string> {
  const trash = join(root, '.trash'); await mkdir(trash, { recursive: true });
  const target = join(trash, `${id}-${Date.now()}`); await rename(resolve(root, id), target); return target;
}

export const assetKinds: Record<string, string> = { '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio', '.aac': 'audio', '.flac': 'audio' };
export async function listAssets(dir: string): Promise<{ name: string; path: string; kind: string; bytes: number }[]> {
  const folder = join(dir, 'assets'), files = await readdir(folder).catch(() => [] as string[]), out: { name: string; path: string; kind: string; bytes: number }[] = [];
  for (const name of files) { const kind = assetKinds[name.slice(name.lastIndexOf('.')).toLowerCase()]; if (!kind) continue; out.push({ name, path: `assets/${name}`, kind, bytes: (await stat(join(folder, name))).size }); }
  return out;
}
