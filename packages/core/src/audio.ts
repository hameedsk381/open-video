import { stat } from 'node:fs/promises'; import type { Composition } from '@ove/schema'; import { audioWindows } from '@ove/timeline'; import { resolveAssetSource, resolveAudio, isUrl } from '@ove/assets'; import { hasAudioStream, type AudioClip, type AudioMix } from '@ove/ffmpeg';
const ensureExists = async (source: string) => { if (!isUrl(source)) await stat(source).catch(() => { throw new Error(`Audio source not found: ${source}`); }); };
// Turns the composition's sounds into clips on the output timeline: `export.audio` as a looping soundtrack under everything, then each
// audio layer and each video layer with an audio track, placed where it is on screen. Returns undefined when the video is silent.
export async function planAudio(composition: Composition, baseDir: string, probe: (source: string) => Promise<boolean> = hasAudioStream): Promise<AudioMix | undefined> { const fps=composition.fps, clips: AudioClip[]=[];
  const soundtrack=resolveAudio(composition, baseDir); if (soundtrack) { await ensureExists(soundtrack); clips.push({ source: soundtrack, start: 0, duration: composition.durationFrames/fps, loop: true }); }
  const hasAudio=new Map<string, Promise<boolean>>();
  for (const { layer, startFrame, endFrame } of audioWindows(composition)) { const source=resolveAssetSource(composition, layer.src, baseDir); await ensureExists(source);
    if (layer.type === 'video') { if (!hasAudio.has(source)) hasAudio.set(source, probe(source)); if (!(await hasAudio.get(source))) continue; }
    clips.push({ source, start: startFrame/fps, duration: (endFrame-startFrame)/fps, trim: layer.trimStart/fps, rate: layer.playbackRate, loop: layer.loop, volume: layer.volume, ...(layer.type === 'audio' ? { fadeIn: layer.fadeInFrames/fps, fadeOut: layer.fadeOutFrames/fps } : {}) }); }
  return clips.length ? { clips, durationSeconds: composition.durationFrames/fps } : undefined; }
