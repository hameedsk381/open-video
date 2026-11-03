// `ove thumbnail`: a cover image from any composition. It renders one frame (by default a moment after the first scene has settled),
// optionally with a big title over a soft shade at the bottom, at the width you choose. The title is added as a one-frame scene on
// top, so the composition file itself is never changed.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { prepareComposition, renderStill } from '@ove/core';

export type ThumbnailOptions = { frame?: number; title?: string; width?: number; allowCode?: boolean };
export type ThumbnailResult = { png: Buffer; frame: number; width: number; height: number };

/** The frame used when none is given: well into the first scene, once its entrance has played. */
export function defaultThumbnailFrame(scenes: { startFrame: number; durationFrames: number; id: string }[], durationFrames: number): number {
  const first = scenes.find(scene => scene.id !== 'narration' && scene.id !== 'captions') ?? scenes[0];
  const frame = first ? first.startFrame + Math.round(first.durationFrames * 0.6) : Math.round(durationFrames * 0.3);
  return Math.min(Math.max(0, frame), Math.max(0, durationFrames - 1));
}

export async function makeThumbnail(raw: any, values: Record<string, unknown>, baseDir: string, options: ThumbnailOptions = {}): Promise<ThumbnailResult> {
  const composition = await prepareComposition(raw, values, baseDir);
  const frame = options.frame ?? defaultThumbnailFrame(composition.scenes as any, composition.durationFrames);
  if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationFrames) throw new Error(`--frame must be an integer from 0 to ${composition.durationFrames - 1}`);
  if (options.width !== undefined && !(Number.isInteger(options.width) && options.width >= 160 && options.width <= 7680)) throw new Error('--width must be a whole number of pixels from 160 to 7680');
  const next = structuredClone(raw);
  const { width, height } = composition;
  const short = Math.min(width, height);
  if (options.title?.trim()) {
    next.scenes = [...(Array.isArray(next.scenes) ? next.scenes : []), { id: 'thumbnail-title', name: 'Thumbnail title', startFrame: frame, durationFrames: 1, layers: [
      { id: 'thumbnail-shade', type: 'rect', x: 0, y: Math.round(height * 0.4), width, height: height - Math.round(height * 0.4),
        fill: { type: 'linear', from: [0, Math.round(height * 0.4)], to: [0, height], stops: [{ offset: 0, color: 'transparent' }, { offset: 1, color: '#000000e0' }] } },
      { id: 'thumbnail-title-box', type: 'group', x: Math.round(width * 0.06), y: Math.round(height * 0.5), width: Math.round(width * 0.88), height: Math.round(height * 0.44),
        layout: { direction: 'column', justify: 'end', align: 'start' }, children: [
          { id: 'thumbnail-title-text', type: 'text', content: options.title.trim(), fontSize: Math.round(short * 0.11), minFontSize: Math.round(short * 0.06), maxWidth: Math.round(width * 0.88), maxLines: 3,
            fontWeight: 900, lineHeight: 1.05, color: '#ffffff', shadow: { color: '#000000aa', blur: Math.round(short * 0.02), offsetX: 0, offsetY: Math.round(short * 0.006) } }] }] }];
  }
  if (options.width !== undefined && options.width !== width) next.export = { ...(next.export ?? {}), scale: options.width / width };
  const prepared = await prepareComposition(next, values, baseDir);
  const png = await renderStill(prepared, { frame, baseDir, allowCode: options.allowCode });
  const scale = options.width !== undefined ? options.width / width : 1;
  return { png, frame, width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function runThumbnail(argv: string[], raw: any, values: Record<string, unknown>, baseDir: string): Promise<void> {
  const option = (name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const number = (name: string) => { const text = option(name); if (text === undefined) return undefined; const value = Number(text); if (!Number.isFinite(value)) throw new Error(`${name} needs a number`); return value; };
  const result = await makeThumbnail(raw, values, baseDir, { frame: number('--frame'), title: option('--title'), width: number('--width'), allowCode: argv.includes('--allow-code') });
  const output = resolve(option('--output') ?? 'thumbnail.png');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.png);
  console.log(`Created ${output} (${result.width}x${result.height}, frame ${result.frame})`);
}
