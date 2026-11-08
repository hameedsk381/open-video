// Revision history for AI-written compositions: every compose, refine and restore keeps the composition file as it was written, in
// history/<name>/0001.json beside it, with an index of what produced it and what changed. Nothing is ever overwritten without a
// copy, so a refine that went wrong is one restore away. Files are plain JSON, so they diff and commit like any other.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

export type RevisionKind = 'baseline' | 'compose' | 'refine' | 'edit' | 'import' | 'restore';
export type Revision = {
  n: number;
  /** File name inside the history folder. */
  file: string;
  at: string;
  kind: RevisionKind;
  /** The brief or instruction, or a note such as "Before AI changes". */
  label: string;
  /** The whole brief a compose was given, so "make another like this" starts from the words that made this video. */
  brief?: string;
  provider?: string;
  model?: string;
  template?: string;
  attempts?: number;
  frames: number;
  scenes: number;
  /** What differs from the previous revision, in a few short phrases. */
  changes: string[];
  restoredFrom?: number;
};
export type RevisionMeta = { kind: RevisionKind; label: string; brief?: string; provider?: string; model?: string; template?: string; attempts?: number; restoredFrom?: number };

const historyDir = (compositionFile: string) => join(dirname(resolve(compositionFile)), 'history', basename(compositionFile).replace(/\.json$/i, ''));
const indexFile = (compositionFile: string) => join(historyDir(compositionFile), 'index.json');
const pad = (n: number) => String(n).padStart(4, '0');
const readText = (file: string) => readFile(file, 'utf8').then(text => text, () => undefined);

export async function listRevisions(compositionFile: string): Promise<Revision[]> {
  const text = await readText(indexFile(compositionFile));
  if (!text) return [];
  try { const list = JSON.parse(text); return Array.isArray(list) ? list : []; } catch { return []; }
}

const scenesOf = (composition: any): any[] => Array.isArray(composition?.scenes) ? composition.scenes : [];
const shotsOf = (production: any): any[] => Array.isArray(production?.shots) ? production.shots : [];
const isProduction = (raw: any): boolean => Array.isArray(raw?.shots);
const defaults = (composition: any): Record<string, unknown> => Object.fromEntries(Object.entries(composition?.variables ?? {}).map(([name, declaration]: [string, any]) => [name, JSON.stringify(declaration?.default)]));

/** A few short phrases about what changed between two production manifests. */
export function summarizeProductionChange(previous: any, next: any): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  const [before, after] = [shotsOf(previous), shotsOf(next)];
  if (before.length !== after.length) changes.push(`shots ${before.length} → ${after.length}`);
  const ids = (list: any[]) => new Set(list.map(shot => shot?.id));
  const added = after.filter(shot => !ids(before).has(shot?.id)).map(shot => shot?.id), removed = before.filter(shot => !ids(after).has(shot?.id)).map(shot => shot?.id);
  if (added.length) changes.push(`added ${added.join(', ')}`);
  if (removed.length) changes.push(`removed ${removed.join(', ')}`);

  const groups = (list: any[]) => new Set(list.map(shot => shot?.sceneId).filter(id => typeof id === 'string'));
  const [wasScenes, nowScenes] = [groups(before), groups(after)];
  if (wasScenes.size !== nowScenes.size) changes.push(`scenes ${wasScenes.size} → ${nowScenes.size}`);

  const seconds = (list: any[]) => list.reduce((total, shot) => total + (Number(shot?.durationSeconds) || 0), 0);
  const length = (list: any[]) => Number(seconds(list).toFixed(1));
  if (length(before) !== length(after)) changes.push(`length ${length(before)} s → ${length(after)} s`);

  const format = (production: any) => production?.format ?? {};
  const [was, now] = [format(previous), format(next)];
  if (was.width !== now.width || was.height !== now.height) changes.push(`size ${was.width}x${was.height} → ${now.width}x${now.height}`);
  if (was.fps !== now.fps) changes.push(`fps ${was.fps} → ${now.fps}`);

  const beats = (production: any) => new Set((production?.script?.beats ?? []).map((beat: any) => beat?.id));
  const [wasBeats, nowBeats] = [beats(previous), beats(next)];
  if (wasBeats.size !== nowBeats.size) changes.push(`script beats ${wasBeats.size} → ${nowBeats.size}`);
  else if ([...nowBeats].some(id => !wasBeats.has(id))) changes.push('script beats reordered or renamed');

  const [wasTarget, nowTarget] = [previous?.brief?.targetDurationSeconds, next?.brief?.targetDurationSeconds];
  if (wasTarget !== nowTarget) changes.push(wasTarget === undefined ? `target ${nowTarget} s` : nowTarget === undefined ? `target removed (was ${wasTarget} s)` : `target ${wasTarget} s → ${nowTarget} s`);

  if (!changes.length && JSON.stringify(previous) !== JSON.stringify(next)) changes.push('plan edited');
  return changes.slice(0, 6);
}

/** A few short phrases about what changed between two compositions. */
export function summarizeChange(previous: any, next: any): string[] {
  if (!previous) return [];
  const changes: string[] = [];
  const [before, after] = [scenesOf(previous), scenesOf(next)];
  if (before.length !== after.length) changes.push(`scenes ${before.length} → ${after.length}`);
  const ids = (list: any[]) => new Set(list.map(scene => scene?.id));
  const added = after.filter(scene => !ids(before).has(scene?.id)).map(scene => scene?.id), removed = before.filter(scene => !ids(after).has(scene?.id)).map(scene => scene?.id);
  if (added.length) changes.push(`added ${added.join(', ')}`);
  if (removed.length) changes.push(`removed ${removed.join(', ')}`);
  if (previous.durationFrames !== next.durationFrames) changes.push(`length ${previous.durationFrames} → ${next.durationFrames} frames`);
  if (previous.width !== next.width || previous.height !== next.height) changes.push(`size ${previous.width}x${previous.height} → ${next.width}x${next.height}`);
  const [was, now] = [defaults(previous), defaults(next)];
  const edited = Object.keys(now).filter(name => name in was && was[name] !== now[name]);
  if (edited.length) changes.push(`values changed: ${edited.slice(0, 6).join(', ')}${edited.length > 6 ? ` and ${edited.length - 6} more` : ''}`);
  if (!changes.length && JSON.stringify(previous) !== JSON.stringify(next)) changes.push('layers or timing edited');
  return changes.slice(0, 6);
}

/** Keeps the composition file as it is now as the next revision. */
export async function saveRevision(compositionFile: string, meta: RevisionMeta): Promise<Revision> {
  const text = await readFile(resolve(compositionFile), 'utf8');
  const composition = JSON.parse(text.replace(/^﻿/, ''));
  const list = await listRevisions(compositionFile);
  const last = list.at(-1);
  const previous = last ? JSON.parse((await readText(join(historyDir(compositionFile), last.file))) ?? 'null') : undefined;
  const n = (last?.n ?? 0) + 1;
  const production = isProduction(composition);
  const fps = Number(composition?.format?.fps) || 30;
  const frames = production ? Math.round(shotsOf(composition).reduce((total, shot) => total + (Number(shot?.durationSeconds) || 0), 0) * fps) : Number(composition?.durationFrames) || 0;
  const scenes = production ? new Set(shotsOf(composition).map(shot => shot?.sceneId).filter(id => typeof id === 'string')).size : scenesOf(composition).length;
  const revision: Revision = { n, file: `${pad(n)}.json`, at: new Date().toISOString(), ...meta, frames, scenes, changes: production ? summarizeProductionChange(previous, composition) : summarizeChange(previous, composition) };
  await mkdir(historyDir(compositionFile), { recursive: true });
  await writeFile(join(historyDir(compositionFile), revision.file), text);
  await writeFile(indexFile(compositionFile), JSON.stringify([...list, revision], null, 2) + '\n');
  return revision;
}

/** Before an AI change replaces a composition that has no history yet, keeps what is there as revision 1. */
export async function ensureBaseline(compositionFile: string): Promise<Revision | undefined> {
  if ((await listRevisions(compositionFile)).length || (await readText(resolve(compositionFile))) === undefined) return undefined;
  return saveRevision(compositionFile, { kind: 'baseline', label: 'Before AI changes' });
}

/** Makes revision n the current composition (and records that as a new revision, so nothing is lost). */
export async function restoreRevision(compositionFile: string, n: number): Promise<Revision> {
  const found = (await listRevisions(compositionFile)).find(revision => revision.n === n);
  if (!found) throw new Error(`There is no revision ${n}`);
  await copyFile(join(historyDir(compositionFile), found.file), resolve(compositionFile));
  return saveRevision(compositionFile, { kind: 'restore', label: `Restored revision ${n}`, restoredFrom: n });
}

/** Reads the raw text and parsed object of revision n. */
export async function readRevisionRaw(compositionFile: string, n: number): Promise<{ raw: any; revision: Revision } | undefined> {
  const list = await listRevisions(compositionFile);
  const found = list.find(revision => revision.n === n);
  if (!found) return undefined;
  const text = await readText(join(historyDir(compositionFile), found.file));
  if (!text) return undefined;
  try {
    return { raw: JSON.parse(text), revision: found };
  } catch {
    return undefined;
  }
}

