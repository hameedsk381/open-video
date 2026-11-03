// `ove track matte.mp4`: follows the speaker through a matte video. For every frame it finds where the matte is white and writes the box
// around it as fractions of the frame (0 to 1), so labels and other layers can follow the speaker. `ove add fx-tracked-label --track
// track.json` turns that into the label's path. The matte is read through FFmpeg at a small size, so this takes seconds.
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegPath } from '@ove/core';

const run = promisify(execFile);
export type TrackPoint = { frame: number; left: number; top: number; right: number; bottom: number; cx: number; cy: number };
const gridWidth = 160, gridHeight = 90;

/** The box around the white of each frame of a matte (video or picture), at `fps` frames a second. Frames with no speaker repeat the last box. */
export async function trackMatte(file: string, options: { fps?: number; threshold?: number } = {}): Promise<TrackPoint[]> {
  const fps = options.fps ?? 30, threshold = options.threshold ?? 128;
  const { stdout } = await run(ffmpegPath(), ['-v', 'error', '-i', resolve(file), '-vf', `fps=${fps},scale=${gridWidth}:${gridHeight},format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { encoding: 'buffer', maxBuffer: 1 << 30 }).catch(error => { throw new Error(`Could not read the matte ${file}: ${String((error as { stderr?: Buffer }).stderr ?? error).slice(0, 300)}`); });
  const size = gridWidth * gridHeight, count = Math.floor(stdout.length / size), points: TrackPoint[] = [];
  if (!count) throw new Error(`The matte ${file} has no frames`);
  let last: TrackPoint | undefined;
  for (let frame = 0; frame < count; frame++) {
    let left = gridWidth, right = -1, top = gridHeight, bottom = -1, sumX = 0, sumY = 0, pixels = 0;
    for (let y = 0; y < gridHeight; y++) for (let x = 0; x < gridWidth; x++) if (stdout[frame * size + y * gridWidth + x]! > threshold) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; sumX += x; sumY += y; pixels++; }
    const round = (n: number) => Math.round(n * 10000) / 10000;
    const point: TrackPoint | undefined = pixels < 4 ? last && { ...last, frame } : { frame, left: round(left / gridWidth), top: round(top / gridHeight), right: round((right + 1) / gridWidth), bottom: round((bottom + 1) / gridHeight), cx: round(sumX / pixels / gridWidth), cy: round(sumY / pixels / gridHeight) };
    if (point) { points.push(point); last = point; } else points.push({ frame, left: 0.3, top: 0.2, right: 0.7, bottom: 0.9, cx: 0.5, cy: 0.55 });
  }
  return points;
}

/** Keyframes for a box of `labelWidth` x `labelHeight` pixels that stays beside the speaker: on the right when there is room, else on the left. Smoothed. */
export function labelKeyframes(points: TrackPoint[], canvas: { width: number; height: number }, label: { width: number; height: number }, options: { step?: number; gap?: number } = {}): { xKeys: { frame: number; value: number }[]; yKeys: { frame: number; value: number }[] } {
  const step = Math.max(1, options.step ?? 3), gap = options.gap ?? Math.round(canvas.width * 0.03), margin = Math.round(canvas.width * 0.03);
  const smooth = (values: number[]) => values.map((_, i) => { const window = values.slice(Math.max(0, i - 4), i + 5); return window.reduce((a, b) => a + b, 0) / window.length; });
  const sampled = points.filter((point, i) => i % step === 0 || i === points.length - 1);
  const rightSide = sampled.filter(point => point.right * canvas.width + gap + label.width <= canvas.width - margin).length >= sampled.length / 2;
  const xs = smooth(sampled.map(point => rightSide ? point.right * canvas.width + gap : point.left * canvas.width - gap - label.width));
  const ys = smooth(sampled.map(point => point.top * canvas.height + canvas.height * 0.04));
  const clampX = (x: number) => Math.round(Math.min(canvas.width - margin - label.width, Math.max(margin, x))), clampY = (y: number) => Math.round(Math.min(canvas.height - margin - label.height, Math.max(margin, y)));
  return { xKeys: sampled.map((point, i) => ({ frame: point.frame, value: clampX(xs[i]!) })), yKeys: sampled.map((point, i) => ({ frame: point.frame, value: clampY(ys[i]!) })) };
}

export async function runTrack(argv: string[]): Promise<void> {
  const option = (name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const file = argv[1];
  if (!file || file.startsWith('--')) throw new Error('Usage: ove track <matte video or picture> [--fps 30] [--output track.json]');
  const fps = option('--fps') === undefined ? 30 : Number(option('--fps'));
  if (!(fps > 0 && fps <= 240)) throw new Error('--fps must be a number from 1 to 240');
  const points = await trackMatte(file, { fps });
  const output = resolve(option('--output') ?? 'track.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(points) + '\n');
  console.log(`Tracked ${points.length} frames of ${file} into ${output}\n  Use it: ove add fx-tracked-label <composition.json> --scene <scene id> --track ${output}`);
}
