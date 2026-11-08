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
  compile: 'Build',
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

/** The take a shot is carrying: attached media wins, then a completed or approved generation. */
function takeRef(production: Pick<Production, 'assets'>, shot: ProductionShot): string | undefined {
  const generation = shot?.generation;
  if (!generation?.assetId || (generation.status !== 'completed' && generation.status !== 'approved')) return undefined;
  return declaredAsset(production, generation.assetId);
}

function assetKind(production: Pick<Production, 'assets'>, ref: string): 'image' | 'video' | undefined {
  const asset = (production.assets ?? []).find(candidate => candidate.id === ref);
  if (!asset) return undefined;
  if (asset.type === 'image') return 'image';
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(asset.src) ? 'image' : 'video';
}

export function shotMedia(production: Pick<Production, 'assets'>, base: string, shot: ProductionShot): { kind: 'image' | 'video'; url: string } | undefined {
  const take = takeRef(production, shot);
  const kind = take ? assetKind(production, take) : undefined;
  const image = mediaUrl(base, production, shot?.media?.image ?? (kind === 'image' ? take : undefined));
  if (image) return { kind: 'image', url: image };
  const video = mediaUrl(base, production, shot?.media?.video ?? (kind === 'video' ? take : undefined));
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

/* ==================== takes ==================== */

export type TakeStatus = 'planned' | 'queued' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected' | 'ready';
export type TakeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'purple';

const takeLabels: Record<TakeStatus, string> = {
  planned: 'Planned',
  queued: 'Queued',
  generating: 'Generating',
  completed: 'Take ready',
  failed: 'Failed',
  approved: 'Approved take',
  rejected: 'Rejected',
  ready: 'Footage ready',
};

const takeTones: Record<TakeStatus, TakeTone> = {
  planned: 'neutral',
  queued: 'blue',
  generating: 'amber',
  completed: 'purple',
  failed: 'red',
  approved: 'green',
  rejected: 'neutral',
  ready: 'green',
};

export type TakeInfo = {
  status: TakeStatus;
  label: string;
  tone: TakeTone;
  /** The asset that would become the approved take, when the plan can approve one. */
  assetId?: string;
  canApprove: boolean;
  canReject: boolean;
};

const declaredAsset = (production: Pick<Production, 'assets'>, ref?: string): string | undefined =>
  ref && (production.assets ?? []).some(asset => asset.id === ref) ? ref : undefined;

/** Only a clip is a take; a still is attached media and compiles without an approval step. */
const declaredTake = (production: Pick<Production, 'assets'>, ref?: string): string | undefined =>
  (production.assets ?? []).some(asset => asset.id === ref && asset.type === 'video') ? ref : undefined;

/**
 * A shot's take: the generator's status when there is one, otherwise whatever footage is attached, otherwise planned.
 * Approval is only offered for a clip declared in the plan, because the schema records an approved take as an assetId.
 */
export function shotTake(production: Pick<Production, 'assets'>, shot: ProductionShot): TakeInfo {
  const status = (shot?.generation?.status ?? (shot?.media ? 'ready' : 'planned')) as TakeStatus;
  const assetId = declaredAsset(production, shot?.generation?.assetId ?? shot?.media?.video ?? shot?.media?.image);
  return {
    status,
    label: takeLabels[status] ?? 'Planned',
    tone: takeTones[status] ?? 'neutral',
    assetId,
    canApprove: declaredTake(production, assetId) !== undefined && status !== 'approved',
    canReject: shot?.generation !== undefined && status !== 'rejected',
  };
}

export type PlanReview = {
  total: number;
  /** Shots that compile to footage: attached media or an approved take. */
  ready: number;
  approved: number;
  /** Shots that compile as a text card. */
  pending: number;
  /** Shots that have a take to approve. */
  unreviewed: number;
  missingCopy: string[];
  unusedBeats: string[];
};

/** The numbers the storyboard header and the co-pilot read from the plan. */
export function planReview(production: Pick<Production, 'shots' | 'script' | 'assets'>): PlanReview {
  const shots = Array.isArray(production.shots) ? production.shots : [];
  const beats: any[] = Array.isArray((production.script as any)?.beats) ? (production.script as any).beats : [];
  const used = new Set(shots.map(shot => shot?.beatId).filter((id): id is string => typeof id === 'string'));
  return {
    total: shots.length,
    ready: shots.filter(shot => shot?.media !== undefined || shot?.generation?.status === 'approved').length,
    approved: shots.filter(shot => shot?.generation?.status === 'approved').length,
    pending: shots.filter(shot => !shot?.media && shot?.generation?.status !== 'approved').length,
    unreviewed: shots.filter(shot => shotTake(production, shot).canApprove).length,
    missingCopy: shots.filter(shot => !shot?.onScreen?.trim()).map(shot => shot.id),
    unusedBeats: beats.map(beat => beat.id).filter(id => !used.has(id)),
  };
}

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
