import { stat } from 'node:fs/promises'; import { isBuiltinSound, builtinSoundName, type Composition } from '@ove/schema'; import { audioWindows, soundIntervals, volumeEnvelope, type SoundMedia } from '@ove/timeline'; import { resolveAssetSource, isUrl, cacheDir, touchCacheEntry } from '@ove/assets'; import { hasAudioStream, audioMixArgs, ffmpegPath, sfxArgs, type AudioClip, type AudioMix } from '@ove/ffmpeg'; import { spawn } from 'node:child_process'; import { mkdtemp, rm, mkdir, rename } from 'node:fs/promises'; import { existsSync } from 'node:fs'; import { createHash } from 'node:crypto'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { measureSource } from './media';
const runFfmpeg=(args: string[]) => new Promise<string>((resolve, reject) => { const child=spawn(ffmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err=''; child.stderr.on('data', d => err+=d); child.on('error', reject); child.on('close', code => code === 0 ? resolve(err) : reject(new Error(`FFmpeg exited ${code}: ${err.slice(-500)}`))); });
// A built-in sound effect's WAV, made once and kept in the cache folder (named by a hash of its recipe, so a changed recipe makes a new file).
const sfxDir = () => cacheDir('sfx'); const making=new Map<string, Promise<string>>();
export function sfxFile(name: string): Promise<string> { const file=join(sfxDir(), `${name}-${createHash('sha256').update(JSON.stringify(sfxArgs(name, ''))).digest('hex').slice(0, 12)}.wav`); if (existsSync(file)) { void touchCacheEntry(file); return Promise.resolve(file); }
  let job=making.get(file); if (!job) { job=(async () => { await mkdir(sfxDir(), { recursive: true }); const temp=`${file}.${process.pid}.tmp.wav`; await runFfmpeg(sfxArgs(name, temp)); await rename(temp, file); return file; })(); making.set(file, job); job.catch(() => making.delete(file)); } return job; }
export const sourceOf = (composition: Composition, src: string, baseDir: string) => isBuiltinSound(src) ? sfxFile(builtinSoundName(src)) : Promise.resolve(resolveAssetSource(composition, src, baseDir));
const ensureExists = async (source: string) => { if (!isUrl(source)) await stat(source).catch(() => { throw new Error(`Audio source not found: ${source}`); }); };
// Turns the composition's sounds into clips on the output timeline: `export.audio` as a looping soundtrack under everything, then each
// audio layer and each video layer with an audio track, placed where it is on screen. Clips whose volume changes (volume keyframes, or
// ducking under other sounds) carry an envelope. Returns undefined when the video is silent.
export async function planAudio(composition: Composition, baseDir: string, probe: (source: string) => Promise<boolean> = hasAudioStream): Promise<AudioMix | undefined> { const fps=composition.fps, clips: AudioClip[]=[], windows=audioWindows(composition);
  // Ducking follows the measured phrases of the other sounds, so their sources are measured only when something ducks.
  const ducking=!!composition.export.duck || windows.some(({ layer }: any) => layer.duck); const media: SoundMedia={};
  if (ducking) await Promise.all([...new Set(windows.map(({ layer }: any) => layer.src as string))].map(async src => { const m=await measureSource(await sourceOf(composition, src, baseDir)); media[src]={ duration: m.duration, segments: m.sounds.map(([start, end]) => ({ start, end })) }; }));
  const others=ducking ? soundIntervals(composition, media) : [];
  const soundtrack=composition.export.audio === undefined ? undefined : await sourceOf(composition, composition.export.audio, baseDir); if (soundtrack) { await ensureExists(soundtrack); const duration=composition.durationFrames/fps;
    clips.push({ source: soundtrack, start: 0, duration, loop: true, volume: composition.export.audioVolume, envelope: volumeEnvelope({ layer: { volume: composition.export.audioVolume }, fps, start: 0, duration, duck: composition.export.duck, others }) }); }
  const hasAudio=new Map<string, Promise<boolean>>();
  for (const { layer, startFrame, endFrame } of windows) { const source=await sourceOf(composition, layer.src, baseDir); await ensureExists(source);
    if (layer.type === 'video') { if (!hasAudio.has(source)) hasAudio.set(source, probe(source)); if (!(await hasAudio.get(source))) continue; }
    const start=startFrame/fps, duration=(endFrame-startFrame)/fps;
    clips.push({ source, start, duration, trim: layer.trimStart/fps, rate: layer.playbackRate, loop: layer.loop, volume: layer.volume, envelope: volumeEnvelope({ layer, fps, start, duration, duck: layer.duck, others }), ...(layer.type === 'audio' ? { fadeIn: layer.fadeInFrames/fps, fadeOut: layer.fadeOutFrames/fps } : {}) }); }
  return clips.length ? { clips, durationSeconds: composition.durationFrames/fps } : undefined; }

// Mixes a planned soundtrack exactly as a render would (into a temporary WAV) and measures it with FFmpeg's EBU R128 meter.
export async function measureMix(mix: AudioMix): Promise<{ integrated: number; truePeak: number } | undefined> { if (!mix.clips.length) return undefined;
  const dir=await mkdtemp(join(tmpdir(), 'ove-loudness-')), wav=join(dir, 'mix.wav'); try {
    const args=audioMixArgs(mix, ['-c:a','pcm_s16le']), video=args.indexOf('0:v');
    if (video > 0) args.splice(video-1, 2); // the mix maps the encoder's video input; a still placeholder stands in for it here
    await runFfmpeg(['-v','error','-y','-f','lavfi','-i','color=c=black:s=16x16:r=1',...args,'-t',String(mix.durationSeconds),wav]);
    const summary=(await runFfmpeg(['-hide_banner','-nostats','-i',wav,'-af','ebur128=peak=true','-f','null','-'])).split('Summary:').at(-1) ?? '';
    const integrated=Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1]), truePeak=Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1]);
    return Number.isFinite(integrated) ? { integrated, truePeak: Number.isFinite(truePeak) ? truePeak : -Infinity } : undefined; } finally { await rm(dir, { recursive: true, force: true }); } }
// The soundtrack as a render plays it: planAudio, then, when export.loudness is set, one fixed gain for the whole video so it measures
// at that loudness (a fixed gain keeps the mix's own dynamics, unlike a running normaliser), with the limiter catching what it pushes
// over. Measured over the whole composition, so partial renders and chunks get the same gain.
export async function masterAudio(composition: Composition, baseDir: string): Promise<AudioMix | undefined> { const mix=await planAudio(composition, baseDir), target=composition.export.loudness;
  if (!mix || target === undefined) return mix; const measured=await measureMix({ ...mix, durationSeconds: composition.durationFrames/composition.fps });
  return measured ? { ...mix, gainDb: Math.max(-40, Math.min(40, target-measured.integrated)) } : mix; }
// How loud the finished video will be.
export async function measureLoudness(composition: Composition, baseDir: string): Promise<{ integrated: number; truePeak: number } | undefined> { const mix=await masterAudio(composition, baseDir); return mix ? measureMix({ ...mix, durationSeconds: composition.durationFrames/composition.fps }) : undefined; }
