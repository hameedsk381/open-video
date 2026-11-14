// An explainer drawn with React scene components where they exist. `compileExplainer({ reactKinds })` leaves the pictures of those scenes
// out of the composition and returns their script data; this view draws the stock composition (captions, chapters, voice, header) with
// CompositionView and the React scenes beside it. A scene kind can have several drawings (variants): the script names one, or the scene's own
// content picks (a long point wants a stacked card, a short pair wants a versus, many bars want rows), so a video is not one template.
// Every value is a pure function of the frame, like any other video component.
import { createElement as h, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { useCurrentFrame, Video } from './index';
import { AmbientGlow, Badge, BentoCard, BentoGrid, CodeEditor, DeviceFrame, GlassCard, KineticText, NumberTicker, ProgressBar, Typewriter, Waveform } from './components';
import { springValue, type SpringPreset } from './springs';
import { Sequence } from './index';
import { CompositionView, sceneStyle, transitionAt, type CompositionData } from './composition';

type Look = { palette: Record<string, string | number>; motion: 'rise' | 'drop' | 'blur' | 'fade'; cornerScale: number; weightCap: number };
type ReactScene = { sceneId: string; index: number; scene: Record<string, any>; frames: number; captions: boolean };
export type ExplainerReactData = { scenes: ReactScene[]; look: Look };
type Band = { top: number; bottom: number };
/** Where the 1080 x 1920 column sits in the frame: scaled by `fit` and moved by (ox, oy), as the stock scenes' camera does for other shapes. */
type Column = { fit: number; ox: number; oy: number };
type Ctx = { look: Look; frame: number; frames: number; band: Band; column: Column };

const W = 1080, RED = '#ff5d6c', GREEN = '#3fae8c';
const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const run = (frame: number, start: number, dur: number) => clamp((frame - start) / dur);
const land = (x: number) => 1 - Math.pow(1 - x, 3);
/** The kit's spring physics, started on frame `at`: 0 before it, settling on 1. smooth for growth, snappy for arrivals, bouncy for pops. */
const sp = (ctx: Ctx, at: number, preset: SpringPreset = 'smooth') => springValue({ frame: ctx.frame, fps: 30, delay: at, preset, from: 0, to: 1 });
const solid = (ctx: Ctx): CSSProperties => ({ background: col(ctx, 'surface'), backdropFilter: 'none', WebkitBackdropFilter: 'none', boxShadow: 'none' });
const col = (ctx: Ctx, name: string): string => String(ctx.look.palette[name] ?? name);
const radius = (ctx: Ctx, r: number) => Math.round(r * ctx.look.cornerScale);
const display = (ctx: Ctx, weight = 800): CSSProperties => ({ fontFamily: `"${col(ctx, 'fontDisplay')}", sans-serif`, fontWeight: Math.min(weight, ctx.look.weightCap), color: col(ctx, 'text') });
const body = (ctx: Ctx, weight = 500): CSSProperties => ({ fontFamily: `"${col(ctx, 'fontBody')}", sans-serif`, fontWeight: weight, color: col(ctx, 'text') });
const mono = (ctx: Ctx): CSSProperties => ({ fontFamily: '"JetBrains Mono", monospace', fontWeight: 600, letterSpacing: 6, textTransform: 'uppercase' });
const mixHex = (a: string, b: string, t: number) => {
  const p = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('');
};
/** How something arrives, in the look's own way. `at` is the frame it starts on. */
function arrive(ctx: Ctx, at: number, _dur = 22, dist = 36): CSSProperties {
  const p = sp(ctx, at, 'snappy'), op = clamp(p * 1.4);
  switch (ctx.look.motion) {
    case 'fade': return { opacity: op };
    case 'blur': return { opacity: op, filter: `blur(${Math.max(0, 1 - p) * 16}px)` };
    case 'drop': return { opacity: op, transform: `translateY(${-(1 - p) * dist}px)` };
    default: return { opacity: op, transform: `translateY(${(1 - p) * dist}px)` };
  }
}
const box = (style: CSSProperties): CSSProperties => ({ position: 'absolute', boxSizing: 'border-box', ...style });
const seeded = (seed: number) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** A column laid out in the band, its children centred: the content decides how tall it is. */
const stack = (ctx: Ctx, children: ReactNode, gap = 28, extra: CSSProperties = {}) => h('div', { style: box({ left: 60, width: W - 120, top: ctx.band.top, height: ctx.band.bottom - ctx.band.top, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap, ...extra }) }, children);
const sentence = (ctx: Ctx, text?: string) => (text && !ctxCaptions(ctx) ? h('div', { key: 'cap', style: { ...display(ctx, 700), fontSize: 46, lineHeight: 1.25, textAlign: 'center', marginTop: 14, ...arrive(ctx, Math.round(ctx.frames * 0.7)) } }, text) : null);
const ctxCaptions = (ctx: Ctx) => (ctx as Ctx & { captions?: boolean }).captions === true;

/* ---- compare: split cards, stacked cards or a versus ---- */
function compare(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const sides = [{ ...s.left, tone: RED, mark: '✗', key: 'left' }, { ...s.right, tone: col(ctx, 'accent2'), mark: '✓', key: 'right' }] as { title: string; points: string[]; tone: string; mark: string; key: string }[];
  const long = Math.max(...sides.flatMap(x => x.points.map(p => p.length))), total = sides.reduce((n, x) => n + x.points.length, 0);
  const pick = variant !== 'auto' ? variant : long > 34 || total >= 7 ? 'stacked' : sides.every(x => x.title.length <= 14 && x.points.length <= 2) ? 'versus' : 'split';
  const point = (side: typeof sides[number], p: string, k: number, at: number, size: number) => h('div', { key: k, style: { display: 'flex', gap: 16, alignItems: 'flex-start', ...arrive(ctx, at + 10 + k * 14, 18, 24) } },
    h('span', { style: { color: side.tone, fontSize: size, lineHeight: 1.2, fontWeight: 800 } }, side.mark), h('span', { style: { ...body(ctx, 500), fontSize: size, lineHeight: 1.25 } }, p));
  if (pick === 'stacked') {
    const card = (side: typeof sides[number], i: number) => h(GlassCard, { key: side.key, delay: 6 + i * 40, style: { ...solid(ctx), border: `3px solid ${side.tone}`, borderRadius: radius(ctx, 28), padding: '34px 40px', display: 'flex', flexDirection: 'column', gap: 16 } },
      h('div', { style: { ...display(ctx, 800), fontSize: 58, color: side.tone, lineHeight: 1.05 } }, side.title), ...side.points.map((p, k) => point(side, p, k, 6 + i * 40, 38)));
    return stack(ctx, [card(sides[0]!, 0), h('div', { key: 'arrow', style: { ...mono(ctx), color: col(ctx, 'muted'), textAlign: 'center', fontSize: 28, ...arrive(ctx, 30) } }, '↓ so instead ↓'), card(sides[1]!, 1), sentence(ctx, s.caption)], 22);
  }
  if (pick === 'versus') {
    const half = (side: typeof sides[number], i: number) => h('div', { key: side.key, style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: i === 0 ? 'flex-end' : 'flex-start', textAlign: i === 0 ? 'right' : 'left', gap: 20, ...arrive(ctx, 6 + i * 22, 24, i === 0 ? 0 : 0) } },
      h('div', { style: { ...display(ctx, 900), fontSize: 66, color: side.tone, lineHeight: 1 } }, side.title),
      h('div', { style: { height: 4, width: 120 * sp(ctx, 14 + i * 22), background: side.tone, borderRadius: 2 } }),
      ...side.points.map((p, k) => h('div', { key: k, style: { ...body(ctx, 500), fontSize: 40, lineHeight: 1.25, ...arrive(ctx, 30 + i * 20 + k * 16, 18, 20) } }, p)));
    return stack(ctx, [h('div', { key: 'row', style: { display: 'flex', alignItems: 'center', gap: 28 } }, half(sides[0]!, 0),
      h('div', { key: 'vs', style: { ...display(ctx, 900), width: 112, height: 112, flex: 'none', borderRadius: 56, background: col(ctx, 'accent'), color: col(ctx, 'bg'), fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${sp(ctx, 4, 'bouncy')})` } }, 'VS'),
      half(sides[1]!, 1)), sentence(ctx, s.caption)], 56);
  }
  const card = (side: typeof sides[number], i: number) => h(GlassCard, { key: side.key, delay: 6 + i * 16, style: { flex: 1, minWidth: 0, alignSelf: 'stretch', ...solid(ctx), borderTop: `8px solid ${side.tone}`, borderRadius: radius(ctx, 24), padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 20 } },
    h('div', { style: { ...display(ctx, 800), fontSize: 46, color: side.tone, lineHeight: 1.05 } }, side.title), ...side.points.map((p, k) => point(side, p, k, 6 + i * 16, 34)));
  return stack(ctx, [h('div', { key: 'row', style: { display: 'flex', gap: 24, alignItems: 'stretch' } }, card(sides[0]!, 0), card(sides[1]!, 1)), sentence(ctx, s.caption)], 30);
}

/* ---- chart: columns, rows or a line ---- */
function chart(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const items = s.items as { label: string; value: number }[], unit = s.unit ?? '', max = Math.max(...items.map(i => i.value), 1);
  const top = typeof s.highlight === 'number' ? s.highlight : items.reduce((best, item, i) => (item.value > items[best]!.value ? i : best), 0);
  const longest = Math.max(...items.map(i => i.label.length));
  const pick = variant !== 'auto' ? variant : s.type === 'line' ? 'line' : items.length >= 6 || longest > 9 ? 'rows' : 'columns';
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`;
  const tone = (i: number) => (i === top ? col(ctx, 'accent') : col(ctx, 'accent2'));
  if (pick === 'rows') {
    return stack(ctx, [...items.map((item, i) => {
      const at = 6 + i * 8;
      return h('div', { key: i, style: { ...arrive(ctx, at, 16, 18) } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', ...body(ctx, 600), fontSize: 32, marginBottom: 8 } }, h('span', null, item.label), h('span', { style: { color: tone(i), fontWeight: 800 } }, h(NumberTicker, { value: item.value, decimals: Number.isInteger(item.value) ? 0 : 1, suffix: unit, delay: at + 4 }))),
        h(ProgressBar, { value: item.value / max, delay: at + 4, color: tone(i), height: 30, style: { background: col(ctx, 'surface'), borderRadius: radius(ctx, 15) } }));
    }), sentence(ctx, s.caption)], 26);
  }
  if (pick === 'line') {
    const w = 940, hgt = 620, padL = 20, n = items.length, xs = items.map((_, i) => padL + (i * (w - 2 * padL)) / Math.max(1, n - 1)), ys = items.map(i => hgt - 40 - (i.value / max) * (hgt - 120));
    const path = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' '), drawn = sp(ctx, 6), length = xs.reduce((sum, x, i) => (i ? sum + Math.hypot(x - xs[i - 1]!, ys[i]! - ys[i - 1]!) : 0), 0);
    return stack(ctx, [h('svg', { key: 'svg', width: w, height: hgt + 60, viewBox: `0 0 ${w} ${hgt + 60}`, style: { alignSelf: 'center', overflow: 'visible' } },
      h('line', { x1: 0, y1: hgt - 20, x2: w, y2: hgt - 20, stroke: col(ctx, 'muted'), strokeOpacity: 0.5, strokeWidth: 3 }),
      h('path', { d: path, fill: 'none', stroke: col(ctx, 'accent2'), strokeWidth: 8, strokeLinecap: 'round', strokeLinejoin: 'round', strokeDasharray: length, strokeDashoffset: length * (1 - drawn) }),
      ...items.map((item, i) => { const shown = drawn >= i / Math.max(1, n - 1) - 0.001, r = i === top ? 16 + 4 * Math.sin(ctx.frame / 9) : 10; return h('g', { key: i, opacity: shown ? 1 : 0 },
        i === top && drawn >= 1 ? h('circle', { cx: xs[i], cy: ys[i], r: 20 + ((ctx.frame % 45) / 45) * 50, fill: 'none', stroke: tone(i), strokeWidth: 4, opacity: 1 - (ctx.frame % 45) / 45 }) : null,
        h('circle', { cx: xs[i], cy: ys[i], r, fill: tone(i) }),
        h('text', { x: xs[i], y: hgt + 20, textAnchor: 'middle', fill: col(ctx, 'muted'), fontSize: 26, fontFamily: `"${col(ctx, 'fontBody')}"` }, item.label),
        i === top ? h('text', { x: xs[i], y: ys[i]! - 30, textAnchor: 'middle', fill: col(ctx, 'accent'), fontSize: 48, fontWeight: 800, fontFamily: `"${col(ctx, 'fontDisplay')}"` }, fmt(item.value)) : null); })), sentence(ctx, s.caption)], 30);
  }
  const hgt = 640;
  return stack(ctx, [h('div', { key: 'bars', style: { display: 'flex', alignItems: 'flex-end', gap: 22, height: hgt + 120, justifyContent: 'center' } }, ...items.map((item, i) => {
    const at = 6 + i * 7, p = sp(ctx, at), height = Math.max(8, (item.value / max) * hgt * p);
    return h('div', { key: i, style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 12 } },
      h('div', { style: { ...display(ctx, 800), fontSize: i === top ? 44 : 34, color: tone(i), opacity: clamp(p * 2 - 0.6) } }, h(NumberTicker, { value: item.value, decimals: Number.isInteger(item.value) ? 0 : 1, suffix: unit, delay: at })),
      h('div', { style: { width: '100%', height, background: tone(i), filter: i === top ? `brightness(${1 + 0.12 * Math.sin(ctx.frame / 10)})` : undefined, borderRadius: `${radius(ctx, 16)}px ${radius(ctx, 16)}px 6px 6px` } }),
      h('div', { style: { ...body(ctx, 600), color: col(ctx, 'muted'), fontSize: 26, textAlign: 'center' } }, item.label));
  })), sentence(ctx, s.caption)], 34);
}

/* ---- flow: sources reach a buffer, then a sink; down the screen (funnel) or across it (chain) ---- */
function flow(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const sources = s.sources as string[], n = sources.length, cy = (ctx.band.top + ctx.band.bottom) / 2;
  const pick = variant !== 'auto' ? variant : n <= 3 ? 'chain' : 'funnel';
  const f = ctx.frame, panel = (id: string, x: number, y: number, w: number, hgt: number, content: ReactNode, at: number, border = col(ctx, 'accent'), fill = col(ctx, 'surface')) => h('div', { key: id, style: box({ left: x, top: y, width: w, height: hgt, background: fill, border: `3px solid ${border}`, borderRadius: radius(ctx, 22), display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', ...arrive(ctx, at, 20, 26) }) }, content);
  const label = (text: string, size: number, color = col(ctx, 'text')) => h('span', { style: { ...display(ctx, 800), fontSize: size, color, letterSpacing: 2 } }, text);
  const tag = (id: string, text: string, tone: string, x: number, y: number, at: number) => h('div', { key: id, style: box({ left: 0, width: W, top: y, textAlign: 'center', ...mono(ctx), fontSize: 26, color: tone, ...arrive(ctx, at, 16, 18) }) }, text);
  const toneOf = (name: string) => (name === 'red' ? RED : name === 'mint' ? col(ctx, 'accent2') : name === 'muted' ? col(ctx, 'muted') : col(ctx, 'accent'));
  const lines: ReactNode[] = [], dots: ReactNode[] = [], parts: ReactNode[] = [];
  const dot = (id: string, pts: [number, number][], phase: number) => {
    const t = (((f - 20 - phase) % 70) + 70) % 70 / 70; if (f < 20 + phase) return; const seg = t * (pts.length - 1), a = Math.min(pts.length - 2, Math.floor(seg)), k = seg - a;
    dots.push(h('circle', { key: id, cx: pts[a]![0] + (pts[a + 1]![0] - pts[a]![0]) * k, cy: pts[a]![1] + (pts[a + 1]![1] - pts[a]![1]) * k, r: 10, fill: col(ctx, 'accent'), opacity: 0.95 }));
  };
  if (pick === 'chain') {
    const chipH = 84, gap = 26, total = n * chipH + (n - 1) * gap, y0 = cy - total / 2, bx = 400, bw = 280, bh = Math.max(300, total + 40), by = cy - bh / 2, sx = 770, sw = 250, sh = 190, sy = cy - sh / 2;
    sources.forEach((name, i) => { const y = y0 + i * (chipH + gap), mid = y + chipH / 2, ty = clamp(mid, by + 30, by + bh - 30);
      parts.push(panel(`src${i}`, 60, y, 260, chipH, label(name, 34), 4 + i * 6, col(ctx, 'muted'), col(ctx, 'surface')));
      lines.push(h('path', { key: `l${i}`, d: `M320,${mid} L${bx},${ty}`, stroke: col(ctx, 'muted'), strokeOpacity: 0.5, strokeWidth: 3, fill: 'none' })); dot(`d${i}`, [[320, mid], [bx, ty], [bx + bw, cy], [sx, cy]], i * 9); });
    lines.push(h('path', { key: 'l-out', d: `M${bx + bw},${cy} L${sx},${cy}`, stroke: col(ctx, 'muted'), strokeOpacity: 0.5, strokeWidth: 3, fill: 'none' }));
    parts.push(panel('buffer', bx, by, bw, bh, label(s.buffer, 34, col(ctx, 'accent')), 14), panel('sink', sx, sy, sw, sh, label(s.sink, 28), 26, col(ctx, 'accent2')));
    if (s.spike) parts.push(tag('spike', `▲ ${s.spike}`, RED, 0, by - 70, 18));
    if (s.note) parts.push(tag('note', s.note.text, toneOf(s.note.tone), 0, by + bh + 24, 30));
    if (s.result) parts.push(tag('result', s.result.text, toneOf(s.result.tone), 0, by + bh + 110, Math.round(ctx.frames * 0.55)));
  } else {
    const gap = 16, cw = Math.min(170, (W - 120 - gap * (n - 1)) / n), rowW = n * cw + (n - 1) * gap, x0 = (W - rowW) / 2, ty = cy - 380, bx = 130, bw = W - 260, by = cy - 70, bh = 150, sw = 380, sx = (W - sw) / 2, sy = cy + 250, sh = 130;
    sources.forEach((name, i) => { const x = x0 + i * (cw + gap), mid = x + cw / 2;
      parts.push(panel(`src${i}`, x, ty, cw, 90, label(name, cw < 110 ? 24 : 30), 4 + i * 5, col(ctx, 'muted')));
      lines.push(h('path', { key: `l${i}`, d: `M${mid},${ty + 90} L${mid},${by}`, stroke: col(ctx, 'muted'), strokeOpacity: 0.5, strokeWidth: 3, fill: 'none' })); dot(`d${i}`, [[mid, ty + 90], [mid, by], [W / 2, by + bh], [W / 2, sy]], i * 8); });
    lines.push(h('path', { key: 'l-out', d: `M${W / 2},${by + bh} L${W / 2},${sy}`, stroke: col(ctx, 'muted'), strokeOpacity: 0.5, strokeWidth: 3, fill: 'none' }));
    parts.push(panel('buffer', bx, by, bw, bh, label(s.buffer, 40, col(ctx, 'accent')), 14), panel('sink', sx, sy, sw, sh, label(s.sink, 38), 24, col(ctx, 'accent2')));
    if (s.spike) parts.push(tag('spike', `▲ ${s.spike}`, RED, 0, ty - 70, 18));
    if (s.note) parts.push(tag('note', s.note.text, toneOf(s.note.tone), 0, by + bh + 20, 30));
    if (s.result) parts.push(tag('result', s.result.text, toneOf(s.result.tone), 0, sy + sh + 40, Math.round(ctx.frames * 0.55)));
  }
  return h('div', { style: box({ left: 0, top: 0, width: W, height: 1920 }) }, h('svg', { key: 'svg', width: W, height: 1920, style: box({ left: 0, top: 0 }) }, ...lines, ...dots), ...parts, h('div', { key: 'cap', style: box({ left: 60, width: W - 120, top: ctx.band.bottom - 70, textAlign: 'center' }) }, sentence(ctx, s.caption)));
}

/* ---- grid: a board of counters or a heatmap; the board fills the width, or one cell is lifted out to read ---- */
function grid(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const rows = s.rows ?? 9, cols = s.cols ?? 8, rnd = seeded(s.seed ?? 7), hot = s.hot ?? { row: Math.floor(rows / 2), col: Math.floor(cols / 2) }, f = ctx.frame;
  const heat = s.mode === 'heatmap', cells = Array.from({ length: rows * cols }, (_, i) => { const r = Math.floor(i / cols), c = i % cols, base = rnd(), near = Math.max(0, 1 - Math.hypot(r - hot.row, c - hot.col) / 3); return { r, c, v: clamp(base * 0.4 + near * 0.85), n: 10 + Math.floor(base * 90) }; });
  const pick = variant !== 'auto' ? variant : heat && s.callout ? 'spotlight' : 'board';
  const avail = ctx.band.bottom - ctx.band.top, size = pick === 'spotlight' ? 0.7 : 1, gap = 8, cell = Math.min(112, (W - 160 - gap * (cols - 1)) / cols, ((avail - (pick === 'spotlight' ? 460 : 140)) - gap * (rows - 1)) / rows) * size;
  const hotCell = cells[hot.row * cols + hot.col]!;
  const view = h('div', { key: 'grid', style: { display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gap: gap * size, justifyContent: 'center' } }, ...cells.map((c, i) => {
    const at = 4 + (c.r + c.c) * 1.6, p = sp({ ...ctx, frame: f }, at), isHot = c.r === hot.row && c.c === hot.col;
    const fill = heat ? mixHex(GREEN, RED, c.v) : isHot ? col(ctx, 'accent') : col(ctx, 'surface');
    return h('div', { key: i, style: { width: cell, height: cell, borderRadius: radius(ctx, 12), background: fill, opacity: heat ? p * (0.45 + c.v * 0.55) : p, transform: `scale(${0.6 + 0.4 * p})`, display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(ctx, 700), fontSize: cell * 0.36, color: isHot && !heat ? col(ctx, 'bg') : col(ctx, 'muted'), outline: isHot ? `4px solid ${col(ctx, 'accent')}` : 'none', outlineOffset: 3 } }, heat ? '' : isHot ? h(NumberTicker, { value: c.n + 70, from: c.n, delay: 40 }) : c.n);
  }));
  const spot = pick === 'spotlight' ? h('div', { key: 'spot', style: { display: 'flex', alignItems: 'center', gap: 30, justifyContent: 'center', ...arrive(ctx, 20) } },
    h('div', { style: { width: 150, height: 150, borderRadius: radius(ctx, 28), flex: 'none', background: heat ? mixHex(GREEN, RED, hotCell.v) : col(ctx, 'accent'), transform: `scale(${1 + 0.06 * Math.sin(f / 8)})` } }),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 } }, h('div', { style: { ...display(ctx, 800), fontSize: 50, lineHeight: 1.1, color: col(ctx, 'accent') } }, s.callout ?? s.result ?? ''), s.resultNote ? h('div', { style: { ...body(ctx), fontSize: 30, color: col(ctx, 'muted') } }, s.resultNote) : null)) : null;
  const card = pick !== 'spotlight' && heat && s.result ? h('div', { key: 'card', style: { alignSelf: 'center', background: col(ctx, 'surface'), border: `3px solid ${col(ctx, 'accent')}`, borderRadius: radius(ctx, 22), padding: '16px 34px', ...display(ctx, 800), fontSize: 40, ...arrive(ctx, Math.round(ctx.frames * 0.45)) } }, s.result) : null;
  return stack(ctx, [spot, view, card, sentence(ctx, s.caption)], 36);
}

/* ---- steps: a list, a ladder or cards; the current step is lit as the scene plays ---- */
function steps(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const items = s.items as { title: string; detail?: string }[], n = items.length;
  const pick = variant !== 'auto' ? variant : items.some(i => i.detail) && n <= 4 ? 'ladder' : n >= 4 ? 'list' : 'cards';
  const gap = Math.min(30, Math.max(14, (ctx.frames - 60) / n)), at = (k: number) => 8 + k * gap;
  const cur = Math.min(n - 1, Math.floor(clamp((ctx.frame - 12) / Math.max(1, ctx.frames - 40)) * n)), lit = (k: number) => k <= cur;
  if (pick === 'bento') {
    return stack(ctx, [h(BentoGrid, { key: 'bento', columns: 2, gap: 22 }, ...items.map((item, k) => h(BentoCard, { key: k, delay: at(k), colSpan: k === 0 && n % 2 === 1 ? 2 : 1, glowColor: 'transparent',
      style: { ...solid(ctx), border: `3px solid ${lit(k) ? col(ctx, 'accent') : 'transparent'}`, borderRadius: radius(ctx, 26), padding: 30, boxShadow: 'none', gap: 8 },
      title: h('span', { style: { ...display(ctx, 800), fontSize: 44, lineHeight: 1.1 } }, item.title),
      badge: h(Badge, { dot: false, delay: at(k) + 4, style: { background: lit(k) ? col(ctx, 'accent') : col(ctx, 'bg'), border: 'none', color: lit(k) ? col(ctx, 'bg') : col(ctx, 'muted'), fontSize: 30, fontWeight: 800, padding: '4px 18px' } }, String(k + 1)),
      subtitle: item.detail ? h('span', { style: { ...body(ctx), fontSize: 28, lineHeight: 1.3, color: col(ctx, 'muted') } }, item.detail) : undefined }))), sentence(ctx, s.caption)], 26);
  }
  if (pick === 'ladder') {
    return stack(ctx, [h('div', { key: 'ladder', style: { position: 'relative', paddingLeft: 96, display: 'flex', flexDirection: 'column', gap: 44 } },
      h('div', { style: box({ left: 30, top: 20, width: 6, height: '100%', background: col(ctx, 'muted'), opacity: 0.3, borderRadius: 3 }) }),
      h('div', { style: box({ left: 30, top: 20, width: 6, height: `${land(run(ctx.frame, 8, ctx.frames - 30)) * 94}%`, background: col(ctx, 'accent'), borderRadius: 3 }) }),
      ...items.map((item, k) => h('div', { key: k, style: { position: 'relative', ...arrive(ctx, at(k), 20, 30) } },
        h('div', { style: box({ left: -96, top: -2, width: 68, height: 68, borderRadius: 34, background: lit(k) ? col(ctx, 'accent') : col(ctx, 'surface'), color: lit(k) ? col(ctx, 'bg') : col(ctx, 'muted'), display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(ctx, 900), fontSize: 36 }) }, String(k + 1)),
        h('div', { style: { ...display(ctx, 800), fontSize: 48, lineHeight: 1.1, color: lit(k) ? col(ctx, 'text') : col(ctx, 'muted') } }, item.title),
        item.detail ? h('div', { style: { ...body(ctx, 500), fontSize: 32, lineHeight: 1.3, marginTop: 8, color: col(ctx, 'muted') } }, item.detail) : null))), sentence(ctx, s.caption)], 30);
  }
  if (pick === 'list') {
    return stack(ctx, [...items.map((item, k) => h('div', { key: k, style: { display: 'flex', alignItems: 'baseline', gap: 26, borderBottom: '3px solid ' + col(ctx, 'muted') + '55', paddingBottom: 20, ...arrive(ctx, at(k), 18, 24) } },
      h('span', { style: { ...display(ctx, 900), fontSize: 64, color: lit(k) ? col(ctx, 'accent') : col(ctx, 'muted'), minWidth: 90 } }, String(k + 1).padStart(2, '0')),
      h('div', { style: { minWidth: 0 } }, h('div', { style: { ...display(ctx, 700), fontSize: 42, lineHeight: 1.15 } }, item.title), item.detail ? h('div', { style: { ...body(ctx), fontSize: 28, color: col(ctx, 'muted'), marginTop: 4 } }, item.detail) : null))), sentence(ctx, s.caption)], 26);
  }
  return stack(ctx, [...items.map((item, k) => h(GlassCard, { key: k, delay: at(k), style: { ...solid(ctx), borderRadius: radius(ctx, 26), padding: '28px 34px', display: 'flex', alignItems: 'center', gap: 28, border: `3px solid ${lit(k) ? col(ctx, 'accent') : 'transparent'}` } },
    h('div', { style: { ...display(ctx, 900), fontSize: 96, lineHeight: 1, color: lit(k) ? col(ctx, 'accent') : col(ctx, 'muted'), minWidth: 80, textAlign: 'center' } }, String(k + 1)),
    h('div', { style: { minWidth: 0 } }, h('div', { style: { ...display(ctx, 800), fontSize: 44, lineHeight: 1.15 } }, item.title), item.detail ? h('div', { style: { ...body(ctx), fontSize: 28, color: col(ctx, 'muted'), marginTop: 6 } }, item.detail) : null))), sentence(ctx, s.caption)], 24);
}

/* ---- timeline: a spine with the events on one side, or zigzagging across it ---- */
function timeline(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const events = s.events as { when: string; title: string; detail?: string }[], n = events.length;
  const pick = variant !== 'auto' ? variant : n <= 4 && events.every(e => e.title.length <= 28 && !e.detail) ? 'zigzag' : 'spine';
  const zig = pick === 'zigzag', gap = Math.min(34, Math.max(14, (ctx.frames - 60) / n)), at = (k: number) => 8 + k * gap, draw = land(run(ctx.frame, 6, ctx.frames - 40));
  const spineLeft = zig ? (W - 120) / 2 - 3 : 19;
  const spine = h('div', { key: 'spine', style: box({ left: spineLeft, top: 0, width: 6, height: '100%', background: col(ctx, 'muted'), opacity: 0.3, borderRadius: 3 }) });
  const fill = h('div', { key: 'fill', style: box({ left: spineLeft, top: 0, width: 6, height: draw * 100 + '%', background: col(ctx, 'accent'), borderRadius: 3 }) });
  const item = (e: typeof events[number], k: number) => {
    const left = zig && k % 2 === 0;
    const text = h('div', { style: { ...(zig ? { width: '44%', marginLeft: left ? 0 : 'auto', textAlign: left ? 'right' : 'left' } : { marginLeft: 80 }), ...arrive(ctx, at(k), 20, 26) } },
      h('div', { style: { ...mono(ctx), fontSize: 24, letterSpacing: 4, color: col(ctx, 'accent') } }, e.when),
      h('div', { style: { ...display(ctx, 800), fontSize: zig ? 40 : 44, lineHeight: 1.12, marginTop: 4 } }, e.title),
      e.detail ? h('div', { style: { ...body(ctx), fontSize: 28, color: col(ctx, 'muted'), marginTop: 6 } }, e.detail) : null);
    const dot = h('div', { style: box({ left: spineLeft + 3 - 17, top: 10, width: 34, height: 34, borderRadius: 17, background: col(ctx, 'accent'), transform: `scale(${sp(ctx, at(k), 'bouncy')})` }) });
    return h('div', { key: k, style: { position: 'relative' } }, dot, text);
  };
  return stack(ctx, [h('div', { key: 'tl', style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: 46 } }, spine, fill, ...events.map(item)), sentence(ctx, s.caption)], 30);
}

/* ---- stat: one number, as a hero, a ring or stacked over its label ---- */
function stat(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const value = String(s.value), numeric = parseFloat(value.replace(/[^0-9.]/g, '')), pct = /%$/.test(value.trim()) && Number.isFinite(numeric) && numeric <= 100;
  const pick = variant !== 'auto' ? variant : pct ? 'ring' : value.length <= 4 ? 'hero' : 'stacked';
  const tone = s.tone === 'red' ? RED : s.tone === 'mint' ? col(ctx, 'accent2') : s.tone === 'muted' ? col(ctx, 'muted') : col(ctx, 'accent');
  const p = sp(ctx, 4);
  const parts = /^(\D*?)(\d[\d,]*\.?\d*)(.*)$/.exec(value.trim());
  const shown: ReactNode = parts ? h(NumberTicker, { value: parseFloat(parts[2]!.replace(/,/g, '')), prefix: parts[1], suffix: parts[3], decimals: (parts[2]!.split('.')[1] ?? '').length, delay: 4 }) : value;
  const label = h('div', { key: 'label', style: { ...display(ctx, 700), fontSize: 50, lineHeight: 1.2, textAlign: 'center' } }, h(KineticText, { text: String(s.label), delay: 24, staggerDelay: 2, preset: 'snappy', style: { justifyContent: 'center' } }));
  const note = s.note ? h('div', { key: 'note', style: { ...body(ctx), fontSize: 30, color: col(ctx, 'muted'), textAlign: 'center', ...arrive(ctx, 40) } }, s.note) : null;
  if (pick === 'ring') {
    const r = 250, c = 2 * Math.PI * r, frac = (Number.isFinite(numeric) ? numeric : 0) / 100;
    return stack(ctx, [h('div', { key: 'ring', style: { alignSelf: 'center', position: 'relative', width: 600, height: 600 } },
      h('svg', { width: 600, height: 600, viewBox: '0 0 600 600' }, h('circle', { cx: 300, cy: 300, r, fill: 'none', stroke: col(ctx, 'surface'), strokeWidth: 44 }),
        h('circle', { cx: 300, cy: 300, r, fill: 'none', stroke: tone, strokeWidth: 44, strokeLinecap: 'round', strokeDasharray: c, strokeDashoffset: c * (1 - frac * p), transform: 'rotate(-90 300 300)' })),
      h('div', { style: box({ left: 0, top: 0, width: 600, height: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', ...display(ctx, 900), fontSize: 150, color: tone }) }, shown)), label, note], 30);
  }
  if (pick === 'stacked') return stack(ctx, [h('div', { key: 'v', style: { ...display(ctx, 900), fontSize: 120, lineHeight: 1.05, color: tone, textAlign: 'left', ...arrive(ctx, 4, 26) } }, shown), h('div', { key: 'rule', style: { height: 6, width: 220 * sp(ctx, 16), background: tone, borderRadius: 3 } }),
    h('div', { key: 'l', style: { ...display(ctx, 700), fontSize: 54, lineHeight: 1.2 } }, h(KineticText, { text: String(s.label), delay: 26, staggerDelay: 2, preset: 'snappy' })), s.note ? h('div', { key: 'n', style: { ...body(ctx), fontSize: 30, color: col(ctx, 'muted'), ...arrive(ctx, 40) } }, s.note) : null], 26);
  return stack(ctx, [h('div', { key: 'v', style: { ...display(ctx, 900), fontSize: 300, lineHeight: 1, color: tone, textAlign: 'center', transform: `scale(${0.9 + 0.1 * sp(ctx, 4, 'bouncy')})`, opacity: clamp(p * 3) } }, shown), label, note], 36);
}

/* ---- quote: a card with its source and stamp, or a pull quote with a bar ---- */
function quote(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const pick = variant !== 'auto' ? variant : String(s.text).length > 120 ? 'pull' : 'card';
  const stampTone = s.stamp ? (s.stamp.tone === 'red' ? RED : s.stamp.tone === 'mint' ? col(ctx, 'accent2') : s.stamp.tone === 'muted' ? col(ctx, 'muted') : col(ctx, 'accent')) : '';
  const stamp = s.stamp ? h(Badge, { key: 'stamp', dot: false, delay: 36, style: { alignSelf: 'flex-start', background: 'transparent', border: `3px solid ${stampTone}`, color: stampTone, ...mono(ctx), fontSize: 24, padding: '6px 16px', borderRadius: radius(ctx, 8), transform: `rotate(-3deg) scale(${sp(ctx, 36, 'bouncy')})` } }, s.stamp.text) : null;
  const who = h('div', { key: 'who', style: { ...arrive(ctx, 30) } }, h('div', { style: { ...display(ctx, 800), fontSize: 38, color: col(ctx, 'accent') } }, '— ' + s.source), s.byline || s.date ? h('div', { style: { ...body(ctx), fontSize: 28, color: col(ctx, 'muted'), marginTop: 4 } }, [s.byline, s.date].filter(Boolean).join(' · ')) : null);
  if (pick === 'typed') {
    const text = `“${s.text}”`;
    return stack(ctx, [stamp, h('div', { key: 'q', style: { display: 'flex', gap: 30 } }, h('div', { style: { width: 10, flex: 'none', background: col(ctx, 'accent'), borderRadius: 5 } }),
      h(Typewriter, { text, delay: 6, speed: Math.max(0.5, text.length / (ctx.frames * 0.55)), style: { display: 'block', ...display(ctx, 600), fontFamily: '"JetBrains Mono", monospace', fontSize: 44, lineHeight: 1.35, whiteSpace: 'pre-wrap' }, cursorStyle: { color: col(ctx, 'accent') } })), who, sentence(ctx, s.caption)], 34);
  }
  if (pick === 'pull') {
    return stack(ctx, [stamp, h('div', { key: 'q', style: { display: 'flex', gap: 30 } }, h('div', { style: { width: 10, flex: 'none', background: col(ctx, 'accent'), borderRadius: 5, transform: `scaleY(${sp(ctx, 4)})`, transformOrigin: 'top' } }),
      h('div', { style: { ...display(ctx, 700), fontSize: 50, lineHeight: 1.25, ...arrive(ctx, 10, 24) } }, `“${s.text}”`)), who, sentence(ctx, s.caption)], 34);
  }
  return stack(ctx, [h(GlassCard, { key: 'card', delay: 4, style: { ...solid(ctx), borderRadius: radius(ctx, 30), padding: '50px 46px', display: 'flex', flexDirection: 'column', gap: 30, position: 'relative' } },
    h('div', { style: { ...display(ctx, 900), fontSize: 180, lineHeight: 0.6, color: col(ctx, 'accent'), height: 70 } }, '“'), h('div', { style: { ...display(ctx, 600), fontSize: 48, lineHeight: 1.3 } }, s.text), who, stamp), sentence(ctx, s.caption)], 30);
}

/* ---- title: a poster (flush left, one line large) or a centred card ---- */
function title(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const lines = s.lines as string[], big = typeof s.highlight === 'number' ? s.highlight : lines.length === 3 ? 1 : 0;
  const pick = variant !== 'auto' ? variant : lines.length >= 3 || lines.some(l => l.length > 22) ? 'poster' : 'centred';
  const align = pick === 'poster' ? 'flex-start' : 'center', ta = pick === 'poster' ? 'left' : 'center';
  return stack(ctx, [
    s.brand ? h('div', { key: 'brand', style: { ...display(ctx, 900), fontSize: pick === 'poster' ? 150 : 120, lineHeight: 1, alignSelf: align, textAlign: ta, ...arrive(ctx, 2, 26) } }, s.brand) : null,
    s.chip ? h(Badge, { key: 'chip', dot: false, delay: 10, style: { alignSelf: align, background: 'transparent', border: `3px solid ${col(ctx, 'accent')}`, color: col(ctx, 'accent'), ...mono(ctx), fontSize: 24, padding: '8px 20px', borderRadius: radius(ctx, 10) } }, s.chip) : null,
    h('div', { key: 'lines', style: { alignSelf: align, textAlign: ta, display: 'flex', flexDirection: 'column', gap: 12, borderLeft: pick === 'poster' ? `8px solid ${col(ctx, 'accent')}` : 'none', paddingLeft: pick === 'poster' ? 30 : 0 } },
      ...lines.map((line, k) => h('div', { key: k, style: { ...display(ctx, k === big ? 900 : 700), fontSize: k === big ? (pick === 'poster' ? 112 : 96) : 54, lineHeight: 1.08, color: k === big ? col(ctx, 'accent') : col(ctx, 'text')} }, h(KineticText, { text: line, delay: 14 + k * 10, staggerDelay: 3, preset: 'snappy', style: { justifyContent: ta === 'center' ? 'center' : 'flex-start' } }))))], 40);
}

/* ---- closing: the takeaway with its reminders and a call to action, or a bare poster line ---- */
function closing(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const points = (s.points ?? []) as string[];
  const pick = variant !== 'auto' ? variant : points.length ? 'takeaway' : 'poster';
  const cta = h('div', { key: 'cta', style: { alignSelf: pick === 'poster' ? 'center' : 'flex-start', background: col(ctx, 'accent'), color: col(ctx, 'bg'), ...display(ctx, 800), fontSize: 42, padding: '22px 46px', borderRadius: radius(ctx, 60), ...arrive(ctx, Math.round(ctx.frames * 0.5), 20, 26) } }, s.cta ?? 'Follow for more');
  if (pick === 'poster') return stack(ctx, [h('div', { key: 't', style: { ...display(ctx, 900), fontSize: 120, lineHeight: 1.05, textAlign: 'center' } }, h(KineticText, { text: String(s.title), delay: 4, staggerDelay: 3, preset: 'snappy', style: { justifyContent: 'center' } })), h(Waveform, { key: 'wave', bars: 28, height: 70, delay: 14, color: col(ctx, 'accent2'), activeColor: col(ctx, 'accent'), style: { alignSelf: 'center' } }), cta], 70);
  return stack(ctx, [h('div', { key: 'rule', style: { height: 8, width: 140 * sp(ctx, 2), background: col(ctx, 'accent'), borderRadius: 4 } }),
    h('div', { key: 't', style: { ...display(ctx, 900), fontSize: 88, lineHeight: 1.05, color: col(ctx, 'accent') } }, h(KineticText, { text: String(s.title), delay: 4, staggerDelay: 3, preset: 'snappy' })),
    ...points.map((p, k) => h('div', { key: 'p' + k, style: { display: 'flex', gap: 20, ...body(ctx, 600), fontSize: 42, lineHeight: 1.25, ...arrive(ctx, 18 + k * 14, 20, 24) } }, h('span', { style: { color: col(ctx, 'accent') } }, '→'), h('span', null, p))), cta], 34);
}

/* ---- freeform: the script places every element; React only draws them, with the look's colours and spring entrances ---- */
const paintOf = (ctx: Ctx, name: string): string => (name === 'none' ? 'transparent' : name === 'red' ? RED : name.startsWith('#') ? name : col(ctx, name));
function freeform(ctx: Ctx, s: Record<string, any>, _variant: string): ReactElement {
  const els = s.elements as Record<string, any>[], f = ctx.frame;
  const start = (el: Record<string, any>) => Math.round((el.at ?? 0.1) * ctx.frames);
  const enter = (el: Record<string, any>, extra: CSSProperties = {}): CSSProperties => {
    const at = start(el), motion = el.motion ?? 'rise';
    if (motion === 'none') return extra;
    if (motion === 'fade') return { ...extra, opacity: clamp(sp(ctx, at, 'smooth') * 1.4) };
    if (motion === 'pop') { const p = sp(ctx, at, 'bouncy'); return { ...extra, opacity: clamp(p * 3), transform: `${extra.transform ?? ''} scale(${0.6 + 0.4 * p})`.trim() }; }
    return { ...extra, ...arrive(ctx, at, 20, 30), transform: `${extra.transform ?? ''} ${(arrive(ctx, at, 20, 30).transform as string | undefined) ?? ''}`.trim() || undefined };
  };
  void f;
  return h('div', { style: box({ left: 0, top: 0, width: W, height: 1920 }) }, ...els.map((el, k) => {
    if (el.type === 'text') {
      const align = el.align ?? 'left', shift = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';
      const family = el.font === 'display' ? `"${col(ctx, 'fontDisplay')}", sans-serif` : el.font === 'mono' ? '"JetBrains Mono", monospace' : `"${col(ctx, 'fontBody')}", sans-serif`;
      return h('div', { key: k, style: enter(el, { position: 'absolute', left: el.x, top: el.y, width: el.width, whiteSpace: el.width ? 'normal' : 'pre', textAlign: align, transform: `translateX(${shift})`, fontFamily: family, fontSize: el.size ?? 48, fontWeight: Math.min(el.weight ?? 600, el.font === 'display' ? ctx.look.weightCap : 1000), lineHeight: 1.15, color: paintOf(ctx, el.color ?? 'text') }) }, el.text);
    }
    if (el.type === 'box') {
      const grows = el.motion === 'draw', p = grows ? sp(ctx, start(el), 'smooth') : 1;
      return h('div', { key: k, style: enter(grows ? { ...el, motion: 'none' } : el, { position: 'absolute', boxSizing: 'border-box', left: el.x, top: el.y, width: el.w * p, height: el.h, borderRadius: radius(ctx, el.radius ?? 0), background: paintOf(ctx, el.fill ?? 'surface'), border: el.stroke ? `${el.strokeWidth ?? 3}px solid ${paintOf(ctx, el.stroke)}` : undefined, opacity: grows ? clamp(p * 6) : undefined }) });
    }
    return h('div', { key: k, style: enter(el, { position: 'absolute', boxSizing: 'border-box', left: el.x - el.d / 2, top: el.y - el.d / 2, width: el.d, height: el.d, borderRadius: '50%', background: paintOf(ctx, el.fill ?? 'accent'), border: el.stroke ? `${el.strokeWidth ?? 3}px solid ${paintOf(ctx, el.stroke)}` : undefined }) });
  }), h('div', { key: 'cap', style: box({ left: 60, width: W - 120, top: ctx.band.bottom - 90, textAlign: 'center' }) }, sentence(ctx, s.caption)));
}

/* ---- phone: a handset with the conversation inside, or a bare thread when there is a lot to say ---- */
function phone(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const messages = s.messages as { side?: string; text: string }[];
  const pick = variant !== 'auto' ? variant : messages.length >= 4 || messages.some(m => m.text.length > 60) ? 'thread' : 'handset';
  const bubble = (m: { side?: string; text: string }, k: number, size: number) => {
    const out = m.side === 'out', at = 14 + k * 22, p = sp(ctx, at, 'bouncy');
    return h('div', { key: k, style: { alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '82%', background: out ? col(ctx, 'accent') : col(ctx, 'surface'), ...body(ctx, 600), color: out ? col(ctx, 'bg') : col(ctx, 'text'), fontSize: size, lineHeight: 1.25, padding: '20px 28px', borderRadius: radius(ctx, 30), opacity: clamp(p * 3), transform: `scale(${0.8 + 0.2 * p})`, transformOrigin: out ? 'right bottom' : 'left bottom' } }, m.text);
  };
  if (pick === 'thread') {
    return stack(ctx, [h('div', { key: 'app', style: { ...mono(ctx), fontSize: 24, color: col(ctx, 'muted'), textAlign: 'center', ...arrive(ctx, 4) } }, s.app), ...messages.map((m, k) => bubble(m, k, 38)), sentence(ctx, s.caption)], 24);
  }
  return stack(ctx, [h('div', { key: 'phone', style: { alignSelf: 'center', width: 560, minHeight: 760, boxSizing: 'border-box', background: col(ctx, 'surface'), border: `6px solid ${col(ctx, 'muted')}`, borderRadius: radius(ctx, 70), padding: 26, ...arrive(ctx, 2, 20, 40) } },
    h('div', { style: { background: col(ctx, 'bg'), borderRadius: radius(ctx, 48), padding: '70px 20px 36px', minHeight: 700, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 22, position: 'relative' } },
      h('div', { style: { position: 'absolute', left: '50%', top: 14, width: 140, height: 18, marginLeft: -70, borderRadius: 9, background: col(ctx, 'surface') } }),
      h('div', { style: { position: 'absolute', left: 0, right: 0, top: 38, textAlign: 'center', ...mono(ctx), fontSize: 22, color: col(ctx, 'muted') } }, s.app),
      ...messages.map((m, k) => bubble(m, k, 32)))), sentence(ctx, s.caption)], 28);
}

/* ---- hex: a honeycomb with some cells lit and named ---- */
function hex(ctx: Ctx, s: Record<string, any>, _variant: string): ReactElement {
  const rows = s.rows ?? 4, cols = s.columns ?? 5, root3 = Math.sqrt(3), r = Math.min(112, 920 / ((cols + 0.5) * root3)), cw = root3 * r, total = rows * cols, rnd = seeded(s.seed ?? 3);
  const lit: number[] = (s.lit ?? Array.from({ length: Math.min(total, 4) }, () => Math.floor(rnd() * total))).filter((c: number) => c < total);
  const gx = (W - (cols + 0.5) * cw) / 2, height = (rows - 1) * r * 1.5 + 2 * r, tones = [col(ctx, 'accent'), col(ctx, 'accent2'), RED];
  const pts = (cx: number, cy: number) => [0, 1, 2, 3, 4, 5].map(n => { const a = ((60 * n - 30) * Math.PI) / 180; return `${(cx + (r - 4) * Math.cos(a)).toFixed(1)},${(cy + (r - 4) * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const cells = Array.from({ length: total }, (_, idx) => {
    const row = Math.floor(idx / cols), c = idx % cols, k = lit.indexOf(idx), on = k >= 0, cx = gx + c * cw + (row % 2 ? cw / 2 : 0) + cw / 2, cy = row * r * 1.5 + r, at = 4 + (row + c) * 3, p = sp(ctx, at, 'smooth');
    const pulse = on ? 1 + 0.06 * Math.sin((ctx.frame - at) / 8) : 1;
    return h('polygon', { key: idx, points: pts(cx, cy), fill: on ? tones[k % 3] : col(ctx, 'surface'), stroke: on ? col(ctx, 'text') : col(ctx, 'muted'), strokeWidth: on ? 3 : 2, opacity: (on ? 1 : 0.7) * clamp(p * 2), style: { transformOrigin: `${cx}px ${cy}px`, transform: `scale(${(0.6 + 0.4 * p) * pulse})` } });
  });
  const tags = ((s.tags ?? []) as string[]).map((t, k) => { if (lit[k] === undefined) return null; const row = Math.floor(lit[k]! / cols), c = lit[k]! % cols, cx = gx + c * cw + (row % 2 ? cw / 2 : 0) + cw / 2, cy = row * r * 1.5 + r;
    return h('text', { key: 't' + k, x: cx, y: cy + 6, textAnchor: 'middle', fill: col(ctx, 'bg'), fontSize: 22, fontWeight: 700, fontFamily: '"JetBrains Mono", monospace', opacity: clamp(sp(ctx, Math.round(ctx.frames * 0.3) + k * 10, 'smooth') * 2) }, t); });
  return stack(ctx, [h('svg', { key: 'svg', width: W, height, viewBox: `0 0 ${W} ${height}`, style: { alignSelf: 'center', marginLeft: -60, overflow: 'visible' } }, ...cells, ...tags), sentence(ctx, s.caption)], 40);
}

/* ---- pile: pieces drop into a bucket and settle on the ones before them ---- */
function pile(ctx: Ctx, s: Record<string, any>, _variant: string): ReactElement {
  const count = s.count ?? 40, size = count > 70 ? 34 : count > 40 ? 42 : 52, bw = 760, bh = 760, rnd = seeded(7), every = Math.max(1, Math.floor((ctx.frames * 0.6) / count));
  const cols = Math.floor(bw / size), heights = new Array(cols).fill(0) as number[];
  const palette = ({ mixed: [col(ctx, 'accent'), col(ctx, 'accent2'), '#e8a548'], gold: [col(ctx, 'accent')], mint: [col(ctx, 'accent2')], red: [RED] } as Record<string, string[]>)[s.tone ?? 'mixed']!;
  const pieces = Array.from({ length: count }, (_, j) => {
    const options = [Math.floor(rnd() * cols), Math.floor(rnd() * cols), Math.floor(rnd() * cols)], c = options.reduce((best, o) => (heights[o]! < heights[best]! ? o : best), options[0]!);
    const rest = bh - (heights[c]! + 1) * size; heights[c]!++;
    const at = 14 + j * every, y = springValue({ frame: ctx.frame, fps: 30, delay: at, damping: 15, stiffness: 150, mass: 0.7, from: -90, to: rest });
    return h('div', { key: j, style: { position: 'absolute', left: c * size + (bw - cols * size) / 2, top: y, width: size, height: size, boxSizing: 'border-box', borderRadius: s.shape === 'rect' ? radius(ctx, 8) : '50%', background: palette[j % palette.length], opacity: ctx.frame < at ? 0 : 1 } });
  });
  const edge = (style: CSSProperties) => h('div', { style: { position: 'absolute', background: col(ctx, 'muted'), borderRadius: 5, ...style } });
  return stack(ctx, [s.title ? h('div', { key: 'title', style: { ...mono(ctx), fontSize: 28, color: col(ctx, 'accent'), textAlign: 'center', ...arrive(ctx, 6) } }, s.title) : null,
    h('div', { key: 'bucket', style: { position: 'relative', alignSelf: 'center', width: bw, height: bh + 14, ...arrive(ctx, 4, 20, 20) } },
      edge({ left: -14, top: 120, width: 14, height: bh - 106 }), edge({ right: -14, top: 120, width: 14, height: bh - 106 }), edge({ left: -14, top: bh, width: bw + 28, height: 14 }), ...pieces),
    s.bucket ? h('div', { key: 'label', style: { ...mono(ctx), fontSize: 26, textAlign: 'center', letterSpacing: 6, ...arrive(ctx, 8) } }, s.bucket) : null, sentence(ctx, s.caption)], 28);
}

/* ---- media: a picture or clip in a rounded frame with the words over its foot, or split with the words on a card beneath ---- */
const isClip = (src: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(src);
function media(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const src = String(s.src ?? ''), clip = isClip(src), { fit, ox, oy } = ctx.column;
  const wanted = variant !== 'auto' ? variant : s.title && s.caption && String(s.caption).length > 70 ? 'split' : 'frame';
  const pick = wanted === 'browser' && clip ? 'frame' : wanted;   // a clip is placed under the React layer, so a window drawn over it would hide it
  const x = 60, y = pick === 'browser' ? 300 : 262, w = 960, hgt = pick === 'split' ? 900 : pick === 'browser' ? 980 : 1478, p = clamp(ctx.frame / Math.max(1, ctx.frames));
  const image = (style: CSSProperties) => h('img', { src: String(s.assetId ?? src), style: { width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1 + 0.08 * p})`, transformOrigin: '50% 40%', ...style } });
  const picture = clip
    // A clip is composited under the React layer by the build; this only tells it where, how big and how round.
    ? h(Video, { key: 'clip', src, muted: true, loop: true, left: ox + x * fit, top: oy + y * fit, width: w * fit, height: hgt * fit, radius: radius(ctx, 28) * fit, objectFit: 'cover', layer: 'back' })
    : pick === 'browser'
      ? h('div', { key: 'pic', style: box({ left: x, top: y, width: w, height: hgt, display: 'flex', flexDirection: 'column' }) }, h(DeviceFrame, { title: String(s.title ?? 'Preview'), delay: 2, style: { flex: 1, background: col(ctx, 'surface'), borderRadius: radius(ctx, 20) } }, h('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden' } }, image({}))))
      : h('div', { key: 'pic', style: box({ left: x, top: y, width: w, height: hgt, borderRadius: radius(ctx, 28), overflow: 'hidden', background: col(ctx, 'surface') }) }, image({}));
  const credit = s.credit ? h('div', { key: 'credit', style: { ...box({ left: x + 30, top: y + 28 }), ...mono(ctx), fontSize: 18, letterSpacing: 2, color: '#ffffff', opacity: 0.75 } }, s.credit) : null;
  if (pick === 'split' || pick === 'browser') {
    return h('div', { style: box({ left: 0, top: 0, width: W, height: 1920 }) }, picture, pick === 'split' ? credit : null,
      h('div', { key: 'words', style: box({ left: x, top: y + hgt + 40, width: w, display: 'flex', flexDirection: 'column', gap: 18 }) },
        s.title && pick === 'split' ? h('div', { style: { ...display(ctx, 900), fontSize: 76, lineHeight: 1.04, color: col(ctx, 'accent') } }, h(KineticText, { text: String(s.title), delay: 8, staggerDelay: 3, preset: 'snappy' })) : null,
        s.caption && !ctxCaptions(ctx) ? h('div', { style: { ...body(ctx, 600), fontSize: 42, lineHeight: 1.25, ...arrive(ctx, 24, 22, 30) } }, s.caption) : null));
  }
  const foot = y + hgt, shade = y + Math.round(hgt * 0.4);
  const scrim = h('div', { key: 'scrim', style: { ...box({ left: x, top: shade, width: w, height: foot - shade }), borderRadius: `0 0 ${radius(ctx, 28)}px ${radius(ctx, 28)}px`, background: 'linear-gradient(to bottom, #00000000, #000000e6)', opacity: clamp(sp(ctx, 0, 'smooth') * 2) } });
  const captionY = 1450, titleY = captionY - (s.caption ? 370 : 230);
  return h('div', { style: box({ left: 0, top: 0, width: W, height: 1920 }) }, picture, scrim, credit,
    s.title ? h('div', { key: 'title', style: box({ left: x + 60, width: w - 120, top: titleY, textAlign: 'center', ...display(ctx, 900), fontSize: 110, lineHeight: 1, color: '#ffffff' }) }, h(KineticText, { text: String(s.title), delay: 8, staggerDelay: 3, preset: 'snappy', style: { justifyContent: 'center' } })) : null,
    s.caption && !ctxCaptions(ctx) ? h('div', { key: 'cap', style: box({ left: x + 70, width: w - 140, top: captionY, textAlign: 'center', ...body(ctx, 600), fontSize: 46, lineHeight: 1.25, color: '#ffffff', ...arrive(ctx, 24, 22, 30) }) }, s.caption) : null);
}

/* ---- code: the kit's editor card with one line picked out at a time, or the code typed out in a bare pane ---- */
function code(ctx: Ctx, s: Record<string, any>, variant: string): ReactElement {
  const picks = (s.highlight ?? []) as number[], first = Math.round(ctx.frames * 0.18), span = Math.max(24, Math.round((ctx.frames * 0.62) / Math.max(1, picks.length)));
  const pick = variant !== 'auto' ? variant : 'editor';
  if (pick === 'typed') {
    const text = String(s.code);
    return stack(ctx, [h('div', { key: 'pane', style: { background: col(ctx, 'surface'), border: `3px solid ${col(ctx, 'muted')}55`, borderRadius: radius(ctx, 24), padding: '34px 40px', ...arrive(ctx, 4, 20, 30) } },
      h('div', { style: { ...mono(ctx), fontSize: 24, color: col(ctx, 'muted'), marginBottom: 22 } }, `$ ${s.file ?? 'main.ts'}`),
      h(Typewriter, { text, delay: 12, speed: Math.max(0.6, text.length / (ctx.frames * 0.5)), style: { display: 'block', whiteSpace: 'pre-wrap', fontFamily: '"JetBrains Mono", monospace', fontSize: String(text).split('\n').some(line => line.length > 34) ? 30 : 36, lineHeight: 1.55, color: col(ctx, 'text') }, cursorStyle: { color: col(ctx, 'accent') } })), sentence(ctx, s.caption)], 36);
  }
  let current = -1;
  picks.forEach((_, k) => { if (ctx.frame >= first + k * span) current = k; });
  // The kit's editor is drawn at 14 px; zoom scales its layout (not just its paint) to a size that reads on a phone.
  return stack(ctx, [h('div', { key: 'editor', style: { zoom: 2.2 } },
    h(CodeEditor, { filename: String(s.file ?? 'main.ts'), language: s.language ? String(s.language) : '', code: String(s.code), highlightLines: current >= 0 ? [picks[current]!] : [], delay: 2, style: { background: col(ctx, 'surface'), borderRadius: radius(ctx, 10), boxShadow: 'none', fontFamily: '"JetBrains Mono", Consolas, monospace' } })), sentence(ctx, s.caption)], 36);
}

const drawings: Record<string, (ctx: Ctx, scene: Record<string, any>, variant: string) => ReactElement> = { compare, chart, flow, grid, steps, timeline, stat, quote, title, closing, freeform, phone, hex, pile, media, code };
/** Variants each scene kind knows, for `variant` in the script and for the error that lists them. */
export const explainerVariants: Record<string, string[]> = { compare: ['split', 'stacked', 'versus'], chart: ['columns', 'rows', 'line'], flow: ['funnel', 'chain'], grid: ['board', 'spotlight'], steps: ['list', 'ladder', 'cards', 'bento'], timeline: ['spine', 'zigzag'], stat: ['hero', 'ring', 'stacked'], quote: ['card', 'pull', 'typed'], title: ['poster', 'centred'], closing: ['takeaway', 'poster'], freeform: [], phone: ['handset', 'thread'], hex: [], pile: [], media: ['frame', 'split', 'browser'], code: ['editor', 'typed'] };

function ReactSceneView({ item, look, shell, size }: { item: ReactScene; look: Look; /** The composition scene this belongs to, for its transition. */ shell?: Record<string, any>; size: { width: number; height: number } }): ReactElement | null {
  const frame = useCurrentFrame();
  const draw = drawings[item.scene.kind as string];
  if (!draw) return null;
  const band: Band = { top: 270, bottom: item.captions ? 1300 : 1540 }, scene = item.scene;
  const variant = scene.variant && explainerVariants[scene.kind]?.includes(scene.variant) ? scene.variant : 'auto';
  const fit = Math.min(size.width / W, size.height / 1920), column: Column = { fit, ox: (size.width - W * fit) / 2, oy: (size.height - 1920 * fit) / 2 };
  const ctx = { look, frame, frames: item.frames, band, captions: item.captions, column } as Ctx;
  // The scene comes in the way the look's other scenes do (fade, zoom, wipe or push): the same transition the stock view draws.
  const entrance = sceneStyle(shell ? transitionAt({ ...shell, durationFrames: item.frames }, frame) : undefined, size.width, size.height);
  const kicker = scene.step ? h('div', { key: 'kicker', style: { ...box({ left: 60, top: 206 }), ...mono(ctx), fontSize: 22, letterSpacing: 4, color: col(ctx, 'muted'), opacity: clamp((frame - 2) / 12) } }, `— ${scene.step}`) : null;
  const glow = ['title', 'stat', 'closing', 'quote'].includes(scene.kind) ? h(AmbientGlow, { key: 'glow', blur: 120, orbs: [{ x: '22%', y: '34%', size: 700, color: col(ctx, 'accent'), opacity: 0.16, speed: 0.025 }, { x: '82%', y: '68%', size: 600, color: col(ctx, 'accent2'), opacity: 0.12, speed: 0.03, phase: 2 }] }) : null;
  const drift = scene.kind === 'media' ? undefined : `scale(${1 + 0.02 * clamp(frame / Math.max(1, item.frames))})`;
  // The scene is drawn on the 1080 x 1920 column; the column is scaled and centred in the frame (a no-op for a vertical video).
  return h('div', { style: entrance }, h('div', { style: { position: 'absolute', left: column.ox, top: column.oy, width: W, height: 1920, transformOrigin: '0 0', transform: `scale(${fit})` } },
    h('div', { style: { position: 'absolute', left: 0, top: 0, width: W, height: 1920, transform: drift, transformOrigin: '50% 50%' } }, glow, kicker, draw(ctx, scene, variant))));
}

/** The explainer's stock composition drawn by CompositionView, with the React scenes in their own time ranges underneath its captions and header. */
export function ExplainerView({ composition, react, assets = {} }: { composition: CompositionData; react: ExplainerReactData; assets?: Record<string, string> }): ReactElement {
  const starts = new Map(composition.scenes.map(scene => [scene.id, Number(scene.startFrame ?? 0)])), shells = new Map(composition.scenes.map(scene => [scene.id, scene as Record<string, any>]));
  const overlay = (composition as any).overlay as Record<string, any>[] | undefined;
  // The header and footer are overlay layers the renderer draws for JSON videos; here they are one more scene lasting the whole video.
  const stock: CompositionData = overlay?.length ? { ...composition, scenes: [...composition.scenes, { id: 'overlay', startFrame: 0, durationFrames: composition.durationFrames, layers: overlay }] } : composition;
  return h('div', { style: { position: 'absolute', left: 0, top: 0, width: composition.width, height: composition.height } },
    ...react.scenes.map(item => h(Sequence, { key: item.sceneId, from: starts.get(item.sceneId) ?? 0, durationInFrames: item.frames }, h(ReactSceneView, { item, look: react.look, shell: shells.get(item.sceneId), size: { width: composition.width, height: composition.height } }))),
    h(CompositionView, { composition: stock, assets }));
}
