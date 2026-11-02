// Measures audio and video assets for media-driven timing, and loads caption files into captions layers.
import { spawn } from 'node:child_process'; import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
import { loadComposition, parseCaptions, captionLines, dropFillerWords, type Composition, type MediaInfo, type CaptionCue } from '@ove/schema'; import { layerWindows } from '@ove/timeline'; import { resolveAssetSource, isUrl, cacheDir, touchCacheEntry } from '@ove/assets'; import { ffmpegPath, ffprobePath } from '@ove/ffmpeg';
type Measured = { duration: number; sounds: [number, number][] };
const run = (cmd: string, args: string[]) => new Promise<string>((ok, fail) => { const child = spawn(cmd, args); let out = ''; child.stdout.on('data', d => out += d); child.stderr.on('data', d => out += d); child.on('error', fail); child.on('close', code => code === 0 ? ok(out) : fail(new Error(`${cmd} failed on ${args[args.indexOf('-i') + 1] ?? args.at(-1)}`))); });
const mediaCache = () => cacheDir('media');
// Length from ffprobe; sound segments from FFmpeg's silencedetect (quieter than -45 dB for 0.25 s counts as a pause, which separates
// phrases in speech). Cached per file version, since decoding a long clip takes a moment.
export async function measureSource(source: string): Promise<Measured> { const version = isUrl(source) ? '' : await stat(source).then(s => `${s.size}:${s.mtimeMs}`, () => { throw new Error(`Media not found: ${source}`); });
  const key = createHash('sha256').update(`${source}|${version}|v1`).digest('hex').slice(0, 32), file = join(mediaCache(), `${key}.json`);
  const cached = await readFile(file, 'utf8').then(JSON.parse, () => undefined); if (cached) { void touchCacheEntry(file); return cached; }
  const duration = Number((await run(ffprobePath(), ['-v','error','-show_entries','format=duration','-of','csv=p=0', source])).trim()) || 0;
  const hasAudio = (await run(ffprobePath(), ['-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0', source])).trim().length > 0; let sounds: [number, number][] = [];
  // Sound runs from the end of one silence to the start of the next; a file that does not end in silence closes its last sound at the end.
  if (hasAudio) { const log = await run(ffmpegPath(), ['-hide_banner','-nostats','-i', source, '-vn','-af','silencedetect=noise=-45dB:d=0.25','-f','null','-']); let soundStart = 0, silent = false;
    for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) { const t = Number(m[2]); if (m[1] === 'start') { sounds.push([soundStart, t]); silent = true; } else { soundStart = t; silent = false; } }
    if (!silent) sounds.push([soundStart, duration]); sounds = sounds.filter(([a, b]) => b - a > 0.05); }
  const measured = { duration, sounds }; await mkdir(mediaCache(), { recursive: true }); await writeFile(file, JSON.stringify(measured)); return measured; }
// Measures every audio and video asset written with a literal path, by asset id, for {{media[id]...}} expressions. Nothing is measured
// unless the composition mentions `media`.
export async function measureMedia(raw: any, baseDir: string, fps = typeof raw?.fps === 'number' ? raw.fps : 30): Promise<Record<string, MediaInfo>> {
  if (!/\bmedia\s*[.[]/.test(JSON.stringify(raw ?? {}))) return {};
  const assets = (Array.isArray(raw?.assets) ? raw.assets : []).filter((a: any) => (a?.type === 'audio' || a?.type === 'video') && typeof a.src === 'string' && !a.src.includes('{{'));
  const stub = { assets } as unknown as Composition;
  return Object.fromEntries(await Promise.all(assets.map(async (asset: any) => { const m = await measureSource(resolveAssetSource(stub, asset.id, baseDir));
    const segments = m.sounds.map(([start, end]) => ({ start, end, startFrame: Math.floor(start*fps), endFrame: Math.ceil(end*fps) })); const soundEnd = m.sounds.at(-1)?.[1] ?? 0;
    return [asset.id, { duration: m.duration, frames: Math.ceil(m.duration*fps), segments, soundEnd, soundEndFrames: Math.ceil(soundEnd*fps) }] as const; }))); }
// Fills in `cues` on captions layers from their files (asset id or path). Word timings are kept whole here; layers group them into lines.
export async function attachCaptions(composition: Composition, baseDir: string): Promise<Composition> { const files = new Map<string, Promise<any>>();
  const walk = async (layers: any[]) => { for (const layer of layers) { if (layer.type === 'group') await walk(layer.children ?? []);
    if (layer.type === 'captions' && !layer.cues) { const source = resolveAssetSource(composition, layer.src, baseDir);
      if (!files.has(source)) files.set(source, (isUrl(source) ? fetch(source).then(r => { if (!r.ok) throw new Error(`Captions not found: ${source}`); return r.text(); }) : readFile(source, 'utf8').catch(() => { throw new Error(`Captions not found: ${source}`); })).then(text => parseCaptions(text, source, Infinity)));
      layer.cues = await files.get(source); } } };
  for (const scene of composition.scenes) await walk(scene.layers); return composition; }
// Every captions layer's lines at their place in the whole video, in seconds, for a sidecar .srt/.vtt (uploads, accessibility).
export function captionTrack(composition: Composition): CaptionCue[] { const fps = composition.fps;
  return layerWindows(composition, layer => layer.type === 'captions').flatMap(({ layer, startFrame, endFrame }: any) => { const shift = startFrame/fps + (layer.offset ?? 0), end = endFrame/fps;
    return captionLines(layer.dropFillers ? dropFillerWords(layer.cues ?? []) : layer.cues ?? [], layer.maxWords).map(cue => ({ text: cue.text, start: cue.start + shift, end: Math.min(cue.end + shift, end) })).filter(cue => cue.end > cue.start); }).sort((a, b) => a.start - b.start); }
// The full load used by the CLI and API: measure media, resolve variables and expressions, place scenes, then load captions.
export async function prepareComposition(raw: unknown, values: Record<string, unknown> = {}, baseDir = process.cwd()): Promise<Composition> {
  const composition = loadComposition(raw, values, { media: await measureMedia(raw, baseDir) }); return attachCaptions(composition, baseDir); }
