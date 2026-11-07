import type { Production, ProductionShot } from '@ove/contracts';

// The plan workspace reads production.json as a working document. These are the pure parts: how a server issue maps
// to a section, how a shot's media resolves to a URL, and how shots group into storyboard scenes.

export const planSections = ['brief', 'script', 'storyboard', 'shots', 'compile'] as const;
export type PlanSection = (typeof planSections)[number];

export const sectionLabels: Record<PlanSection, string> = {
  brief: 'Brief',
  script: 'Script',
  storyboard: 'Storyboard',
  shots: 'Shots',
  compile: 'Compile',
};

/** The section a validation issue belongs to, from its dotted path. */
export function sectionOf(path: string): PlanSection {
  const head = (path || '').split('.')[0];
  if (head === 'script') return 'script';
  if (head === 'shots') return 'shots';
  return 'brief';
}

export function issuesBySection(issues: { path: string }[]): Record<PlanSection, number> {
  const counts: Record<PlanSection, number> = { brief: 0, script: 0, storyboard: 0, shots: 0, compile: 0 };
  for (const issue of issues) counts[sectionOf(issue.path)]++;
  return counts;
}

const looksLikePath = (ref: string) => ref.includes('/') || /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov|mkv|wav|mp3|m4a|aac|ogg|flac|json|lottie)$/i.test(ref);

/** The file a shot's media reference points at: a registered asset's src, or the path itself. */
export function assetRef(production: Pick<Production, 'assets'>, ref?: string): string | undefined {
  if (!ref) return undefined;
  const asset = (production.assets ?? []).find(candidate => candidate.id === ref);
  const src = asset?.src ?? (looksLikePath(ref) ? ref : undefined);
  return src;
}

/** A URL the studio can render, resolved the same way the Player resolves project files. */
export function mediaUrl(base: string, production: Pick<Production, 'assets'>, ref?: string): string | undefined {
  const src = assetRef(production, ref);
  if (!src) return undefined;
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
  return `${base}${src.replace(/^\.\//, '')}`;
}

export function shotMedia(production: Pick<Production, 'assets'>, base: string, shot: ProductionShot): { kind: 'image' | 'video'; url: string } | undefined {
  const image = mediaUrl(base, production, shot?.media?.image);
  if (image) return { kind: 'image', url: image };
  const video = mediaUrl(base, production, shot?.media?.video);
  return video ? { kind: 'video', url: video } : undefined;
}

/** Consecutive shots that share a scene are one storyboard card group. */
export function groupShots(production: Pick<Production, 'shots'>): { sceneId: string; shots: ProductionShot[] }[] {
  const groups: { sceneId: string; shots: ProductionShot[] }[] = [];
  for (const shot of Array.isArray(production.shots) ? production.shots : []) {
    const sceneId = String(shot?.sceneId ?? 'scene');
    const last = groups[groups.length - 1];
    if (last && last.sceneId === sceneId) last.shots.push(shot);
    else groups.push({ sceneId, shots: [shot] });
  }
  return groups;
}

export const planSeconds = (production: Pick<Production, 'shots'>) =>
  Math.round((production.shots ?? []).reduce((total, shot) => total + (Number(shot?.durationSeconds) || 0), 0) * 10) / 10;

/** A new shot that keeps the shot ids unique, ready for the shots editor. */
export function newShot(production: Pick<Production, 'shots'>, sceneId = 'scene'): ProductionShot {
  const used = new Set((production.shots ?? []).map(shot => shot?.id));
  let n = (production.shots ?? []).length + 1;
  while (used.has(`shot-${n}`)) n++;
  return {
    id: `shot-${n}`, sceneId, name: 'New shot', action: 'Describe what happens on screen', durationSeconds: 2,
    characterIds: [], propIds: [], camera: { shotSize: 'medium', angle: 'eye-level', movement: 'static' },
  };
}
