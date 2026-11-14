// Turns an explainer script (the scenes and what is said over them) into a composition. Each scene kind draws one kind of small animated
// diagram on the same dark board, with the same header and footer on every scene, so any topic gets a consistent video. Nothing here
// runs while rendering: the result is plain composition JSON, frame-exact like any other.
import type { Explainer, ExplainerScene } from '@ove/schema';
import { explainerCornerScale, explainerFontMaxWeight, explainerLookDefs, explainerWeightValue, groupCaptionWords, type CaptionCue } from '@ove/schema';

type Layer = Record<string, any>;
type Anim = { property: string; keyframes: { frame: number; value: number | string; easing?: string }[] };
type Beat = Anim | Anim[];

const FPS = 30, W = 1080, H = 1920;
const SIZES = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] } as const;
// The header sits just under the strip that platforms cover (the top 8% of a vertical video), and nothing is drawn in the bottom band or the right-hand column where their buttons and captions go.
const HEADER_Y = 170;
// A two-line caption at 52 px ends above the bottom band (y 1574 in a 1920-high video).
const CAPTION_Y = 1430;
const GOLD = '{{accent}}', MINT = '{{accent2}}', RED = '#ff5d6c', ORANGE = '#e8a548', GREEN = '#3fae8c', CLEAR = '#00000000';
const TONES = { gold: GOLD, mint: MINT, red: RED, muted: '{{muted}}' } as const;

/* ---- the design in force while one script compiles ---- */
type Active = { motion: 'rise' | 'drop' | 'blur' | 'fade'; cornerScale: number; weightCap: number; fonts: Record<string, string>; layout: 'card' | 'editorial' };
const NEUTRAL: Active = { motion: 'rise', cornerScale: 1, weightCap: 900, fonts: { '{{fontDisplay}}': 'Archivo', '{{fontBody}}': 'Inter' }, layout: 'card' };
let active: Active = NEUTRAL;
/** A corner radius in this design: the cards' own numbers are for the default soft corners. */
const R = (radius: number) => Math.round(radius * active.cornerScale);
/** A font weight the font really has: no heavier than the headline weight chosen, and no heavier than the font goes. */
const weightFor = (family: string, weight: number | string): number | string => {
  const wanted = typeof weight === 'number' ? weight : Number.parseInt(weight, 10);
  if (!Number.isFinite(wanted)) return weight;
  const font = active.fonts[family] ?? family, cap = family === '{{fontDisplay}}' ? active.weightCap : 1000;
  return Math.min(wanted, cap, explainerFontMaxWeight[font] ?? 1000);
};

/* ---- drawing helpers ---- */
const anim = (property: string, ...keys: [number, number | string, string?][]): Anim => ({ property, keyframes: keys.map(([frame, value, easing]) => ({ frame, value, ...(easing ? { easing } : {}) })) });
const fade = (delay = 0, dur = 18, to = 1): Anim => anim('opacity', [delay, 0], [delay + dur, to, 'glide']);
/** How something arrives, in the design's own way: from below (rise), from above (drop), into focus (blur) or simply fading in. */
const rise = (y: number, delay = 0, dist = 40, dur = 24): Anim[] => {
  switch (active.motion) {
    case 'fade': return [fade(delay, Math.round(dur * 0.9))];
    case 'blur': return [fade(delay, Math.round(dur * 0.7)), anim('blur', [delay, 16], [delay + dur, 0, 'land'])];
    case 'drop': return [fade(delay, Math.round(dur * 0.7)), anim('y', [delay, y - dist], [delay + dur, y, 'land'])];
    default: return [fade(delay, Math.round(dur * 0.7)), anim('y', [delay, y + dist], [delay + dur, y, 'land'])];
  }
};
const pop = (delay = 0, dur = 20, from = 0.6): Anim[] => [fade(delay, 8), anim('scale', [delay, from], [delay + dur, 1, 'pop'])];
const grow = (property: string, to: number, delay = 0, dur = 24): Anim => anim(property, [delay, 0], [delay + dur, to, 'land']);
const flat = (beats?: Beat[]) => (beats?.length ? { animations: beats.flat() } : {});

type TextOptions = { size?: number; weight?: number | string; font?: string; color?: string; ls?: number; lh?: number; maxWidth?: number; maxLines?: number; minSize?: number; align?: 'left' | 'center' | 'right'; opacity?: number; italic?: boolean; anims?: Beat[] };
const text = (id: string, content: string, x: number, y: number, o: TextOptions = {}): Layer => ({
  id, type: 'text', content, x, y, fontSize: o.size ?? 48, fontFamily: o.font ?? '{{fontBody}}', fontWeight: weightFor(o.font ?? '{{fontBody}}', o.weight ?? 500), color: o.color ?? '{{text}}',
  ...(o.ls !== undefined ? { letterSpacing: o.ls } : {}), ...(o.lh ? { lineHeight: o.lh } : {}), ...(o.maxWidth ? { maxWidth: o.maxWidth } : {}),
  ...(o.maxLines ? { maxLines: o.maxLines, minFontSize: o.minSize ?? Math.round((o.size ?? 48) * 0.6) } : {}), ...(o.align ? { textAlign: o.align } : {}),
  ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.italic ? { fontStyle: 'italic' } : {}), ...flat(o.anims),
});
const label = (id: string, content: string, x: number, y: number, o: TextOptions = {}) => text(id, content, x, y, { font: 'JetBrains Mono', weight: 600, size: 24, ls: 7, color: GOLD, ...o });
const center = (id: string, content: string, y: number, o: TextOptions = {}) => text(id, content, W / 2, y, { align: 'center', maxWidth: 940, ...o });

type ShapeOptions = { radius?: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; anims?: Beat[] };
const rect = (id: string, x: number, y: number, width: number, height: number, o: ShapeOptions = {}): Layer => ({
  id, type: 'rect', x, y, width: Math.max(1, width), height: Math.max(1, height), radius: R(o.radius ?? 0), fill: o.fill ?? '{{surface}}',
  ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 2 } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...flat(o.anims),
});
const circle = (id: string, x: number, y: number, width: number, o: ShapeOptions = {}): Layer => ({
  id, type: 'circle', x, y, width, fill: o.fill ?? GOLD, ...(o.stroke ? { stroke: o.stroke, strokeWidth: o.strokeWidth ?? 2 } : {}), ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...flat(o.anims),
});
const outline = (id: string, x: number, y: number, w: number, h: number, color: string, o: ShapeOptions = {}) => rect(id, x, y, w, h, { radius: 10, fill: CLEAR, stroke: color, strokeWidth: 3, ...o });
const sfx = (name: string, frame: number, volume = 0.3): Layer => ({ id: `sfx-${name}-${frame}`, type: 'audio', src: `sfx:${name}`, startFrame: frame, volume });
/** A small boxed label that pops in. */
const tag = (id: string, content: string, cx: number, y: number, color: string, at: number, width?: number): Layer[] => {
  const w = width ?? Math.round(content.length * 17 + 56);
  return [outline(`${id}-box`, cx - w / 2, y, w, 58, color, { radius: 8, fill: '{{bg}}', anims: [pop(at, 14, 0.8)] }), label(`${id}-text`, content, cx, y + 17, { size: 22, ls: 4, color, align: 'center', anims: [fade(at + 4, 10)] })];
};
const caption = (id: string, content: string | undefined, y: number, at: number): Layer[] => (content ? [center(id, content, y, { size: 52, weight: 700, lh: 1.25, anims: [rise(y, at, 30, 22)] })] : []);
const rng = (seed: number) => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---- scene kinds: each draws its layers for a scene of `frames` frames and says how short it may be ---- */
type Draw = { min: number; layers: (frames: number) => Layer[] };
type Kind<S extends ExplainerScene['kind']> = (scene: Extract<ExplainerScene, { kind: S }>, i: number) => Draw;
const at = (frames: number, fraction: number) => Math.round(frames * fraction);
const kicker = (i: number, step?: string): Layer[] => (step ? [label(`kicker-${i}`, `— ${step}`, 60, 218, { size: 22, ls: 4, color: '{{muted}}', anims: [fade(2, 12)] })] : []);

const title: Kind<'title'> = (s, i) => ({ min: 165, layers: () => {
  const n = s.lines.length, hi = s.highlight !== undefined && s.highlight < n ? s.highlight : n === 3 ? 1 : 0;
  const ys = ({ 1: [1100], 2: [1000, 1150], 3: [960, 1080, 1290] } as Record<number, number[]>)[n]!;
  return [...kicker(i, s.step),
    ...(s.brand ? [text('brand', s.brand, W / 2, 360, { font: '{{fontDisplay}}', weight: 900, size: 250, color: '{{text}}', opacity: 0.85, align: 'center', ls: -8, maxWidth: 940, maxLines: 1, minSize: 120, anims: [rise(360, 4, 50, 26)] })] : []),
    ...(s.chip ? tag('chip', s.chip, W / 2, 700, MINT, 20, 620) : []),
    outline('card', 110, 900, 860, 560, GOLD, { radius: 18, fill: '{{surface}}', strokeWidth: 4, anims: [pop(34, 20, 0.9)] }),
    ...s.lines.map((line, k) => k === hi
      ? center(`line-${k}`, line, ys[k]!, { font: '{{fontDisplay}}', weight: 900, size: 150, maxWidth: 780, color: GOLD, maxLines: 1, minSize: 80, anims: [rise(ys[k]!, 46 + k * 8, 30, 22)] })
      : center(`line-${k}`, line, ys[k]!, { size: 84, weight: 800, maxWidth: 780, maxLines: 1, minSize: 50, anims: [rise(ys[k]!, 46 + k * 8, 30, 20)] })),
    sfx('whoosh', 0, 0.25), sfx('thump', 36, 0.35), sfx('pop', 58, 0.25)];
} });

const flow: Kind<'flow'> = (s, i) => ({ min: 240, layers: frames => {
  const n = s.sources.length, rowY = (k: number) => 540 + k * 130, mid = 540 + ((n - 1) * 130 + 110) / 2;
  const cycles = Math.max(3, Math.min(9, Math.floor((frames - 80) / 30)));
  const packets = s.sources.flatMap((id, k) => Array.from({ length: cycles }, (_, c) => {
    const t = 40 + c * 30 + k * 4;
    return rect(`p-${k}-${c}`, 190, rowY(k) + 40, 54, 20, { radius: 4, fill: GOLD, opacity: 0, anims: [[anim('x', [t, 190], [t + 26, 330, 'easeIn']), anim('opacity', [t, 0], [t + 3, 1], [t + 22, 1], [t + 26, 0])]] });
  }));
  const belt = Array.from({ length: Math.max(4, Math.min(14, Math.floor((frames - 120) / 15))) }, (_, c) => {
    const t = 60 + c * 15;
    return rect(`belt-${c}`, 350, mid - 9, 40, 18, { radius: 4, fill: GOLD, opacity: 0, anims: [[anim('x', [t, 350], [t + 44, 780, 'linear']), anim('opacity', [t, 0], [t + 4, 1], [t + 38, 1], [t + 44, 0])]] });
  });
  return [...kicker(i, s.step),
    ...(s.spike ? [text('rate-title', 'UPDATES / SEC', 70, 255, { font: 'JetBrains Mono', weight: 600, size: 22, ls: 3, color: '{{muted}}' }),
      rect('rate', 70, 300, 940, 26, { radius: 13, fill: RED, anims: [grow('width', 940, 8, 50)] }), ...tag('spike', s.spike, 880, 360, RED, 40)] : []),
    ...s.sources.flatMap((id, k) => [
      outline(`src-${k}`, 70, rowY(k), 110, 110, '{{muted}}', { radius: 18, fill: '{{surface}}', anims: [pop(6 + k * 4, 14, 0.7)] }),
      circle(`dot-${k}`, 100, rowY(k) + 28, 18, { fill: MINT, anims: [fade(10 + k * 4, 8)] }),
      label(`src-label-${k}`, id, 125, rowY(k) + 64, { size: 22, ls: 1, color: '{{text}}', align: 'center', maxWidth: 100, anims: [fade(10 + k * 4, 8)] })]),
    label('buffer-title', s.buffer, 565, mid - 62, { size: 24, ls: 6, color: '{{text}}', align: 'center', anims: [fade(24, 10)] }),
    outline('buffer', 340, mid - 29, 450, 58, GOLD, { radius: 8, fill: '{{surface}}', anims: [pop(22, 16, 0.85)] }),
    outline('sink', 850, mid - 170, 160, 340, '{{muted}}', { radius: 16, fill: '{{surface}}', anims: [pop(26, 16, 0.85)] }),
    label('sink-label', s.sink, 930, mid - 20, { size: 22, ls: 3, color: '{{text}}', align: 'center', maxWidth: 150, anims: [fade(30, 10)] }),
    ...packets, ...belt,
    ...(s.note ? tag('note', s.note.text, 565, mid + 60, TONES[s.note.tone], 70, 300) : []),
    ...(s.result ? tag('result', s.result.text, 565, mid + 270, TONES[s.result.tone], at(frames, 0.62), 380) : []),
    ...caption('caption', s.caption, CAPTION_Y, at(frames, 0.34)),
    sfx('whoosh', 0, 0.2), sfx('thump', 12, 0.3), ...(s.result ? [sfx('ding', at(frames, 0.62) + 2, 0.25)] : [])];
} });

const grid: Kind<'grid'> = (s, i) => ({ min: 240, layers: frames => {
  const { rows, cols } = s, heat = s.mode === 'heatmap', pitch = Math.min(118, Math.floor(938 / cols)), cellSize = pitch - 8, gx = Math.round((W - (cols * pitch - 8)) / 2), gy = heat ? 360 : 300;
  const cell = (r: number, c: number): [number, number] => [gx + c * pitch, gy + r * pitch];
  const hot = s.hot ? { row: Math.min(rows - 1, s.hot.row), col: Math.min(cols - 1, s.hot.col) } : { row: Math.floor(rows * (heat ? 0.18 : 0.45)), col: Math.floor(cols * (heat ? 0.75 : 0.62)) };
  const rnd = rng(s.seed), layers: Layer[] = [...kicker(i, s.step)];
  if (!heat) {
    const counts = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rnd() < 0.42 ? 0 : Math.floor(rnd() * 3) + 1)));
    const size = Math.round(cellSize * 0.5);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const [x, y] = cell(r, c), start = 6 + (r + c) * 3;
      layers.push(outline(`cell-${r}-${c}`, x, y, cellSize, cellSize, '{{muted}}', { radius: 8, strokeWidth: 2, opacity: 0.55, anims: [pop(start, 10, 0.8)] }));
      if (r !== hot.row || c !== hot.col) layers.push(text(`n-${r}-${c}`, String(counts[r]![c]), x + cellSize / 2, y + cellSize / 2 - size * 0.55, { font: 'JetBrains Mono', weight: 800, size, align: 'center', color: counts[r]![c] ? '{{text}}' : '{{muted}}', anims: [fade(start + 4, 10)] }));
    }
    const [hx, hy] = cell(hot.row, hot.col), tx = hx + cellSize / 2, ty = hy + cellSize / 2 - size * 0.55, come = at(frames, 0.4), swap = at(frames, 0.6);
    const before = counts[hot.row]![hot.col] || 1;
    layers.push(
      text('n-hot-a', String(before), tx, ty, { font: 'JetBrains Mono', weight: 800, size, align: 'center', anims: [anim('opacity', [come - 20, 0], [come - 10, 1], [swap - 6, 1], [swap + 4, 0])] }),
      text('n-hot-b', String(before + 1), tx, ty, { font: 'JetBrains Mono', weight: 800, size, align: 'center', color: GOLD, anims: [anim('opacity', [swap, 0], [swap + 10, 1])] }),
      rect('car', hx - pitch + cellSize * 0.34, hy + cellSize * 0.2, cellSize * 0.33, cellSize * 0.6, { radius: 9, fill: GOLD, opacity: 0,
        anims: [[anim('opacity', [come, 0], [come + 8, 1], [swap + 4, 1], [swap + 12, 0]), anim('x', [come, hx - pitch + cellSize * 0.34], [swap, hx + cellSize * 0.34, 'land'])]] }),
      outline('hot-ring', hx - 4, hy - 4, cellSize + 8, cellSize + 8, GOLD, { radius: 10, strokeWidth: 4, opacity: 0, anims: [anim('opacity', [swap, 0], [swap + 8, 1], [swap + 60, 1], [swap + 72, 0.35])] }));
    layers.push(...caption('caption', s.caption, gy + rows * pitch + 60, at(frames, 0.15)), sfx('whoosh', 0, 0.2), sfx('tick', come, 0.3), sfx('pop', swap + 2, 0.3));
    return layers;
  }
  const spots: [number, number][] = [[0, 0], [0, -1], [0, 1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1]].map(([dr, dc]) => [hot.row + dr!, hot.col + dc!]);
  const isHot = (r: number, c: number) => spots.some(([sr, sc]) => sr === r && sc === c), isWarm = (r: number, c: number) => Math.abs(hot.row - r) + Math.abs(hot.col - c) <= 3;
  if (s.mode === 'heatmap') {
    [['LAAL = ZYADA', RED, 70], ['NARANGI = THODE', ORANGE, 330], ['HARA = KAM', GREEN, 640]].forEach(([txt, col, x], k) => layers.push(
      rect(`legend-${k}`, x as number, 236, 22, 22, { radius: 4, fill: col as string, anims: [fade(4 + k * 4, 10)] }),
      label(`legend-text-${k}`, txt as string, (x as number) + 36, 236, { size: 22, ls: 2, color: '{{text}}', anims: [fade(6 + k * 4, 10)] })));
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const color = isHot(r, c) ? RED : isWarm(r, c) ? (rnd() < 0.7 ? ORANGE : GREEN) : (rnd() < 0.16 ? ORANGE : GREEN);
    const start = 8 + Math.round(Math.hypot(r - hot.row, c - hot.col) * 5), [x, y] = cell(r, c);
    layers.push(rect(`heat-${r}-${c}`, x, y, cellSize, cellSize, { radius: 6, fill: color, opacity: 0, anims: [anim('opacity', [start, 0], [start + 14, 0.92, 'glide'])] }));
  }
  const [hx, hy] = cell(hot.row, hot.col), ring = at(frames, 0.36), call = at(frames, 0.46), card = at(frames, 0.64);
  layers.push(circle('ring', hx + cellSize / 2, hy + cellSize / 2, pitch * 2.2, { fill: CLEAR, stroke: '#ffffff', strokeWidth: 5, opacity: 0, anims: [[anim('opacity', [ring, 0], [ring + 14, 1]), anim('scale', [ring, 1.4], [ring + 20, 1, 'pop'])]] }));
  if (s.callout) layers.push(...tag('callout', s.callout, Math.min(W - 300, Math.max(300, hx + cellSize / 2 - 140)), hy + pitch * 2 + 20, RED, call, Math.min(700, s.callout.length * 17 + 56)));
  if (s.result) {
    const cardY = gy + rows * pitch + 28;
    layers.push(outline('card', 230, cardY, 620, 190, GOLD, { radius: 14, fill: '{{surface}}', strokeWidth: 3, anims: [pop(card, 18, 0.9)] }),
      ...(s.resultNote ? [label('card-kicker', 'THIS IS CALLED', W / 2, cardY + 30, { size: 20, ls: 5, color: '{{muted}}', align: 'center', anims: [fade(card + 10, 10)] })] : []),
      center('card-title', s.result, cardY + (s.resultNote ? 76 : 50), { font: '{{fontDisplay}}', weight: 900, size: 84, color: GOLD, maxWidth: 560, maxLines: 1, minSize: 50, anims: [rise(cardY + (s.resultNote ? 76 : 50), card + 14, 24, 18)] }),
      ...(s.resultNote ? [label('card-note', s.resultNote, W / 2, cardY + 168, { size: 20, ls: 3, color: '{{muted}}', align: 'center', anims: [fade(card + 24, 10)] })] : []),
      sfx('ding', card + 2, 0.25));
  } else layers.push(...caption('caption', s.caption, gy + rows * pitch + 60, card));
  layers.push(sfx('whoosh', 0, 0.2), sfx('riser', at(frames, 0.2), 0.15), sfx('impact', ring + 4, 0.25));
  return layers;
} });

const steps: Kind<'steps'> = (s, i) => ({ min: 90 + s.items.length * 70, layers: frames => {
  // Few steps get taller cards and larger type, so two or three do not sit in the top of the frame.
  const n = s.items.length, first = at(frames, 0.1), span = at(frames, 0.62) / n, few = n <= 3, pitch = few ? 330 : 250, h = pitch - 50, pad = (h - 200) / 2, titleSize = few ? 62 : 54, detailSize = few ? 38 : 34;
  return [...kicker(i, s.step), ...s.items.flatMap((item, k) => {
    const start = first + Math.round(k * span), next = k + 1 < n ? first + Math.round((k + 1) * span) : undefined, y = 320 + k * pitch, ty = y + pad + (item.detail ? 38 : 70);
    return [
      outline(`step-${k}`, 70, y, 940, h, '{{muted}}', { radius: 18, fill: '{{surface}}', strokeWidth: 2, anims: [[anim('opacity', [start, 0], [start + 12, 1, 'glide']), anim('y', [start, y + 30], [start + 18, y, 'land'])]] }),
      outline(`step-on-${k}`, 70, y, 940, h, GOLD, { radius: 18, strokeWidth: 4, opacity: 0, anims: [next === undefined ? anim('opacity', [start, 0], [start + 12, 1]) : anim('opacity', [start, 0], [start + 12, 1], [next, 1], [next + 14, 0])] }),
      circle(`step-n-${k}`, 150, y + h / 2, 84, { fill: CLEAR, stroke: MINT, strokeWidth: 4, anims: [fade(start + 4, 10)] }),
      label(`step-num-${k}`, String(k + 1), 150, y + h / 2 - 22, { size: 44, ls: 0, color: MINT, align: 'center', anims: [fade(start + 4, 10)] }),
      text(`step-title-${k}`, item.title, 230, ty, { font: '{{fontDisplay}}', weight: 800, size: titleSize, maxWidth: 740, maxLines: 1, minSize: 34, anims: [rise(ty, start + 6, 20, 16)] }),
      ...(item.detail ? [text(`step-detail-${k}`, item.detail, 230, y + pad + 112 + (titleSize - 54), { size: detailSize, color: '{{muted}}', maxWidth: 740, maxLines: 2, minSize: 26, lh: 1.2, anims: [fade(start + 14, 12)] })] : []),
      sfx('pop', start + 4, 0.25)];
  }), ...caption('caption', s.caption, 320 + n * pitch + 20, at(frames, 0.78)), sfx('whoosh', 0, 0.2)];
} });

const compare: Kind<'compare'> = (s, i) => ({ min: 120 + (s.left.points.length + s.right.points.length) * 40, layers: frames => {
  const rows = Math.max(s.left.points.length, s.right.points.length), first = at(frames, 0.12), span = at(frames, 0.6) / rows, rowPitch = rows <= 2 ? 300 : 230;
  const column = (side: 'left' | 'right', data: { title: string; points: string[] }, x: number, color: string, mark: string): Layer[] => [
    outline(`${side}-card`, x, 300, 450, 170 + rows * rowPitch, color, { radius: 18, fill: '{{surface}}', strokeWidth: 3, anims: [pop(side === 'left' ? 4 : 12, 16, 0.92)] }),
    label(`${side}-title`, data.title, x + 225, 340, { size: 30, ls: 5, color, align: 'center', maxWidth: 400, anims: [fade(side === 'left' ? 10 : 18, 10)] }),
    ...data.points.flatMap((point, k) => {
      const start = first + Math.round(k * span) + (side === 'right' ? 10 : 0), y = 470 + k * rowPitch;
      return [label(`${side}-mark-${k}`, mark, x + 40, y, { size: 44, ls: 0, color, anims: [fade(start, 10)] }),
        text(`${side}-point-${k}`, point, x + 100, y - 4, { size: 44, weight: 700, maxWidth: 320, maxLines: 4, minSize: 30, lh: 1.2, anims: [rise(y - 4, start, 24, 18)] }),
        sfx('pop', start + 2, 0.2)];
    })];
  return [...kicker(i, s.step), ...column('left', s.left, 60, RED, '✗'), ...column('right', s.right, 570, MINT, '✓'), ...caption('caption', s.caption, CAPTION_Y, at(frames, 0.8)), sfx('whoosh', 0, 0.2)];
} });

const VIDEO = /\.(mp4|mov|webm|mkv)$/i;
const stat: Kind<'stat'> = (s, i) => ({ min: 150, layers: () => [
  ...kicker(i, s.step),
  outline('stat-card', 90, 380, 900, 560, GOLD, { radius: 22, fill: '{{surface}}', strokeWidth: 4, anims: [pop(6, 20, 0.92)] }),
  center('stat-value', s.value, 500, { font: '{{fontDisplay}}', weight: 900, size: 340, color: TONES[s.tone], maxWidth: 820, maxLines: 1, minSize: 120, ls: -10, anims: [pop(16, 24, 0.7)] }),
  center('stat-label', s.label, 1010, { size: 64, weight: 800, maxWidth: 880, lh: 1.2, anims: [rise(1010, 34, 30, 22)] }),
  ...(s.note ? [center('stat-note', s.note, 1300, { size: 40, weight: 500, color: '{{muted}}', maxWidth: 820, lh: 1.25, anims: [fade(58, 14)] })] : []),
  sfx('whoosh', 0, 0.2), sfx('thump', 18, 0.35)] });

const chart: Kind<'chart'> = (s, i) => ({ min: 180, layers: frames => {
  const n = s.items.length, max = Math.max(...s.items.map(item => item.value), 1), left = 90, width = 900, base = 1280, tall = 700, pitch = width / n;
  const fmt = (value: number) => `${Number.isInteger(value) ? value : value.toFixed(1)}${s.unit ?? ''}`;
  const hi = s.highlight !== undefined && s.highlight < n ? s.highlight : s.items.reduce((best, item, k, all) => (item.value > all[best]!.value ? k : best), 0);
  const first = at(frames, 0.12), span = at(frames, 0.5), height = (value: number) => Math.max(6, Math.round((value / max) * tall));
  const layers: Layer[] = [...kicker(i, s.step), rect('axis', left, base, width, 4, { fill: '{{muted}}', opacity: 0.6, anims: [grow('width', width, 4, 24)] })];
  s.items.forEach((item, k) => layers.push(label(`cat-${k}`, item.label, left + k * pitch + pitch / 2, base + 24, { size: 22, ls: 1, color: '{{muted}}', align: 'center', maxWidth: pitch - 8, maxLines: 2, minSize: 14, anims: [fade(first + Math.round(k * span / n) + 8, 10)] })));
  if (s.type === 'bars') {
    s.items.forEach((item, k) => {
      const h = height(item.value), bw = Math.round(pitch * 0.6), x = Math.round(left + k * pitch + (pitch - bw) / 2), start = first + Math.round(k * span / n), on = k === hi;
      layers.push(
        rect(`bar-${k}`, x, base - h, bw, h, { radius: 10, fill: on ? GOLD : '{{muted}}', opacity: on ? 1 : 0.75, anims: [[anim('y', [start, base], [start + 26, base - h, 'land']), anim('height', [start, 1], [start + 26, h, 'land']), fade(start, 8, on ? 1 : 0.75)]] }),
        label(`value-${k}`, fmt(item.value), x + bw / 2, base - h - 46, { size: 30, ls: 1, color: on ? GOLD : '{{text}}', align: 'center', maxWidth: pitch, anims: [fade(start + 18, 10)] }),
        ...(on ? [sfx('pop', start + 20, 0.3)] : []));
    });
  } else {
    const px = (k: number) => Math.round(left + pitch / 2 + k * pitch), py = (value: number) => base - height(value);
    layers.push({ id: 'line', type: 'path', d: s.items.map((item, k) => `${k ? 'L' : 'M'}${px(k)} ${py(item.value)}`).join(' '), x: 0, y: 0, stroke: GOLD, strokeWidth: 8, lineCap: 'round', lineJoin: 'round', trimEnd: 0, animations: [anim('trimEnd', [first, 0], [first + span, 1, 'land'])] });
    s.items.forEach((item, k) => {
      const start = first + Math.round((k / Math.max(1, n - 1)) * span), on = k === hi;
      layers.push(circle(`dot-${k}`, px(k), py(item.value), on ? 36 : 24, { fill: on ? GOLD : '{{bg}}', stroke: GOLD, strokeWidth: 5, anims: [pop(start, 12, 0.5)] }),
        label(`value-${k}`, fmt(item.value), px(k), py(item.value) - (on ? 78 : 64), { size: on ? 34 : 28, ls: 1, color: on ? GOLD : '{{text}}', align: 'center', maxWidth: pitch, anims: [fade(start + 6, 10)] }));
    });
  }
  return [...layers, ...caption('caption', s.caption, CAPTION_Y, at(frames, 0.7)), sfx('whoosh', 0, 0.2)];
} });

const timeline: Kind<'timeline'> = (s, i) => ({ min: 100 + s.events.length * 60, layers: frames => {
  const n = s.events.length, pitch = Math.min(300, Math.floor(1000 / (n - 1))), top = 400, first = at(frames, 0.1), span = at(frames, 0.62) / n;
  const spine = (n - 1) * pitch;
  return [...kicker(i, s.step),
    rect('spine', 187, top, 6, spine, { radius: 3, fill: '{{muted}}', opacity: 0.6, anims: [anim('height', [first, 1], [first + Math.round(span * (n - 1)) + 20, spine, 'linear'])] }),
    ...s.events.flatMap((event, k) => {
      const y = top + k * pitch, start = first + Math.round(k * span);
      return [circle(`dot-${k}`, 190, y, 44, { fill: '{{bg}}', stroke: k === n - 1 ? GOLD : MINT, strokeWidth: 5, anims: [pop(start, 14, 0.5)] }),
        label(`when-${k}`, event.when, 270, y - 52, { size: 24, ls: 4, color: GOLD, maxWidth: 700, anims: [fade(start + 4, 10)] }),
        text(`title-${k}`, event.title, 270, y - 14, { font: '{{fontDisplay}}', weight: 800, size: 56, maxWidth: 720, maxLines: 2, minSize: 36, lh: 1.05, anims: [rise(y - 14, start + 6, 20, 16)] }),
        ...(event.detail ? [text(`detail-${k}`, event.detail, 270, y + 62, { size: 34, color: '{{muted}}', maxWidth: 720, maxLines: 2, minSize: 26, lh: 1.2, anims: [fade(start + 14, 12)] })] : []),
        sfx('pop', start + 4, 0.2)];
    }),
    ...caption('caption', s.caption, top + spine + 200, at(frames, 0.8)), sfx('whoosh', 0, 0.2)];
} });

// Things falling into a container and piling up, simulated with real physics so they tumble and settle the same way on every render.
const PILE = { x: 240, y: 430, w: 600, h: 880 };
const pile: Kind<'pile'> = (s, i) => ({ min: 200 + Math.round(s.count * 1.5), layers: frames => {
  const fills = { mixed: [GOLD, MINT, ORANGE], gold: [GOLD], mint: [MINT], red: [RED] }[s.tone], every = Math.max(1, Math.floor(at(frames, 0.6) / s.count)), size = s.count > 70 ? 34 : s.count > 40 ? 42 : 52;
  const edge = (id: string, x: number, y: number, w: number, h: number) => rect(id, x, y, w, h, { radius: 5, fill: '{{muted}}', anims: [fade(4, 12)] });
  return [...kicker(i, s.step),
    ...(s.title ? [label('pile-title', s.title, W / 2, 262, { size: 28, ls: 6, color: GOLD, align: 'center', anims: [fade(6, 12)] })] : []),
    edge('bucket-left', PILE.x - 14, PILE.y + 120, 14, PILE.h - 120), edge('bucket-right', PILE.x + PILE.w, PILE.y + 120, 14, PILE.h - 120), edge('bucket-floor', PILE.x - 14, PILE.y + PILE.h, PILE.w + 28, 14),
    { id: 'pile', type: 'physics', x: PILE.x, y: PILE.y, width: PILE.w, height: PILE.h, walls: 'box', seed: 7, substeps: 3,
      emit: [{ shape: s.shape, x: PILE.w / 2, y: -70, spread: PILE.w / 2 - size, width: size, widthJitter: Math.round(size * 0.3), count: s.count, every, at: 14, restitution: 0.35, friction: 0.15, fill: fills }] },
    ...(s.bucket ? [label('bucket-label', s.bucket, W / 2, PILE.y + PILE.h + 40, { size: 26, ls: 6, color: '{{text}}', align: 'center', anims: [fade(8, 12)] })] : []),
    ...caption('caption', s.caption, CAPTION_Y, at(frames, 0.7)), sfx('whoosh', 0, 0.2), sfx('thump', at(frames, 0.5), 0.25)];
} });

// The picture or clip sits in a rounded frame inside the board, so the header and footer stay readable whatever is behind them.
const FRAME = { x: 60, y: 262, w: 960, h: 1478 };
const media: Kind<'media'> = (s, i) => ({ min: 120, layers: () => {
  if (!s.src) throw new Error('A media scene that is still a prompt has no picture yet: make the pictures first (mr explainer compile does, with an image model)');
  const src = s.src;
  const shadeFrom = FRAME.y + Math.round(FRAME.h * 0.4), bottom = FRAME.y + FRAME.h, captionY = 1450, titleY = captionY - (s.caption ? 370 : 230); // the words stay above the platforms' bottom band; only the picture reaches the frame's foot
  return [
    { id: 'footage', type: VIDEO.test(src) ? 'video' : 'image', src, x: FRAME.x, y: FRAME.y, width: FRAME.w, height: FRAME.h, radius: R(28), objectFit: 'cover', ...(VIDEO.test(src) ? { muted: true, loop: true } : {}) },
    { ...rect('scrim', FRAME.x, shadeFrom, FRAME.w, bottom - shadeFrom, { radius: 28, anims: [fade(0, 10)] }), fill: { type: 'linear', from: [0, 0], to: [0, bottom - shadeFrom], stops: [{ offset: 0, color: '#00000000' }, { offset: 1, color: '#000000e6' }] } },
    ...kicker(i, s.step),
    ...(s.title ? [center('media-title', s.title, titleY, { font: '{{fontDisplay}}', weight: 900, size: 110, color: '#ffffff', maxWidth: 840, maxLines: 3, minSize: 60, lh: 1.0, anims: [rise(titleY, 8, 40, 26)] })] : []),
    ...(s.caption ? [center('media-caption', s.caption, captionY, { size: 46, weight: 600, color: '#ffffff', maxWidth: 820, lh: 1.25, anims: [rise(captionY, 24, 30, 22)] })] : []),
    ...(s.credit ? [label('media-credit', s.credit, FRAME.x + 30, FRAME.y + 28, { size: 18, ls: 2, color: '#ffffff', opacity: 0.75 })] : []),
    sfx('whoosh', 0, 0.2)];
} });

const phone: Kind<'phone'> = (s, i) => ({ min: 180 + s.messages.length * 22, layers: frames => {
  const x = 260, y = 240, w = 560, h = 1140, inner = 26, top = y + 110, layers: Layer[] = [...kicker(i, s.step),
    rect('phone-body', x, y, w, h, { radius: 70, fill: '{{surface}}', stroke: '{{muted}}', strokeWidth: 6, anims: [fade(2, 14)] }),
    rect('phone-screen', x + inner, y + inner, w - inner * 2, h - inner * 2, { radius: 48, fill: '{{bg}}', anims: [fade(4, 14)] }),
    rect('phone-notch', x + w / 2 - 70, y + inner + 14, 140, 18, { radius: 9, fill: '{{surface}}' }),
    label('phone-app', s.app, x + w / 2, y + 68, { size: 24, ls: 5, color: '{{muted}}', align: 'center', anims: [fade(8, 10)] })];
  const bubbleW = 380, gap = 28, step = 22; let at0 = 14, cursor = top + 20;
  s.messages.forEach((m, k) => {
    const lines = Math.max(1, Math.ceil(m.text.length / 22)), bh = 56 + lines * 40, out = m.side === 'out', bx = out ? x + w - inner - 20 - bubbleW : x + inner + 20, start = at0 + k * step;
    layers.push(rect(`bubble-${k}`, bx, cursor, bubbleW, bh, { radius: 30, fill: out ? GOLD : '{{surface}}', anims: [fade(start, 10)] }),
      text(`bubble-text-${k}`, m.text, bx + 28, cursor + 26, { size: 32, weight: 600, color: out ? '{{bg}}' : '{{text}}', maxWidth: bubbleW - 56, maxLines: 4, minSize: 22, lh: 1.25, anims: [rise(cursor + 26, start, 16, 14)] }), sfx(out ? 'pop' : 'ding', start + 1, 0.2));
    cursor += bh + gap;
  });
  return [...layers, ...caption('phone-caption', s.caption, CAPTION_Y, at(frames, 0.55)), sfx('whoosh', 0, 0.2)];
} });

const hex: Kind<'hex'> = (s, i) => ({ min: 200, layers: frames => {
  const { rows, columns } = s, root3 = Math.sqrt(3), r = Math.min(112, 920 / ((columns + 0.5) * root3)), cw = root3 * r, total = rows * columns;
  const gx = (W - (columns + 0.5) * cw) / 2, gy = 420, rnd = rng(s.seed);
  const lit = (s.lit ?? Array.from({ length: Math.min(total, 4) }, () => Math.floor(rnd() * total))).filter(c => c < total);
  const layers: Layer[] = [...kicker(i, s.step)];
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const idx = row * columns + col, k = lit.indexOf(idx), on = k >= 0, x = gx + col * cw + (row % 2 ? cw / 2 : 0), y = gy + row * r * 1.5, start = 4 + (row + col) * 3;
    const d = 'M' + [0, 1, 2, 3, 4, 5].map(n => { const a = ((60 * n - 30) * Math.PI) / 180; return `${(cw / 2 + (r - 4) * Math.cos(a)).toFixed(1)} ${(r + (r - 4) * Math.sin(a)).toFixed(1)}`; }).join(' L') + ' Z';
    layers.push({ id: `hex-${idx}`, type: 'path', x, y, d, fill: on ? [GOLD, MINT, RED][k % 3] : '{{surface}}', stroke: on ? '{{text}}' : '{{muted}}', strokeWidth: on ? 3 : 2, ...flat([fade(start, 10, on ? 1 : 0.7), ...(on ? [anim('opacity', [at(frames, 0.3) + k * 10, 0.55], [at(frames, 0.3) + k * 10 + 12, 1, 'pop'])] : [])]) });
  }
  s.tags.forEach((t, k) => { if (lit[k] === undefined) return; const row = Math.floor(lit[k]! / columns), col = lit[k]! % columns, cx = gx + col * cw + (row % 2 ? cw / 2 : 0) + cw / 2, cy = gy + row * r * 1.5 + r;
    layers.push(label(`hex-tag-${k}`, t, cx, cy - 12, { size: 20, ls: 2, color: '{{bg}}', align: 'center', maxWidth: cw - 8, maxLines: 1, minSize: 12, anims: [fade(at(frames, 0.3) + k * 10 + 6, 10)] })); });
  return [...layers, ...caption('hex-caption', s.caption, Math.min(CAPTION_Y, gy + rows * r * 1.5 + r * 1.4 + 40), at(frames, 0.5)), sfx('whoosh', 0, 0.2), ...lit.slice(0, 4).map((_, k) => sfx('pop', at(frames, 0.3) + k * 10, 0.2))];
} });

const closing: Kind<'closing'> = (s, i) => ({ min: 150, layers: frames => [
  ...kicker(i, s.step),
  center('close-title', s.title, 520, { font: '{{fontDisplay}}', weight: 900, size: 130, color: GOLD, maxWidth: 900, maxLines: 3, minSize: 70, lh: 1.0, anims: [rise(520, 6, 40, 26)] }),
  ...s.points.flatMap((point, k) => { const y = 900 + k * 110, start = at(frames, 0.3) + k * 20; return [
    label(`close-mark-${k}`, '✓', 90, y, { size: 52, ls: 0, color: MINT, anims: [fade(start, 10)] }),
    text(`close-point-${k}`, point, 170, y - 6, { size: 50, weight: 700, maxWidth: 800, maxLines: 2, minSize: 34, lh: 1.15, anims: [rise(y - 6, start, 24, 18)] }), sfx('pop', start + 2, 0.2)]; }),
  ...tag('cta', s.cta, W / 2, 1260, MINT, at(frames, 0.6), 640),
  sfx('whoosh', 0, 0.2), sfx('ding', at(frames, 0.6) + 2, 0.25)] });

/* ---- the editorial layout: flush left, no boxes, hairline rules and large numerals (title, stat, steps and closing) ---- */
const LEFT = 90;
const captionLeft = (id: string, content: string | undefined, y: number, at: number): Layer[] => (content ? [text(id, content, LEFT, y, { size: 50, weight: 700, lh: 1.25, maxWidth: 900, anims: [rise(y, at, 30, 22)] })] : []);

const titleEditorial: Kind<'title'> = (s, i) => ({ min: 165, layers: () => {
  const hi = s.highlight !== undefined && s.highlight < s.lines.length ? s.highlight : s.lines.length === 3 ? 1 : 0;
  let y = s.brand ? 700 : 560;
  const placed = s.lines.map((line, k) => { const size = k === hi ? 176 : 92, at0 = y; y += Math.round(size * 1.08) + 10; return { line, k, size, y: at0 }; });
  const top = placed[0]!.y, bottom = y;
  return [...kicker(i, s.step),
    ...(s.brand ? [text('brand', s.brand, LEFT - 6, 330, { font: '{{fontDisplay}}', weight: 900, size: 230, color: '{{text}}', opacity: 0.9, ls: -8, maxWidth: 940, maxLines: 1, minSize: 110, anims: [rise(330, 4, 50, 26)] })] : []),
    rect('title-bar', 56, top, 12, bottom - top, { fill: GOLD, anims: [grow('height', bottom - top, 10, 28)] }),
    ...(s.chip ? [label('chip', s.chip, 100, top - 70, { size: 24, ls: 6, color: MINT, anims: [fade(16, 12)] })] : []),
    ...placed.map(({ line, k, size, y: at0 }) => (k === hi
      ? text(`line-${k}`, line, 100, at0, { font: '{{fontDisplay}}', weight: 900, size, color: GOLD, maxWidth: 880, maxLines: 1, minSize: 80, anims: [rise(at0, 46 + k * 8, 30, 22)] })
      : text(`line-${k}`, line, 100, at0, { size, weight: 800, maxWidth: 880, maxLines: 1, minSize: 50, anims: [rise(at0, 46 + k * 8, 30, 20)] }))),
    rect('title-rule', 100, bottom + 36, 1, 10, { fill: MINT, radius: 5, anims: [grow('width', 240, 56, 26)] }),
    sfx('whoosh', 0, 0.25), sfx('thump', 36, 0.35), sfx('pop', 58, 0.25)];
} });

const statEditorial: Kind<'stat'> = (s, i) => ({ min: 150, layers: () => [
  ...kicker(i, s.step),
  rect('stat-rule', LEFT, 400, 1, 12, { fill: TONES[s.tone], radius: 6, anims: [grow('width', 170, 4, 24)] }),
  text('stat-value', s.value, LEFT - 6, 450, { font: '{{fontDisplay}}', weight: 900, size: 420, color: TONES[s.tone], maxWidth: 930, maxLines: 1, minSize: 140, ls: -14, anims: [rise(450, 12, 60, 28)] }),
  rect('stat-hair', LEFT, 990, 1, 3, { fill: '{{muted}}', opacity: 0.5, anims: [grow('width', 900, 30, 26)] }),
  text('stat-label', s.label, LEFT, 1040, { size: 70, weight: 800, maxWidth: 900, lh: 1.15, maxLines: 3, anims: [rise(1040, 34, 30, 22)] }),
  ...(s.note ? [text('stat-note', s.note, LEFT, 1330, { size: 40, weight: 500, color: '{{muted}}', maxWidth: 900, lh: 1.25, anims: [fade(58, 14)] })] : []),
  sfx('whoosh', 0, 0.2), sfx('thump', 18, 0.35)] });

const stepsEditorial: Kind<'steps'> = (s, i) => ({ min: 90 + s.items.length * 70, layers: frames => {
  const n = s.items.length, first = at(frames, 0.1), span = at(frames, 0.62) / n, few = n <= 3, pitch = few ? 330 : 250, h = pitch - 50, pad = (h - 200) / 2;
  return [...kicker(i, s.step), ...s.items.flatMap((item, k) => {
    const start = first + Math.round(k * span), next = k + 1 < n ? first + Math.round((k + 1) * span) : undefined, y = 320 + k * pitch, ty = y + pad + (item.detail ? 36 : 64);
    return [
      rect(`step-line-${k}`, LEFT, y + h + 6, 1, 3, { fill: '{{muted}}', opacity: 0.4, anims: [grow('width', 900, start, 24)] }),
      rect(`step-on-${k}`, 56, y + 6, 12, h - 10, { fill: GOLD, opacity: 0, anims: [next === undefined ? anim('opacity', [start, 0], [start + 12, 1]) : anim('opacity', [start, 0], [start + 12, 1], [next, 1], [next + 14, 0])] }),
      text(`step-num-${k}`, String(k + 1).padStart(2, '0'), LEFT - 6, y + pad + 22, { font: '{{fontDisplay}}', weight: 900, size: 124, color: GOLD, opacity: 0.95, anims: [rise(y + pad + 22, start, 24, 18)] }),
      text(`step-title-${k}`, item.title, 300, ty, { font: '{{fontDisplay}}', weight: 800, size: 56, maxWidth: 690, maxLines: 1, minSize: 34, anims: [rise(ty, start + 6, 20, 16)] }),
      ...(item.detail ? [text(`step-detail-${k}`, item.detail, 300, y + pad + 112, { size: 34, color: '{{muted}}', maxWidth: 690, maxLines: 2, minSize: 26, lh: 1.2, anims: [fade(start + 14, 12)] })] : []),
      sfx('pop', start + 4, 0.25)];
  }), ...captionLeft('caption', s.caption, 320 + n * pitch + 20, at(frames, 0.78)), sfx('whoosh', 0, 0.2)];
} });

const closingEditorial: Kind<'closing'> = (s, i) => ({ min: 150, layers: frames => [
  ...kicker(i, s.step),
  rect('close-rule', LEFT, 330, 1, 12, { fill: GOLD, radius: 6, anims: [grow('width', 170, 4, 24)] }),
  text('close-title', s.title, LEFT - 6, 380, { font: '{{fontDisplay}}', weight: 900, size: 150, color: GOLD, maxWidth: 920, maxLines: 3, minSize: 70, lh: 1.0, anims: [rise(380, 6, 40, 26)] }),
  ...s.points.flatMap((point, k) => { const y = 900 + k * 110, start = at(frames, 0.3) + k * 20; return [
    label(`close-mark-${k}`, '→', LEFT, y, { size: 52, ls: 0, color: MINT, anims: [fade(start, 10)] }),
    text(`close-point-${k}`, point, 170, y - 6, { size: 50, weight: 700, maxWidth: 800, maxLines: 2, minSize: 34, lh: 1.15, anims: [rise(y - 6, start, 24, 18)] }), sfx('pop', start + 2, 0.2)]; }),
  text('cta-url', s.cta, LEFT - 4, 1235, { font: '{{fontDisplay}}', weight: 900, size: 84, color: MINT, maxWidth: 900, maxLines: 1, minSize: 40, anims: [rise(1235, at(frames, 0.6), 30, 22)] }),
  rect('cta-bar', LEFT, 1341, 1, 10, { fill: GOLD, radius: 5, anims: [grow('width', 420, at(frames, 0.6) + 8, 26)] }),
  sfx('whoosh', 0, 0.2), sfx('ding', at(frames, 0.6) + 2, 0.25)] });

/** The scenes that have an editorial layout use it when the design asks for it; every other scene is drawn the same way in every design. */
const pick = <S extends ExplainerScene['kind']>(card: Kind<S>, editorial: Kind<S>): Kind<S> => (scene, i) => (active.layout === 'editorial' ? editorial(scene, i) : card(scene, i));
/* ---- freeform: the script places every element, so the content decides the layout ---- */
const PAINT: Record<string, string> = { accent: GOLD, accent2: MINT, text: '{{text}}', muted: '{{muted}}', surface: '{{surface}}', bg: '{{bg}}', red: RED, none: CLEAR };
const paintOf = (color: string) => PAINT[color] ?? color;
const freeform: Kind<'freeform'> = (s, i) => ({ min: Math.max(150, Math.round((s.duration ?? 0) * FPS)), layers: frames => {
  const arrive = (el: { at: number; motion: string }, y: number, rises: boolean): Beat[] => {
    const start = at(frames, el.at);
    if (el.motion === 'none') return [];
    if (el.motion === 'fade') return [fade(start, 14)];
    if (el.motion === 'pop') return [pop(start)];
    return rises ? [rise(y, start, 30, 20)] : [fade(start, 14)];
  };
  const layers = s.elements.flatMap((el, k): Layer[] => {
    const id = `ff-${el.type}-${k}`;
    if (el.type === 'text') {
      const font = el.font === 'display' ? '{{fontDisplay}}' : el.font === 'mono' ? 'JetBrains Mono' : '{{fontBody}}';
      return [text(id, el.text, el.x, el.y, { size: el.size, weight: el.weight, font, color: paintOf(el.color), align: el.align, lh: 1.15, ...(el.width ? { maxWidth: el.width } : {}), anims: arrive(el, el.y, true) })];
    }
    if (el.type === 'box') {
      const grows = el.motion === 'draw', start = at(frames, el.at);
      return [rect(id, el.x, el.y, el.w, el.h, { radius: el.radius, fill: paintOf(el.fill), ...(el.stroke ? { stroke: paintOf(el.stroke), strokeWidth: el.strokeWidth } : {}),
        anims: grows ? [fade(start, 6), grow('width', el.w, start, 24)] : arrive(el, el.y, true) })];
    }
    return [circle(id, el.x, el.y, el.d, { fill: paintOf(el.fill), ...(el.stroke ? { stroke: paintOf(el.stroke), strokeWidth: el.strokeWidth } : {}), anims: arrive(el, el.y, false) })];
  });
  return [...kicker(i, s.step), ...layers, ...caption('caption', s.caption, CAPTION_Y, at(frames, 0.82)), sfx('whoosh', 0, 0.2)];
} });

/**
 * "auto" layout: the scene's own words decide. Text-heavy scenes read better flush left with room to breathe (editorial); short, punchy
 * ones keep their cards. Scenes that are diagrams have no editorial form, so they stay as they are.
 */
const wordCount = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ').split(/\s+/).filter(Boolean).length;
export function autoLayout(scene: ExplainerScene, fallback: 'card' | 'editorial'): 'card' | 'editorial' {
  switch (scene.kind) {
    case 'title': return wordCount(...scene.lines) >= 9 ? 'editorial' : 'card';
    case 'steps': return wordCount(...scene.items.flatMap(item => [item.title, item.detail])) >= 24 ? 'editorial' : 'card';
    case 'stat': return wordCount(scene.label, scene.note) >= 10 ? 'editorial' : 'card';
    case 'closing': return wordCount(scene.title, ...scene.points) >= 14 ? 'editorial' : 'card';
    default: return fallback;
  }
}

const kinds: { [K in ExplainerScene['kind']]: Kind<K> } = { title: pick(title, titleEditorial), flow, grid, steps: pick(steps, stepsEditorial), compare, stat: pick(stat, statEditorial), chart, timeline, pile, media, phone, hex, freeform, closing: pick(closing, closingEditorial) };

/* ---- the whole video ---- */
const theme = {
  bg: ['color', 'page background (a 6-digit hex)'], surface: ['color', 'raised surfaces and cards'], text: ['color', 'main text'], muted: ['color', 'secondary text'],
  accent: ['color', 'the one signal colour'], accent2: ['color', 'a softer partner for the accent'],
  fontDisplay: ['string', 'headline font'], fontBody: ['string', 'body font'], texture: ['string', 'background texture: none, grid, dots, scanlines or paper'],
  textureColor: ['color', 'texture ink'], textureOpacity: ['number', 'texture strength'], transition: ['string', 'how scenes change: fade, zoom, wipe or push'],
} as const;


/** What was said over one scene: the audio file (relative to the composition) and how long it runs. */
export type ExplainerAudio = { src: string; seconds: number; /** When each word is said, in seconds from the start of the recording: captions follow it. */ words?: { text: string; start: number; end: number }[] };
export type ExplainerCompiled = { composition: Record<string, unknown>; notes: string[] };

/**
 * Compiles an explainer script into a composition. A scene with a spoken line lasts as long as the line (plus a short pause), never
 * shorter than its pictures need; `audio[i]` is the recording of scene i's `say`, if there is one.
 */
export function compileExplainer(spec: Explainer, options: { audio?: (ExplainerAudio | undefined)[] } = {}): ExplainerCompiled {
  // The look is a whole design; the script's `design` and `colors` change parts of it.
  const def = explainerLookDefs[spec.look];
  const chosen = { ...def.design, ...Object.fromEntries(Object.entries(spec.design ?? {}).filter(([, value]) => value !== undefined)) } as typeof def.design;
  const palette: Record<string, string | number> = { ...def.colors, ...spec.colors, fontDisplay: chosen.fontDisplay, fontBody: chosen.fontBody, texture: chosen.texture, transition: chosen.transition };
  active = { motion: chosen.motion, cornerScale: explainerCornerScale[chosen.corners], weightCap: explainerWeightValue[chosen.weight], fonts: { '{{fontDisplay}}': chosen.fontDisplay, '{{fontBody}}': chosen.fontBody }, layout: chosen.layout };
  try { return compileWith(spec, options, palette); } finally { active = NEUTRAL; }
}

/**
 * The vertical space a scene's content may use: below the header and its kicker, above the lower band that reel apps cover with their
 * own buttons. Scenes are drawn from the top; centring them in this band is what keeps the lower half of the frame from sitting empty.
 */
const BAND = { top: 270, bottom: 1540 };

/** The top and bottom of what a scene draws (shapes and text; the kicker and sounds are left out), or undefined when nothing could be measured. */
function contentExtent(layers: Layer[]): { top: number; bottom: number } | undefined {
  let top = Infinity, bottom = -Infinity;
  const add = (from: number, to: number) => { top = Math.min(top, from); bottom = Math.max(bottom, to); };
  for (const layer of layers) {
    if (typeof layer.id === 'string' && layer.id.startsWith('kicker')) continue;
    if (layer.type === 'rect' && typeof layer.y === 'number') add(layer.y, layer.y + layer.height);
    else if (layer.type === 'circle' && typeof layer.y === 'number') add(layer.y - layer.width / 2, layer.y + layer.width / 2);
    else if (layer.type === 'text' && typeof layer.y === 'number') {
      const size = layer.fontSize ?? 48, width = layer.maxWidth ?? 940, content = String(layer.content ?? '');
      const lines = content.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * size * 0.55) / width)), 0);
      add(layer.y, layer.y + Math.min(layer.maxLines ?? lines, lines) * size * (layer.lineHeight ?? 1.2));
    }
  }
  return Number.isFinite(top) ? { top, bottom } : undefined;
}

/** The spoken words, near the bottom and above the band reel apps cover; the word being said is picked out in the signal colour. */
const CAPTIONS_Y = 1380;
const captionsLayer = (cues: CaptionCue[]): Layer => ({
  id: 'captions', type: 'captions', src: 'spoken', cues, mode: 'words', maxWords: 6, startFrame: 8, x: W / 2, y: CAPTIONS_Y, textAlign: 'center', maxWidth: 920, fontSize: 54,
  fontFamily: '{{fontDisplay}}', fontWeight: weightFor('{{fontDisplay}}', 800), color: '{{text}}', highlightColor: GOLD, upcomingColor: '{{muted}}', background: 'transparent', padding: 0, dropFillers: false,
});

/** Where the viewer is: one segment per scene (past ones filled, the current one filling as it plays) and a "03 / 07" count under the header. */
const CHAPTER_Y = 1556;
function chapterBar(i: number, n: number, frames: number): Layer[] {
  const gap = 8, width = Math.max(4, (960 - gap * (n - 1)) / n), x = (k: number) => 60 + k * (width + gap);
  return [
    ...Array.from({ length: n }, (_, k) => rect(`chapter-${k}`, x(k), CHAPTER_Y, width, 8, { radius: 4, fill: k < i ? GOLD : '{{muted}}', opacity: k < i ? 0.95 : 0.3 })),
    rect('chapter-fill', x(i), CHAPTER_Y, 1, 8, { radius: 4, fill: GOLD, anims: [anim('width', [0, 1], [frames, width, 'linear'])] }),
    label('chapter-count', `${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`, W - 120, 218, { size: 22, ls: 4, color: '{{muted}}', align: 'right' }),
  ];
}

/** A voiced scene longer than this holds the picture for a long time; the note suggests splitting it into beats. */
const LONG_SCENE_FRAMES = 9 * FPS;

/** Moves a scene's picture down (or up) so its content sits in the middle of the band: every layer's y and its y keyframes shift together, so layers keep their ids and stay flat. Sounds are untouched. */
function centred(layers: Layer[], bottom = BAND.bottom): Layer[] {
  const extent = contentExtent(layers.filter(layer => layer.type !== 'audio'));
  if (!extent) return layers;
  const raw = Math.round((BAND.top + bottom) / 2 - (extent.top + extent.bottom) / 2), shift = Math.max(-80, Math.min(420, raw));
  if (Math.abs(shift) < 24) return layers;
  return layers.map(layer => {
    if (layer.type === 'audio' || typeof layer.y !== 'number' || String(layer.id).startsWith('kicker')) return layer;
    const animations = Array.isArray(layer.animations) ? layer.animations.map((beat: Anim) => beat.property === 'y'
      ? { ...beat, keyframes: beat.keyframes.map(key => (typeof key.value === 'number' ? { ...key, value: key.value + shift } : key)) } : beat) : undefined;
    return { ...layer, y: layer.y + shift, ...(animations ? { animations } : {}) };
  });
}

function compileWith(spec: Explainer, options: { audio?: (ExplainerAudio | undefined)[] }, palette: Record<string, string | number>): ExplainerCompiled {
  const notes: string[] = [];
  const [cw, ch] = SIZES[spec.aspect], fit = Math.min(cw / W, ch / H), column = cw !== W || ch !== H;
  const scenes = spec.scenes.map((scene, i) => {
    // A scene may pick its own layout (card or editorial), so a video is not one template from start to end.
    const base = active;
    if (scene.layout) active = { ...active, layout: scene.layout === 'auto' ? autoLayout(scene, active.layout) : scene.layout };
    let draw: Draw;
    try { draw = (kinds[scene.kind] as Kind<any>)(scene, i); } finally { active = base; }
    const spoken = options.audio?.[i];
    const frames = Math.max(draw.min, spoken ? Math.ceil((spoken.seconds + 0.6) * FPS) + 8 : 0);
    if (spoken && frames > draw.min) notes.push(`Scene ${i + 1} (${scene.kind}) runs ${(frames / FPS).toFixed(1)} s to fit its spoken line.`);
    if (spoken && frames > LONG_SCENE_FRAMES) notes.push(`Scene ${i + 1} (${scene.kind}) holds for ${(frames / FPS).toFixed(1)} s: split it into two beats so something changes every few seconds.`);
    // Captions follow the real speech, a few words at a time. They take the place of the scene's own caption line, which is kept as a small
    // muted note above them: it often carries a source ("Berkeley Lab, 2024") that must stay on screen.
    const cues = spec.captions && spoken?.words?.length ? groupCaptionWords(spoken.words, 6) : undefined;
    const everything = draw.layers(frames), sentence = cues ? everything.find(layer => layer.id === 'caption') : undefined;
    const drawn = cues ? everything.filter(layer => layer.id !== 'caption') : everything;
    const note = sentence ? [text('caption-note', String(sentence.content), W / 2, CAPTIONS_Y - 96, { size: 30, color: '{{muted}}', align: 'center', maxWidth: 900, maxLines: 2, lh: 1.2, anims: [fade(at(frames, 0.3), 14)] })] : [];
    const picture = scene.place === 'top' || scene.kind === 'pile' || scene.kind === 'media' || scene.kind === 'freeform' ? drawn : centred(drawn, cues ? CAPTIONS_Y - (note.length ? 130 : 40) : BAND.bottom);
    return { id: `s${i + 1}-${scene.kind}`, name: `${i + 1}. ${scene.kind}`, durationFrames: frames,
      ...(column ? { camera: { x: W / 2, y: H / 2, zoom: fit } } : {}),
      ...(i > 0 ? { transitionIn: { type: '{{transition}}', durationFrames: 14 } } : {}),
      layers: [...picture, ...note, ...(spec.chapters ? chapterBar(i, spec.scenes.length, frames) : []), ...(cues ? [captionsLayer(cues)] : []),
        ...(spoken ? [{ id: 'voice', type: 'audio', src: spoken.src, startFrame: 8, volume: 1 }] : [])] };
  });
  const overlay: Layer[] = [
    label('header-kind', `${spec.series} ·`, 60, HEADER_Y, { size: 22, ls: 3, color: '{{muted}}' }),
    label('header-topic', '{{topic}}', 60 + (spec.series.length + 3) * 16.2, HEADER_Y, { size: 22, ls: 3, color: GOLD }),
    label('header-handle', '{{handle}}', W - 120, HEADER_Y, { size: 22, ls: 3, color: '{{muted}}', align: 'right' }),
  ];
  // The header and footer are not scene layers, so no scene camera reaches them: scale the column by hand.
  const board = column ? [{ id: 'column', type: 'group', x: (cw - W * fit) / 2, y: (ch - H * fit) / 2, scale: fit, children: overlay }] : overlay;
  const variables = {
    ...Object.fromEntries(Object.entries(theme).map(([key, [type, description]]) => [key, { type, default: palette[key], description: `Theme: ${description}` }])),
    topic: { type: 'string', default: spec.topic, description: 'The topic, in the header' }, handle: { type: 'string', default: spec.handle, description: 'The creator handle, in the header' },
  };
  const composition = {
    version: '1.0', id: spec.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'explainer', name: spec.topic, width: cw, height: ch, fps: FPS, durationFrames: 'auto', background: '{{bg}}',
    texture: { type: '{{texture}}', color: '{{textureColor}}', opacity: '{{textureOpacity}}', scale: 56 }, export: { format: 'mp4', loudness: -16 },
    ...(spec.sketch ? { sketch: { roughness: 1.3, bowing: 1.2, boil: 6 } } : {}), variables, scenes, overlay: board,
  };
  return { composition, notes };
}
