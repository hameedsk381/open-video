import { spawn } from 'node:child_process'; import { once } from 'node:events'; import { join } from 'node:path';
// x264 presets trade encoding speed for file size at the same visual quality. OVE defaults to 'veryfast' rather than x264's 'medium':
// for flat motion graphics it measured both faster and smaller with no visible loss (see docs/architecture.md).
export const x264Presets = ['ultrafast','superfast','veryfast','faster','fast','medium','slow','slower','veryslow'] as const;
export type X264Preset = typeof x264Presets[number]; export type EncodeOptions = { preset?: X264Preset };
export const defaultPreset: X264Preset = 'veryfast';
export type Mp4Encoder = { write(frame: Buffer): Promise<void>; finish(): Promise<void>; abort(): void }; export type Encoder = Mp4Encoder;
// FFmpeg/ffprobe come from PATH unless OVE_FFMPEG_PATH / OVE_FFPROBE_PATH point at specific executables.
export const ffmpegPath = () => process.env.OVE_FFMPEG_PATH || 'ffmpeg'; export const ffprobePath = () => process.env.OVE_FFPROBE_PATH || 'ffprobe';
const notFound = (tool: string, env: string) => new Error(`${tool} was not found. Install FFmpeg (it includes ${tool}) and put it on PATH, or set ${env} to the executable.`);
// One sound placed on the output timeline; all times are seconds. `trim` skips the start of the source, `rate` changes speed
// without changing pitch, and `loop` repeats the source (each repeat restarts from the source's beginning, not from `trim`).
export type AudioClip = { source: string; start: number; duration: number; trim?: number; rate?: number; loop?: boolean; volume?: number; fadeIn?: number; fadeOut?: number };
// `durationSeconds` is the output length; `offsetSeconds` skips the start of the mix, for rendering only part of a video.
export type AudioMix = { clips: AudioClip[]; durationSeconds: number; offsetSeconds?: number };
const seconds = (n: number) => n.toFixed(6);
// atempo accepts 0.5–100 per instance, so slower rates chain several.
const tempo = (rate: number) => { const filters: string[]=[]; let remaining=rate; while (remaining < 0.5) { filters.push('atempo=0.5'); remaining/=0.5; } if (remaining !== 1) filters.push(`atempo=${remaining}`); return filters; };
// Inputs, filter graph and output options for mixing clips with the video at input 0. Clips are summed without amix's default
// 1/n normalisation, so a clip's volume is the same whether it plays alone or with others; the mix is padded or cut to the video length.
export function audioMixArgs(mix: AudioMix | undefined, audioCodec: string[] = ['-c:a','aac','-b:a','192k']): string[] { if (!mix || mix.clips.length === 0) return []; const inputs: string[]=[], chains: string[]=[];
  mix.clips.forEach((clip, i) => { inputs.push(...(clip.loop ? ['-stream_loop','-1'] : []), '-i', clip.source); const fadeIn=Math.min(clip.fadeIn ?? 0, clip.duration), fadeOut=Math.min(clip.fadeOut ?? 0, clip.duration);
    const filters=[`atrim=start=${seconds(clip.trim ?? 0)}`,'asetpts=PTS-STARTPTS',...tempo(clip.rate ?? 1),`atrim=duration=${seconds(clip.duration)}`,'asetpts=PTS-STARTPTS','aformat=sample_rates=48000:channel_layouts=stereo',`volume=${clip.volume ?? 1}`,...(fadeIn > 0 ? [`afade=t=in:d=${seconds(fadeIn)}`] : []),...(fadeOut > 0 ? [`afade=t=out:st=${seconds(clip.duration-fadeOut)}:d=${seconds(fadeOut)}`] : []),`adelay=delays=${Math.round(clip.start*48000)}S:all=1`];
    chains.push(`[${i+1}:a]${filters.join(',')}[a${i}]`); });
  const labels=mix.clips.map((_, i) => `[a${i}]`).join(''); const mixed=mix.clips.length === 1 ? `${labels}apad` : `${labels}amix=inputs=${mix.clips.length}:duration=longest:normalize=0,apad`;
  return [...inputs,'-filter_complex',`${chains.join(';')};${mixed},atrim=start=${seconds(mix.offsetSeconds ?? 0)}:duration=${seconds(mix.durationSeconds)},asetpts=PTS-STARTPTS[aout]`,'-map','0:v','-map','[aout]',...audioCodec]; }
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'gif';
export type VideoEncodeOptions = EncodeOptions & { format?: VideoFormat; codec?: 'h264' | 'h265'; transparent?: boolean };
// Per-format video and audio codec settings. x265 shares x264's preset names. VP9 uses constant quality (crf 32, the libvpx
// default range's middle) and row multithreading; ProRes uses 4444 (with alpha) when transparent, HQ otherwise. GIF builds a palette
// from all frames (palettegen) before writing, and loops forever.
function formatArgs(fps: number, options: VideoEncodeOptions): { video: string[]; audio: string[] | undefined } { const preset=options.preset ?? defaultPreset, rate=['-r',String(fps)];
  switch (options.format ?? 'mp4') {
    case 'webm': return { video: ['-c:v','libvpx-vp9','-b:v','0','-crf','32','-row-mt','1','-deadline','good','-cpu-used','4','-pix_fmt',options.transparent ? 'yuva420p' : 'yuv420p',...rate], audio: ['-c:a','libopus','-b:a','160k'] };
    case 'mov': return { video: ['-c:v','prores_ks','-profile:v',options.transparent ? '4' : '3','-pix_fmt',options.transparent ? 'yuva444p10le' : 'yuv422p10le','-vendor','apl0',...rate], audio: ['-c:a','pcm_s16le'] };
    case 'gif': return { video: ['-vf','split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a','-loop','0',...rate], audio: undefined };
    default: return { video: options.codec === 'h265' ? ['-c:v','libx265','-preset',preset,'-pix_fmt','yuv420p','-tag:v','hvc1','-x265-params','log-level=error','-movflags','+faststart',...rate] : ['-c:v','libx264','-preset',preset,'-pix_fmt','yuv420p','-movflags','+faststart',...rate], audio: ['-c:a','aac','-b:a','192k'] }; } }
function run(args: string[], stdin: 'ignore'|'pipe') { const child=spawn(ffmpegPath(),args,{stdio:[stdin,'ignore','pipe']}); let error=''; child.stderr!.on('data',d=>error+=d); const done=new Promise<void>((resolve,reject)=>{child.on('error',e=>reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? notFound('ffmpeg','OVE_FFMPEG_PATH') : e)); child.on('close',code=>code===0?resolve():reject(new Error(`FFmpeg exited ${code}: ${error.slice(-1000)}`)));}); return { child, done }; }
const encodeArgs = (fps: number, audio: AudioMix | undefined, options: VideoEncodeOptions) => { const { video, audio: audioCodec }=formatArgs(fps, options); return [...(audioCodec ? audioMixArgs(audio, audioCodec) : []), ...video]; };
export function encodeMp4(framesPattern: string, fps: number, output: string, audio?: AudioMix, options: VideoEncodeOptions = {}): Promise<void> { return run(['-y','-framerate',String(fps),'-i',framesPattern,...encodeArgs(fps,audio,options),output],'ignore').done; }
// Streams PNG frames straight into FFmpeg's stdin, so no frames are written to disk. GIF output ignores audio.
export function createEncoder(fps: number, output: string, audio?: AudioMix, options: VideoEncodeOptions = {}): Encoder { const { child, done }=run(['-y','-f','image2pipe','-c:v','png','-framerate',String(fps),'-i','-',...encodeArgs(fps,audio,options),output],'pipe'); const stdin=child.stdin!; stdin.on('error',()=>{}); done.catch(()=>{}); return { async write(frame) { if(!stdin.write(frame)) await Promise.race([once(stdin,'drain'),done.then(()=>{ throw new Error('FFmpeg exited before all frames were written'); })]); }, finish() { stdin.end(); return done; }, abort() { child.kill(); } }; }
export const createMp4Encoder = (fps: number, output: string, audio?: AudioMix, options: EncodeOptions & { codec?: 'h264' | 'h265' } = {}): Mp4Encoder => createEncoder(fps, output, audio, { ...options, format: 'mp4' });
// Joins video segments rendered separately (same format and settings, each starting on a keyframe) without re-encoding, then mixes
// the composition's audio over the whole result. Used to assemble chunks rendered by workers.
export function concatSegments(segments: string[], listFile: string, output: string, audio?: AudioMix, options: Pick<VideoEncodeOptions, 'format'> = {}): Promise<void> {
  const { audio: audioCodec }=formatArgs(30, { format: options.format ?? 'mp4' }); const list=segments.map(s => `file '${s.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
  return import('node:fs/promises').then(fs => fs.writeFile(listFile, list)).then(() => run(['-y','-f','concat','-safe','0','-i',listFile,...(audioCodec ? audioMixArgs(audio, audioCodec) : []),...(audio && audioCodec ? [] : ['-map','0:v']),'-c:v','copy',...(options.format === 'mp4' || options.format === undefined ? ['-movflags','+faststart'] : []),output],'ignore').done); }
// Decodes a video onto a fixed frame grid as numbered JPEGs (000001.jpg is the frame at time 0), scaled down to fit maxWidth × maxHeight.
export type ExtractOptions = { fps: number; maxWidth: number; maxHeight: number; durationSeconds?: number };
export function extractFrames(source: string, outDir: string, options: ExtractOptions): Promise<void> { const { fps, maxWidth, maxHeight, durationSeconds }=options; return run(['-v','error','-y',...(durationSeconds === undefined ? [] : ['-t',String(durationSeconds)]),'-i',source,'-an','-vf',`fps=${fps},scale=w='min(iw,${maxWidth})':h='min(ih,${maxHeight})':force_original_aspect_ratio=decrease`,'-q:v','2',join(outDir,'%06d.jpg')],'ignore').done; }
// The encoders each output format needs; `ove doctor` reports which are missing from the FFmpeg build in use.
export const requiredEncoders: Record<string, string[]> = { mp4: ['libx264','aac'], 'mp4 (h265)': ['libx265'], webm: ['libvpx-vp9','libopus'], mov: ['prores_ks','pcm_s16le'], gif: ['gif'], 'video layers': ['mjpeg'] };
export function checkFfmpeg(): Promise<{ version: string; missing: Record<string, string[]> }> { return new Promise((resolve, reject) => { const child=spawn(ffmpegPath(), ['-hide_banner','-encoders']); let out=''; child.stdout.on('data', d => out+=d); child.on('error', e => reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? notFound('ffmpeg','OVE_FFMPEG_PATH') : e));
  child.on('close', () => { const have=new Set([...out.matchAll(/^\s*[VAS][.A-Z]{5}\s+(\S+)/gm)].map(m => m[1]!)); const missing=Object.fromEntries(Object.entries(requiredEncoders).map(([use, names]) => [use, names.filter(n => !have.has(n))]).filter(([, names]) => names.length));
    const version=spawn(ffmpegPath(), ['-version']); let v=''; version.stdout.on('data', d => v+=d); version.on('close', () => resolve({ version: v.split('\n')[0]?.trim() ?? 'unknown', missing })); version.on('error', reject); }); }); }
export function hasAudioStream(path: string): Promise<boolean> { return new Promise((resolve,reject)=>{const child=spawn(ffprobePath(),['-v','error','-select_streams','a','-show_entries','stream=index','-of','csv=p=0',path]);let out='';child.stdout.on('data',d=>out+=d);child.on('error',e=>reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? notFound('ffprobe','OVE_FFPROBE_PATH') : e));child.on('close',c=>c===0?resolve(out.trim().length>0):reject(new Error(`ffprobe could not read ${path}`)));}); }
export function probe(path: string): Promise<string> { return new Promise((resolve,reject)=>{const child=spawn(ffprobePath(),['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path]);let out='';child.stdout.on('data',d=>out+=d);child.on('error',e=>reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? notFound('ffprobe','OVE_FFPROBE_PATH') : e));child.on('close',c=>c===0?resolve(out.trim()):reject(new Error('ffprobe failed')));}); }
