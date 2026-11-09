import { describe, expect, it } from 'vitest';
import { explainerLooks, explainerSchema, loadComposition } from '@ove/schema';
import { compileExplainer, renderStill } from '@ove/core';
import { decodePng } from './glb';

// "Every video looks the same" made measurable: the same script is drawn in every look, and no two of them may be close. Two things are compared.
// Colour: the mean colour of each cell of a coarse grid. Structure: the shape of the picture with colour taken out (grey, with the average and
// the spread removed, on a fine grid), so a change of palette alone counts for nothing but a different typeface, texture or corner does.
// 0 is identical; the two are added.
const scenes = [{ kind: 'title', chip: 'HOW IT WORKS', lines: ['What is', 'A CACHE', 'really?'], say: 'x' }, { kind: 'stat', value: '87%', label: 'of reads never reach the database', note: 'a week' }];
const FRAME = 118; // the title card has settled

type Picture = { png: Buffer; colour: Float32Array; shape: Float32Array };

function grid(data: Uint8Array, width: number, height: number, columns: number, rows: number, channels: 1 | 3): Float32Array {
  const out = new Float32Array(columns * rows * channels), counts = new Float32Array(columns * rows);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const cell = Math.floor((y * rows) / height) * columns + Math.floor((x * columns) / width), at = (y * width + x) * 4;
    if (channels === 3) for (let c = 0; c < 3; c++) out[cell * 3 + c]! += data[at + c]! / 255;
    else out[cell]! += (0.2126 * data[at]! + 0.7152 * data[at + 1]! + 0.0722 * data[at + 2]!) / 255;
    counts[cell]!++;
  }
  for (let cell = 0; cell < counts.length; cell++) for (let c = 0; c < channels; c++) out[cell * channels + c]! /= counts[cell]!;
  return out;
}
function normalised(values: Float32Array): Float32Array {
  let mean = 0; for (const v of values) mean += v; mean /= values.length;
  let spread = 0; for (const v of values) spread += (v - mean) ** 2; spread = Math.sqrt(spread / values.length) || 1;
  return values.map(v => (v - mean) / spread);
}
const picture = (png: Buffer): Picture => { const { data, width, height } = decodePng(png); return { png, colour: grid(data, width, height, 18, 32, 3), shape: normalised(grid(data, width, height, 54, 96, 1)) }; };
const mean = (a: Float32Array, b: Float32Array) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!); return sum / a.length; };
const colourDistance = (a: Picture, b: Picture) => mean(a.colour, b.colour);
const shapeDistance = (a: Picture, b: Picture) => mean(a.shape, b.shape);
const distance = (a: Picture, b: Picture) => colourDistance(a, b) + shapeDistance(a, b);

const still = async (extra: Record<string, unknown>) => picture(await renderStill(loadComposition(compileExplainer(explainerSchema.parse({ topic: 'CACHES', series: 'HOW IT WORKS', handle: '@motionrender', scenes, ...extra })).composition), { frame: FRAME, baseDir: process.cwd() }));

describe('how different the looks are', () => {
  it('keeps every pair of looks clearly apart, so videos about different things do not come out alike', async () => {
    const pictures = new Map<string, Picture>();
    for (const look of explainerLooks) pictures.set(look, await still({ look }));
    const pairs: { a: string; b: string; d: number; colour: number; shape: number }[] = [];
    for (const [i, a] of explainerLooks.entries()) for (const b of explainerLooks.slice(i + 1)) pairs.push({ a, b, d: distance(pictures.get(a)!, pictures.get(b)!), colour: colourDistance(pictures.get(a)!, pictures.get(b)!), shape: shapeDistance(pictures.get(a)!, pictures.get(b)!) });
    pairs.sort((x, y) => x.d - y.d);
    const closest = pairs.slice(0, 4).map(pair => `${pair.a}/${pair.b} ${pair.d.toFixed(3)} (colour ${pair.colour.toFixed(3)}, shape ${pair.shape.toFixed(3)})`).join('; ');
    expect(pairs[0]!.d, `the closest looks: ${closest}`).toBeGreaterThan(MIN_DISTANCE);

    // The looks added beyond the original five are designs, not palettes: each must also differ in shape from every other look.
    const designed = explainerLooks.filter(look => !ORIGINAL.includes(look));
    const nearest = designed.map(look => ({ look, shape: Math.min(...explainerLooks.filter(other => other !== look).map(other => shapeDistance(pictures.get(look)!, pictures.get(other)!))) }));
    expect(Math.min(...nearest.map(item => item.shape)), `shape distance to the nearest look: ${nearest.map(item => `${item.look} ${item.shape.toFixed(3)}`).join(', ')}`).toBeGreaterThan(MIN_SHAPE);
  }, 300_000);

  it('makes a change to the design show in the picture, not only in the numbers', async () => {
    const base = await still({ look: 'navy' });
    for (const [name, design] of [['font', { fontDisplay: 'Playfair Display' }], ['corners', { corners: 'sharp' }], ['texture', { texture: 'dots' }], ['weight', { weight: 'medium' }], ['motion is not a still', {}]] as const) {
      const changed = await still({ look: 'navy', design });
      if (name === 'motion is not a still') expect(changed.png.equals(base.png), name).toBe(true);
      else expect(changed.png.equals(base.png), name).toBe(false);
    }
  }, 300_000);
});

// Calibrated on the thirteen looks as shipped. Overall: the closest pair (navy and forest, which differ only in palette) is 0.078 apart. Shape alone:
// looks that differ only in palette are 0.02 to 0.03 apart, and each of the eight designed looks is at least 0.076 from its nearest neighbour.
const ORIGINAL = ['navy', 'ink', 'paper', 'forest', 'sunset'];
const MIN_DISTANCE = Number(process.env.LOOKS_MIN_DISTANCE ?? 0.05);
const MIN_SHAPE = Number(process.env.LOOKS_MIN_SHAPE ?? 0.05);
