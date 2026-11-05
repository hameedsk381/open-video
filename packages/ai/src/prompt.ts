// The prompt is the product here: a compact, accurate description of the composition format is what makes an LLM
// emit JSON that validates on the first or second try. The exact JSON Schema can be appended for hard cases (--schema).
import { compositionJsonSchema } from '@ove/schema';
import { movesGlossary } from './registry';

export type PromptOptions = {
  width: number; height: number; fps: number; durationSeconds: number;
  kind?: string;
  fields?: { name: string; type: string; description?: string; example?: unknown }[];
  assets?: { id: string; type: string; src: string }[];
  includeSchema?: boolean;
  narration?: boolean;
  /** Beats and look from the planning pass; the composition must follow them. */
  motionPlan?: MotionPlan;
};

export type MotionBeat = { name: string; takeaway?: string; onScreen?: string; seconds?: number; motion?: string };
export type MotionPlan = { idea?: string; look?: Record<string, string>; beats: MotionBeat[]; transition?: string };

export function isMotionPlan(raw: unknown): raw is MotionPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as { beats?: unknown; scenes?: unknown };
  return Array.isArray(value.beats) && value.beats.length > 0 && !Array.isArray(value.scenes);
}

const CHEATSHEET = `# OVE composition format (version 1.0)

Return ONE JSON object. No markdown fences, no commentary, no trailing commas.

Top level:
{
  "version": "1.0",
  "id": "kebab-case-id",
  "name": "Human readable name",
  "width": 1080, "height": 1920, "fps": 30,
  "durationFrames": 900,
  "background": "#0b1020" | { "type": "linear", "from": [0,0], "to": [1080,1920], "stops": [{"offset":0,"color":"#0b1020"},{"offset":1,"color":"#1e1b4b"}] },
  "scenes": [ ... ],
  "assets": [ ... ],        // optional; only for files the user supplied
  "variables": { ... },     // optional; typed template inputs
  "export": { "format": "mp4", "loudness": -14 }   // optional
}

Scene (required: id, name, durationFrames, layers):
{
  "id": "intro", "name": "Intro",
  "startFrame": 0,                 // frames from the start of the video
  "durationFrames": 90,
  "transitionIn": { "type": "fade", "durationFrames": 15 },
  "transitionOut": { "type": "fade", "durationFrames": 12 },
  "camera": { "x": 540, "y": 960, "zoom": 1.05 },   // optional
  "layers": [ ... ]
}
Scenes draw in order (later on top). Overlap scenes by the transition length. The first scene must start at 0, and
startFrame + durationFrames must not exceed the video's durationFrames.

Layer common fields: "id" (unique), "type", "startFrame" (0), "endFrame" (exclusive), "x", "y", "opacity",
"rotation", "scale", "originX"/"originY" ("center" or pixels), "zIndex", "animations", "shadow", "blur",
"filter", "blendMode", "fixed" (top-level scene layers only; ignores the camera).

Layer types and their required fields:
- text: "content" (string, \\n for a line break), "fontSize", "color". Optional "fontFamily" (default Inter),
  "fontWeight" (100-900 or "bold"), "fontStyle", "textAlign" ("left"|"center"|"right"), "maxWidth", "maxLines",
  "minFontSize", "lineHeight" (multiple of fontSize, default 1.2), "letterSpacing", "stroke", "strokeWidth".
  "y" is the top of the first line; "x" is the left/centre/right edge according to textAlign.
- rect: "width", "height", "fill", "radius" (optional "stroke", "strokeWidth").
- circle: "width" is the diameter; "x","y" is the centre. "fill".
- path: "d" (SVG path data in the layer's pixels), "fill" or "stroke"+"strokeWidth". Give "width"/"height" only
  if you use originX: "center". "trimStart"/"trimEnd" (0-1) draw part of the outline.
- image: "src" (an asset id), "width", "height", "objectFit": "cover"|"contain"|"fill", optional "radius".
- video: as image, plus "trimStart", "playbackRate", "loop", "muted", "volume".
- audio: "src" (asset id or "sfx:whoosh"), no position; "volume", "trimStart", "playbackRate", "fadeInFrames",
  "fadeOutFrames". Built-in sounds: sfx:click, sfx:tick, sfx:pop, sfx:whoosh, sfx:thump, sfx:ding, sfx:riser.
- group: "children" (layers). Children's x/y are relative to the group. Optional "layout":
  { "direction": "row"|"column", "gap": 24, "padding": 24, "align": "start"|"center"|"end",
    "justify": "start"|"center"|"end"|"space-between" }.
- captions: only when the user supplied a captions asset.

Animations (optional "animations" array on any layer):
{ "property": "y", "keyframes": [ { "frame": 0, "value": 40, "easing": "land" }, { "frame": 20, "value": 0 } ] }
- Keyframe frames are relative to the LAYER's startFrame.
- Animatable: x, y, opacity, rotation, scale, fontSize, width, height, radius, letterSpacing, strokeWidth,
  trimStart, trimEnd, blur, volume, and colours fill/color/stroke.
- Before the first keyframe the first value holds; after the last the last value holds.
- Easing names: linear, easeIn, easeOut, easeInOut, easeInCubic, easeOutCubic, easeInOutCubic, easeInQuart,
  easeOutQuart, easeInOutQuart, easeInExpo, easeOutExpo, easeInOutExpo, easeInBack, easeOutBack, easeInOutBack,
  spring, hold, land, snap, glide, pop, move, exit, drift, or [x1,y1,x2,y2] cubic Bézier.
- "repeat": n (integer) repeats after the first play; "reverse": true ping-pongs.
- Kinetic text is its own field on a TEXT layer, next to "content" (never an entry inside "animations"): { "split": { "by": "words"|"letters"|"lines", "stagger": 4, "preset": "rise"|"fade"|"pop"|
  "blur"|"slide"|"drop"|"typewriter", "order": "forward"|"reverse"|"center"|"edges"|"random", "duration": 18 } }.

Transitions: fade | slide | wipe | zoom | iris | push | dip | blur. Fields: "type", "durationFrames",
"direction" ("left"|"right"|"top"|"bottom"), optional "easing", "color" (dip), "x"/"y" (iris centre).
Use at most two styles in one video and overlap scenes by the transition length.

Colours: "#rgb", "#rrggbb", "#rrggbbaa", "rgb(...)", "rgba(...)", "transparent".
Gradients replace any fill/color/stroke: { "type": "linear", "from": [0,0], "to": [400,0], "stops": [...] } or
{ "type": "radial", "center": [500,500], "radius": 400, "stops": [...] }.

Variables (only when the brief asks for template fields):
"variables": { "title": { "type": "string", "default": "Hello" }, "accent": { "type": "color", "default": "#22d3ee" } }
Use them as "{{title}}" inside strings. A string that is exactly one reference takes the typed value. Do NOT use
expressions, repeat, if or components unless the brief explicitly asks; they are easy to get subtly wrong.

# Non-negotiable rules
- Use only these layer types. No html, lottie or shader layers unless the brief explicitly asks.
- Never invent asset ids: an image/video/audio layer may only use ids listed under "assets" (and sfx: names).
- No web URLs, no {{media[...]}}, no JavaScript.
- Every scene must have layers; every layer must have a unique id; every text layer must have non-empty content.
- Text at least 24px; body 28-36px; headings 64-96px; titles 140-200px at 1920 wide.
- Keep content inside a 6% margin; keep the bottom 12% clear when captions may sit there.
- Do not use opacity 0 as a way to hide a layer for the whole video: omit it or fade it in.
- Give every rect/circle a width and height (circle: width). A rect without width and height draws nothing.
- Use "land" for entrances, "move" for repositioning, "exit" for exits, "drift" for slow continuous motion.
- Entrances are shorter than exits: 14-26 frames in, 8-14 frames out.
- Fill the frame. Avoid tiny cards floating in a corner; use margins and a consistent grid.
- Use 2-3 text colours: near-white headings, muted body, one accent.
- The background should be a dark gradient with one or two soft radial glows, not flat unless asked.

# Motion-graphics craft (this is a designed piece, not slides)
- Structure: pick one short-video shape (problem → solution → proof → CTA; step-by-step around a held hero; question then answers; or a list of 3–5 beats then a payoff). One idea per scene. Scene lengths must differ; equal-length scenes read as a slideshow.
- Open with the subject in the first second. End on the idea (or a small logo hold), not a fade of the whole frame to black.
- Carry something across cuts: a colour, a held element, a shape that morphs, or motion that continues. One transition style for the video; overlap scenes by that length. Prefer push or fade.
- Type scale at 1920 wide (scale down for smaller canvases): display 160–220, headings 72–96, card titles 44–60, body 28–36, labels 20–24. Headings weight 700–800 with letterSpacing about -3% of size; body 400. Two or three text colours: ink #f5f7fb, muted #97a0b6, one accent. Declare them once and reuse.
- Kinetic type: headlines use "split" { "by": "words", "stagger": 4, "preset": "rise" or "blur" }. One split style per video. Keep body and captions whole.
- Depth: dark gradient background, one or two large soft radial glow circles (fill fading to transparent), optional grain 0.03, and motionBlur { "samples": 8, "shutter": 180 }. Cards: faint fill, 1–2px stroke, radius 24–32, soft shadow.
- Camera: a slow zoom or pan on content scenes (zoom 1 → 1.06 over the scene). Captions and logos stay put with "fixed": true.
- Sound: put sfx:whoosh / pop / thump / tick on hits, not on every layer. export.loudness -14 (or -16 if a voiceover will be added).
- Draw icons as path layers, not letters in circles. Animate groups, stagger siblings 4–8 frames, land in / exit out.

# Design defaults that look good
- Canvas: fill it; keep left-aligned content at a consistent x (about 6-8% of the width).
- Type: fontWeight 700-800 for headings with letterSpacing about -2% of fontSize; body 400.
- Motion: stagger related items by 4-8 frames; animate groups rather than each child separately.
- Finish on a clean hold; do not fade the whole frame to black at the end unless asked.`;

export function systemPrompt(options: Partial<PromptOptions> = {}): string {
  const parts = ['You write Open Video Engine (OVE) motion-graphics compositions as strict JSON. You think like a motion designer: beats, type, camera and crafted motion — not a slide deck. You are precise about field names, frame timing and the design rules below. Output JSON only.', CHEATSHEET, movesGlossary];
  if (options.includeSchema) parts.push('# Exact JSON Schema (authoritative)\n' + JSON.stringify(compositionJsonSchema));
  return parts.join('\n\n');
}

export function planSystemPrompt(): string {
  return `You plan motion-graphics videos for Open Video Engine. Do not write a composition, scenes or layers yet.
Reply with JSON only:
{"idea":"<one sentence the viewer should remember>","look":{"background":"dark gradient description","ink":"#f5f7fb","muted":"#97a0b6","accent":"#hex"},"transition":"push|fade|dip","beats":[{"name":"kebab-id","takeaway":"one idea","onScreen":"exact words on screen","seconds":4,"motion":"how it enters; what is carried into the next beat"}]}
Rules: one idea per beat; lengths must differ; open with the subject in the first second; end on the idea, not a credit fade; onScreen is real copy, not a description of the shot; do not invent facts, prices or claims that are not in the brief.`;
}

export function planUserPrompt(brief: string, options: PromptOptions): string {
  const durationFrames = Math.max(1, Math.round(options.durationSeconds * options.fps));
  return [
    `Plan a ${options.kind ?? 'short'} motion-graphics video.`,
    `Canvas: WIDTH=${options.width} HEIGHT=${options.height} FPS=${options.fps} DURATION_SECONDS=${options.durationSeconds} DURATION_FRAMES=${durationFrames}.`,
    `Aspect ratio: ${ratioName(options.width, options.height)}.`,
    '',
    'Brief:',
    brief.trim(),
    '',
    'Return the motion plan JSON now. Do not write scenes or layers yet.',
  ].join('\n');
}

// The markers (WIDTH=, HEIGHT=, FPS=, DURATION_FRAMES=) are also read by the offline mock provider, so a dry run
// with --provider mock exercises the same path as a real model without a key or a network.
export function userPrompt(brief: string, options: PromptOptions): string {
  const { width, height, fps } = options;
  const durationFrames = Math.max(1, Math.round(options.durationSeconds * fps));
  const lines = [
    `Make a ${options.kind ?? 'short'} motion-graphics video (designed frames and motion, not slides).`,
    `Canvas: WIDTH=${width} HEIGHT=${height} FPS=${fps} DURATION_SECONDS=${options.durationSeconds} DURATION_FRAMES=${durationFrames}.`,
    `Aspect ratio: ${ratioName(width, height)}.`,
    '',
    'Brief:',
    brief.trim(),
    '',
  ];
  if (options.motionPlan) {
    lines.push('Follow this motion plan (one scene per beat, copy from onScreen, timings from seconds):');
    lines.push(JSON.stringify(options.motionPlan));
    lines.push('');
  }
  if (options.fields?.length) {
    lines.push('Template variables (declare each one in "variables" and use it in the content):');
    for (const field of options.fields) lines.push(`- ${field.name}: ${field.type}${field.example === undefined ? '' : `, e.g. ${JSON.stringify(field.example)}`}${field.description ? ` — ${field.description}` : ''}`);
    lines.push('');
  }
  if (options.assets?.length) {
    lines.push('Assets available (reference them by id only):');
    for (const asset of options.assets) lines.push(`- ${asset.id} (${asset.type}): ${asset.src}`);
    lines.push('');
  } else {
    lines.push('No assets are available: use only text, rect, circle, path, group and built-in sfx sounds.\n');
  }
  if (options.narration) lines.push('A voiceover will be added afterwards; leave the bottom of the frame clear for captions.\n');
  lines.push('Return the complete composition JSON now: several scenes of unequal length, kinetic headlines, a camera or drifting glows, grain, and motionBlur.');
  return lines.join('\n');
}

export function refineUserPrompt(composition: any, instruction: string): string {
  return [
    'Here is an existing valid OVE composition JSON:',
    '```json',
    JSON.stringify(composition, null, 2),
    '```',
    '',
    'Requested modification:',
    instruction.trim(),
    '',
    'Instructions for the modification:',
    '- Apply the requested changes accurately.',
    '- Preserve existing canvas dimensions, scenes, layers, timing, transitions, and variables unless explicitly asked to modify them.',
    '- Maintain valid OVE composition schema rules.',
    '- Return the complete updated composition JSON object only.'
  ].join('\n');
}

/** Compositions longer than this many characters are shown to the model as an outline, not in full (about 4000 tokens). */
export const refineOutlineChars = 16_000;

const clip = (value: unknown, max: number) => { const text = String(value).replace(/\s+/g, ' '); return text.length > max ? `${text.slice(0, max)}…` : text; };
const colour = (value: unknown) => typeof value === 'string' ? value : value && typeof value === 'object' ? 'gradient' : undefined;

/** One line per layer, with the path to it, so changes can be addressed exactly without sending animation and component bodies. */
export function compositionOutline(composition: any, maxLines = 400): string {
  const lines: string[] = [`Canvas ${composition.width}x${composition.height}, ${composition.fps} fps, ${composition.durationFrames} frames; theme and other variables: ${Object.entries(composition.variables ?? {}).slice(0, 14).map(([name, declaration]: [string, any]) => `${name}=${clip(typeof declaration?.default === 'object' ? JSON.stringify(declaration.default) : declaration?.default, 40)}`).join(', ') || 'none'}`];
  const layerLine = (layer: any, path: string, depth: number) => {
    const parts = [`${'  '.repeat(depth + 1)}${path}`, layer.type, `id=${layer.id}`];
    if (typeof layer.content === 'string' && layer.content) parts.push(`content="${clip(layer.content, 90)}"`);
    if (Array.isArray(layer.spans)) parts.push(`spans="${clip(layer.spans.map((span: any) => span.text).join(''), 90)}"`);
    for (const key of ['fontSize', 'fontWeight']) if (layer[key] !== undefined) parts.push(`${key}=${layer[key]}`);
    for (const key of ['color', 'fill', 'stroke']) { const value = colour(layer[key]); if (value) parts.push(`${key}=${value}`); }
    if (typeof layer.src === 'string') parts.push(`src=${clip(layer.src, 50)}`);
    for (const key of ['x', 'y', 'width', 'height']) if (typeof layer[key] === 'number') parts.push(`${key}=${Math.round(layer[key])}`);
    if (layer.startFrame) parts.push(`startFrame=${layer.startFrame}`);
    if (layer.endFrame !== undefined) parts.push(`endFrame=${layer.endFrame}`);
    if (layer.volume !== undefined && layer.volume !== 1) parts.push(`volume=${layer.volume}`);
    if (layer.split) parts.push(`split=${layer.split.preset ?? 'rise'}/${layer.split.by ?? 'words'}`);
    if (Array.isArray(layer.animations) && layer.animations.length) parts.push(`animates=${[...new Set(layer.animations.map((animation: any) => animation.property))].join('+')}`);
    lines.push(parts.join(' '));
  };
  const walk = (layers: any[], base: string, depth: number) => (layers ?? []).forEach((layer, i) => { if (lines.length >= maxLines) return; layerLine(layer, `${base}[${i}]`, depth); if (Array.isArray(layer.children)) walk(layer.children, `${base}[${i}].children`, depth + 1); });
  (composition.scenes ?? []).forEach((scene: any, i: number) => {
    lines.push(`scenes[${i}] id=${scene.id} start=${scene.startFrame} duration=${scene.durationFrames}${scene.transitionIn ? ` transitionIn=${scene.transitionIn.type}` : ''}${scene.camera ? ' camera' : ''}`);
    walk(scene.layers, `scenes[${i}].layers`, 0);
  });
  if (lines.length >= maxLines) lines.push('(outline cut here: ask for changes only to what is listed)');
  return lines.join('\n');
}

/** For a large composition: the outline, and a request for fixes by path instead of the whole composition back. */
export function refineOutlinePrompt(composition: any, instruction: string): string {
  return [
    'This is the outline of an existing valid OVE composition (one line per layer, with its path):',
    '',
    compositionOutline(composition),
    '',
    'Requested modification:',
    instruction.trim(),
    '',
    'Reply with only the changes, as JSON: {"fixes": [{"path": "scenes[0].layers[1].children[0].content", "value": "New text"}, {"path": "scenes[2].layers[0].fill", "value": "#f4a259"}, {"path": "scenes[1].layers[3]", "remove": true}]}.',
    '- Use the exact paths shown in the outline; a path ending in a field replaces that field, a path to a layer replaces the whole layer.',
    '- To change a colour or text that appears in several layers, give one fix for each of them.',
    '- Change only what was asked. Do not repeat layers or fields that stay the same, and do not invent files.',
  ].join('\n');
}

export function ratioName(width: number, height: number): string {
  if (width === height) return 'square 1:1';
  if (width * 16 === height * 9) return 'vertical 9:16';
  if (width * 9 === height * 16) return 'landscape 16:9';
  if (width * 5 === height * 4) return 'portrait 4:5';
  return `${width}x${height}`;
}
