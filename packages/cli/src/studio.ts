// Studio editing for `ove dev`: maps what is on screen back to the composition file and applies edits to it.
// Only layers written literally in the file can be edited. Layers produced by `repeat` or inside component definitions have no single
// place in the file, and values containing {{ }} come from variables, so those are shown read-only.
import type { Composition } from '@ove/schema';
export type TimelineLayer = { id: string; type: string; scene: string; depth: number; start: number; end: number; editable: boolean };
const plain = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
// Every layer object in the file's scenes with this id, skipping repeat bodies (their ids are templates) and component definitions.
export function findRawLayers(raw: unknown, id: string): Record<string, any>[] { const found: Record<string, any>[] = [];
  const walk = (list: unknown) => { if (!Array.isArray(list)) return; for (const item of list) { if (!plain(item) || 'repeat' in item) continue; if (item.id === id) found.push(item); walk(item.children); } };
  for (const scene of plain(raw) && Array.isArray(raw.scenes) ? raw.scenes : []) if (plain(scene) && !('repeat' in scene)) walk(scene.layers); return found; }
// The expanded composition's layers with absolute frame windows (clipped by scene and parent groups), in drawing order, for the timeline.
export function layerTimeline(composition: Composition, raw: unknown): TimelineLayer[] { const rows: TimelineLayer[] = [];
  const walk = (layers: any[], scene: string, offset: number, limit: number, depth: number) => { for (const layer of layers) { const start = offset + layer.startFrame, end = Math.min(limit, layer.endFrame === undefined ? limit : offset + layer.endFrame);
    rows.push({ id: layer.id, type: layer.type, scene, depth, start, end: Math.max(start, end), editable: findRawLayers(raw, layer.id).length === 1 }); if (layer.type === 'group') walk(layer.children ?? [], scene, start, end, depth + 1); } };
  for (const scene of composition.scenes) walk(scene.layers, scene.id, scene.startFrame, Math.min(scene.startFrame + scene.durationFrames, composition.durationFrames), 0); return rows; }
export type LayerEdit = { id: string; set?: Record<string, unknown>; unset?: string[] };
// Applies an edit to a copy of the raw composition. Only plain values (numbers, text, true/false) can be set, never id/type/children,
// and a value written as {{ }} stays as it is unless the edit replaces it on purpose.
export function applyLayerEdit(raw: unknown, edit: LayerEdit): unknown { const copy = structuredClone(raw); const matches = findRawLayers(copy, edit.id);
  if (matches.length === 0) throw new Error(`No layer "${edit.id}" is written directly in the file (layers from repeat or components can only be changed in their template)`);
  if (matches.length > 1) throw new Error(`${matches.length} layers have the id "${edit.id}"; give them unique ids to edit them here`);
  const layer = matches[0]!; for (const [key, value] of Object.entries(edit.set ?? {})) { if (['id','type','children','animations','use','with','each'].includes(key)) throw new Error(`"${key}" cannot be edited here`);
    if (!['number','string','boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`"${key}" must be a number, text or true/false`); layer[key] = value; }
  for (const key of edit.unset ?? []) { if (['id','type'].includes(key)) throw new Error(`"${key}" cannot be removed`); delete layer[key]; } return copy; }
export type SceneEdit = { id: string; set: { startFrame?: number; durationFrames?: number } };
/** Moves or resizes a scene written directly in the file's scenes list (not one made by repeat or a variable). */
export function applySceneEdit(raw: unknown, edit: SceneEdit): unknown { const copy = structuredClone(raw) as any;
  const scenes = (plain(copy) && Array.isArray(copy.scenes) ? copy.scenes : []).filter((scene: unknown) => plain(scene) && !('repeat' in scene) && scene.id === edit.id);
  if (scenes.length !== 1) throw new Error(scenes.length ? `${scenes.length} scenes have the id "${edit.id}"` : `No scene "${edit.id}" is written directly in the file`);
  for (const [key, value] of Object.entries(edit.set ?? {})) { if (key !== 'startFrame' && key !== 'durationFrames') throw new Error(`"${key}" cannot be changed here`);
    if (typeof value !== 'number' || !Number.isInteger(value) || value < (key === 'durationFrames' ? 1 : 0)) throw new Error(`"${key}" must be a whole number of frames`);
    if (typeof scenes[0][key] === 'string') throw new Error(`The scene's ${key} comes from a variable, so it can only be changed in the file`); scenes[0][key] = value; }
  return copy; }
export type KeyframeEdit = { id: string; animation: number; keyframe: number; frame: number };
/** Retimes one keyframe of a layer's animation (its frame counts from the layer's own start), keeping the keyframes in order. */
export function applyKeyframeEdit(raw: unknown, edit: KeyframeEdit): unknown { const copy = structuredClone(raw); const matches = findRawLayers(copy, edit.id);
  if (matches.length !== 1) throw new Error(matches.length ? `${matches.length} layers have the id "${edit.id}"` : `No layer "${edit.id}" is written directly in the file`);
  const animation = matches[0]!.animations?.[edit.animation], keyframe = animation?.keyframes?.[edit.keyframe];
  if (!plain(keyframe)) throw new Error('That keyframe is not written in the file (it may come from a preset or a variable)');
  if (typeof keyframe.frame !== 'number' || !Number.isInteger(edit.frame) || edit.frame < 0) throw new Error('The keyframe must stay on a whole frame, 0 or later');
  keyframe.frame = edit.frame; animation.keyframes.sort((a: any, b: any) => a.frame - b.frame); return copy; }
// Writes JSON with the file's own indentation (two spaces when it cannot be told), keeping its trailing newline.
export function formatLike(previous: string, value: unknown): string { const indent = /\n([ \t]+)"/.exec(previous)?.[1] ?? '  '; return JSON.stringify(value, null, indent) + (previous.endsWith('\n') || !previous ? '\n' : ''); }
