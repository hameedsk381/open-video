// The design kit the shipped templates are written with. A template is a short script that composes these pieces and returns a
// composition; scripts/build-templates.mjs writes each one to packages/cli/templates/<id>/. Nothing here is special to the renderer:
// every helper returns plain composition JSON, so a template can always be edited as JSON afterwards.
//
// Colours come only from the theme tokens ({{bg}}, {{accent}}…), so any theme restyles a template; fonts, texture, motion and
// transition are tokens as well, so a theme changes a template's personality and not just its palette.

export const FPS = 30;
export const sec = s => Math.round(s * FPS);
export const SIZES = { wide: [1920, 1080], tall: [1080, 1920], square: [1080, 1080], portrait: [1080, 1350] };

/** The theme tokens every template declares, with defaults that make that template look right on its own. */
export function tokens(defaults = {}) {
  const d = { bg: '#0a0a0b', surface: '#16161a', text: '#f4f1ea', muted: '#9a968c', accent: '#ff4a1c', accent2: '#ffb199', radius: 28, headWeight: 800, fontDisplay: 'Archivo', fontBody: 'Inter', texture: 'none', textureColor: '#ffffff', textureOpacity: 0.05, motion: 'rise', transition: 'fade', ...defaults };
  const v = (type, key, description) => [key, { type, default: d[key], description: `Theme: ${description}` }];
  return Object.fromEntries([
    v('color', 'bg', 'page background (a 6-digit hex)'), v('color', 'surface', 'raised surfaces and cards'), v('color', 'text', 'main text'), v('color', 'muted', 'secondary text'),
    v('color', 'accent', 'the one signal colour'), v('color', 'accent2', 'a softer partner for the accent'),
    v('number', 'radius', 'corner radius of cards and buttons'), v('number', 'headWeight', 'weight of headlines'),
    v('string', 'fontDisplay', 'headline font'), v('string', 'fontBody', 'body font'),
    v('string', 'texture', 'background texture: none, grid, dots, scanlines or paper'), v('color', 'textureColor', 'texture ink'), v('number', 'textureOpacity', 'texture strength'),
    v('string', 'motion', 'how headlines arrive: rise, slide, pop or blur'), v('string', 'transition', 'how scenes change: fade, zoom, wipe or push'),
  ]);
}
/** A content variable: text a person (or the AI) fills in. */
export const field = (def, description, type = 'string') => ({ type, default: def, description });

/* ---- animation ---- */
/** { property, keyframes } from [frame, value, easing?] triples. */
export const anim = (property, ...keys) => ({ property, keyframes: keys.map(([frame, value, easing]) => ({ frame, value, ...(easing ? { easing } : {}) })) });
/** Fades in over `dur` frames from `delay`. */
export const fade = (delay = 0, dur = 18, to = 1) => anim('opacity', [delay, 0], [delay + dur, to, 'glide']);
/** Rises into place: opacity and a short travel, ending at the layer's own y. */
export const rise = (y, delay = 0, dist = 40, dur = 24) => [fade(delay, Math.round(dur * 0.7)), anim('y', [delay, y + dist], [delay + dur, y, 'land'])];
/** Slides in along x, ending at the layer's own x. */
export const slideX = (x, delay = 0, dist = 80, dur = 24) => [fade(delay, Math.round(dur * 0.7)), anim('x', [delay, x + dist], [delay + dur, x, 'land'])];
/** Grows from nothing: a bar, a rule, a ring. */
export const grow = (prop, to, delay = 0, dur = 24, ease = 'land') => anim(prop, [delay, 0], [delay + dur, to, ease]);
/** Pops: scale from small with a little overshoot. */
export const pop = (delay = 0, dur = 20, from = 0.6) => [fade(delay, 8), anim('scale', [delay, from], [delay + dur, 1, 'pop'])];
/** Fades in at `at`, then steps back to `to` once the next item (at frame `next`) has arrived, so one item at a time holds the frame. */
export const spot = (at, next, dur = 14, to = 0.45) => next === undefined ? fade(at, dur) : anim('opacity', [at, 0], [at + dur, 1, 'glide'], [next, 1], [next + 16, to, 'glide']);
/** Leaves: fades out over `dur` frames ending at `end`. */
export const leave = (end, dur = 10) => anim('opacity', [end - dur, 1], [end, 0, 'exit']);
/** Slow continuous drift between two values across the whole scene. */
export const drift = (property, from, to, frames) => anim(property, [0, from], [frames, to, 'drift']);

/** A wobble added on top of a property, the same in every render: an idle float (every ≈ 40), handheld drift, or with `hold` a hand-redrawn boil. `base` is the value it wobbles around. */
export const wiggle = (property, base, o = {}) => ({ property, keyframes: [{ frame: 0, value: base }], wiggle: { amount: o.amount ?? 4, every: o.every ?? 12, seed: o.seed ?? 0, hold: o.hold ?? false } });
/** Squash and stretch on a landing: flattens as it hits, then springs back, keeping its volume (scaleX × scaleY stays 1). Put it on the same frame as the pop or drop it follows. */
export const squashLand = (delay = 0, o = {}) => { const s = o.squash ?? 0.86, dur = o.dur ?? 16; return [anim('scaleY', [delay, 1], [delay + 4, s, 'easeOut'], [delay + dur, 1, 'spring']), anim('scaleX', [delay, 1], [delay + 4, 1 / s, 'easeOut'], [delay + dur, 1, 'spring'])]; };
/** A move that winds back first and carries past the target before it settles: anticipation and follow-through in one curve. */
export const anticipate = (property, from, to, delay = 0, dur = 24) => anim(property, [delay, from], [delay + dur, to, 'anticipate']);

/* ---- layers ---- */
export const text = (id, content, x, y, o = {}) => ({
  id, type: 'text', content, x, y, fontSize: o.size ?? 48, fontFamily: o.font ?? '{{fontBody}}', fontWeight: o.weight ?? 500, color: o.color ?? '{{text}}',
  ...(o.ls !== undefined ? { letterSpacing: o.ls } : {}), ...(o.lh ? { lineHeight: o.lh } : {}), ...(o.maxWidth ? { maxWidth: o.maxWidth } : {}),
  ...(o.maxLines ? { maxLines: o.maxLines, minFontSize: o.minSize ?? Math.round((o.size ?? 48) * 0.6) } : {}), ...(o.align ? { textAlign: o.align } : {}),
  ...(o.split ? { split: { by: o.split.by ?? 'words', preset: o.split.preset ?? '{{motion}}', stagger: o.split.stagger ?? 5, duration: o.split.duration ?? 24, ...(o.split.order ? { order: o.split.order } : {}) } } : {}),
  ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 2 } : {}),
  ...(o.anims?.length ? { animations: o.anims.flat() } : {}), ...(o.start ? { startFrame: o.start } : {}), ...(o.end ? { endFrame: o.end } : {}),
});
/** A display headline: the theme's font and weight, tight tracking, split into words that arrive on the theme's motion. */
export const headline = (id, content, x, y, o = {}) => text(id, content, x, y, { font: '{{fontDisplay}}', weight: '{{headWeight}}', lh: 0.96, ls: o.ls ?? Math.round(-(o.size ?? 120) * 0.035), split: { stagger: 5, duration: 26 }, ...o });
/** A small uppercase label: a kicker, a caption, an index. */
export const label = (id, content, x, y, o = {}) => text(id, content, x, y, { font: 'JetBrains Mono', weight: 600, size: o.size ?? 24, ls: o.ls ?? 7, color: o.color ?? '{{accent}}', ...o });
// A bar that grows from nothing still needs a positive base size (the schema rejects 0); its animation starts it at 0.
export const rect = (id, x, y, width, height, o = {}) => ({ id, type: 'rect', x, y, width: Math.max(1, width), height: Math.max(1, height), radius: o.radius ?? 0, fill: o.fill ?? '{{surface}}', ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 2 } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.blur ? { blur: o.blur } : {}), ...(o.shadow ? { shadow: o.shadow } : {}), ...(o.anims?.length ? { animations: o.anims.flat() } : {}), ...(o.start ? { startFrame: o.start } : {}), ...(o.end ? { endFrame: o.end } : {}), ...(o.originX !== undefined ? { originX: o.originX, originY: o.originY ?? 0 } : {}) });
/** A circle is centred on x, y; `width` is its diameter. */
export const circle = (id, x, y, width, o = {}) => ({ id, type: 'circle', x, y, width, fill: o.fill ?? '{{accent}}', ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 2 } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.blur ? { blur: o.blur } : {}), ...(o.anims?.length ? { animations: o.anims.flat() } : {}), ...(o.start ? { startFrame: o.start } : {}), ...(o.end ? { endFrame: o.end } : {}) });
export const path = (id, d, x, y, o = {}) => ({ id, type: 'path', d, x, y, ...(o.fill ? { fill: o.fill } : {}), ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 3, lineCap: 'round', lineJoin: 'round' } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.anims?.length ? { animations: o.anims.flat() } : {}), ...(o.start ? { startFrame: o.start } : {}) });
export const group = (id, children, o = {}) => ({ id, type: 'group', children, x: o.x ?? 0, y: o.y ?? 0, ...(o.layout ? { layout: o.layout } : {}), ...(o.width ? { width: o.width } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.anims?.length ? { animations: o.anims.flat() } : {}), ...(o.start ? { startFrame: o.start } : {}), ...(o.end ? { endFrame: o.end } : {}) });
export const sfx = (name, frame, volume = 0.5) => ({ id: `sfx-${name}-${frame}`, type: 'audio', src: `sfx:${name}`, startFrame: frame, volume });

/* ---- backgrounds ---- */
/** Soft coloured light behind everything: slow, large, never the subject. */
export function aurora(w, h, frames, o = {}) {
  const k = o.strength ?? 1;
  return [
    circle('aurora-a', w * 0.78, h * 0.12, Math.max(w, h) * 0.75, { fill: '{{accent}}', opacity: 0.22 * k, blur: 120, anims: [drift('x', w * 0.78, w * 0.64, frames), drift('y', h * 0.12, h * 0.2, frames)] }),
    circle('aurora-b', w * 0.1, h * 0.92, Math.max(w, h) * 0.6, { fill: '{{accent2}}', opacity: 0.13 * k, blur: 130, anims: [drift('x', w * 0.1, w * 0.24, frames), drift('y', h * 0.92, h * 0.82, frames)] }),
  ];
}
/** Darkens the corners so the middle holds the eye. */
export const vignette = (w, h, strength = 'cc') => rect('vignette', 0, 0, w, h, { fill: { type: 'radial', center: [w / 2, h / 2], radius: Math.hypot(w, h) * 0.55, stops: [{ offset: 0.45, color: '{{bg}}00' }, { offset: 1, color: `{{bg}}${strength}` }] } });
/** A hairline frame: the poster edge that makes a video feel designed. */
export const frame = (w, h, inset = 36) => rect('frame', inset, inset, w - inset * 2, h - inset * 2, { radius: 4, fill: '#00000000', stroke: '{{text}}', strokeWidth: 1, opacity: 0.14 });

/* ---- scenes and compositions ---- */
export const scene = (id, name, frames, layers, o = {}) => ({
  id, name, durationFrames: frames, ...(o.camera === false ? {} : { camera: { animations: [anim('zoom', [0, 1], [frames, o.zoom ?? 1.06, 'drift'])] } }),
  ...(o.tin !== false ? { transitionIn: { type: o.tin ?? '{{transition}}', durationFrames: o.tinFrames ?? 14, ...(o.tinDirection ? { direction: o.tinDirection } : {}) } } : {}),
  ...(o.tout ? { transitionOut: { type: o.tout, durationFrames: o.toutFrames ?? 14 } } : {}),
  layers: layers.flat(),
});
export function composition({ id, name, size, scenes, variables, overlay, assets, o = {} }) {
  const [width, height] = SIZES[size];
  return {
    version: '1.0', id, name, width, height, fps: FPS, durationFrames: 'auto', background: '{{bg}}',
    texture: { type: '{{texture}}', color: '{{textureColor}}', opacity: '{{textureOpacity}}', scale: 56 },
    ...(o.grain !== undefined ? { grain: o.grain } : {}), ...(o.motionBlur ? { motionBlur: { samples: 6, shutter: 160 } } : {}),
    export: { format: 'mp4', loudness: -16 },
    variables, ...(assets ? { assets } : {}), scenes: scenes.flat(), ...(overlay ? { overlay: overlay.flat() } : {}),
  };
}
