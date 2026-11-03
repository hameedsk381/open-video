// The public Node API: load a composition, render it to any output format or render single frames. The CLI is built on these.
import { mkdir, readFile, writeFile } from 'node:fs/promises'; import { dirname, extname, join, resolve } from 'node:path';
import { exportSchema, outputFormats, type Composition } from '@ove/schema'; import { prepareComposition } from './media'; import { createRenderer, renderFrames, defaultConcurrency } from '@ove/renderer'; import { createEncoder, probe, defaultPreset, type X264Preset } from '@ove/ffmpeg'; import { masterAudio } from './audio';
export * from '@ove/schema'; export * from '@ove/timeline'; export { planAudio } from './audio'; export { masterAudio, measureMix, measureLoudness, sfxFile } from './audio'; export { cacheRoot, cacheUsage, cleanCache, type CacheUsage } from '@ove/assets'; export { reviewComposition, type ReviewIssue, type ReviewResult, type ReviewOptions } from './review'; export { measureMedia, attachCaptions, prepareComposition, captionTrack } from './media'; export * from './distributed'; export { createRenderer, renderFrames, defaultConcurrency, launchBrowser, describeBrowser, browserInstallHint, type Renderer } from '@ove/renderer'; export { x264Presets, defaultPreset, checkFfmpeg, requiredEncoders, ffmpegPath, ffprobePath, type X264Preset } from '@ove/ffmpeg';
export type OutputFormat = typeof outputFormats[number];
export type LoadedComposition = { composition: Composition; baseDir: string };
// Reads a composition file and prepares it: measures media for {{media[...]}} timing, resolves variables, places scenes and loads
// captions. Media paths in it are relative to the file's folder (`baseDir`).
export async function loadCompositionFile(path: string, values: Record<string, unknown> = {}): Promise<LoadedComposition> { const file=resolve(path), baseDir=dirname(file); return { composition: await prepareComposition(JSON.parse(await readFile(file, 'utf8')), values, baseDir), baseDir }; }
export type RenderProgress = { frame: number; rendered: number; total: number };
export type RenderMediaOptions = {
  output: string; baseDir?: string;
  /** Run the composition's code layers (JavaScript). Only for compositions you trust. */
  allowCode?: boolean;
  /** Overrides the composition's export settings. When format is left out it follows the output's extension, then export.format. */
  format?: OutputFormat; codec?: 'h264' | 'h265'; transparent?: boolean;
  /** Overrides export.crf / bitrate / audioBitrate / scale / loudness. */ crf?: number; bitrate?: string; audioBitrate?: string; scale?: number; loudness?: number;
  /** false renders without the composition's motion blur, for quick drafts. */ motionBlur?: boolean;
  /** First and last frame to render, inclusive. Defaults to the whole composition. */
  frameRange?: [number, number];
  concurrency?: number; preset?: X264Preset; onProgress?: (progress: RenderProgress) => void; signal?: AbortSignal;
  /** false renders silent video; distributed chunks use this and the audio is mixed once when they are joined. */
  audio?: boolean };
export type RenderMediaResult = { output: string; format: OutputFormat; frames: number; durationSeconds: number };
const byExtension: Record<string, OutputFormat> = { '.mp4': 'mp4', '.webm': 'webm', '.mov': 'mov', '.gif': 'gif' };
export const formatForOutput = (output: string, fallback: OutputFormat): OutputFormat => byExtension[extname(output).toLowerCase()] ?? (extname(output) === '' ? 'png' : fallback);
function checkRange(composition: Composition, range?: [number, number]): [number, number] { const [first, last]=range ?? [0, composition.durationFrames-1];
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= composition.durationFrames) throw new Error(`Frame range must be whole frames within 0–${composition.durationFrames-1}, first ≤ last; got ${first}–${last}`); return [first, last]; }
// Renders a composition (or part of it) to a video file, a GIF, or a folder of PNG frames named frame-000000.png by frame number.
export async function renderMedia(composition: Composition, options: RenderMediaOptions): Promise<RenderMediaResult> { const baseDir=options.baseDir ?? process.cwd(), output=resolve(options.output);
  const format=options.format ?? formatForOutput(output, composition.export.format);
  const settings=exportSchema.parse({ ...composition.export, ...Object.fromEntries(Object.entries({ crf: options.crf, bitrate: options.bitrate, audioBitrate: options.audioBitrate, scale: options.scale, loudness: options.loudness }).filter(([, v]) => v !== undefined)), format, codec: options.codec ?? (format === 'mp4' ? composition.export.codec : 'h264'), transparent: options.transparent ?? composition.export.transparent });
  const target={ ...composition, export: settings }; const [first, last]=checkRange(target, options.frameRange), total=last-first+1, fps=target.fps;
  const throwIfAborted=() => { if (options.signal?.aborted) throw options.signal.reason ?? new Error('Render cancelled'); }; throwIfAborted();
  await mkdir(format === 'png' ? output : dirname(output), { recursive: true });
  const renderer=await createRenderer(target, { baseDir, concurrency: options.concurrency ?? defaultConcurrency(), scale: settings.scale, motionBlur: options.motionBlur, allowCode: options.allowCode });
  const audio=format === 'png' || format === 'gif' || options.audio === false ? undefined : await masterAudio(target, baseDir).then(mix => mix && { ...mix, durationSeconds: total/fps, offsetSeconds: first/fps });
  const encoder=format === 'png' ? undefined : createEncoder(fps, output, audio, { format, codec: settings.codec, preset: options.preset ?? defaultPreset, transparent: settings.transparent, crf: settings.crf, bitrate: settings.bitrate, audioBitrate: settings.audioBitrate });
  try { let frame=first; for await (const png of renderFrames(renderer, first, last+1)) { throwIfAborted(); if (encoder) await encoder.write(png); else await writeFile(join(output, `frame-${String(frame).padStart(6, '0')}.png`), png); frame++; options.onProgress?.({ frame: frame-1, rendered: frame-first, total }); }
    await encoder?.finish(); } catch (error) { encoder?.abort(); throw error; } finally { await renderer.close(); }
  return { output, format, frames: total, durationSeconds: format === 'png' ? total/fps : Number(await probe(output)) || total/fps }; }
export type RenderStillOptions = { frame?: number; output?: string; baseDir?: string; transparent?: boolean; allowCode?: boolean };
// Renders one frame as PNG; writes it when `output` is given and always returns the bytes.
export async function renderStill(composition: Composition, options: RenderStillOptions = {}): Promise<Buffer> { const frame=options.frame ?? 0; checkRange(composition, [frame, frame]);
  const target=options.transparent === undefined ? composition : { ...composition, export: { ...composition.export, transparent: options.transparent } };
  const renderer=await createRenderer(target, { baseDir: options.baseDir ?? process.cwd(), allowCode: options.allowCode }); try { const png=await renderer.renderFrame(frame); if (options.output) { await mkdir(dirname(resolve(options.output)), { recursive: true }); await writeFile(resolve(options.output), png); } return png; } finally { await renderer.close(); } }
