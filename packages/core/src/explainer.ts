// Turns an explainer script (the scenes and what is said over them) into a composition. Each scene kind draws one kind of small animated
// diagram on the same dark board, with the same header and footer on every scene, so any topic gets a consistent video. Nothing here
// runs while rendering: the result is plain composition JSON, frame-exact like any other.
import type { Explainer, ExplainerScene } from '@ove/schema';
import { explainerLooks } from '@ove/schema';

type Layer = Record<string, any>;
type Anim = { property: string; keyframes: { frame: number; value: number | string; easing?: string }[] };
type Beat = Anim | Anim[];

const FPS = 30, W = 1080, H = 1920;
const GOLD = '{{accent}}', MINT = '{{accent2}}', RED = '#ff5d6c', ORANGE = '#e8a548', GREEN = '#3fae8c', CLEAR = '#00000000';
const TONES = { gold: GOLD, mint: MINT, red: RED, muted: '{{muted}}' } as const;

/* ---- drawing helpers ---- */
const anim = (property: string, ...keys: [number, number | string, string?][]): Anim => ({ property, keyframes: keys.map(([frame, value, easing]) => ({ frame, value, ...(easing ? { easing } : {}) })) });
const fade = (delay = 0, dur = 18, to = 1): Anim => anim('opacity', [delay, 0], [delay + dur, to, 'glide']);
const rise = (y: number, delay = 0, dist = 40, dur = 24): Anim[] => [fade(delay, Math.round(dur * 0.7)), anim('y', [delay, y + dist], [delay + dur, y, 'land'])];
const pop = (delay = 0, dur = 20, from = 0.6): Anim[] => [fade(delay, 8), anim('scale', [delay, from], [delay + dur, 1, 'pop'])];
const grow = (property: string, to: number, delay = 0, dur = 24): Anim => anim(property, [delay, 0], [delay + dur, to, 'land']);
const flat = (beats?: Beat[]) => (beats?.length ? { animations: beats.flat() } : {});

type TextOptions = { size?: number; weight?: number | string; font?: string; color?: string; ls?: number; lh?: number; maxWidth?: number; maxLines?: number; minSize?: number; align?: 'left' | 'center' | 'right'; opacity?: number; italic?: boolean; anims?: Beat[] };
const text = (id: string, content: string, x: number, y: number, o: TextOptions = {}): Layer => ({
  id, type: 'text', content, x, y, fontSize: o.size ?? 48, fontFamily: o.font ?? '{{fontBody}}', fontWeight: o.weight ?? 500, color: o.color ?? '{{text}}',
  ...(o.ls !== undefined ? { letterSpacing: o.ls } : {}), ...(o.lh ? { lineHeight: o.lh } : {}), ...(o.maxWidth ? { maxWidth: o.maxWidth } : {}),
  ...(o.maxLines ? { maxLines: o.maxLines, minFontSize: o.minSize ?? Math.round((o.size ?? 48) * 0.6) } : {}), ...(o.align ? { textAlign: o.align } : {}),
  ...(o.opacity !== undefined ? { opacity: o.opacity } : {}), ...(o.italic ? { fontStyle: 'italic' } : {}), ...flat(o.anims),
});
const label = (id: string, content: string, x: number, y: number, o: TextOptions = {}) => text(id, content, x, y, { font: 'JetBrains Mono', weight: 600, size: 24, ls: 7, color: GOLD, ...o });
const center = (id: string, content: string, y: number, o: TextOptions = {}) => text(id, content, W / 2, y, { align: 'center', maxWidth: 940, ...o });

type ShapeOptions = { radius?: number; fill?: string; stroke?: string; strokeWidth?: number; opacity?: number; anims?: Beat[] };
const rect = (id: string, x: number, y: number, width: number, height: number, o: ShapeOptions = {}): Layer => ({
  id, type: 'rect', x, y, width: Math.max(1, width), height: Math.max(1, height), radius: o.radius ?? 0, fill: o.fill ?? '{{surface}}',
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
const kicker = (i: number, step?: string): Layer[] => (step ? [label(`kicker-${i}`, `— ${step}`, 60, 150, { size: 22, ls: 4, color: '{{muted}}', anims: [fade(2, 12)] })] : []);

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
    ...caption('caption', s.caption, 1580, at(frames, 0.34)),
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
  const n = s.items.length, first = at(frames, 0.1), span = at(frames, 0.62) / n, pitch = 250;
  return [...kicker(i, s.step), ...s.items.flatMap((item, k) => {
    const start = first + Math.round(k * span), next = k + 1 < n ? first + Math.round((k + 1) * span) : undefined, y = 320 + k * pitch;
    return [
      outline(`step-${k}`, 70, y, 940, 200, '{{muted}}', { radius: 18, fill: '{{surface}}', strokeWidth: 2, anims: [[anim('opacity', [start, 0], [start + 12, 1, 'glide']), anim('y', [start, y + 30], [start + 18, y, 'land'])]] }),
      outline(`step-on-${k}`, 70, y, 940, 200, GOLD, { radius: 18, strokeWidth: 4, opacity: 0, anims: [next === undefined ? anim('opacity', [start, 0], [start + 12, 1]) : anim('opacity', [start, 0], [start + 12, 1], [next, 1], [next + 14, 0])] }),
      circle(`step-n-${k}`, 150, y + 100, 84, { fill: CLEAR, stroke: MINT, strokeWidth: 4, anims: [fade(start + 4, 10)] }),
      label(`step-num-${k}`, String(k + 1), 150, y + 78, { size: 44, ls: 0, color: MINT, align: 'center', anims: [fade(start + 4, 10)] }),
      text(`step-title-${k}`, item.title, 230, y + (item.detail ? 38 : 70), { font: '{{fontDisplay}}', weight: 800, size: 54, maxWidth: 740, maxLines: 1, minSize: 34, anims: [rise(y + (item.detail ? 38 : 70), start + 6, 20, 16)] }),
      ...(item.detail ? [text(`step-detail-${k}`, item.detail, 230, y + 112, { size: 34, color: '{{muted}}', maxWidth: 740, maxLines: 2, minSize: 26, lh: 1.2, anims: [fade(start + 14, 12)] })] : []),
      sfx('pop', start + 4, 0.25)];
  }), ...caption('caption', s.caption, 320 + n * pitch + 20, at(frames, 0.78)), sfx('whoosh', 0, 0.2)];
} });

const compare: Kind<'compare'> = (s, i) => ({ min: 120 + (s.left.points.length + s.right.points.length) * 40, layers: frames => {
  const rows = Math.max(s.left.points.length, s.right.points.length), first = at(frames, 0.12), span = at(frames, 0.6) / rows;
  const column = (side: 'left' | 'right', data: { title: string; points: string[] }, x: number, color: string, mark: string): Layer[] => [
    outline(`${side}-card`, x, 300, 450, 170 + rows * 230, color, { radius: 18, fill: '{{surface}}', strokeWidth: 3, anims: [pop(side === 'left' ? 4 : 12, 16, 0.92)] }),
    label(`${side}-title`, data.title, x + 225, 340, { size: 30, ls: 5, color, align: 'center', maxWidth: 400, anims: [fade(side === 'left' ? 10 : 18, 10)] }),
    ...data.points.flatMap((point, k) => {
      const start = first + Math.round(k * span) + (side === 'right' ? 10 : 0), y = 470 + k * 230;
      return [label(`${side}-mark-${k}`, mark, x + 40, y, { size: 44, ls: 0, color, anims: [fade(start, 10)] }),
        text(`${side}-point-${k}`, point, x + 100, y - 4, { size: 44, weight: 700, maxWidth: 320, maxLines: 4, minSize: 30, lh: 1.2, anims: [rise(y - 4, start, 24, 18)] }),
        sfx('pop', start + 2, 0.2)];
    })];
  return [...kicker(i, s.step), ...column('left', s.left, 60, RED, '✗'), ...column('right', s.right, 570, MINT, '✓'), ...caption('caption', s.caption, 1500, at(frames, 0.8)), sfx('whoosh', 0, 0.2)];
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
  return [...layers, ...caption('caption', s.caption, 1500, at(frames, 0.7)), sfx('whoosh', 0, 0.2)];
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
    ...caption('caption', s.caption, 1560, at(frames, 0.7)), sfx('whoosh', 0, 0.2), sfx('thump', at(frames, 0.5), 0.25)];
} });

// The picture or clip sits in a rounded frame inside the board, so the header and footer stay readable whatever is behind them.
const FRAME = { x: 60, y: 210, w: 960, h: 1530 };
const media: Kind<'media'> = (s, i) => ({ min: 120, layers: () => {
  const shadeFrom = FRAME.y + Math.round(FRAME.h * 0.4), bottom = FRAME.y + FRAME.h, titleY = bottom - (s.caption ? 560 : 420);
  return [
    { id: 'footage', type: VIDEO.test(s.src) ? 'video' : 'image', src: s.src, x: FRAME.x, y: FRAME.y, width: FRAME.w, height: FRAME.h, radius: 28, objectFit: 'cover', ...(VIDEO.test(s.src) ? { muted: true, loop: true } : {}) },
    { ...rect('scrim', FRAME.x, shadeFrom, FRAME.w, bottom - shadeFrom, { radius: 28, anims: [fade(0, 10)] }), fill: { type: 'linear', from: [0, 0], to: [0, bottom - shadeFrom], stops: [{ offset: 0, color: '#00000000' }, { offset: 1, color: '#000000e6' }] } },
    ...kicker(i, s.step),
    ...(s.title ? [center('media-title', s.title, titleY, { font: '{{fontDisplay}}', weight: 900, size: 110, color: '#ffffff', maxWidth: 840, maxLines: 3, minSize: 60, lh: 1.0, anims: [rise(titleY, 8, 40, 26)] })] : []),
    ...(s.caption ? [center('media-caption', s.caption, bottom - 190, { size: 46, weight: 600, color: '#ffffff', maxWidth: 820, lh: 1.25, anims: [rise(bottom - 190, 24, 30, 22)] })] : []),
    ...(s.credit ? [label('media-credit', s.credit, FRAME.x + FRAME.w - 30, bottom - 52, { size: 18, ls: 2, color: '#ffffff', align: 'right', opacity: 0.75 })] : []),
    sfx('whoosh', 0, 0.2)];
} });

const closing: Kind<'closing'> = (s, i) => ({ min: 150, layers: frames => [
  ...kicker(i, s.step),
  center('close-title', s.title, 520, { font: '{{fontDisplay}}', weight: 900, size: 130, color: GOLD, maxWidth: 900, maxLines: 3, minSize: 70, lh: 1.0, anims: [rise(520, 6, 40, 26)] }),
  ...s.points.flatMap((point, k) => { const y = 1000 + k * 150, start = at(frames, 0.3) + k * 20; return [
    label(`close-mark-${k}`, '✓', 90, y, { size: 52, ls: 0, color: MINT, anims: [fade(start, 10)] }),
    text(`close-point-${k}`, point, 170, y - 6, { size: 50, weight: 700, maxWidth: 800, maxLines: 2, minSize: 34, lh: 1.15, anims: [rise(y - 6, start, 24, 18)] }), sfx('pop', start + 2, 0.2)]; }),
  ...tag('cta', s.cta, W / 2, 1560, MINT, at(frames, 0.6), 640),
  sfx('whoosh', 0, 0.2), sfx('ding', at(frames, 0.6) + 2, 0.25)] });

const kinds: { [K in ExplainerScene['kind']]: Kind<K> } = { title, flow, grid, steps, compare, stat, chart, timeline, pile, media, closing };

/* ---- the whole video ---- */
const theme = {
  bg: ['color', '#0b1c3f', 'page background (a 6-digit hex)'], surface: ['color', '#10295a', 'raised surfaces and cards'], text: ['color', '#f1efe8', 'main text'], muted: ['color', '#8ea3c9', 'secondary text'],
  accent: ['color', '#f4c542', 'the one signal colour'], accent2: ['color', '#37d3a3', 'a softer partner for the accent'], radius: ['number', 28, 'corner radius of cards and buttons'], headWeight: ['number', 800, 'weight of headlines'],
  fontDisplay: ['string', 'Archivo', 'headline font'], fontBody: ['string', 'Inter', 'body font'], texture: ['string', 'grid', 'background texture: none, grid, dots, scanlines or paper'],
  textureColor: ['color', '#8fb0ff', 'texture ink'], textureOpacity: ['number', 0.05, 'texture strength'], motion: ['string', 'rise', 'how headlines arrive: rise, slide, pop or blur'], transition: ['string', 'fade', 'how scenes change: fade, zoom, wipe or push'],
} as const;

/** The board's colours for each look; `colors` in the script replaces any of them. */
const looks: Record<typeof explainerLooks[number], Record<string, string | number>> = {
  navy: {},
  ink: { bg: '#0a0a0b', surface: '#17171c', text: '#f4f1ea', muted: '#9a968c', accent: '#ff4a1c', accent2: '#ffb199', textureColor: '#ffffff' },
  paper: { bg: '#f4efe6', surface: '#fffaf0', text: '#1a1a1a', muted: '#6b655a', accent: '#c2410c', accent2: '#0f766e', textureColor: '#000000', textureOpacity: 0.05 },
  forest: { bg: '#0c2a22', surface: '#12392f', text: '#eef5ef', muted: '#8fb3a4', accent: '#f2c14e', accent2: '#7bdcb5', textureColor: '#9fe8c8' },
  sunset: { bg: '#2a1033', surface: '#3a1a47', text: '#fff3ec', muted: '#c9a5c9', accent: '#ff9f43', accent2: '#ff6b81', textureColor: '#ffc2d4' },
};

/** What was said over one scene: the audio file (relative to the composition) and how long it runs. */
export type ExplainerAudio = { src: string; seconds: number };
export type ExplainerCompiled = { composition: Record<string, unknown>; notes: string[] };

/**
 * Compiles an explainer script into a composition. A scene with a spoken line lasts as long as the line (plus a short pause), never
 * shorter than its pictures need; `audio[i]` is the recording of scene i's `say`, if there is one.
 */
export function compileExplainer(spec: Explainer, options: { audio?: (ExplainerAudio | undefined)[] } = {}): ExplainerCompiled {
  const notes: string[] = [];
  const scenes = spec.scenes.map((scene, i) => {
    const draw = (kinds[scene.kind] as Kind<any>)(scene, i), spoken = options.audio?.[i];
    const frames = Math.max(draw.min, spoken ? Math.ceil((spoken.seconds + 0.6) * FPS) + 8 : 0);
    if (spoken && frames > draw.min) notes.push(`Scene ${i + 1} (${scene.kind}) runs ${(frames / FPS).toFixed(1)} s to fit its spoken line.`);
    return { id: `s${i + 1}-${scene.kind}`, name: `${i + 1}. ${scene.kind}`, durationFrames: frames,
      ...(i > 0 ? { transitionIn: { type: '{{transition}}', durationFrames: 14 } } : {}),
      layers: [...draw.layers(frames), ...(spoken ? [{ id: 'voice', type: 'audio', src: spoken.src, startFrame: 8, volume: 1 }] : [])] };
  });
  const overlay: Layer[] = [
    label('header-kind', `${spec.series} ·`, 60, 64, { size: 22, ls: 3, color: '{{muted}}' }),
    label('header-topic', '{{topic}}', 60 + (spec.series.length + 3) * 16.2, 64, { size: 22, ls: 3, color: GOLD }),
    label('header-handle', '{{handle}}', W - 60, 64, { size: 22, ls: 3, color: '{{muted}}', align: 'right' }),
    text('follow', 'Follow', 60, 1810, { size: 46, weight: 800, italic: true }),
  ];
  const variables = {
    ...Object.fromEntries(Object.entries(theme).map(([key, [type, value, description]]) => [key, { type, default: ({ ...looks[spec.look], ...spec.colors } as Record<string, string | number>)[key] ?? value, description: `Theme: ${description}` }])),
    topic: { type: 'string', default: spec.topic, description: 'The topic, in the header' }, handle: { type: 'string', default: spec.handle, description: 'The creator handle, in the header' },
  };
  const composition = {
    version: '1.0', id: spec.topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'explainer', name: spec.topic, width: W, height: H, fps: FPS, durationFrames: 'auto', background: '{{bg}}',
    texture: { type: '{{texture}}', color: '{{textureColor}}', opacity: '{{textureOpacity}}', scale: 56 }, export: { format: 'mp4', loudness: -16 },
    ...(spec.sketch ? { sketch: { roughness: 1.3, bowing: 1.2, boil: 6 } } : {}), variables, scenes, overlay,
  };
  return { composition, notes };
}
