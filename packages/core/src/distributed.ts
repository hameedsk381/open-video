// Distributed rendering: the frame range is split into chunks, workers render each chunk as a silent segment, and the segments are
// joined without re-encoding while the composition's audio is mixed once over the whole result (so there are no audio seams).
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { dirname, extname, isAbsolute, join, resolve } from 'node:path'; import { timingSafeEqual } from 'node:crypto';
import { exportSchema, isBuiltinSound, type Composition } from '@ove/schema'; import { isUrl } from '@ove/assets'; import { concatSegments, probe, defaultPreset, type X264Preset } from '@ove/ffmpeg'; import { masterAudio } from './audio';
import type { OutputFormat, RenderMediaResult, RenderProgress } from './index';
export type ChunkFormat = 'mp4' | 'webm' | 'mov';
export type ChunkSettings = { format: ChunkFormat; codec: 'h264' | 'h265'; transparent: boolean; preset: X264Preset; crf?: number; bitrate?: string; scale?: number };
export type ChunkJob = { index: number; frameRange: [number, number] };
// A worker renders one chunk and returns the segment's bytes. httpWorker talks to `ove worker`; anything else can implement this too.
export type RenderWorker = { name: string; renderChunk(composition: Composition, job: ChunkJob, settings: ChunkSettings, signal: AbortSignal): Promise<Buffer> };
export function planChunks(first: number, last: number, chunkSize: number): ChunkJob[] { if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('Chunk size must be a positive whole number of frames'); const jobs: ChunkJob[]=[];
  for (let start=first, index=0; start <= last; start+=chunkSize, index++) jobs.push({ index, frameRange: [start, Math.min(last, start+chunkSize-1)] }); return jobs; }
// Workers may run elsewhere, so relative media paths become absolute here. They must still exist at those paths on each worker
// (same machine or a shared drive) unless the composition uses URLs.
export function absolutizeSources(composition: Composition, baseDir: string): Composition { const abs=(src: string) => isUrl(src) || isAbsolute(src) || isBuiltinSound(src) || composition.assets.some(a => a.id === src) ? src : resolve(baseDir, src);
  const fix=(layer: any): any => ({ ...layer, ...(typeof layer.src === 'string' ? { src: abs(layer.src) } : {}), ...(layer.children ? { children: layer.children.map(fix) } : {}) });
  return { ...composition, assets: composition.assets.map(a => ({ ...a, src: isUrl(a.src) || isAbsolute(a.src) ? a.src : resolve(baseDir, a.src) })), scenes: composition.scenes.map(s => ({ ...s, layers: s.layers.map(fix) })), export: { ...composition.export, audio: composition.export.audio && !composition.assets.some(a => a.id === composition.export.audio) ? abs(composition.export.audio) : composition.export.audio } }; }
export type RenderDistributedOptions = { output: string; baseDir?: string; workers: RenderWorker[]; chunkSize?: number; frameRange?: [number, number]; format?: ChunkFormat; codec?: 'h264' | 'h265'; transparent?: boolean; preset?: X264Preset; crf?: number; bitrate?: string; audioBitrate?: string; scale?: number; loudness?: number; motionBlur?: boolean;
  /** Attempts per chunk beyond the first, each on the next free worker. */ retries?: number; onProgress?: (progress: RenderProgress & { chunk: number; worker: string }) => void; onWorkerError?: (worker: string, error: Error) => void; signal?: AbortSignal };
export async function renderDistributed(composition: Composition, options: RenderDistributedOptions): Promise<RenderMediaResult> { const baseDir=options.baseDir ?? process.cwd(), output=resolve(options.output);
  if (!options.workers.length) throw new Error('No workers given');
  // Same rule as renderMedia: known extensions pick the format, no extension means PNG frames, anything else falls back to export.format.
  const extension=extname(output).toLowerCase(), byExtension: Record<string, OutputFormat>={ '.mp4': 'mp4', '.webm': 'webm', '.mov': 'mov', '.gif': 'gif' };
  const format=(options.format ?? byExtension[extension] ?? (extension === '' ? 'png' : composition.export.format)) as OutputFormat;
  if (format !== 'mp4' && format !== 'webm' && format !== 'mov') throw new Error(`Distributed rendering writes mp4, webm or mov (segments are joined without re-encoding); ${format} is not supported`);
  const settings=exportSchema.parse({ ...composition.export, ...Object.fromEntries(Object.entries({ crf: options.crf, bitrate: options.bitrate, audioBitrate: options.audioBitrate, scale: options.scale, loudness: options.loudness }).filter(([, v]) => v !== undefined)), format, codec: options.codec ?? (format === 'mp4' ? composition.export.codec : 'h264'), transparent: options.transparent ?? composition.export.transparent });
  const target=absolutizeSources({ ...composition, export: settings, ...(options.motionBlur === false ? { motionBlur: undefined } : {}) }, baseDir), [first, last]=options.frameRange ?? [0, composition.durationFrames-1];
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last < first || last >= composition.durationFrames) throw new Error(`Frame range must be within 0–${composition.durationFrames-1}`);
  const chunkSettings: ChunkSettings={ format, codec: settings.codec, transparent: settings.transparent, preset: options.preset ?? defaultPreset, crf: settings.crf, bitrate: settings.bitrate, scale: settings.scale };
  const jobs=planChunks(first, last, options.chunkSize ?? Math.max(30, Math.ceil((last-first+1)/(options.workers.length*2)))), total=last-first+1, retries=options.retries ?? 2;
  const work=await mkdtemp(join(tmpdir(), 'ove-chunks-')), segments: string[]=new Array(jobs.length), attempts=new Map<number, number>(); const abort=new AbortController(); const onOuterAbort=() => abort.abort(options.signal?.reason); options.signal?.addEventListener('abort', onOuterAbort);
  try { const queue=[...jobs]; let rendered=0, fatal: Error | undefined;
    // Each worker takes the next chunk until none are left. A failed chunk goes back on the queue for another attempt; a worker
    // that fails twice in a row is dropped. The render fails when a chunk runs out of attempts or every worker has been dropped.
    let alive=options.workers.length;
    await Promise.all(options.workers.map(async worker => { let failures=0;
      while (!fatal && !abort.signal.aborted && queue.length) { const job=queue.shift()!;
        try { const bytes=await worker.renderChunk(target, job, chunkSettings, abort.signal); const file=join(work, `chunk-${String(job.index).padStart(5, '0')}.${format}`); await writeFile(file, bytes); segments[job.index]=file; failures=0;
          rendered+=job.frameRange[1]-job.frameRange[0]+1; options.onProgress?.({ frame: job.frameRange[1], rendered, total, chunk: job.index, worker: worker.name }); }
        catch (error) { if (abort.signal.aborted) break; options.onWorkerError?.(worker.name, error as Error); const n=(attempts.get(job.index) ?? 0)+1; attempts.set(job.index, n);
          if (n > retries) { fatal=new Error(`Chunk ${job.index} (frames ${job.frameRange[0]}–${job.frameRange[1]}) failed ${n} times; last error from ${worker.name}: ${(error as Error).message}`); abort.abort(fatal); break; }
          queue.unshift(job); if (++failures >= 2) { alive--; if (alive === 0) { fatal=new Error(`Every worker failed; last error from ${worker.name}: ${(error as Error).message}`); abort.abort(fatal); } break; } } } }));
    if (fatal) throw fatal; if (options.signal?.aborted) throw options.signal.reason ?? new Error('Render cancelled'); if (segments.some(s => !s)) throw new Error('Some chunks were not rendered');
    await mkdir(dirname(output), { recursive: true });
    const audio=await masterAudio(target, baseDir).then(mix => mix && { ...mix, durationSeconds: total/composition.fps, offsetSeconds: first/composition.fps });
    await concatSegments(segments, join(work, 'segments.txt'), output, audio, { format, audioBitrate: settings.audioBitrate });
    return { output, format, frames: total, durationSeconds: Number(await probe(output)) || total/composition.fps };
  } finally { options.signal?.removeEventListener('abort', onOuterAbort); await rm(work, { recursive: true, force: true }); } }
// A worker reached over HTTP. The token must match the worker's (`ove worker --token`).
export function httpWorker(url: string, token: string): RenderWorker { const base=url.replace(/\/+$/, '');
  return { name: base, async renderChunk(composition, job, settings, signal) { const response=await fetch(`${base}/render`, { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ composition, frameRange: job.frameRange, ...settings }) });
    if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 500)}`); return Buffer.from(await response.arrayBuffer()); } }; }
// Constant-time token comparison for the worker server.
export const tokensMatch=(given: string, expected: string) => { const a=Buffer.from(given), b=Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b); };
