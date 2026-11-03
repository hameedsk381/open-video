// Blocks and themes: reusable, editable pieces of a video. A block is a scene (a title, a stat, a quote, a list…) or an overlay
// (a lower third, a badge…) written as a component with parameters, sized from the canvas so it fits any aspect ratio. `ove add`
// copies it into a composition as plain JSON (a component plus a placement), so it can be edited afterwards like anything else.
// A theme is a set of colour and style variables the blocks read ({{bg}}, {{text}}, {{accent}}…); `ove theme` switches them.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coerceVariable, loadComposition, variablesSchema, type VariableDeclaration } from '@ove/schema';

export const blocksDir = fileURLToPath(new URL('../blocks', import.meta.url));
export const themesDir = fileURLToPath(new URL('../themes', import.meta.url));

export type Block = { id: string; name: string; description: string; category: string; kind: 'scene' | 'overlay'; durationFrames: number;
  transition?: { type: string; durationFrames: number }; /** Scene settings the block brings along, such as a slow camera push. */ scene?: Record<string, unknown>; params: Record<string, VariableDeclaration>; layers: unknown[] };
export type Theme = { id: string; name: string; description: string; variables: Record<string, string | number> };

const idPattern = /^[a-z0-9][a-z0-9-]*$/;
const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
async function listJson<T extends { id: string }>(dir: string, kind: string): Promise<T[]> {
  const names = (await readdir(dir)).filter(name => name.endsWith('.json')).sort();
  const items = await Promise.all(names.map(name => readJson(join(dir, name)) as Promise<T>));
  for (const item of items) if (!idPattern.test(item.id)) throw new Error(`${kind} ids use lowercase letters, digits and dashes, not "${item.id}"`);
  return items;
}
export const listBlocks = (root = blocksDir) => listJson<Block>(root, 'Block');
export const listThemes = (root = themesDir) => listJson<Theme>(root, 'Theme');

export async function readBlock(id: string, root = blocksDir): Promise<Block> {
  const found = (await listBlocks(root)).find(block => block.id === id);
  if (!found) throw new Error(`There is no block "${id}". Run ove blocks to see them.`);
  return found;
}
export async function readTheme(id: string, root = themesDir): Promise<Theme> {
  const found = (await listThemes(root)).find(theme => theme.id === id);
  if (!found) throw new Error(`There is no theme "${id}". Run ove theme to see them.`);
  return found;
}

/** The variable names every block reads. */
export const themeTokens = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight'] as const;
const tokenType = (name: string) => name === 'radius' || name === 'headWeight' ? 'number' : 'color';

/** Sets the theme's values as the composition's variable defaults (other variables are left alone). */
export function applyTheme(raw: any, theme: Theme, only?: readonly string[]): any {
  raw.variables = { ...(raw.variables ?? {}) };
  for (const [name, value] of Object.entries(theme.variables)) {
    if (only && !only.includes(name)) continue;
    raw.variables[name] = { type: tokenType(name), default: value, description: raw.variables[name]?.description ?? `Theme: ${name}` };
  }
  return raw;
}

const componentName = (blockId: string) => blockId.replace(/-/g, '_');
const allIds = (raw: any): Set<string> => {
  const ids = new Set<string>();
  const walk = (layers: any[] = []) => { for (const layer of layers) { if (typeof layer?.id === 'string') ids.add(layer.id); walk(layer?.children); } };
  for (const scene of raw.scenes ?? []) { if (typeof scene?.id === 'string') ids.add(scene.id); walk(scene.layers); }
  return ids;
};
const uniqueId = (wanted: string, taken: Set<string>) => { let id = wanted, n = 1; while (taken.has(id)) id = `${wanted}-${++n}`; return id; };

/** `frames` sets how long a scene lasts, or how long an overlay stays (instead of the block's own length). */
export type AddOptions = { at?: number; frames?: number; scene?: string; id?: string; set?: Record<string, unknown> };
export type AddResult = { composition: any; placed: string; where: string };

/** Adds the block to the raw composition (a new scene, or an overlay inside a scene) and returns the checked result. */
export function addBlock(input: any, block: Block, options: AddOptions = {}): AddResult {
  const raw = structuredClone(input);
  applyTheme(raw, themeDefaults, themeTokens.filter(name => !(name in (raw.variables ?? {}))));
  raw.components = { ...(raw.components ?? {}) };
  const name = componentName(block.id);
  if (!raw.components[name]) raw.components[name] = { description: block.description, params: block.params, layers: block.layers };
  const declared = variablesSchema.parse(raw.components[name].params ?? {});
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options.set ?? {})) {
    const declaration = declared[key];
    if (!declaration) throw new Error(`${block.id} has no parameter "${key}" (it has ${Object.keys(declared).join(', ') || 'none'})`);
    values[key] = coerceVariable(`${block.id}.${key}`, declaration, value);
  }
  const taken = allIds(raw), id = uniqueId(options.id ?? block.id, taken);
  raw.scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  let where: string;
  if (block.kind === 'scene') {
    const scene: any = { id, name: block.name, durationFrames: options.frames ?? block.durationFrames, ...structuredClone(block.scene ?? {}), layers: [{ use: name, id: `${id}-block`, with: values }] };
    if (options.at !== undefined) scene.startFrame = options.at;
    if (block.transition && raw.scenes.length) scene.transitionIn = block.transition;
    raw.scenes.push(scene);
    where = `scene ${id}`;
  } else {
    const scene = options.scene ? raw.scenes.find((candidate: any) => candidate.id === options.scene) : raw.scenes[raw.scenes.length - 1];
    if (!scene) throw new Error(options.scene ? `There is no scene "${options.scene}"` : `${block.id} is an overlay and goes inside a scene; add a scene block first`);
    const start = options.at ?? 0, length = options.frames ?? block.durationFrames, end = Math.min(start + length, Number(scene.durationFrames) || start + length);
    if ('frames' in declared && !('frames' in values)) values.frames = Math.max(1, end - start);
    scene.layers = [...(scene.layers ?? []), { use: name, id, startFrame: start, endFrame: end, fixed: true, with: values }];
    where = `scene ${scene.id}, frames ${start}-${end}`;
  }
  // Keep a fixed length long enough for the scenes; "auto" lengths follow the scenes by themselves.
  const resolved = loadComposition({ ...raw, durationFrames: 'auto' });
  if (typeof raw.durationFrames === 'number') raw.durationFrames = Math.max(raw.durationFrames, resolved.durationFrames);
  loadComposition(raw);
  return { composition: raw, placed: id, where };
}

/** A new, empty composition of the given size for the first block to go into. */
export function emptyComposition(name: string, width: number, height: number, fps = 30): any {
  return { $schema: './composition.schema.json', version: '1.0', id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video', name, width, height, fps, durationFrames: 'auto', motionBlur: { samples: 4, shutter: 180 }, variables: {}, scenes: [] };
}

// The theme used for tokens a composition does not have yet. Kept in step with themes/midnight.json (a test checks it).
export const themeDefaults: Theme = { id: 'midnight', name: 'Midnight', description: '', variables: { bg: '#0b1020', surface: '#151c33', text: '#f5f7fb', muted: '#9aa6c4', accent: '#22d3ee', accent2: '#a78bfa', radius: 20, headWeight: 800 } };
