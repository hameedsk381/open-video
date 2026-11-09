// Which pictures, clips and sounds an AI-written composition may refer to. A model (or a pasted answer) must not be able to point a
// layer at a file nobody gave it, such as a private picture elsewhere on the disk: the video would embed it when rendered.
import { isBuiltinSound, loadComposition, type Composition } from '@ove/core';

/**
 * assets: the supplied assets, id to src. srcs: other sources that are fine as they are (used when changing an existing composition).
 * relativeInside: also allow relative paths that cannot leave the project folder (for pasted JSON, where nothing is supplied).
 */
export type AssetPolicy = { assets: Map<string, string>; srcs?: Set<string>; relativeInside?: boolean };

// Not absolute, no drive letter or URL scheme (C:, https:, data:), and no ".." step: it stays inside the folder it is relative to.
const staysInside = (src: string) => !/^([a-z][a-z0-9+.-]*:|[\\/])/i.test(src) && !src.split(/[\\/]/).includes('..');

/** Problems with the assets a composition declares or uses, in the wording used to ask the model to fix them. */
export function assetProblems(composition: Composition, policy: AssetPolicy): string[] {
  const problems: string[] = [];
  const known = [...policy.assets.keys()].join(', ') || 'none';
  const sources = new Set([...policy.assets.values(), ...(policy.srcs ?? [])]);
  const fine = (src: string) => isBuiltinSound(src) || policy.assets.has(src) || sources.has(src) || (policy.relativeInside === true && staysInside(src));
  const declared = new Set<string>();
  for (const asset of composition.assets) {
    declared.add(asset.id);
    if (policy.assets.get(asset.id) !== asset.src && !fine(asset.src)) problems.push(`Asset "${asset.id}" uses src "${asset.src}", which is not one of the supplied assets (${known}).`);
  }
  const check = (src: string, what: string) => { if (!declared.has(src) && !fine(src)) problems.push(`${what} uses src "${src}", which is not one of the supplied assets (${known}).`); };
  const walk = (layers: any[]) => {
    for (const layer of layers ?? []) {
      if (!layer || typeof layer !== 'object') continue;
      if (layer.type === 'code' || layer.type === 'react' || layer.type === 'p5') problems.push(`Layer "${layer.id}" is a ${layer.type === 'react' ? 'React' : 'code'} layer; AI-written and pasted compositions cannot contain code, so use text, shapes, html or shader layers instead.`);
      if (['image', 'video', 'audio', 'lottie', 'model', 'captions'].includes(layer.type)) check(String(layer.src ?? ''), `Layer "${layer.id}"`);
      if (layer.type === 'group') walk(layer.children ?? []);
    }
  };
  for (const scene of composition.scenes) walk(scene.layers as any[]);
  if (composition.export.audio !== undefined) check(composition.export.audio, 'export.audio');
  return problems;
}

// Every "src" string in a JSON tree.
function collectSources(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) { for (const item of value) collectSources(item, into); return; }
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(object)) { if (key === 'src' && typeof child === 'string') into.add(child); else collectSources(child, into); }
}

/**
 * The policy for changing a composition that already exists: what it already declares and uses stays allowed (read both as written
 * and with its templates expanded), plus anything newly supplied; anything else is new and refused.
 */
export function refinePolicy(current: unknown, supplied: { id: string; src: string }[] = []): AssetPolicy {
  const assets = new Map<string, string>(), srcs = new Set<string>(), existing = current as any;
  for (const asset of Array.isArray(existing?.assets) ? existing.assets : []) if (typeof asset?.id === 'string' && typeof asset?.src === 'string') assets.set(asset.id, asset.src);
  for (const asset of supplied) assets.set(asset.id, asset.src);
  collectSources(current, srcs);
  try { collectSources(loadComposition(structuredClone(current)), srcs); } catch { /* a composition that does not load only narrows what is known */ }
  if (typeof existing?.export?.audio === 'string') srcs.add(existing.export.audio);
  return { assets, srcs };
}

/**
 * The sources in a composition that point outside the project folder it is rendered from: absolute paths, drive letters,
 * UNC paths, ".." steps, and network addresses. The renderer reads what a source names from the machine it runs on, so on a
 * shared volume such a source is another person's file. Built-in sounds and inline data are fine. Pass the *resolved*
 * composition: a template variable can carry a path into a "src" that the saved JSON only shows as "{{photo}}".
 */
export function escapingSources(composition: unknown): string[] {
  const found = new Set<string>();
  collectSources(composition, found);
  const audio = (composition as any)?.export?.audio;
  if (typeof audio === 'string') found.add(audio);
  return [...found].filter(src => !isBuiltinSound(src) && !/^data:/i.test(src) && !staysInside(src));
}

/** Throws, in words a person can act on, when the composition refers to files outside its own project. */
export function assertSourcesConfined(composition: unknown): void {
  const escaping = escapingSources(composition);
  if (!escaping.length) return;
  const shown = escaping.slice(0, 3).map(src => `"${src.length > 60 ? `${src.slice(0, 57)}...` : src}"`).join(', ');
  throw new Error(`This video refers to files outside its own project (${shown}${escaping.length > 3 ? `, and ${escaping.length - 3} more` : ''}). Here a video can use only the pictures, clips and sounds uploaded to it.`);
}

/** A declared asset that is one of the supplied ones gets the supplied src, however the model spelled it. */
export function restoreSuppliedSources(raw: any, supplied: { id: string; type?: string; src: string }[] = []): void {
  if (!Array.isArray(raw?.assets)) return;
  for (const asset of raw.assets) {
    const match = asset && typeof asset === 'object' ? supplied.find(item => item.id === asset.id) : undefined;
    if (match) { asset.src = match.src; if (match.type && !asset.type) asset.type = match.type; }
  }
}
