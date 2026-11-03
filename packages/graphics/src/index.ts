import type { EvaluatedLayer } from '@ove/timeline'; import { captionLines, dropFillerWords, captionKey, type CaptionCue } from '@ove/schema';
// The renderer sets frameKey on video operations (which decoded source frame to draw) and fontPrefix/fontStack on text operations.
// `caption` is the line a captions layer shows at this frame: each word with its state (0 still to come, 1 being said, 2 said).
export type CaptionWordState = { text: string; state: 0 | 1 | 2; emphasis?: boolean };
// `vars` are an html or shader layer's variables at this frame: its vars, animated --name values, --t (seconds) and --frame.
// `mediaTime` is where a lottie layer's animation is, in seconds (after trim, speed and looping by the runtime).
export type DrawOperation = { kind: 'text'|'image'|'video'|'captions'|'rect'|'circle'|'path'|'group'|'html'|'lottie'|'shader'|'code'|'react'; layer: EvaluatedLayer; children?: DrawOperation[]; frameKey?: string; fontPrefix?: string; fontStack?: string; spanStacks?: string[]; caption?: { words: CaptionWordState[] } | null; vars?: Record<string, string | number>; mediaTime?: number };
// "center" origins become pixels: half the width/height, a circle's own centre (0), and for text the middle of maxWidth given its
// alignment and of one line vertically (use pixel values for exact pivots on multi-line text).
const resolveOrigin = (value: unknown, layer: any, axis: 'x'|'y'): number => { if (value !== 'center') return typeof value === 'number' ? value : 0; if (layer.type === 'circle') return 0;
  if (layer.type === 'text') return axis === 'y' ? (layer.fontSize*layer.lineHeight)/2 : layer.textAlign === 'center' ? 0 : ((layer.textAlign === 'right' ? -1 : 1)*(layer.maxWidth ?? 0))/2;
  return ((axis === 'x' ? layer.width : layer.height) ?? 0)/2; };
// Draw operations carry final values: animated properties replace the static ones and origins are in pixels.
const finalLayer = (layer: EvaluatedLayer): EvaluatedLayer => { const merged: any={ ...layer, ...layer.evaluated }; return { ...merged, originX: resolveOrigin(merged.originX, merged, 'x'), originY: resolveOrigin(merged.originY, merged, 'y') }; };
export const toDrawOperations = (layers: EvaluatedLayer[]): DrawOperation[] => layers.filter(layer => layer.type !== 'audio').map(finalLayer).map(layer => layer.type === 'group' ? { kind: 'group', layer, children: toDrawOperations(layer.children ?? []) } : { kind: layer.type, layer });
export const flattenLayers = (layers: readonly any[]): any[] => layers.flatMap(l => l.type === 'group' ? [l, ...flattenLayers(l.children ?? [])] : [l]);
export const flattenOperations = (operations: readonly DrawOperation[]): DrawOperation[] => operations.flatMap(op => op.kind === 'group' ? [op, ...flattenOperations(op.children ?? [])] : [op]);
// Pictures an html layer refers to: src="…" attributes and url(…) in its markup and CSS, other than data: URLs and fragments.
export const htmlReferences = (layer: { html?: string; css?: string }): string[] => { const text = `${layer.html ?? ''}\n${layer.css ?? ''}`, refs = [...text.matchAll(/(?<![\w:-])src\s*=\s*(["'])([^"']+)\1/gi)].map(m => m[2]!).concat([...text.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi)].map(m => m[2]!.trim()));
  return refs.filter(ref => !/^(data:|#|blob:)/i.test(ref)); };
// The Lottie animations a composition draws, by src.
export const collectCodeSources = (layers: readonly any[]): string[] => [...new Set(flattenLayers(layers).filter(l => (l.type === 'code' || l.type === 'react') && typeof l.src === 'string').map(l => l.src as string))];
/** True when any layer runs the composition's own JavaScript. */
export const hasCodeLayers = (layers: readonly any[]): boolean => flattenLayers(layers).some(l => l.type === 'code' || l.type === 'react');
/** True when any layer is a React component (its markup can name any image asset the composition declares). */
export const hasReactLayers = (layers: readonly any[]): boolean => flattenLayers(layers).some(l => l.type === 'react');
export const collectLottieSources = (layers: readonly any[]): string[] => [...new Set(flattenLayers(layers).filter(l => l.type === 'lottie').map(l => l.src as string))];
export const collectImageSources = (layers: readonly any[]): string[] => [...new Set(flattenLayers(layers).flatMap(l => l.type === 'image' ? [l.src as string] : l.type === 'html' ? htmlReferences(l) : []))];
export type TextLayoutOptions = { fontSize: number; maxWidth?: number; maxLines?: number; minFontSize?: number };
export type TextLayout = { lines: string[]; fontSize: number; truncated: boolean };
// The drawing runtime (packages/graphics/runtime/canvas-runtime.js) and text layout (runtime/text-layout.js) are plain browser scripts,
// read as text by @ove/graphics/runtime (Node only): the renderer injects them into its pages and the Player bundles them.
export type TextSpan = { text: string; fontSize?: number; [style: string]: unknown };
export type RichLayout = { lines: { runs: { text: string; span: number; kind: 'word' | 'space'; size: number; width: number }[]; width: number }[]; scale: number; truncated: boolean };
// Builds a CSS font shorthand. Family lists are kept; each named family is quoted so names with spaces work, generic ones are not.
const genericFamilies = new Set(['serif','sans-serif','monospace','cursive','fantasy','system-ui','ui-serif','ui-sans-serif','ui-monospace','ui-rounded','emoji','math','fangsong']);
// Inter (SIL Open Font License) is built in and is the default family, so text looks the same on every machine without font assets.
// Variable weight 100–900 and optical sizes: large text gets Inter Display's tighter shapes. Faces are split by script like the
// @fontsource-variable/inter package they come from; fonts.ts (Node) finds the files.
// What the canvas runtime reports about a frame drawn with payload.report (see createCanvasRuntime).
export type TextNote = { id: string; kind: 'text'|'captions'; x0: number; y0: number; x1: number; y1: number; size: number; baseSize: number; alpha: number; color: string; truncated: boolean; shrunk: boolean; text: string; words: number };
export type FrameReport = { texts: TextNote[]; thumb: { width: number; height: number; pixels: number[] } };
export type FontSpec = { family: string; src: string; url: string; weight: number | string; style: string; unicodeRange?: string };
export const builtinFontFaces: { family: string; file: string; weight: string; style: 'normal'|'italic'; unicodeRange: string }[] = [
  { family: 'Inter', file: 'inter-latin-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Inter', file: 'inter-latin-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { family: 'Inter', file: 'inter-cyrillic-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  { family: 'Inter', file: 'inter-cyrillic-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F' },
  { family: 'Inter', file: 'inter-greek-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF' },
  { family: 'Inter', file: 'inter-greek-ext-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+1F00-1FFF' },
  { family: 'Inter', file: 'inter-vietnamese-opsz-normal.woff2', weight: '100 900', style: 'normal', unicodeRange: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' },
  { family: 'Inter', file: 'inter-latin-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' },
  { family: 'Inter', file: 'inter-latin-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF' },
  { family: 'Inter', file: 'inter-cyrillic-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116' },
  { family: 'Inter', file: 'inter-cyrillic-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F' },
  { family: 'Inter', file: 'inter-greek-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0370-0377,U+037A-037F,U+0384-038A,U+038C,U+038E-03A1,U+03A3-03FF' },
  { family: 'Inter', file: 'inter-greek-ext-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+1F00-1FFF' },
  { family: 'Inter', file: 'inter-vietnamese-opsz-italic.woff2', weight: '100 900', style: 'italic', unicodeRange: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB' },
];
export const fontStack = (family: string) => family.split(',').map(f => f.trim()).filter(Boolean).map(f => /^["']/.test(f) || genericFamilies.has(f.toLowerCase()) ? f : `"${f.replace(/"/g, '')}"`).join(', ');
export const cssFont = (layer: { fontStyle?: string; fontWeight?: number | string; fontFamily: string }, fontSize: number) => `${layer.fontStyle ?? 'normal'} ${layer.fontWeight ?? 400} ${fontSize}px ${fontStack(layer.fontFamily)}`;

// Text operations need their CSS font parts; the runtime only appends the final (possibly shrunk) size.
// Captions layers also get the line showing at this frame. Lines are cached per cue list, since grouping words is the same every frame.
const lineCache = new WeakMap<object, Map<number, CaptionCue[]>>();
const cleaned = new WeakMap<object, CaptionCue[]>();
const linesFor = (raw: CaptionCue[], maxWords: number, fillers = false) => { let cues = raw; if (fillers) { cues = cleaned.get(raw) ?? dropFillerWords(raw); cleaned.set(raw, cues); } let byWords = lineCache.get(cues); if (!byWords) lineCache.set(cues, byWords = new Map()); let lines = byWords.get(maxWords); if (!lines) byWords.set(maxWords, lines = captionLines(cues, maxWords)); return lines; };
// The line at time t. A gap shorter than 0.3 s keeps the previous line up (fully said) so captions do not flicker between phrases.
export function captionAt(layer: { cues?: CaptionCue[]; maxWords: number; mode: string; offset?: number; dropFillers?: boolean; emphasis?: string[] }, seconds: number): { words: CaptionWordState[] } | null { const lines = linesFor(layer.cues ?? [], layer.maxWords, layer.dropFillers), t = seconds - (layer.offset ?? 0), stress = new Set((layer.emphasis ?? []).map(captionKey)), mark = (w: CaptionWordState) => stress.size && stress.has(captionKey(w.text)) ? { ...w, emphasis: true } : w;
  let cue = lines.find(c => t >= c.start && t < c.end), finished = false; if (!cue) { cue = [...lines].reverse().find(c => c.end <= t && t - c.end < 0.3); finished = !!cue; } if (!cue) return null;
  if (layer.mode === 'lines' || !cue.words?.length) return { words: cue.text.split(/\s+/).filter(Boolean).map(text => mark({ text, state: 2 as const })) };
  const current = finished ? cue.words.length : cue.words.reduce((at, w, i) => w.start <= t ? i : at, -1);
  return { words: cue.words.map((w, i) => mark({ text: w.text, state: i < current ? 2 : i === current ? 1 : 0 })) }; }
export const prepareOperations = (operations: DrawOperation[], fps = 30): DrawOperation[] => { for (const op of flattenOperations(operations)) { if (op.kind !== 'text' && op.kind !== 'captions') continue; const layer = op.layer as any; op.fontPrefix = `${layer.fontStyle} ${layer.fontWeight}`; op.fontStack = fontStack(layer.fontFamily);
  if (layer.spans?.length) op.spanStacks = layer.spans.map((span: any) => fontStack(span.fontFamily ?? layer.fontFamily));
  if (op.kind === 'captions') op.caption = captionAt(layer, (layer.localFrame - layer.startFrame)/fps); }
  for (const op of flattenOperations(operations)) { const layer = op.layer as any, own = layer.localFrame - layer.startFrame; if (op.kind === 'lottie') op.mediaTime = (layer.trimStart + own*layer.playbackRate)/fps; if (op.kind !== 'html' && op.kind !== 'shader' && op.kind !== 'code' && op.kind !== 'react') continue;
    op.vars = { ...layer.vars, ...Object.fromEntries(Object.entries(layer).filter(([key]) => key.startsWith('--'))), '--t': Math.round(own/fps*1e6)/1e6, '--frame': own, ...(op.kind === 'code' || op.kind === 'react' ? { '--fps': fps } : {}) } as Record<string, string | number>; } return operations; };
