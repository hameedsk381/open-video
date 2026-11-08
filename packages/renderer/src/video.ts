import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { createHash, randomUUID } from 'node:crypto';
import type { Composition } from '@ove/schema'; import { layerWindows } from '@ove/timeline'; import { resolveAssetSource, isUrl, cacheDir, touchCacheEntry } from '@ove/assets'; import { extractFrames } from '@ove/ffmpeg';
// first: the source frame the decoded files start at; count: one past the last source frame available (first + files), so frame
// indexes mean the same whether the whole source or only the shown part was decoded.
export type VideoFrames = { dir: string; count: number; first: number };
export const videoFrameFile = (video: VideoFrames, index: number) => join(video.dir, `${String(Math.max(0, index - video.first) + 1).padStart(6, '0')}.jpg`);
export const videoCacheRoot = () => cacheDir('video');
const complete = '.complete';
// Each source is decoded once per (file version, fps, size, length) into a cache folder that later renders and stills reuse.
// Decoding happens in a scratch folder renamed into place only when finished, so an interrupted run never leaves a partial cache.
async function decode(source: string, key: { fps: number; maxWidth: number; maxHeight: number; durationSeconds?: number; startSeconds?: number }, first = 0): Promise<VideoFrames> { const version=isUrl(source) ? '' : await stat(source).then(s => `${s.size}:${s.mtimeMs}`, () => { throw new Error(`Video not found: ${source}`); }); const dir=join(videoCacheRoot(), createHash('sha256').update(JSON.stringify({ source, version, ...key })).digest('hex').slice(0, 32)); const count=async () => (await readdir(dir)).filter(f => f.endsWith('.jpg')).length;
  if (await stat(join(dir, complete)).then(() => true, () => false)) { void touchCacheEntry(dir); return { dir, count: first + await count(), first }; }
  const scratch=`${dir}.partial-${randomUUID()}`; await mkdir(scratch, { recursive: true }); try { await extractFrames(source, scratch, key); await writeFile(join(scratch, complete), ''); await rename(scratch, dir).catch(async error => { if (!(await stat(join(dir, complete)).then(() => true, () => false))) throw error; }); } finally { await rm(scratch, { recursive: true, force: true }); }
  const frames=await count(); if (frames === 0) throw new Error(`No frames could be decoded from ${source}`); return { dir, count: first + frames, first }; }
// Only the source frames some layer can show are decoded: for each video layer, from its trimStart to as far as its on-screen window
// reaches at its playback rate (plus one for rounding). A source that any layer loops is decoded whole. If a trim starts past the end
// of the source, the whole source is decoded instead, so the layer holds its last frame as before.
export async function prepareVideos(composition: Composition, baseDir: string): Promise<Map<string, VideoFrames>> { const fps=composition.fps, bySource=new Map<string, { first: number; last: number; loop: boolean }>();
  for (const { layer, startFrame, endFrame } of layerWindows(composition, l => l.type === 'video')) { const l: any=layer, first=Math.max(0, Math.floor(l.trimStart)), last=Math.ceil(l.trimStart + (endFrame-startFrame)*l.playbackRate) + 1, seen=bySource.get(l.src);
    bySource.set(l.src, seen ? { first: Math.min(seen.first, first), last: Math.max(seen.last, last), loop: seen.loop || l.loop } : { first, last, loop: !!l.loop }); }
  return new Map(await Promise.all([...bySource].map(async ([src, range]) => { const source=resolveAssetSource(composition, src, baseDir), size={ fps, maxWidth: composition.width, maxHeight: composition.height };
    if (range.loop) return [src, await decode(source, size)] as const;
    const windowed=range.first > 0 ? await decode(source, { ...size, startSeconds: range.first/fps, durationSeconds: (range.last-range.first)/fps }, range.first).catch(() => undefined) : undefined;
    return [src, windowed ?? await decode(source, { ...size, durationSeconds: range.last/fps })] as const; }))); }
