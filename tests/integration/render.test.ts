import { describe, it, expect, beforeAll, afterAll } from 'vitest'; import { spawnSync } from 'node:child_process'; import { createHash } from 'node:crypto'; import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { loadComposition, renderMedia, renderStill, createRenderer, renderFrames, ffmpegPath, ffprobePath, type Composition } from '@ove/core';
// Renders a small composition for real (Chromium + FFmpeg) in every output format. Inputs are generated, so nothing is downloaded.
let dir='', composition: Composition;
const run=(cmd: string, args: string[]) => { const r=spawnSync(cmd, args, { encoding: 'buffer' }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}\n${r.stderr}`); return r.stdout; };
const streams=(file: string) => run(ffprobePath(), ['-v','error','-show_entries','stream=codec_name','-of','csv=p=0',file]).toString().trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const duration=(file: string) => Number(run(ffprobePath(), ['-v','error','-show_entries','format=duration','-of','csv=p=0',file]).toString());
// RGBA of one pixel of the first frame. VP9 alpha needs the libvpx decoder, whose output format settles only after the first frame,
// so the frame is decoded to a PNG before cropping (cropping the live stream makes FFmpeg fail to reconfigure its filters).
const pixel=(file: string, x: number, y: number, decoder: string[] = []) => { let source=file; if (decoder.length) { source=`${file}.first.png`; run(ffmpegPath(), ['-v','error','-y',...decoder,'-i',file,'-frames:v','1',source]); }
  return [...run(ffmpegPath(), ['-v','error','-i',source,'-vf',`crop=1:1:${x}:${y},format=rgba`,'-f','rawvideo','-'])]; };
beforeAll(async () => { dir=await mkdtemp(join(tmpdir(), 'ove-integration-')); run(ffmpegPath(), ['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=2',join(dir,'tone.wav')]);
  composition=loadComposition({ version:'1.0', id:'it', name:'Integration', width:160, height:90, fps:30, durationFrames:30, assets:[{ id:'tone', type:'audio', src:'./tone.wav' }],
    scenes:[{ id:'s', name:'S', startFrame:0, durationFrames:30, layers:[{ id:'tone', type:'audio', src:'tone' }, { id:'dot', type:'circle', x:80, y:45, width:40, fill:'#22c55e', animations:[{ property:'x', keyframes:[{ frame:0, value:40 }, { frame:29, value:120 }] }] }, { id:'label', type:'text', x:6, y:6, fontSize:14, content:'OVE' }] }] }); });
afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
describe('rendering', () => {
  it.each([['mp4', ['h264','aac']], ['webm', ['vp9','opus']], ['mov', ['prores','pcm_s16le']], ['gif', ['gif']]] as const)('%s has the expected streams and length', async (format, codecs) => {
    const output=join(dir, `out.${format}`); const result=await renderMedia(composition, { baseDir: dir, output, concurrency: 2 }); expect(result).toMatchObject({ format, frames: 30 }); expect(streams(output)).toEqual(codecs); expect(duration(output)).toBeCloseTo(1, 1); });
  it('writes H.265 when asked', async () => { const output=join(dir, 'h265.mp4'); await renderMedia(composition, { baseDir: dir, output, codec: 'h265' }); expect(streams(output)[0]).toBe('hevc'); });
  it('writes numbered PNG frames for a folder output', async () => { const output=join(dir, 'frames'); await renderMedia(composition, { baseDir: dir, output, frameRange: [10, 14] }); expect((await readdir(output)).sort()).toEqual(['frame-000010.png','frame-000011.png','frame-000012.png','frame-000013.png','frame-000014.png']); });
  it('keeps transparency in webm, mov and png', async () => { const clear={ ...composition, export: { ...composition.export, transparent: true } };
    for (const [file, decoder] of [['alpha.webm', ['-c:v','libvpx-vp9']], ['alpha.mov', []]] as const) { const output=join(dir, file); await renderMedia(clear, { baseDir: dir, output, frameRange: [0, 4] }); expect(pixel(output, 150, 80, [...decoder])[3]).toBe(0); expect(pixel(output, 40, 45, [...decoder])[3]).toBe(255); }
    const png=join(dir, 'alpha.png'); await renderStill(clear, { baseDir: dir, frame: 0, output: png }); expect(pixel(png, 150, 80)[3]).toBe(0); });
  it('cuts the audio to a frame range', async () => { const output=join(dir, 'range.mp4'); const result=await renderMedia(composition, { baseDir: dir, output, frameRange: [15, 29] }); expect(result.frames).toBe(15); expect(duration(output)).toBeCloseTo(.5, 1); expect(streams(output)).toEqual(['h264','aac']); });
  it('returns PNG bytes from renderStill', async () => { const png=await renderStill(composition, { baseDir: dir, frame: 12 }); expect(png.subarray(1, 4).toString()).toBe('PNG'); });
  it('produces identical frames whatever the page count', async () => { const hashes=async (concurrency: number) => { const r=await createRenderer(composition, { baseDir: dir, concurrency }); const out: string[]=[]; try { for await (const png of renderFrames(r, 0, 30)) out.push(createHash('sha256').update(png).digest('hex')); } finally { await r.close(); } return out; };
    expect(await hashes(3)).toEqual(await hashes(1)); });
  it('refuses settings a format cannot honour', async () => { await expect(renderMedia({ ...composition, export: { ...composition.export, transparent: true } }, { baseDir: dir, output: join(dir, 'x.mp4') })).rejects.toThrow(/cannot store transparency/); await writeFile(join(dir, 'unused'), ''); });
});
