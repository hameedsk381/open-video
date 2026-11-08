import { colorPattern, parseComposition, productionSchema, transitionStyles, type Composition, type Production } from '@ove/schema';

// Compiles a production manifest into the rendering timeline. This is an editing step, not an art-direction step: it
// places each shot at its start frame, hands footage or a planned text card to the renderer, and carries the script,
// palette and soundtrack across. Design stays with the authoring paths (React, JSON, the model); this only has to be
// truthful about what exists. Shots without approved footage compile to a card from their onScreen copy, so a plan can
// be watched before a single clip is generated.

export type ProductionSummary = {
  shots: number;
  scenes: string[];
  characters: number;
  environments: number;
  plannedSeconds: number;
  targetSeconds?: number;
  readyShots: number;
  approvedShots: number;
  pendingShots: number;
  beats: number;
  unusedBeats: string[];
  coverage: ProductionCoverage;
};

export type CompiledProduction = { composition: Composition; notes: string[] };

// ---- coverage: is everything the production needs actually there? ----

export type RequirementStatus = 'missing' | 'candidate' | 'approved';
export type ShotCoverage = {
  shotId: string;
  required: number; approved: number; candidate: number; missing: number;
  /** none: nothing is required of this shot; blocked: something is missing; review: nothing is missing but something awaits approval; ready: all approved */
  state: 'none' | 'blocked' | 'review' | 'ready';
  needs: { requirementId: string; role: string; status: RequirementStatus; instruction?: string }[];
};
export type EntityCoverage = { id: string; kind: 'character' | 'environment' | 'prop'; references: number; required: number; approved: number; missing: number };
export type Outstanding = { requirementId: string; role: string; strategy: string; status: RequirementStatus; instruction?: string; shotId?: string; entityId?: string; beatId?: string };
export type ProductionCoverage = {
  total: number; approved: number; candidate: number; missing: number;
  /** Whole percent of requirements approved. Undefined while nothing is required: an unplanned production is not "100% ready". */
  percent?: number;
  shots: ShotCoverage[];
  entities: EntityCoverage[];
  /** Beats no requirement is aimed at, directly or through a shot that renders them. Meaningful once requirements exist. */
  beatsWithoutRequirements: string[];
  /** Everything not yet approved, the missing ones first. */
  outstanding: Outstanding[];
};

/**
 * What the production still lacks, computed from its requirements and their approval, never from how many files exist: an uploaded picture
 * that nobody approved for its job does not make a shot ready. A requirement for a character, environment or prop applies to every shot
 * that uses it; one for a beat applies to the shot that renders it.
 */
export function productionCoverage(production: Production): ProductionCoverage {
  const requirements = production.requirements ?? [];
  const applies = (requirement: (typeof requirements)[number], shot: Production['shots'][number]) => {
    const { shotId, entityId, beatId } = requirement.purpose;
    return shotId === shot.id
      || (entityId !== undefined && (shot.characterIds.includes(entityId) || shot.environmentId === entityId || shot.propIds.includes(entityId)))
      || (beatId !== undefined && beatId === shot.beatId);
  };
  const tally = (list: typeof requirements) => ({ approved: list.filter(r => r.status === 'approved').length, candidate: list.filter(r => r.status === 'candidate').length, missing: list.filter(r => r.status === 'missing').length });

  const shots: ShotCoverage[] = production.shots.map(shot => {
    const mine = requirements.filter(requirement => applies(requirement, shot)), counts = tally(mine);
    return {
      shotId: shot.id, required: mine.length, ...counts,
      state: !mine.length ? 'none' : counts.missing ? 'blocked' : counts.candidate ? 'review' : 'ready',
      needs: mine.map(requirement => ({ requirementId: requirement.id, role: requirement.role, status: requirement.status, ...(requirement.instruction ? { instruction: requirement.instruction } : {}) })),
    };
  });

  const entity = (kind: EntityCoverage['kind'], item: { id: string; referenceAssets: unknown[] }): EntityCoverage => {
    const mine = requirements.filter(requirement => requirement.purpose.entityId === item.id);
    return { id: item.id, kind, references: item.referenceAssets.length, required: mine.length, approved: tally(mine).approved, missing: tally(mine).missing };
  };
  const entities = [
    ...production.characters.map(item => entity('character', item)),
    ...production.environments.map(item => entity('environment', item)),
    ...production.props.map(item => entity('prop', item)),
  ];

  const covered = new Set<string>();
  for (const requirement of requirements) if (requirement.purpose.beatId !== undefined) covered.add(requirement.purpose.beatId);
  for (const shot of production.shots) if (shot.beatId !== undefined && requirements.some(requirement => applies(requirement, shot))) covered.add(shot.beatId);

  const order: Record<RequirementStatus, number> = { missing: 0, candidate: 1, approved: 2 };
  const outstanding: Outstanding[] = requirements.filter(requirement => requirement.status !== 'approved')
    .sort((a, b) => order[a.status] - order[b.status])
    .map(requirement => ({ requirementId: requirement.id, role: requirement.role, strategy: requirement.strategy, status: requirement.status, ...(requirement.instruction ? { instruction: requirement.instruction } : {}), ...requirement.purpose }));

  const total = tally(requirements);
  return {
    total: requirements.length, ...total,
    ...(requirements.length ? { percent: Math.floor((total.approved / requirements.length) * 100) } : {}),
    shots, entities,
    beatsWithoutRequirements: (production.script?.beats ?? []).map(beat => beat.id).filter(id => !covered.has(id)),
    outstanding,
  };
}

export function productionSummary(production: Production): ProductionSummary {
  const beats = production.script?.beats ?? [];
  const used = new Set(production.shots.map(shot => shot.beatId).filter((id): id is string => id !== undefined));
  return {
    shots: production.shots.length,
    scenes: [...new Set(production.shots.map(shot => shot.sceneId))],
    characters: production.characters.length,
    environments: production.environments.length,
    plannedSeconds: production.shots.reduce((total, shot) => total + shot.durationSeconds, 0),
    targetSeconds: production.brief.targetDurationSeconds,
    readyShots: production.shots.filter(shot => shot.media !== undefined || shot.generation?.status === 'approved').length,
    approvedShots: production.shots.filter(shot => shot.generation?.status === 'approved').length,
    pendingShots: production.shots.filter(shot => !shot.media && shot.generation?.status !== 'approved').length,
    beats: beats.length,
    unusedBeats: beats.map(beat => beat.id).filter(id => !used.has(id)),
    coverage: productionCoverage(production),
  };
}

/**
 * Reads an existing timeline back into a plan: one shot per scene, keeping its picture, sound, copy and transition.
 * The plan is deliberately plain — this is a starting point to edit, not a reconstruction of the bespoke design.
 */
export function scaffoldProduction(composition: Composition): Production {
  const scenes = composition.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions');
  if (!scenes.length) throw new Error('This video has no scenes to plan');

  const first = (layers: any[], type: string): any | undefined => {
    for (const layer of layers) {
      if (!layer || typeof layer !== 'object') continue;
      if (layer.type === type) return layer;
      if (Array.isArray(layer.children)) { const found = first(layer.children, type); if (found) return found; }
    }
    return undefined;
  };
  const textOf = (layer: any): string => typeof layer?.content === 'string' ? layer.content : Array.isArray(layer?.spans) ? layer.spans.map((span: any) => span?.text ?? '').join('') : '';
  const seconds = (frames: number) => Math.max(0.001, Math.round((frames / composition.fps) * 1000) / 1000);

  const shots: any[] = scenes.map(scene => {
    const text = textOf(first(scene.layers as any[], 'text')).trim();
    const video = first(scene.layers as any[], 'video'), image = first(scene.layers as any[], 'image'), audio = first(scene.layers as any[], 'audio');
    const transition = scene.transitionIn?.type;
    return {
      id: scene.id, sceneId: scene.id, name: scene.name, action: scene.name, durationSeconds: seconds(scene.durationFrames),
      ...(text ? { onScreen: text } : {}),
      ...(transition && (transitionStyles as readonly string[]).includes(transition) ? { transition } : {}),
      ...(video ? { media: { video: video.src } } : image ? { media: { image: image.src } } : {}),
      ...(audio ? { audio: { src: audio.src, volume: Number(audio.volume) || 1 } } : {}),
    };
  });

  let script: any = composition.content;
  if (!script) {
    script = { beats: shots.map(shot => ({ id: shot.id, name: shot.name, onScreen: shot.onScreen ?? shot.action })) };
    for (const shot of shots) shot.beatId = shot.id;
  } else if (script.beats?.length === shots.length) {
    shots.forEach((shot: any, index: number) => { shot.beatId = script.beats[index].id; });
  }

  const style: any = {};
  if (typeof composition.background === 'string' && colorPattern.test(composition.background)) style.palette = { bg: composition.background };
  if (composition.texture && composition.texture.type !== 'none') style.texture = composition.texture.type;

  const format = composition.export?.format;
  const audio = composition.export?.audio;
  return productionSchema.parse({
    id: composition.id, name: composition.name, brief: {
      prompt: composition.content?.promise ?? composition.name, audience: composition.content?.audience,
      targetDurationSeconds: seconds(composition.durationFrames), notes: 'Started from the existing timeline.',
    },
    format: { width: composition.width, height: composition.height, fps: composition.fps },
    ...(Object.keys(style).length ? { style } : {}),
    script, shots, assets: composition.assets,
    ...(audio ? { audio: { music: audio, volume: composition.export.audioVolume, duck: composition.export.duck !== undefined } } : {}),
    export: {
      ...(format === 'mp4' || format === 'webm' || format === 'mov' ? { format } : {}),
      ...(composition.export.loudness !== undefined ? { loudness: composition.export.loudness } : {}),
      ...(composition.grain ? { grain: composition.grain } : {}),
    },
  });
}

export function compileProduction(production: Production): CompiledProduction {
  const { width, height, fps } = production.format;
  const style = production.style;
  const assetIds = new Set(production.assets.map(asset => asset.id));
  const font = style?.fonts?.display ?? 'Inter';
  const ink = style?.palette?.text ?? '#f4f1ea';
  const notes: string[] = [];
  const scenes: any[] = [];
  let startFrame = 0;

  for (const shot of production.shots) {
    const durationFrames = Math.max(1, Math.round(shot.durationSeconds * fps));
    const approved = shot.generation?.status === 'approved' ? shot.generation.assetId : undefined;
    const video = shot.media?.video ?? approved;
    const image = shot.media?.image;
    const fit = shot.media?.fit ?? 'cover';
    const layers: any[] = [];

    if (video) {
      layers.push({ id: `${shot.id}-media`, type: 'video', src: video, width, height, objectFit: fit, muted: shot.media ? !shot.media.audio : true, startFrame: 0, endFrame: durationFrames });
    } else if (image) {
      layers.push({ id: `${shot.id}-media`, type: 'image', src: image, width, height, objectFit: fit, startFrame: 0, endFrame: durationFrames });
    }
    if ((video || image) && shot.onScreen) {
      const fontSize = Math.round(Math.min(width, height) * 0.05);
      layers.push({ id: `${shot.id}-copy`, type: 'text', content: shot.onScreen, x: width * 0.08, y: height * 0.62, width: width * 0.64, maxWidth: width * 0.64, textAlign: 'left',
        fontSize, lineHeight: 1.1, fontFamily: font, fontWeight: 600, color: ink, startFrame: 0, endFrame: durationFrames });
    }
    if (!video && !image) {
      const copy = shot.onScreen ?? shot.action;
      const fontSize = Math.round(Math.min(width, height) * (shot.onScreen ? 0.055 : 0.04));
      layers.push({ id: `${shot.id}-card`, type: 'text', content: copy, x: width / 2, y: height / 2 - fontSize * 0.6, width: width * 0.8, maxWidth: width * 0.8, textAlign: 'center',
        fontSize, lineHeight: 1.15, fontFamily: font, fontWeight: shot.onScreen ? 600 : 400, color: ink, startFrame: 0, endFrame: durationFrames });
      notes.push(`Shot "${shot.id}" has no footage yet: its ${shot.onScreen ? 'onScreen copy' : 'action'} is compiled as a text card.`);
    }
    if (shot.audio) layers.push({ id: `${shot.id}-audio`, type: 'audio', src: shot.audio.src, volume: shot.audio.volume, startFrame: 0, endFrame: durationFrames });

    const transition = shot.transition ?? (scenes.length ? style?.transition : undefined);
    scenes.push({
      id: shot.id,
      name: shot.name ?? shot.sceneId,
      startFrame,
      durationFrames,
      ...(shot.beatId ? { beat: shot.beatId } : {}),
      ...(transition ? { transitionIn: { type: transition, durationFrames: Math.min(12, Math.max(1, Math.round(durationFrames / 3))) } } : {}),
      layers,
      metadata: { sceneId: shot.sceneId, action: shot.action, emotion: shot.emotion, camera: shot.camera, characterIds: shot.characterIds, environmentId: shot.environmentId, propIds: shot.propIds, generation: shot.generation },
      assetIds: [video, image, shot.audio?.src].filter((src): src is string => typeof src === 'string' && assetIds.has(src)),
    });
    startFrame += durationFrames;
  }

  const planned = startFrame / fps, target = production.brief.targetDurationSeconds;
  if (target !== undefined && Math.abs(planned - target) > 0.5) notes.push(`The shot list runs ${planned.toFixed(1)} s; the brief asked for ${target} s.`);
  const used = new Set(production.shots.map(shot => shot.beatId));
  for (const beat of production.script?.beats ?? []) if (!used.has(beat.id)) notes.push(`Script beat "${beat.id}" is not rendered by any shot.`);

  const composition = {
    version: '1.0', id: production.id, name: production.name, width, height, fps, durationFrames: startFrame,
    assets: production.assets, scenes,
    background: style?.palette?.bg ?? '#101827',
    ...(style?.texture ? { texture: { type: style.texture, color: ink, opacity: 0.06 } } : {}),
    ...(production.script ? { content: production.script } : {}),
    ...(production.export?.grain !== undefined ? { grain: production.export.grain } : {}),
    export: {
      ...(production.export?.format ? { format: production.export.format } : {}),
      ...(production.export?.loudness !== undefined ? { loudness: production.export.loudness } : {}),
      ...(production.audio?.music ? { audio: production.audio.music, audioVolume: production.audio.volume, ...(production.audio.duck ? { duck: {} } : {}) } : {}),
    },
  };
  return { composition: parseComposition(composition), notes };
}
