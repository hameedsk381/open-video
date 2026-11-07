// Scene-scoped orchestration: instead of one big model call for the whole composition — the calls that stall for
// tens of seconds on rate-limited gateways and miscount global constraints ("exactly 2 scenes" came back as one) —
// a small style-contract call, one small call per scene, and a deterministic stitch that owns all timing. Each scene
// call lands in the gateway's fast path (0.2-2 s), fails independently (a bad scene costs its own retry, not the
// video), and the stitch enforces palette, fonts, durations and camera by construction. The calls run in beat order
// on purpose: each scene continues from the previous one's exit, which is what keeps the story coherent. Any failure
// throws, and the caller falls back to the proven single-call path — so the mock provider and offline runs keep
// working untouched.
import { safeZoneBands } from '@ove/core';
import { layoutStyles, motionPresets, textureTypes, transitionStyles, type ContentDatum, type DesignLook, type VideoContent } from '@ove/schema';
import type { AiProvider, ChatMessage } from './providers';
import { extractJson } from './json';
import type { MotionPlan } from './prompt';

export type StyleContract = {
  background: string;
  text: string;
  primary: string;
  accent: string;
  secondary: string;
  fonts: { heading: string; body: string };
  /** One motion move per beat, e.g. "word-cascade". */
  moves: string[];
  style: string;
  /** Entrance preset for kinetic headlines. */
  motion: string;
  /** Transition every cut uses. */
  transition: string;
  layout: string;
  density: number;
  texture?: { type: string; color: string; opacity: number; scale: number };
};

export type ScenesBeat = { name: string; onScreen?: string; motion?: string; seconds?: number; narration?: string; data?: ContentDatum[]; id?: string };

export type ScenesPlan = {
  beats: ScenesBeat[];
  contract: StyleContract;
  /** Frames per scene — decided by code, never by the model. */
  durations: number[];
  /** Where each scene sits on the timeline, for mapping review issues back to scenes. */
  sceneRanges: { start: number; end: number }[];
};

/** `notes` is index-aligned with `scenes`: what each scene reply had to be changed into to become usable. */
export type ScenesState = { plan: ScenesPlan; raw: any; scenes: any[]; notes: string[][] };

export type ScenesOptions = {
  brief: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  assets?: { id: string; src: string; type: string }[];
  /** The planner's art direction: palette, fonts, texture, motion, transition, layout and density. */
  look?: DesignLook;
  /** The fixed script: its beats replace whatever the contract call invents, and their copy is final. */
  content?: VideoContent;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

const hex6 = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const match = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(value.trim());
  if (!match) return undefined;
  const digits = match[1]!;
  return `#${(digits.length === 3 ? digits.split('').map(c => c + c).join('') : digits).toLowerCase()}`;
};

const text = (value: unknown, fallback = ''): string => (typeof value === 'string' && value.trim() ? value.trim() : fallback);

/** The beats come back with the contract; 2-8 beats, each with a name. */
export function parseBeats(raw: unknown): ScenesBeat[] {
  if (!Array.isArray(raw)) return [];
  const beats: ScenesBeat[] = [];
  for (const item of raw.slice(0, 8)) {
    const name = text((item as any)?.name);
    if (!name) continue;
    beats.push({ name, onScreen: text((item as any)?.onScreen) || undefined, motion: text((item as any)?.motion) || undefined });
  }
  return beats;
}

const pick = (value: unknown, options: readonly string[], fallback: string): string => {
  const wanted = text(value).toLowerCase().replace(/[-_]+/g, ' ');
  return options.find(option => option.toLowerCase() === wanted) ?? fallback;
};
const ratio = (value: unknown, fallback: number): number => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
};

/** Turns the model's raw contract reply into a valid StyleContract; anything missing or malformed gets a house default.
 *  A planner look, when present, wins over the contract's own palette, fonts and design choices. */
export function parseContract(raw: any, look?: DesignLook): StyleContract {
  if (!raw || typeof raw !== 'object') throw new Error('the style contract reply was not a JSON object');
  const palette = raw.palette && typeof raw.palette === 'object' ? raw.palette : {};
  const fonts = raw.fonts && typeof raw.fonts === 'object' ? raw.fonts : {};
  const moves = Array.isArray(raw.moves) ? raw.moves.map((move: unknown) => text(move)).filter(Boolean) : [];
  const fallbackMoves = ['rise-in', 'ken-burns', 'pop-in', 'drift', 'wipe-reveal', 'word-cascade'];
  const beats = parseBeats(raw.beats);
  const motion = pick(look?.motion ?? raw.motion, motionPresets, 'rise');
  const transition = pick(look?.transition ?? raw.transition, transitionStyles, 'fade');
  const layout = pick(look?.layout ?? raw.layout, layoutStyles, 'left');
  const densityIn = Number(raw.density);
  const density = look?.density ?? (Number.isFinite(densityIn) ? Math.max(0.75, Math.min(1.25, densityIn)) : 1);
  const textureIn = raw.texture && typeof raw.texture === 'object' ? raw.texture : undefined;
  const textureType = pick(look?.texture?.type ?? textureIn?.type, textureTypes, 'none');
  const texture = textureType === 'none' ? undefined : {
    type: textureType,
    color: hex6(look?.texture?.color) ?? hex6(textureIn?.color) ?? '#ffffff',
    opacity: ratio(look?.texture?.opacity ?? textureIn?.opacity, 0.05),
    scale: Math.max(6, Number(look?.texture?.scale ?? textureIn?.scale) || 48),
  };
  return {
    background: hex6(look?.palette?.bg) ?? hex6(palette.background) ?? '#0b0e14',
    text: hex6(look?.palette?.text) ?? hex6(palette.text) ?? '#f8fafc',
    primary: hex6(look?.palette?.accent) ?? hex6(palette.primary) ?? '#6366f1',
    accent: hex6(look?.palette?.accent2) ?? hex6(palette.accent) ?? '#ec4899',
    secondary: hex6(look?.palette?.muted) ?? hex6(palette.secondary) ?? '#22d3ee',
    fonts: { heading: look?.fonts?.display ?? text(fonts.heading, 'Inter'), body: look?.fonts?.body ?? text(fonts.body, look?.fonts?.display ?? text(fonts.heading, 'Inter')) },
    moves: beats.map((_, i) => moves[i] ?? fallbackMoves[i % fallbackMoves.length]!),
    style: text(raw.style, 'clean modern motion'),
    motion,
    transition,
    layout,
    density,
    texture,
  };
}

/**
 * The fade each scene shares with the one before it, in frames. A fixed wall-clock length, so a transition looks the
 * same whatever the fps — and the reason durations must overshoot the timeline: the loader starts every scene this
 * much before the previous one ends.
 */
export function sceneOverlap(fps: number): number {
  return Math.max(1, Math.round(0.27 * fps));
}

/** One overlap per scene; the first scene has none, because nothing precedes it. */
export function sceneOverlaps(count: number, fps: number): number[] {
  return Array.from({ length: count }, (_, index) => (index === 0 ? 0 : sceneOverlap(fps)));
}

/**
 * Frames per scene, decided entirely by code: weighted by each beat's `seconds` (a deterministic jitter keeps the
 * lengths unequal when the model gives every beat the same weight, which the craft checks require), scaled so the
 * stitched timeline lands on the exact requested length, with rounding drift absorbed without dropping any scene
 * below the 1.2 s floor.
 */
export function sceneDurations(beats: ScenesBeat[], durationSeconds: number, fps: number): number[] {
  const count = Math.max(1, beats.length);
  const jitter = [1, 1.2, 0.85, 1.1, 0.95, 1.15, 0.9, 1.05];
  const sameWeight = new Set(beats.map(beat => (typeof beat.seconds === 'number' && Number.isFinite(beat.seconds) && beat.seconds > 0 ? beat.seconds : 1))).size === 1;
  const weights = beats.map((beat, i) => {
    const seconds = typeof beat.seconds === 'number' && Number.isFinite(beat.seconds) && beat.seconds > 0 ? beat.seconds : 1;
    return count > 1 && sameWeight ? seconds * jitter[i % jitter.length]! : seconds;
  });
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const totalFrames = Math.max(count, Math.round(durationSeconds * fps));
  // The timeline overlaps the scenes, so the durations must overshoot it by the whole overlap budget — otherwise the
  // video comes out that many frames shorter than the brief asked for.
  const targetFrames = totalFrames + sceneOverlap(fps) * Math.max(0, count - 1);
  // The 1.2 s floor is a craft preference; the requested length is the contract. Beats that cannot all fit above the
  // floor share the timeline instead of the video silently growing past the request.
  const minFrames = Math.min(Math.max(1, Math.round(1.2 * fps)), Math.floor(targetFrames / count));
  const frames = weights.map(weight => Math.max(minFrames, Math.round(weight / totalWeight * targetFrames)));
  let drift = frames.reduce((sum, value) => sum + value, 0) - targetFrames;
  const order = frames.map((value, i) => [value, i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    while (drift > 0 && frames[i]! > minFrames) {
      frames[i]!--;
      drift -= 1;
    }
    if (drift <= 0) break;
  }
  for (const [, i] of order) {
    while (drift < 0) {
      frames[i]! += 1;
      drift += 1;
    }
    if (drift >= 0) break;
  }
  return frames;
}

/** Where each scene sits on the timeline (the loader's rule: each starts where the previous ends, minus its overlap). */
export function sceneRanges(durations: number[], overlaps: number[] = []): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let end = 0;
  for (const [i, frames] of durations.entries()) {
    const start = i === 0 ? 0 : Math.max(0, end - (overlaps[i] ?? 0));
    end = start + frames;
    ranges.push({ start, end });
  }
  return ranges;
}

const contractMessages = (options: ScenesOptions, plan?: MotionPlan): ChatMessage[] => {
  const beatLines = plan?.beats?.length
    ? plan.beats.map((beat, i) => `${i + 1}. ${beat.name}${beat.onScreen ? `: ${beat.onScreen}` : ''}`).join('\n')
    : undefined;
  const lookValue = plan?.look ?? options.look;
  const look = lookValue && Object.keys(lookValue).length ? `\nA look was decided earlier; use it exactly (palette, fonts, texture, motion, transition, layout, density): ${JSON.stringify(lookValue)}` : '';
  return [
    { role: 'system', content: 'You are a motion-design director. Reply with ONE JSON object and nothing else.' },
    { role: 'user', content: `Brief: ${options.brief.trim()}
${beatLines ? `The video follows these beats:\n${beatLines}\n` : 'Split the brief into 3-6 short beats (one idea each, unequal weight).\n'}
Decide the visual system all scenes will share${look ? ', following the look above' : ' — the subject decides it, not a house style'}. Reply ONLY JSON:
{ "beats": [{ "name": "...", "onScreen": "what is on screen, concretely", "seconds": 3 }],
  "palette": { "background": "#hex", "text": "#hex", "primary": "#hex", "accent": "#hex", "secondary": "#hex" },
  "fonts": { "heading": "Inter|Space Grotesk|Fraunces|Archivo|Source Sans 3", "body": "<family>" },
  "moves": ["one motion move per beat, e.g. word-cascade, ken-burns, pop-in, rise-in, drift, wipe-reveal"],
  "motion": "rise|blur|slide|pop|fade",
  "transition": "push|fade|slide|wipe|zoom|dip",
  "layout": "left|center|split|editorial",
  "density": 1,
  "texture": { "type": "none|grid|dots|scanlines|paper", "color": "#hex", "opacity": 0.04 },
  "style": "3-6 words on the visual mood" }${look}` },
  ];
};

const sceneMessages = (contract: StyleContract, beat: ScenesBeat, index: number, total: number, frames: number, previous: string | undefined, options: ScenesOptions): ChatMessage[] => {
  const assets = (options.assets ?? []).filter(asset => asset.type === 'image');
  const margin = Math.round(options.width * 0.08 * contract.density);
  // The areas a player's own chrome covers come from the same table the review checks against, including its
  // letterbox math — a landscape canvas has no bands, and the prompt must not invent rules the renderer ignores.
  const bands = safeZoneBands(options.width, options.height);
  const platformUi = bands.length ? ` ${bands.map(band => band.hint).join('. ')}.` : '';
  const arrangement = contract.layout === 'center' ? 'centre the content symmetrically'
    : contract.layout === 'split' ? 'create two-column tension: the headline on one side, supporting content on the other'
    : contract.layout === 'editorial' ? 'use an asymmetric grid with generous margins and oversized type'
    : 'align content to a straight left edge';
  return [
    { role: 'system', content: `You design ONE scene of a ${options.width}x${options.height} motion-graphics video (${options.fps} fps). Reply with ONE JSON object and nothing else:
{ "background": { "type": "color", "color": "#hex from the palette" },
  "layers": [ ...2 to 4 layers... ] }

Layer shapes (x and y are the layer's CENTRE in pixels):
- text: { "type": "text", "text": "...", "x": <centre x>, "y": <centre y>, "fontSize": <px>, "color": "#hex from the palette", "fontFamily": "<the heading or body font>", "align": "center", "split": { "by": "words", "stagger": 4, "preset": "${contract.motion}" }, "animations": [{ "property": "y", "keyframes": [{ "frame": 0, "value": <y+80> }, { "frame": 20, "value": <y>, "easing": "land" }] }] }
- rect: { "type": "rect", "x": ..., "y": ..., "width": ..., "height": ..., "radius": ..., "fill": "#hex from the palette", "opacity": 0.2, "animations": [...] }
- circle: { "type": "circle", "x": ..., "y": ..., "width": ..., "height": ..., "fill": "#hex from the palette", "opacity": 0.25, "animations": [...] }${assets.length ? `
- image: { "type": "image", "src": "<one of the asset srcs below, verbatim>", "x": ..., "y": ..., "width": ..., "height": ..., "animations": [...] }` : ''}

House rules:
- Use ONLY the palette colours: background ${contract.background}, text ${contract.text}, primary ${contract.primary}, accent ${contract.accent}, secondary ${contract.secondary}.
- Fonts: headings in ${contract.fonts.heading}, supporting text in ${contract.fonts.body}.
- Layout: ${arrangement}.
- Keep every layer fully inside the frame: x within ${margin}-${options.width - margin}, y within ${margin}-${options.height - margin}.${platformUi}
- The scene's headline (largest text) MUST carry "split": { "by": "words", "stagger": 4, "preset": "${contract.motion}" }.
- Every layer MUST have at least one animation. An animation is { "property": "x"|"y"|"opacity"|"rotation"|"scale"|"fontSize"|"blur", "keyframes": [{ "frame": 0, "value": <start> }, { "frame": <end>, "value": <end value>, "easing": "land" }] } — keyframes are relative to the scene start (frame 0), the easing sits on the keyframe being arrived at, and every frame must stay within the scene's ${frames} frames. Easings: land, snap, glide, pop, drift, spring, easeInOut.
- Headline fontSize about ${Math.round(options.height * 0.09)} px, supporting text about ${Math.round(options.height * 0.045)} px.
- Decoration (rect/circle) stays subtle: opacity at most 0.35, behind the text.` },
    { role: 'user', content: `Scene ${index + 1} of ${total} — "${beat.name}"${beat.onScreen ? `: ${beat.onScreen}` : ''}.${beat.data?.length ? `\nFigures to show exactly as written (change no number, add none): ${beat.data.map(datum => `${datum.label}: ${datum.value}${datum.unit ? ` ${datum.unit}` : ''}${datum.period ? ` (${datum.period})` : ''}`).join('; ')}.` : ''}${beat.narration ? `\nThe spoken line (do not put it on screen): ${beat.narration}` : ''}
Motion: ${beat.motion ?? contract.moves[index] ?? 'a clean entrance'}. Scene length: ${frames} frames (~${(frames / options.fps).toFixed(1)} s).${assets.length ? `\nAvailable image assets (use src verbatim): ${assets.map(asset => asset.src).join(' | ')}` : ''}${previous ? `\nThe previous scene ends on: ${previous}. Do not repeat it; continue the story.` : 'This is the opening scene: land the hook fast.'}
Design this scene. Reply ONLY the scene JSON.` },
  ];
};

const COLOR_PROPS = new Set(['fill', 'color', 'stroke']);
const VALID_PROPERTIES = new Set([
  'x', 'y', 'opacity', 'rotation', 'scale', 'fontSize', 'width', 'height',
  'radius', 'letterSpacing', 'strokeWidth', 'trimStart', 'trimEnd', 'blur', 'volume',
  'd', 'fill', 'color', 'stroke'
]);
const PROPERTY_MAP: Record<string, string> = {
  fade: 'opacity',
  rotate: 'rotation',
  zoom: 'scale',
  size: 'fontSize',
  tracking: 'letterSpacing',
};
const VALID_EASINGS = new Set([
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeInQuart', 'easeOutQuart', 'easeInOutQuart',
  'easeInExpo', 'easeOutExpo', 'easeInOutExpo',
  'easeInBack', 'easeOutBack',
  'spring', 'hold', 'land', 'snap', 'glide', 'pop', 'move', 'exit', 'drift'
]);
const EASING_MAP: Record<string, string> = {
  ease: 'easeInOut',
  'ease-in': 'easeIn',
  'ease-out': 'easeOut',
  'ease-in-out': 'easeInOut',
  easein: 'easeIn',
  easeout: 'easeOut',
  easeinout: 'easeInOut',
  in: 'easeIn',
  out: 'easeOut',
  'in-out': 'easeInOut',
};

export function normalizeEasing(easing: any): string | undefined {
  if (typeof easing !== 'string') return undefined;
  if (VALID_EASINGS.has(easing)) return easing;
  const lower = easing.toLowerCase().trim();
  if (EASING_MAP[lower]) return EASING_MAP[lower];
  if (VALID_EASINGS.has(lower)) return lower;
  return undefined;
}

/**
 * Coerces one animation to the schema's keyframes form. Both the correct `{ property, keyframes }` shape and a from/to
 * shorthand the model may invent (`{ property, from, to, startFrame, endFrame, easing }`) are accepted.
 *
 * Anything this function changes or removes is invisible in the finished video, so `onNote` lets callers report it
 * instead of quietly sanitizing: a renamed property, a dropped keyframe, an animation that did not survive.
 */
export function normalizeAnimation(animation: any, frames: number, onNote?: (message: string) => void): any | undefined {
  const drop = (message: string) => { onNote?.(message); return undefined; };
  if (!animation || typeof animation !== 'object' || typeof animation.property !== 'string') {
    return drop(`an animation was dropped: it has no "property" string (${JSON.stringify(animation)?.slice(0, 60) ?? String(animation)})`);
  }
  let prop = animation.property.trim();
  const requestedProp = prop;
  if (PROPERTY_MAP[prop.toLowerCase()]) {
    prop = PROPERTY_MAP[prop.toLowerCase()];
    onNote?.(`the animation property "${requestedProp}" is not a schema property; used "${prop}" instead.`);
  }
  const isCssVar = prop.startsWith('--');
  if (!VALID_PROPERTIES.has(prop) && !isCssVar) return drop(`the animation on "${requestedProp}" was dropped: "${prop}" is not an animatable property.`);

  const isColor = COLOR_PROPS.has(prop);
  const isPath = prop === 'd';

  const cleanKeyframe = (keyframe: any) => {
    if (!keyframe || typeof keyframe !== 'object') return null;
    const rawFrame = Math.round(Number(keyframe?.frame) || 0);
    const frame = Math.max(0, Math.min(frames, rawFrame));
    if (frame !== rawFrame) onNote?.(`the ${prop} keyframe asked for frame ${rawFrame}, outside this scene's ${frames} frames; moved to ${frame}.`);
    let val = keyframe.value;
    const dropKeyframe = (reason: string) => { onNote?.(`the ${prop} keyframe at frame ${frame} was dropped: ${reason}.`); return null; };
    if (isCssVar) {
      if (typeof val !== 'string' && typeof val !== 'number') return dropKeyframe(`${JSON.stringify(val) ?? 'undefined'} is not a value`);
    } else if (isColor) {
      if (typeof val !== 'string' || !val.trim()) return dropKeyframe(`${JSON.stringify(val) ?? 'undefined'} is not a colour`);
      val = val.trim();
    } else if (isPath) {
      if (typeof val !== 'string' || !val.trim()) return dropKeyframe(`${JSON.stringify(val) ?? 'undefined'} is not path data`);
    } else {
      // numeric property
      if (typeof val === 'string') {
        const parsed = Number(val.replace(/px$/, '').replace(/%$/, '').trim());
        if (!Number.isFinite(parsed)) return dropKeyframe(`"${val}" is not a number`);
        val = parsed;
      } else if (typeof val !== 'number' || !Number.isFinite(val)) {
        return dropKeyframe(`${JSON.stringify(val) ?? 'undefined'} is not a number`);
      }
      if (prop === 'opacity') {
        if (val > 1) val = val <= 100 ? val / 100 : 1;
        if (val < 0) val = 0;
      }
    }
    const easing = normalizeEasing(keyframe.easing);
    if (easing === undefined && typeof keyframe.easing === 'string' && keyframe.easing.trim()) {
      onNote?.(`the easing "${keyframe.easing}" on the ${prop} keyframe at frame ${frame} is not a known easing; it was left out.`);
    }
    return { frame, value: val, ...(easing ? { easing } : {}) };
  };

  if (Array.isArray(animation.keyframes) && animation.keyframes.length) {
    const keyframes = animation.keyframes
      .map(cleanKeyframe)
      .filter((k: any): k is NonNullable<typeof k> => k !== null)
      .sort((a: any, b: any) => a.frame - b.frame);
    if (!keyframes.length) return drop(`the ${prop} animation was dropped: none of its ${animation.keyframes.length} keyframes were usable.`);
    return {
      property: prop,
      keyframes,
      ...(Number.isFinite(Number(animation.repeat)) ? { repeat: Math.max(0, Math.round(Number(animation.repeat))) } : {})
    };
  }

  // The from/to shorthand: two keyframes, the easing on the one being arrived at.
  if (animation.from !== undefined && animation.to !== undefined) {
    const start = Math.max(0, Math.round(Number(animation.startFrame) || 0));
    const end = Math.min(frames, Math.max(start + 1, Math.round(Number(animation.endFrame) || frames)));
    const k1 = cleanKeyframe({ frame: start, value: animation.from });
    const k2 = cleanKeyframe({ frame: end, value: animation.to, easing: animation.easing });
    if (!k1 || !k2) return drop(`the ${prop} animation was dropped: its from/to values were not usable.`);
    return { property: prop, keyframes: [k1, k2] };
  }
  return drop(`the ${prop} animation was dropped: it had no "keyframes" and no from/to values.`);
}

/** Coerces one scene reply into a schema-safe scene body; throws when the model produced nothing usable.
 *  Animations are normalized to the schema's keyframes form — both the correct `{ property, keyframes }` shape and
 *  a from/to shorthand the model may invent (`{ property, from, to, startFrame, endFrame, easing }`) are accepted.
 *  Everything removed or reshaped along the way is pushed to `notes` so the caller can report it. */
export function parseScene(raw: any, frames: number, notes: string[] = []): any {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('the scene reply was not a JSON object');
  const usableType = (layer: any) => Boolean(layer && typeof layer === 'object' && ['text', 'rect', 'circle', 'image'].includes(layer.type));
  for (const layer of Array.isArray(raw.layers) ? raw.layers : []) {
    if (!usableType(layer)) notes.push(`a layer of type ${JSON.stringify((layer as any)?.type ?? layer) ?? 'undefined'} was dropped; a scene layer is text, rect, circle or image.`);
  }
  const layers = (Array.isArray(raw.layers) ? raw.layers : []).filter(usableType);
  if (!layers.length) throw new Error('the scene reply has no usable layers');
  layers.forEach((layer: any, index: number) => {
    const label = `${layer.type} layer ${index + 1}`;
    const note = (message: string) => notes.push(`${label}: ${message}`);
    if (layer.type === 'text') {
      if (!layer.content && layer.text) layer.content = layer.text;
      if (!layer.text && layer.content) layer.text = layer.content;
      if (!text(layer.content ?? layer.text)) throw new Error('a text layer has no text');
      if (layer.fontSize !== undefined) {
        const fs = typeof layer.fontSize === 'number' ? layer.fontSize : Number(String(layer.fontSize).replace(/px$/, ''));
        layer.fontSize = Number.isFinite(fs) && fs > 0 ? fs : 48;
      }
    }
    if (typeof layer.x === 'string') {
      const num = Number(layer.x.replace(/px$/, ''));
      if (Number.isFinite(num)) layer.x = num;
    }
    if (typeof layer.y === 'string') {
      const num = Number(layer.y.replace(/px$/, ''));
      if (Number.isFinite(num)) layer.y = num;
    }
    if (typeof layer.opacity === 'string') {
      const num = Number(layer.opacity.replace(/%$/, ''));
      if (Number.isFinite(num)) layer.opacity = num > 1 ? num / 100 : Math.max(0, num);
    }
    if (typeof layer.width === 'string') {
      const num = Number(layer.width.replace(/px$/, ''));
      if (Number.isFinite(num) && num > 0) layer.width = num;
      else delete layer.width;
    }
    if (typeof layer.height === 'string') {
      const num = Number(layer.height.replace(/px$/, ''));
      if (Number.isFinite(num) && num > 0) layer.height = num;
      else delete layer.height;
    }
    if (layer.split) {
      if (typeof layer.split !== 'object') {
        note(`the split "${JSON.stringify(layer.split)}" was not an object; used word-by-word rise instead.`);
        layer.split = { by: 'words', stagger: 4, preset: 'rise' };
      } else {
        const allowedPresets = ['rise', 'fade', 'pop', 'blur', 'slide', 'drop', 'typewriter'];
        const p = String(layer.split.preset || 'rise').toLowerCase().replace(/-in$/, '');
        if (!allowedPresets.includes(p)) note(`the split preset "${layer.split.preset}" does not exist; used "rise" instead.`);
        layer.split.preset = allowedPresets.includes(p) ? p : 'rise';
        const allowedBy = ['words', 'letters', 'lines'];
        const b = String(layer.split.by || 'words').toLowerCase();
        if (!allowedBy.includes(b)) note(`the split "${layer.split.by}" does not exist; used "words" instead.`);
        layer.split.by = allowedBy.includes(b) ? b : 'words';
        layer.split.stagger = Math.max(1, Math.round(Number(layer.split.stagger) || 4));
      }
    }
    if (Array.isArray(layer.animations)) {
      layer.animations = layer.animations.map((animation: any) => normalizeAnimation(animation, frames, note)).filter(Boolean);
    }
  });
  return {
    background: raw.background && typeof raw.background === 'object' ? raw.background : undefined,
    layers,
  };
}

const houseCamera = (frames: number) => ({
  animations: [{ property: 'zoom', keyframes: [{ frame: 0, value: 1 }, { frame: Math.max(2, frames), value: 1.06, easing: 'drift' }] }],
});

/** The largest-font text layer's content and position, so the next scene knows where the story stands. */
export function summarizeExit(scene: any): string | undefined {
  const texts = ((scene?.layers ?? []) as any[]).filter((layer: any) => layer.type === 'text' && text(layer.text));
  if (!texts.length) return undefined;
  const headline = texts.reduce((big: any, layer: any) => (Number(layer.fontSize) || 0) > (Number(big.fontSize) || 0) ? layer : big, texts[0]!);
  return `"${text(headline.text).slice(0, 60)}" at x=${Math.round(Number(headline.x) || 0)}, y=${Math.round(Number(headline.y) || 0)}`;
}

/**
 * Stitches scene bodies into a full composition: code-owned ids, durations, transitions and camera (the house slow
 * push goes on every scene missing one, which also guarantees the craft checks for camera and motion), plus the
 * kinetic-type backstop for compositions where no scene carried a split headline.
 */
export function stitchScenes(scenes: any[], plan: ScenesPlan, options: ScenesOptions, name?: string): any {
  const overlaps = sceneOverlaps(scenes.length, options.fps);
  const ranges = sceneRanges(plan.durations, overlaps);
  if (!scenes.some(scene => (scene.layers ?? []).some((layer: any) => layer.type === 'text' && layer.split))) {
    // Backstop: the biggest headline of the longest scene gets the kinetic split so the craft check holds.
    const target = scenes[plan.durations.indexOf(Math.max(...plan.durations))];
    const texts = ((target?.layers ?? []) as any[]).filter((layer: any) => layer.type === 'text');
    if (texts.length) {
      const biggest = texts.reduce((big: any, layer: any) => (Number(layer.fontSize) || 0) > (Number(big.fontSize) || 0) ? layer : big, texts[0]!);
      biggest.split = { by: 'words', stagger: 4, preset: plan.contract.motion };
    }
  }
  const stitched = scenes.map((scene, i) => ({
    id: `scene-${i + 1}`,
    name: plan.beats[i]?.name ?? `Scene ${i + 1}`,
    ...(options.content?.beats[i] ? { beat: options.content.beats[i]!.id } : {}),
    startFrame: ranges[i]!.start,
    durationFrames: plan.durations[i]!,
    ...(i > 0 ? { transitionIn: { type: plan.contract.transition, durationFrames: overlaps[i] } } : {}),
    camera: scene.camera ?? houseCamera(plan.durations[i]!),
    layers: (scene.layers ?? []).map((layer: any, j: number) => ({ ...structuredClone(layer), id: `s${i + 1}-l${j + 1}` })),
  }));
  return {
    version: '1.0',
    $schema: './composition.schema.json',
    id: 'ai-video',
    name: name ?? 'AI video',
    width: options.width,
    height: options.height,
    fps: options.fps,
    durationFrames: ranges[ranges.length - 1]!.end,
    background: plan.contract.background,
    ...(plan.contract.texture ? { texture: plan.contract.texture } : {}),
    ...(options.content ? { content: structuredClone(options.content) } : {}),
    scenes: stitched,
  };
}

/** Runs the small calls in beat order: one style contract, then one call per scene (2 attempts each). */
export async function composeByScenes(provider: AiProvider, options: ScenesOptions, motionPlan?: MotionPlan): Promise<ScenesState> {
  options.onProgress?.('Agreeing the visual system (small call)…');
  let contractRaw: any;
  let lastError = 'no attempt was made';
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const reply = await provider.chat(contractMessages(options, motionPlan), { json: true, task: 'fast', temperature: attempt === 1 ? 0.4 : 0.2, maxTokens: 1200, signal: options.signal });
      contractRaw = extractJson(reply);
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (contractRaw === undefined) throw new Error(`the style contract call failed twice: ${lastError}`);
  const beats: ScenesBeat[] = options.content
    ? options.content.beats.map(beat => ({ id: beat.id, name: beat.name, onScreen: beat.onScreen, seconds: beat.seconds, motion: beat.motion, narration: beat.narration, data: beat.data }))
    : parseBeats(contractRaw.beats);
  if (!beats.length) throw new Error('the style contract had no usable beats');
  const contract = parseContract(contractRaw, options.look ?? motionPlan?.look);
  const durations = sceneDurations(beats, options.durationSeconds, options.fps);
  const plan: ScenesPlan = { beats, contract, durations, sceneRanges: sceneRanges(durations, sceneOverlaps(durations.length, options.fps)) };

  options.onProgress?.(`Designing ${beats.length} scenes, one small call each…`);
  const scenes: any[] = [];
  const notes: string[][] = [];
  for (const [index, beat] of beats.entries()) {
    const frames = durations[index]!;
    const previous = index > 0 ? summarizeExit(scenes[index - 1]) : undefined;
    let lastSceneError = 'no attempt was made';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const reply = await provider.chat(sceneMessages(contract, beat, index, beats.length, frames, previous, options), { json: true, task: 'fast', temperature: attempt === 1 ? 0.5 : 0.2, maxTokens: 1800, signal: options.signal });
        const attemptNotes: string[] = [];
        scenes[index] = parseScene(extractJson(reply), frames, attemptNotes);
        notes[index] = attemptNotes.map(note => `scene ${index + 1} ("${beat.name}"): ${note}`);
        break;
      } catch (error) {
        lastSceneError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!scenes[index]) throw new Error(`scene ${index + 1} ("${beat.name}") failed twice: ${lastSceneError}`);
  }
  const raw = stitchScenes(scenes, plan, options, motionPlan?.idea);
  return { plan, raw, scenes, notes };
}

/** Maps review issues (by frame) back to their scenes and re-designs only those, feeding the exact findings back. */
export async function healScenes(provider: AiProvider, state: ScenesState, issues: { frame?: number; message: string; layer?: string }[], options: ScenesOptions): Promise<ScenesState> {
  const flagged = new Map<number, string[]>();
  for (const issue of issues) {
    if (issue.frame === undefined) continue;
    // findLastIndex needs lib es2023; a reverse scan is the same and keeps the tsconfig untouched.
    let index = -1;
    for (let candidate = state.plan.sceneRanges.length - 1; candidate >= 0; candidate--) {
      const range = state.plan.sceneRanges[candidate]!;
      if (issue.frame! >= range.start && issue.frame! < range.end) { index = candidate; break; }
    }
    if (index < 0) continue;
    flagged.set(index, [...flagged.get(index) ?? [], `${issue.message}${issue.layer ? ` [${issue.layer}]` : ''}`]);
  }
  if (!flagged.size) throw new Error('no review issue mapped to a scene');
  options.onProgress?.(`Re-designing ${flagged.size} scene(s) from the review…`);
  const scenes = structuredClone(state.scenes);
  const notes = state.notes.map(sceneNotes => [...sceneNotes]);
  for (const [index, findings] of flagged) {
    const frames = state.plan.durations[index]!;
    const beat = state.plan.beats[index]!;
    const previous = index > 0 ? summarizeExit(scenes[index - 1]) : undefined;
    const messages = sceneMessages(state.plan.contract, beat, index, state.plan.beats.length, frames, previous, options);
    messages.push({ role: 'assistant', content: JSON.stringify(scenes[index]) }, { role: 'user', content: `The design review found these problems in this scene:\n${findings.map(finding => `- ${finding}`).join('\n')}\nFix ONLY these problems. Reply with the corrected scene JSON only.` });
    let healed = false;
    let lastError = 'no attempt was made';
    for (let attempt = 1; attempt <= 2 && !healed; attempt++) {
      try {
        const reply = await provider.chat(messages, { json: true, task: 'fast', temperature: 0.2, maxTokens: 1800, signal: options.signal });
        const attemptNotes: string[] = [];
        const candidate = parseScene(extractJson(reply), frames, attemptNotes);
        if (JSON.stringify(candidate) !== JSON.stringify(scenes[index])) {
          scenes[index] = candidate;
          notes[index] = attemptNotes.map(note => `scene ${index + 1} ("${beat.name}"): ${note}`);
          healed = true;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!healed) throw new Error(`scene ${index + 1} ("${beat.name}") could not be healed: ${lastError}`);
  }
  const raw = stitchScenes(scenes, state.plan, options, state.raw.name);
  return { plan: state.plan, raw, scenes, notes };
}
