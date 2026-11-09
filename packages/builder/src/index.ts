// Write a video as code. These helpers build the same composition JSON you could write by hand, with types, autocomplete, loops,
// functions and your own maths: `createVideo(...).scene(...).toJSON()` is a plain object, and `ove build video.ts` writes it to
// composition.json for validate, review and render. Nothing here runs while rendering, so the output stays frame-exact; the one
// exception is `code(...)`, which embeds JavaScript that runs per frame and only renders with --allow-code.
import type { Composition } from '@ove/schema';

// ---- values
export type Easing = string | [number, number, number, number];
export type Keyframe = { frame: number; value: number | string; easing?: Easing };
export type Animation = { property: string; keyframes: Keyframe[]; repeat?: number; reverse?: boolean };
export type Value<T = number> = T | string;
export type Transition = { type: 'fade' | 'slide' | 'wipe' | 'zoom' | 'iris' | 'push' | 'dip' | 'blur'; durationFrames: number; direction?: 'left' | 'right' | 'top' | 'bottom'; easing?: Easing; color?: string };

/** What every layer accepts. Strings may hold {{expressions}}; anything else the schema allows can be passed too. */
export type LayerOptions = { id?: string; x?: Value; y?: Value; opacity?: Value; rotation?: Value; scale?: Value; originX?: Value<number | 'center'>; originY?: Value<number | 'center'>;
  startFrame?: Value; endFrame?: Value; zIndex?: number; fixed?: boolean; blur?: Value; animations?: Animation[]; if?: string; [other: string]: unknown };
export type Layer = Record<string, unknown> & { type?: string; id?: string };
export type TextOptions = LayerOptions & { fontSize?: Value; fontFamily?: string; fontWeight?: number | 'normal' | 'bold'; color?: string; textAlign?: 'left' | 'center' | 'right'; maxWidth?: Value; maxLines?: number; minFontSize?: number; lineHeight?: number; letterSpacing?: number;
  split?: { by?: 'words' | 'letters' | 'lines'; stagger?: number; preset?: 'rise' | 'fade' | 'pop' | 'blur' | 'slide' | 'drop' | 'typewriter'; order?: 'forward' | 'reverse' | 'center' | 'edges' | 'random'; duration?: number } };
export type ShapeOptions = LayerOptions & { width?: Value; height?: Value; fill?: unknown; stroke?: unknown; strokeWidth?: number; radius?: Value };

// ---- layers
const layer = (type: string, options: Record<string, unknown>): Layer => ({ type, ...options });
export const text = (content: string, options: TextOptions = {}): Layer => layer('text', { content, ...options });
export const rect = (options: ShapeOptions): Layer => layer('rect', options);
export const circle = (options: ShapeOptions & { width: Value }): Layer => layer('circle', options);
export const path = (d: string, options: ShapeOptions = {}): Layer => layer('path', { d, ...options });
export const image = (src: string, options: LayerOptions & { width?: Value; height?: Value; objectFit?: 'cover' | 'contain' | 'fill'; radius?: number } = {}): Layer => layer('image', { src, ...options });
export const clip = (src: string, options: LayerOptions & { width?: Value; height?: Value; trimStart?: number; volume?: number } = {}): Layer => layer('video', { src, ...options });
export const audio = (src: string, options: LayerOptions & { volume?: number } = {}): Layer => layer('audio', { src, ...options });
/** A built-in sound effect: whoosh, click, tick, pop, thump, ding or riser. */
export const sfx = (name: 'whoosh' | 'click' | 'tick' | 'pop' | 'thump' | 'ding' | 'riser', options: LayerOptions & { volume?: number } = {}): Layer => layer('audio', { src: `sfx:${name}`, ...options });
export const group = (children: Layer[], options: LayerOptions & { width?: Value; height?: Value; layout?: { direction?: 'row' | 'column'; gap?: number; padding?: number; align?: 'start' | 'center' | 'end'; justify?: 'start' | 'center' | 'end' | 'space-between' } } = {}): Layer => layer('group', { ...options, children });
export const lottie = (src: string, options: LayerOptions & { width: number; height: number; loop?: boolean }): Layer => layer('lottie', { src, ...options });
/** Bodies that fall, bounce and pile up (matter.js), simulated from the layer's first frame so every render agrees. */
export const physics = (options: LayerOptions & { width: number; height: number; bodies?: Record<string, unknown>[]; emit?: Record<string, unknown>[]; gravity?: { x?: number; y?: number }; walls?: 'box' | 'floor' | 'none'; seed?: number; substeps?: number; sketch?: Record<string, unknown> | false }): Layer => layer('physics', options);
export const shader = (fragment: string, options: LayerOptions & { width: number; height: number; vars?: Record<string, number | string> }): Layer => layer('shader', { fragment, ...options });
export const captions = (src: string, options: LayerOptions = {}): Layer => layer('captions', { src, ...options });
/** A reusable component declared with `video.component(...)`, placed with values for its parameters. */
export const use = (component: string, values: Record<string, unknown> = {}, options: LayerOptions = {}): Layer => ({ use: component, ...options, with: values });

/** The arguments a code layer's draw function receives. */
export type CodeArgs = { frame: number; t: number; fps: number; width: number; height: number; props: Record<string, any>;
  api: { random(seed: number): () => number; noise(x: number, y?: number, z?: number): number; interpolate(x: number, input: number[], output: number[], options?: { easing?: string; clamp?: boolean }): number;
    spring(options: { frame: number; fps?: number; damping?: number; stiffness?: number; mass?: number; from?: number; to?: number }): number; clamp(x: number, min: number, max: number): number; lerp(a: number, b: number, t: number): number } };
/**
 * Drawing code that runs every frame on a canvas. Give a function (it is copied into the composition as text, so it must not use
 * anything from the surrounding file) or the source of `function draw(ctx, args)`. Needs `--allow-code` to render: only for your own files.
 */
export const code = (draw: ((ctx: CanvasRenderingContext2D, args: CodeArgs) => void) | string, options: LayerOptions & { width: number; height: number; props?: Record<string, unknown>; resolution?: number }): Layer =>
  layer('code', { code: typeof draw === 'string' ? draw : `const draw = ${draw.toString()};`, ...options });
/**
 * A p5.js sketch: `draw(p, args)` runs once per frame on a p5 canvas with the random and noise seeds set first, so a frame is a pure function of
 * its number (do not build up state from frame to frame). Give a function (copied as text, so it must not use anything from the surrounding file) or source. Needs `--allow-code`.
 */
export const p5 = (draw: ((p: any, args: CodeArgs) => void) | string, options: LayerOptions & { width: number; height: number; props?: Record<string, unknown>; resolution?: number; seed?: number }): Layer =>
  layer('p5', { code: typeof draw === 'string' ? draw : `const draw = ${draw.toString()};`, ...options });

// ---- animation
/** Keyframes from [frame, value, easing?] triples: `keyframes('y', [[0, 40, 'land'], [18, 0]])`. */
export const keyframes = (property: string, frames: [number, number | string, Easing?][], options: { repeat?: number; reverse?: boolean } = {}): Animation =>
  ({ property, keyframes: frames.map(([frame, value, easing]) => easing === undefined ? { frame, value } : { frame, value, easing }), ...options });
/** One value moving to another: `tween('opacity', 0, 1, { frames: 12, delay: 4 })`. */
export const tween = (property: string, from: number | string, to: number | string, options: { frames?: number; delay?: number; easing?: Easing } = {}): Animation => {
  const frames = options.frames ?? 15, delay = options.delay ?? 0;
  return keyframes(property, [...(delay ? [[0, from] as [number, number | string]] : []), [delay, from, options.easing], [delay + frames, to]]);
};
export const fadeIn = (frames = 12, delay = 0): Animation => tween('opacity', 0, 1, { frames, delay });
export const fadeOut = (atFrame: number, frames = 12): Animation => keyframes('opacity', [[atFrame, 1], [atFrame + frames, 0]]);
/** Rises into place at `y` (use 0 for a child of a group with a layout): `riseIn(560, 30)` starts 30 px lower and fades in. Returns both animations. */
export const riseIn = (y: number, distance = 36, frames = 18, delay = 0): Animation[] => [tween('y', y + distance, y, { frames, delay, easing: 'land' }), fadeIn(Math.round(frames * 0.75), delay)];
/** Samples any function of the frame into keyframes, so springs, noise and physics become ordinary animations: `sample('x', 0, 60, f => Math.sin(f / 8) * 100)`. */
export const sample = (property: string, from: number, to: number, fn: (frame: number) => number, options: { step?: number } = {}): Animation => {
  const step = Math.max(1, Math.round(options.step ?? 2)), frames: [number, number][] = [];
  for (let f = from; f < to; f += step) frames.push([f, Math.round(fn(f) * 1000) / 1000]);
  frames.push([to, Math.round(fn(to) * 1000) / 1000]);
  return keyframes(property, frames);
};
/** A damped spring settling from `from` to `to`, as a function of the frame (use inside `sample`). */
export function spring(options: { frame: number; fps?: number; damping?: number; stiffness?: number; mass?: number; from?: number; to?: number }): number {
  const { fps = 30, damping = 10, stiffness = 100, mass = 1, from = 0, to = 1 } = options, t = Math.max(0, options.frame) / fps, w0 = Math.sqrt(stiffness / mass), z = damping / (2 * Math.sqrt(stiffness * mass));
  const wd = w0 * Math.sqrt(Math.max(0, 1 - z * z));
  const v = z < 1 ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)) : 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  return from + (to - from) * v;
}
const eases: Record<string, (t: number) => number> = { linear: t => t, easeIn: t => t * t * t, easeOut: t => 1 - (1 - t) ** 3, easeInOut: t => t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2 };
/** Maps a value through ranges: `interpolate(frame, [0, 30, 60], [0, 1, 0])`. */
export function interpolate(x: number, input: number[], output: number[], options: { easing?: keyof typeof eases | ((t: number) => number); clamp?: boolean } = {}): number {
  if (input.length !== output.length || input.length < 2) throw new Error('interpolate needs two lists of the same length, at least two long');
  let i = 1; while (i < input.length - 1 && x > input[i]!) i++;
  let t = (x - input[i - 1]!) / (input[i]! - input[i - 1]! || 1); if (options.clamp !== false) t = Math.min(1, Math.max(0, t));
  const ease = typeof options.easing === 'function' ? options.easing : eases[options.easing ?? 'linear']; if (!ease) throw new Error(`Unknown easing "${String(options.easing)}"`);
  return output[i - 1]! + (output[i]! - output[i - 1]!) * (t >= 0 && t <= 1 ? ease(t) : t);
}

// ---- video
export type VideoOptions = { id: string; name?: string; width: number; height: number; fps?: number; background?: unknown; motionBlur?: { samples?: number; shutter?: number } | boolean;
  /** Seconds of the whole video; leave out to follow the scenes. */ durationSeconds?: number; tempo?: { bpm: number; offset?: number; beatsPerBar?: number } };
export type SceneOptions = { name?: string; /** Frames, or use `seconds`. */ duration?: number; seconds?: number; startFrame?: number; transitionIn?: Transition; transitionOut?: Transition; overlap?: number;
  camera?: { x?: number; y?: number; zoom?: number; rotation?: number; shake?: number; animations?: Animation[] }; background?: unknown; [other: string]: unknown };
export type SceneBuilder = { readonly layers: Layer[]; add(...layers: (Layer | Layer[])[]): SceneBuilder };
export type VideoBuilder = {
  readonly fps: number; readonly width: number; readonly height: number;
  /** Seconds to frames at this video's rate. */ frames(seconds: number): number;
  scene(id: string, options: SceneOptions, build: ((scene: SceneBuilder) => void) | Layer[]): VideoBuilder;
  variable(name: string, declaration: { type: 'string' | 'number' | 'boolean' | 'color' | 'list'; default?: unknown; description?: string; items?: Record<string, unknown> }): VideoBuilder;
  component(name: string, definition: { params?: Record<string, unknown>; layers: Layer[]; description?: string }): VideoBuilder;
  asset(id: string, asset: { type: 'image' | 'video' | 'audio' | 'font' | 'lottie' | 'captions'; src: string; [other: string]: unknown }): VideoBuilder;
  export(settings: Record<string, unknown>): VideoBuilder;
  /** The composition as plain JSON, ready for `ove validate` and `ove render`. */ toJSON(): Record<string, unknown>;
};

export function createVideo(options: VideoOptions): VideoBuilder {
  const fps = options.fps ?? 30, scenes: Record<string, unknown>[] = [], variables: Record<string, unknown> = {}, components: Record<string, unknown> = {}, assets: Record<string, unknown>[] = [];
  let exportSettings: Record<string, unknown> | undefined;
  // Layers without an id get one (text-1, rect-2…); an id you give must be unique. The video has one set of ids, and each component its own.
  const idMaker = (taken = new Set<string>()) => { const counts: Record<string, number> = {};
    const idFor = (type: string, wanted?: string) => { if (wanted !== undefined) { if (taken.has(wanted)) throw new Error(`The id "${wanted}" is used twice; ids must be unique`); taken.add(wanted); return wanted; }
      let id: string; do { id = `${type}-${(counts[type] = (counts[type] ?? 0) + 1)}`; } while (taken.has(id)); taken.add(id); return id; };
    const withIds = (input: Layer): Layer => { const copy: Layer = { ...input }; const type = String(copy.type ?? (copy.use ? 'use' : 'layer')); copy.id = idFor(type, copy.id as string | undefined);
      if (Array.isArray(copy.children)) copy.children = (copy.children as Layer[]).map(withIds); return copy; };
    return { taken, withIds }; };
  const { taken, withIds } = idMaker();
  const builder: VideoBuilder = {
    fps, width: options.width, height: options.height,
    frames: seconds => Math.round(seconds * fps),
    scene(id, sceneOptions, build) {
      const { seconds, duration, ...rest } = sceneOptions, durationFrames = duration ?? (seconds !== undefined ? Math.round(seconds * fps) : undefined);
      if (!durationFrames || durationFrames < 1) throw new Error(`Scene "${id}" needs a duration in frames or seconds`);
      taken.add(id);
      const layers: Layer[] = [], api: SceneBuilder = { layers, add: (...added) => { for (const item of added.flat()) layers.push(withIds(item)); return api; } };
      if (Array.isArray(build)) api.add(...build); else build(api);
      scenes.push({ id, name: rest.name ?? id, ...rest, durationFrames, layers });
      return builder;
    },
    variable(name, declaration) { variables[name] = declaration; return builder; },
    component(name, definition) { const own = idMaker(); components[name] = { params: {}, ...definition, layers: definition.layers.map(own.withIds) }; return builder; },
    asset(id, asset) { assets.push({ id, ...asset }); return builder; },
    export(settings) { exportSettings = { ...(exportSettings ?? {}), ...settings }; return builder; },
    toJSON() {
      if (!scenes.length) throw new Error('A video needs at least one scene');
      const motionBlur = options.motionBlur === true ? { samples: 4, shutter: 180 } : options.motionBlur || undefined;
      return { $schema: './composition.schema.json', version: '1.0', id: options.id, name: options.name ?? options.id, width: options.width, height: options.height, fps,
        durationFrames: options.durationSeconds !== undefined ? Math.round(options.durationSeconds * fps) : 'auto',
        ...(options.background !== undefined ? { background: options.background } : {}), ...(motionBlur ? { motionBlur } : {}), ...(options.tempo ? { tempo: options.tempo } : {}),
        ...(Object.keys(variables).length ? { variables } : {}), ...(Object.keys(components).length ? { components } : {}), ...(assets.length ? { assets } : {}),
        ...(exportSettings ? { export: exportSettings } : {}), scenes: structuredClone(scenes) };
    },
  };
  return builder;
}

/** What `ove build` accepts from a file: a builder, a composition object, or a function (async too) returning either. */
export type Buildable = VideoBuilder | Composition | Record<string, unknown> | (() => Buildable | Promise<Buildable>);
export async function resolveBuildable(value: Buildable): Promise<Record<string, unknown>> {
  const resolved = typeof value === 'function' ? await value() : value;
  if (resolved && typeof (resolved as VideoBuilder).toJSON === 'function') return (resolved as VideoBuilder).toJSON();
  if (resolved && typeof resolved === 'object') return resolved as Record<string, unknown>;
  throw new Error('The file must export a video from createVideo(...), a composition object, or a function returning one');
}
