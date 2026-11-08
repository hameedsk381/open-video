// A JSON composition drawn as a React component. `compositionAsReact` (in the CLI) writes a video whose component is
// <CompositionView composition={…} /> with the composition as data, so every video, whatever made it, is a React video: one `react` layer
// the renderer mounts, with the same encoder, audio and review as any other. The code in the bundle is this file, not anything a model wrote.
//
// Coverage is deliberate and checked: `unsupportedFeatures` names what this view cannot draw yet (video, lottie, shader, code, captions,
// masks, grades, mattes, group layout, kinetic text), so a caller keeps the JSON route for a composition that uses them instead of
// shipping a video that silently lost them. Conventions follow the canvas runtime: a layer's x, y is its top-left corner (a circle's
// centre), rotation and scale pivot on (x + originX, y + originY), and text is aligned about x.
import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { evaluateAnimation, ease, type Easing } from '@ove/animation';
import { cameraState, splitUnits } from '@ove/timeline';
import { useCurrentFrame, useVideoConfig } from './index';

type Layer = Record<string, any>;
type Scene = Record<string, any>;
/** A colour, or a gradient the renderer paints underneath every layer. */
type Background = string | { type: 'linear' | 'radial'; from?: [number, number]; to?: [number, number]; center?: [number, number]; radius?: number; stops: { offset: number; color: string }[] };
export type CompositionData = { width: number; height: number; fps: number; durationFrames: number; background?: Background; scenes: Scene[]; [key: string]: unknown };

const supportedTypes = new Set(['rect', 'circle', 'path', 'text', 'image', 'group', 'audio', 'react']);
const supportedTransitions = new Set(['fade', 'slide', 'zoom', 'wipe', 'push', 'dip', 'blur']);

/** What in a composition this view cannot draw yet, in words. Empty means the composition converts without losing anything. */
export function unsupportedFeatures(composition: CompositionData): string[] {
  const found = new Set<string>();
  const walk = (layers: Layer[], where: string) => {
    for (const layer of layers ?? []) {
      if (!supportedTypes.has(layer.type)) found.add(`${layer.type} layers (${where})`);
      if (layer.grade) found.add('colour grading');
      if (layer.matte || layer.masked) found.add('mattes and masks');
      if (layer.clipPath || layer.clip) found.add('group clipping');
      if (layer.type === 'text' && layer.spans?.length && layer.split) found.add('split rich text');
      if (layer.type === 'path' && ((layer.trimStart ?? 0) > 0 || (layer.trimEnd ?? 1) < 1 || layer.animations?.some((a: any) => a.property === 'd' || a.property === 'trimEnd' || a.property === 'trimStart'))) found.add('path trimming and morphing');
      if (layer.type === 'react') found.add('nested react layers');
      // Gradients fill and outline shapes; on text they would need the glyphs as a clip, which this view does not do yet.
      if (layer.type === 'text' && (typeof layer.color === 'object' && layer.color || typeof layer.stroke === 'object' && layer.stroke || layer.spans?.some((span: any) => typeof span.color === 'object' && span.color))) found.add('gradient text');
      if (layer.animations?.some((a: any) => String(a.property).startsWith('--'))) found.add('shader variables');
      if (layer.children) walk(layer.children, where);
    }
  };
  composition.scenes.forEach(scene => {
    walk(scene.layers, `scene "${scene.id}"`);
    if (scene.grade) found.add('colour grading');
    for (const t of [scene.transitionIn, scene.transitionOut]) if (t && !supportedTransitions.has(t.type)) found.add(`${t.type} transitions`);
  });
  if ((composition as any).export?.transparent) found.add('transparent output');
  return [...found];
}

const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
/** A layer property at a frame (counted from the layer's own start): its animation when it has one, else its fixed value. */
const valueOf = (layer: Layer, property: string, frame: number): any => {
  const animation = (layer.animations ?? []).find((a: any) => a.property === property);
  return animation ? evaluateAnimation(animation, frame) : layer[property];
};
const fontStack = (family: unknown) => String(family ?? 'Inter').split(',').map(name => { const t = name.trim(); return /^[\w-]+$/.test(t) ? t : `"${t.replace(/"/g, '')}"`; }).join(', ') + ', sans-serif';
const originOf = (layer: Layer, axis: 'originX' | 'originY', extent: number) => (layer[axis] === 'center' ? extent / 2 : num(layer[axis], 0));



/**
 * The lines the canvas runtime would break this text into, using its own layoutText (a global in the render page) with the page's
 * font measuring, so wrapping, shrinking and ellipsis agree with the JSON route. Without a page (the Node scan), undefined: CSS wraps.
 */
function layoutLines(layer: Layer, size: number): { lines: string[]; fontSize: number; shift: number; measure: (text: string) => number } | undefined {
  const lay = (globalThis as any).layoutText as undefined | ((text: string, options: Record<string, unknown>, measure: (text: string, fontSize: number) => number) => { lines: string[]; fontSize: number });
  if (typeof lay !== 'function' || typeof document === 'undefined') return undefined;
  const ctx = (layoutLines as any).ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  const prefix = `${layer.fontStyle ?? 'normal'} ${layer.fontWeight ?? 400}`, stack = fontStack(layer.fontFamily);
  ctx.letterSpacing = `${num(layer.letterSpacing, 0)}px`;
  const laid = lay(String(layer.content ?? ''), { fontSize: size, maxWidth: layer.maxWidth, maxLines: layer.maxLines, minFontSize: layer.minFontSize }, (text: string, px: number) => { ctx.font = `${prefix} ${px}px ${stack}`; return ctx.measureText(text).width; });
  // The canvas draws a line with its baseline a font-dependent distance below the y it is given ('top'); CSS puts the baseline half the
  // leading plus the font's ascent below the top of the line box. The difference, measured for this very font, moves each line to where the canvas had it.
  ctx.font = `${prefix} ${laid.fontSize}px ${stack}`;
  // Ascent and descent are measured from the alphabetic baseline; the canvas's own offset from 'top' to that baseline is read in 'top' mode.
  ctx.textBaseline = 'alphabetic'; const metrics = ctx.measureText('Hg'); ctx.textBaseline = 'top'; const fromTop = ctx.measureText('Hg'); ctx.textBaseline = 'alphabetic';
  const lineBox = laid.fontSize * num(layer.lineHeight, 1.2), ascent = num(metrics.fontBoundingBoxAscent, 0), descent = num(metrics.fontBoundingBoxDescent, 0);
  const canvasBaseline = -num(fromTop.alphabeticBaseline, 0), cssBaseline = (lineBox - (ascent + descent)) / 2 + ascent;
  return { lines: laid.lines, fontSize: laid.fontSize, shift: metrics.fontBoundingBoxAscent === undefined ? 0 : canvasBaseline - cssBaseline, measure: (text: string) => { ctx.font = `${prefix} ${laid.fontSize}px ${stack}`; return ctx.measureText(text).width; } };
}

/** The order pieces of split text start in: step 0 starts first. Kept in step with unitSteps in the canvas runtime. */
function unitSteps(n: number, order: string | undefined, seed: string): number[] {
  const mid = (n - 1) / 2;
  if (order === 'reverse') return Array.from({ length: n }, (_, i) => n - 1 - i);
  if (order === 'center') return Array.from({ length: n }, (_, i) => Math.floor(Math.abs(i - mid)));
  if (order === 'edges') return Array.from({ length: n }, (_, i) => Math.floor(mid - Math.abs(i - mid)));
  if (order === 'random') { let s = 0; for (const ch of seed) s = (Math.imul(s, 31) + ch.charCodeAt(0)) | 0; const steps = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { s = (Math.imul(s, 1103515245) + 12345) | 0; const j = (s >>> 8) % (i + 1); [steps[i], steps[j]] = [steps[j]!, steps[i]!]; } return steps; }
  return Array.from({ length: n }, (_, i) => i);
}

/**
 * Rich text (spans), placed the way the canvas runtime places it: each line's baseline sits one font ascent below the line's top, words
 * are laid left to right from the aligned start, and a span's highlight and underline are drawn behind and under its words. Split rich
 * text is not drawn here yet. Without a page (the Node scan) it is undefined and the caller shows the plain text.
 */
function richContent(layer: Layer, size: number, highlight = 1): ReactNode[] | undefined {
  const lay = (globalThis as any).layoutRich as undefined | ((spans: any[], options: Record<string, unknown>, measure: (text: string, span: any, px: number) => number) => { lines: { runs: { text: string; span: number; kind: string; size: number; width: number }[]; width: number }[]; scale: number });
  if (typeof lay !== 'function' || typeof document === 'undefined') return undefined;
  const ctx = (layoutLines as any).ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return undefined;
  const spans: any[] = layer.spans, align = layer.textAlign ?? 'left';
  const stack = (span: any) => fontStack(span.fontFamily ?? layer.fontFamily);
  const weight = (span: any) => span.fontWeight ?? layer.fontWeight ?? 400, style = (span: any) => span.fontStyle ?? layer.fontStyle ?? 'normal';
  const font = (span: any, px: number) => `${style(span)} ${weight(span)} ${px}px ${stack(span)}`;
  ctx.letterSpacing = `${num(layer.letterSpacing, 0)}px`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const laid = lay(spans, { fontSize: size, maxWidth: layer.maxWidth, maxLines: layer.maxLines, minFontSize: layer.minFontSize }, (text, span, px) => { ctx.font = font(span, px); return ctx.measureText(text).width; });
  const out: ReactNode[] = []; let top = 0, k = 0;
  // Highlighter swipe, as in the canvas runtime: `highlight` reveals the span backgrounds left to right, one span after the next.
  const hl = Math.min(1, Math.max(0, highlight)), bgSpans = spans.map((x, i) => (x.background ? i : -1)).filter(i => i >= 0), spanTotal = spans.map(() => 0), spanSeen = spans.map(() => 0);
  for (const line of laid.lines) for (const run of line.runs) spanTotal[run.span]! += run.width;
  const lineHeight = num(layer.lineHeight, 1.2), ink = (span: any) => span.color ?? layer.color ?? '#ffffff';
  const stroke = layer.stroke && num(layer.strokeWidth, 0) > 0 && typeof layer.stroke === 'string' ? `${layer.strokeWidth}px ${layer.stroke}` : undefined;
  for (const line of laid.lines) {
    const lineSize = line.runs.length ? Math.max(...line.runs.map(run => run.size)) : size * laid.scale;
    const metrics = line.runs.map(run => { ctx.font = font(spans[run.span], run.size); const m = ctx.measureText('Hg'); return { ascent: num(m.fontBoundingBoxAscent, run.size * 0.8), descent: num(m.fontBoundingBoxDescent, run.size * 0.2) }; });
    const ascent = metrics.reduce((a, m) => Math.max(a, m.ascent), 0), base = top + (ascent || lineSize * 0.8);
    let x = align === 'center' ? -line.width / 2 : align === 'right' ? -line.width : 0;
    line.runs.forEach((run, i) => {
      const span = spans[run.span], m = metrics[i]!, left = x;
      let cover = run.width + run.size * 0.16;
      if (span.background && hl < 1) {
        const index = bgSpans.indexOf(run.span), p = Math.min(1, Math.max(0, hl * bgSpans.length - index)), shown = Math.min(run.width, Math.max(0, p * spanTotal[run.span]! - spanSeen[run.span]!));
        cover = shown > 0 ? shown + run.size * (shown >= run.width ? 0.16 : 0.08) : 0;
      }
      spanSeen[run.span]! += run.width;
      if (span.background && cover > 0) out.push(createElement('div', { key: k++, style: { position: 'absolute', left: left - run.size * 0.08, top: base - run.size * 0.95, width: cover, height: run.size * 1.25, borderRadius: run.size * 0.15, background: span.background } }));
      if (run.kind === 'word') {
        const textStyle: CSSProperties = { position: 'absolute', left, top: base - m.ascent, whiteSpace: 'pre', fontFamily: stack(span), fontSize: run.size, fontWeight: weight(span), fontStyle: style(span), letterSpacing: `${num(layer.letterSpacing, 0)}px`, lineHeight: `${m.ascent + m.descent}px`, color: ink(span) };
        if (stroke) (textStyle as any).WebkitTextStroke = stroke;
        out.push(createElement('div', { key: k++, style: textStyle }, run.text));
      }
      if (span.underline) out.push(createElement('div', { key: k++, style: { position: 'absolute', left, top: base + run.size * 0.12, width: run.width, height: Math.max(1, run.size * 0.07), background: ink(span) } }));
      x += run.width;
    });
    top += lineSize * lineHeight;
  }
  return out;
}

// Group layout: children placed one after another, measured as drawn. Mirrors boxOf and layoutPlan in the canvas runtime; a child's own x and y
// then offset it from its place, so entrance animations still work. Only children that are showing take part.
type Box = { w: number; h: number; ax: number; ay: number };
function textBoxOf(layer: Layer, local: number): Box {
  const size = num(valueOf(layer, 'fontSize', local), 48), lh = num(layer.lineHeight, 1.2), align = layer.textAlign ?? 'left';
  let w = 0, h = 0;
  const ctx = (layoutLines as any).ctx ??= typeof document === 'undefined' ? undefined : document.createElement('canvas').getContext('2d');
  if (layer.spans?.length) {
    const lay = (globalThis as any).layoutRich;
    if (typeof lay === 'function' && ctx) {
      ctx.letterSpacing = `${num(layer.letterSpacing, 0)}px`;
      const font = (span: any, px: number) => `${span.fontStyle ?? layer.fontStyle ?? 'normal'} ${span.fontWeight ?? layer.fontWeight ?? 400} ${px}px ${fontStack(span.fontFamily ?? layer.fontFamily)}`;
      const laid = lay(layer.spans, { fontSize: size, maxWidth: layer.maxWidth, maxLines: layer.maxLines, minFontSize: layer.minFontSize }, (text: string, span: any, px: number) => { ctx.font = font(span, px); return ctx.measureText(text).width; });
      w = Math.max(0, ...laid.lines.map((line: any) => line.width));
      h = laid.lines.reduce((n: number, line: any) => n + (line.runs.length ? Math.max(...line.runs.map((run: any) => run.size)) : size * laid.scale) * lh, 0);
    }
  } else {
    const lines = layoutLines(layer, size);
    if (lines) { w = Math.max(0, ...lines.lines.map(line => lines.measure(line))); h = lines.lines.length ? (lines.lines.length - 1) * lines.fontSize * lh + lines.fontSize : 0; }
  }
  return { w, h, ax: align === 'center' ? w / 2 : align === 'right' ? w : 0, ay: 0 };
}
const showing = (layer: Layer, own: number) => layer.visible !== false && own >= num(layer.startFrame, 0) && (layer.endFrame === undefined || own < layer.endFrame);
function boxOf(layer: Layer, own: number): Box {
  const local = own - num(layer.startFrame, 0), w = valueOf(layer, 'width', local), h = valueOf(layer, 'height', local);
  if (layer.type === 'text') return textBoxOf(layer, local);
  if (layer.type === 'circle') { const d = num(w, 40); return { w: d, h: d, ax: d / 2, ay: d / 2 }; }
  if (layer.type === 'group' && layer.layout) { const plan = layoutPlan(layer, own); return { w: num(w, plan.w), h: num(h, plan.h), ax: 0, ay: 0 }; }
  return { w: w || 0, h: h || 0, ax: 0, ay: 0 };
}
function layoutPlan(layer: Layer, own: number): { kids: Layer[]; places: { x: number; y: number }[]; w: number; h: number } {
  const local = own - num(layer.startFrame, 0), L = layer.layout, kids = (layer.children ?? []).filter((child: Layer) => showing(child, local)).sort((a: Layer, b: Layer) => num(a.zIndex, 0) - num(b.zIndex, 0));
  const boxes = kids.map((child: Layer) => boxOf(child, local)), row = L.direction === 'row', main = (b: Box) => (row ? b.w : b.h), cross = (b: Box) => (row ? b.h : b.w), pad = num(L.padding, 0), gap = num(L.gap, 0);
  const content = boxes.reduce((n: number, b: Box) => n + main(b), 0) + gap * Math.max(0, kids.length - 1), crossMax = Math.max(0, ...boxes.map(cross));
  const W = valueOf(layer, 'width', local), H = valueOf(layer, 'height', local);
  const innerMain = (row ? W : H) !== undefined ? (row ? W : H) - 2 * pad : content, innerCross = (row ? H : W) !== undefined ? (row ? H : W) - 2 * pad : crossMax;
  let pos = pad, step = gap;
  if (L.justify === 'center') pos = pad + (innerMain - content) / 2; else if (L.justify === 'end') pos = pad + innerMain - content; else if (L.justify === 'space-between' && kids.length > 1) step = gap + (innerMain - content) / (kids.length - 1);
  const places = boxes.map((b: Box) => { const c = L.align === 'center' ? pad + (innerCross - cross(b)) / 2 : L.align === 'end' ? pad + innerCross - cross(b) : pad, place = { x: (row ? pos : c) + b.ax, y: (row ? c : pos) + b.ay }; pos += main(b) + step; return place; });
  return { kids, places, w: row ? content + 2 * pad : crossMax + 2 * pad, h: row ? crossMax + 2 * pad : content + 2 * pad };
}

function layerBox(layer: Layer, frame: number) {
  const width = num(valueOf(layer, 'width', frame), 0), height = num(valueOf(layer, 'height', frame), 0);
  return { width, height };
}

function wrapperStyle(layer: Layer, frame: number, width: number, height: number): CSSProperties {
  const x = num(valueOf(layer, 'x', frame), 0), y = num(valueOf(layer, 'y', frame), 0);
  const scale = num(valueOf(layer, 'scale', frame), 1), rotation = num(valueOf(layer, 'rotation', frame), 0), opacity = num(valueOf(layer, 'opacity', frame), 1);
  // A circle is centred on x, y: its box starts half a diameter up and to the left, and "centre" origins mean that box's middle.
  const ox = layer.type === 'circle' ? 0 : originOf(layer, 'originX', width), oy = layer.type === 'circle' ? 0 : originOf(layer, 'originY', height);
  const style: CSSProperties = { position: 'absolute', left: 0, top: 0, opacity, transformOrigin: '0 0', transform: `translate(${x + ox}px, ${y + oy}px) rotate(${rotation}deg) scale(${scale}) translate(${-ox}px, ${-oy}px)` };
  const filters: string[] = [];
  const blur = num(valueOf(layer, 'blur', frame), 0);
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (layer.shadow) filters.push(`drop-shadow(${layer.shadow.offsetX ?? 0}px ${layer.shadow.offsetY ?? 0}px ${(layer.shadow.blur ?? 0) / 2}px ${layer.shadow.color})`);
  if (layer.filter) filters.push(String(layer.filter));
  if (filters.length) style.filter = filters.join(' ');
  if (layer.blendMode && layer.blendMode !== 'normal') style.mixBlendMode = layer.blendMode;
  return style;
}

/**
 * A colour or a gradient as an SVG paint. Gradient points are in the layer's own pixels, so they become user-space coordinates; a circle's
 * box starts half a diameter up and left of its centre, so its points move by `offset`. The id comes from the gradient's content, so two
 * layers with the same gradient share one definition and different ones never collide.
 */
function svgPaint(value: any, offset = 0): { paint: string | undefined; defs: ReactElement[] } {
  if (!value || typeof value !== 'object') return { paint: value, defs: [] };
  const key = JSON.stringify([value, offset]); let hash = 0; for (const ch of key) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
  const id = `ove-grad-${(hash >>> 0).toString(36)}`;
  const stops = value.stops.map((stop: any, i: number) => createElement('stop', { key: i, offset: stop.offset, stopColor: stop.color }));
  const gradient = value.type === 'radial'
    ? createElement('radialGradient', { key: id, id, gradientUnits: 'userSpaceOnUse', cx: value.center[0] + offset, cy: value.center[1] + offset, r: value.radius }, stops)
    : createElement('linearGradient', { key: id, id, gradientUnits: 'userSpaceOnUse', x1: value.from[0] + offset, y1: value.from[1] + offset, x2: value.to[0] + offset, y2: value.to[1] + offset }, stops);
  return { paint: `url(#${id})`, defs: [gradient] };
}

function strokeProps(layer: Layer, frame: number, offset = 0): { props: Record<string, unknown>; defs: ReactElement[] } {
  const stroke = valueOf(layer, 'stroke', frame), width = num(valueOf(layer, 'strokeWidth', frame), 1);
  if (!stroke || !(width > 0)) return { props: {}, defs: [] };
  const { paint, defs } = svgPaint(stroke, offset);
  return { props: { stroke: paint, strokeWidth: width, strokeLinecap: layer.lineCap ?? 'butt', strokeLinejoin: layer.lineJoin ?? 'miter', strokeDasharray: layer.strokeDash?.join(' ') }, defs };
}

function drawLayer(layer: Layer, frame: number, key: string | number, assets: Map<string, string>): ReactElement | null {
  if (layer.visible === false || layer.type === 'audio') return null;
  const start = num(layer.startFrame, 0);
  if (frame < start || (layer.endFrame !== undefined && frame >= layer.endFrame)) return null;
  const local = frame - start;
  const { width, height } = layerBox(layer, local);
  let content: ReactNode;
  let w = width, h = height;
  if (layer.type === 'rect') {
    const fill = svgPaint(valueOf(layer, 'fill', local) ?? '#000000'), radius = Math.min(num(valueOf(layer, 'radius', local), 0), Math.min(width, height) / 2);
    const stroke = strokeProps(layer, local);
    content = createElement('svg', { width, height, style: { overflow: 'visible', display: 'block' } }, createElement('defs', null, ...fill.defs, ...stroke.defs), createElement('rect', { x: 0, y: 0, width, height, rx: radius, ry: radius, fill: fill.paint, ...stroke.props }));
  } else if (layer.type === 'circle') {
    const diameter = width || 40; const fill = svgPaint(valueOf(layer, 'fill', local) ?? '#000000', diameter / 2), stroke = strokeProps(layer, local, diameter / 2);
    w = h = diameter;
    content = createElement('svg', { width: diameter, height: diameter, style: { overflow: 'visible', display: 'block', transform: `translate(${-diameter / 2}px, ${-diameter / 2}px)` } }, createElement('defs', null, ...fill.defs, ...stroke.defs), createElement('circle', { cx: diameter / 2, cy: diameter / 2, r: diameter / 2, fill: fill.paint, ...stroke.props }));
  } else if (layer.type === 'path') {
    const fill = svgPaint(valueOf(layer, 'fill', local) ?? 'none'), stroke = strokeProps(layer, local);
    content = createElement('svg', { width: 1, height: 1, style: { overflow: 'visible', display: 'block' } }, createElement('defs', null, ...fill.defs, ...stroke.defs), createElement('path', { d: layer.d, fill: fill.paint, fillRule: layer.fillRule ?? 'nonzero', ...stroke.props }));
  } else if (layer.type === 'text') {
    const size = num(valueOf(layer, 'fontSize', local), 48), align = layer.textAlign ?? 'left';
    const textWidth = layer.maxWidth ? num(layer.maxWidth, 0) : undefined;
    // Aligned about x: centre and right text sit in a box that is centred or right-anchored on the layer's own x.
    const shift = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
    const style: CSSProperties = { position: 'absolute', left: 0, top: 0, whiteSpace: textWidth ? 'normal' : 'pre', width: textWidth, textAlign: align, transform: textWidth ? `translateX(${align === 'center' ? -textWidth / 2 : align === 'right' ? -textWidth : 0}px)` : `translateX(${shift})`, color: valueOf(layer, 'color', local) ?? '#ffffff', fontFamily: fontStack(layer.fontFamily), fontSize: size, fontWeight: layer.fontWeight ?? 400, fontStyle: layer.fontStyle ?? 'normal', letterSpacing: `${num(valueOf(layer, 'letterSpacing', local), 0)}px`, lineHeight: num(layer.lineHeight, 1.2), overflowWrap: 'normal' };
    if (layer.stroke && num(layer.strokeWidth, 0) > 0) (style as any).WebkitTextStroke = `${layer.strokeWidth}px ${layer.stroke}`;
    const rich = layer.spans?.length ? richContent(layer, size, num(valueOf(layer, 'highlight', local), 1)) : undefined, lines = layer.spans?.length ? undefined : layoutLines(layer, size);
    if (lines) {
      const lh = lines.fontSize * num(layer.lineHeight, 1.2);
      content = lines.lines.map((line: string, i: number) => createElement('div', { key: i, style: { ...style, width: undefined, whiteSpace: 'pre', fontSize: lines.fontSize, top: i * lh + lines.shift, transform: `translateX(${shift})`, lineHeight: `${lh}px` } }, line));
      if (layer.split) {
        // Split text: each word, letter or line is placed where the canvas would put it and animated on its own step.
        const by = layer.split.by ?? 'words', pieces: { text: string; x: number; y: number; w: number }[] = [];
        lines.lines.forEach((line: string, i: number) => {
          const width = lines.measure(line), start = align === 'center' ? -width / 2 : align === 'right' ? -width : 0, y = i * lh;
          if (by === 'lines') { pieces.push({ text: line, x: start, y, w: width }); return; }
          const re = by === 'letters' ? /\S/gu : /\S+/g; let m: RegExpExecArray | null;
          while ((m = re.exec(line))) pieces.push({ text: m[0], x: start + lines.measure(line.slice(0, m.index)), y, w: lines.measure(m[0]) });
        });
        const steps = unitSteps(pieces.length, layer.split.order, String(layer.id)), values = splitUnits(layer, local) as Record<string, any>[];
        content = pieces.map((p, i) => {
          const v = values[Math.min(steps[i]!, values.length - 1)] ?? {}, opacity = v.opacity ?? 1;
          if (opacity <= 0) return null;
          const pieceStyle: CSSProperties = { ...style, width: undefined, whiteSpace: 'pre', fontSize: lines.fontSize, lineHeight: `${lh}px`, left: p.x, top: p.y + lines.shift, opacity, color: v.color ?? style.color,
            transformOrigin: `${p.w / 2}px ${lines.fontSize / 2 - lines.shift}px`, transform: `translate(${v.x ?? 0}px, ${v.y ?? 0}px) rotate(${v.rotation ?? 0}deg) scale(${v.scale ?? 1})` };
          if (v.blur > 0) pieceStyle.filter = `blur(${v.blur}px)`;
          return createElement('div', { key: i, style: pieceStyle }, p.text);
        });
      }
    } else content = rich ?? createElement('div', { style }, layer.spans?.length ? layer.spans.map((span: any) => span.text).join('') : String(layer.content ?? ''));
  } else if (layer.type === 'image') {
    w = width; h = height;
    const src = assets.get(layer.src) ?? layer.src;
    content = createElement('img', { src, style: { width: width || undefined, height: height || undefined, objectFit: layer.objectFit ?? 'cover', borderRadius: num(layer.radius, 0), display: 'block' } });
  } else if (layer.type === 'group') {
    if (layer.layout) {
      const plan = layoutPlan(layer, local);
      content = plan.kids.map((child: Layer, i: number) => createElement('div', { key: i, style: { position: 'absolute', left: 0, top: 0, transform: `translate(${plan.places[i]!.x}px, ${plan.places[i]!.y}px)` } }, drawLayer(child, local, i, assets)));
    } else content = (layer.children ?? []).slice().sort((a: Layer, b: Layer) => num(a.zIndex, 0) - num(b.zIndex, 0)).map((child: Layer, i: number) => drawLayer(child, local, i, assets));
  } else return null;
  return createElement('div', { key, style: wrapperStyle(layer, local, w, h) }, content);
}

/** The scene's transition factor at a frame: 0 fully hidden to 1 fully shown, and the transition that is playing. */
function transitionAt(scene: Scene, local: number): { progress: number; type: string; direction: string; color?: string; entering: boolean } | undefined {
  const tin = scene.transitionIn, tout = scene.transitionOut, length = scene.durationFrames;
  if (tin && local < tin.durationFrames) return { progress: ease(local / tin.durationFrames, (tin.easing ?? 'easeInOut') as Easing), type: tin.type, direction: tin.direction ?? 'left', color: tin.color, entering: true };
  if (tout && local >= length - tout.durationFrames) return { progress: 1 - ease((local - (length - tout.durationFrames)) / tout.durationFrames, (tout.easing ?? 'easeInOut') as Easing), type: tout.type, direction: tout.direction ?? 'left', color: tout.color, entering: false };
  return undefined;
}

function sceneStyle(t: ReturnType<typeof transitionAt>, width: number, height: number): CSSProperties {
  const style: CSSProperties = { position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' };
  if (!t) return style;
  const p = t.progress, off = 1 - p, sign = t.entering ? 1 : -1;
  const axis = t.direction === 'left' || t.direction === 'right' ? 'x' : 'y';
  const dist = (axis === 'x' ? width : height) * off * (t.direction === 'left' || t.direction === 'top' ? -1 : 1);
  switch (t.type) {
    case 'fade': style.opacity = p; break;
    case 'slide': case 'push': style.transform = axis === 'x' ? `translateX(${dist * (t.entering ? 1 : 1)}px)` : `translateY(${dist}px)`; break;
    case 'zoom': style.opacity = p; style.transform = `scale(${t.entering ? 0.5 + 0.5 * p : 1 + 0.5 * off})`; break;
    case 'blur': style.opacity = p; style.filter = `blur(${off * 30}px)`; break;
    case 'dip': style.opacity = p; break;
    case 'wipe': style.clipPath = t.direction === 'left' ? `inset(0 ${off * 100}% 0 0)` : t.direction === 'right' ? `inset(0 0 0 ${off * 100}%)` : t.direction === 'top' ? `inset(0 0 ${off * 100}% 0)` : `inset(${off * 100}% 0 0 0)`; break;
  }
  void sign;
  return style;
}

/** Draws the composition frame by frame. Every value is a pure function of the current frame, like any other video component. */
export function CompositionView({ composition, assets = {} }: { composition: CompositionData; assets?: Record<string, string> }): ReactElement {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const urls = new Map(Object.entries(assets));
  const scenes = composition.scenes.map((scene, index) => {
    const start = num(scene.startFrame, 0), local = frame - start;
    if (local < 0 || local >= scene.durationFrames) return null;
    const t = transitionAt(scene, local);
    const ordered = (scene.layers ?? []).slice().sort((a: Layer, b: Layer) => num(a.zIndex, 0) - num(b.zIndex, 0));
    const draw = (list: Layer[]) => list.map((layer: Layer, i: number) => drawLayer(layer, local, `${scene.id}-${layer.id ?? i}`, urls));
    const children: ReactNode[] = [];
    if (scene.camera) {
      // The renderer's own camera maths: a group that puts the camera's point at the frame's centre, zoomed and turned; fixed layers stay outside it.
      const cam = cameraState(scene.camera, local, width, height);
      children.push(createElement('div', { key: 'camera', style: { position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform: `translate(${width / 2 - cam.x + cam.x}px, ${height / 2 - cam.y + cam.y}px) rotate(${-cam.rotation}deg) scale(${cam.zoom}) translate(${-cam.x}px, ${-cam.y}px)` } }, draw(ordered.filter((layer: Layer) => !layer.fixed))), ...draw(ordered.filter((layer: Layer) => layer.fixed)));
    } else children.push(...draw(ordered));
    if (t && t.type === 'dip') children.push(createElement('div', { key: 'dip', style: { position: 'absolute', inset: 0, background: t.color ?? '#000000', opacity: 1 - t.progress } }));
    return createElement('div', { key: scene.id ?? index, style: sceneStyle(t && t.type === 'dip' ? { ...t, progress: 1 } : t, width, height) }, children);
  });
  return createElement('div', { style: { position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' } }, scenes);   // no background here: the renderer paints it (and the texture and grain over it) under every layer
}
