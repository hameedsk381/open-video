import { describe, it, expect, beforeAll, afterAll } from 'vitest'; import { spawnSync } from 'node:child_process'; import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { loadComposition, ffmpegPath, createRenderer } from '@ove/core'; import { prepareVideos, videoFrameFile } from '../../packages/renderer/src/video';
// Video layers decode only the source frames they can show. Seeking must give exactly the frames a full decode gives.
let dir: string, saved: string | undefined;
const comp = (layer: any, durationFrames = 30) => loadComposition({ version: '1.0', id: 'v', name: 'V', width: 160, height: 90, fps: 30, durationFrames, assets: [{ id: 'clip', type: 'video', src: './clip.mp4' }],
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames, layers: [{ id: 'v', type: 'video', src: 'clip', width: 160, height: 90, ...layer }] }] });
beforeAll(async () => { saved = process.env.OVE_CACHE_DIR; dir = await mkdtemp(join(tmpdir(), 'ove-video-')); process.env.OVE_CACHE_DIR = join(dir, 'cache');
  // 4 s at 30 fps with a moving pattern and a keyframe only every 2 s, so a seek has to decode forward from a keyframe.
  spawnSync(ffmpegPath(), ['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=4','-c:v','libx264','-g','60','-pix_fmt','yuv420p',join(dir, 'clip.mp4')]); });
afterAll(async () => { if (saved === undefined) delete process.env.OVE_CACHE_DIR; else process.env.OVE_CACHE_DIR = saved; if (dir) await rm(dir, { recursive: true, force: true }); });
describe('video decoding', () => {
  it('decodes only the shown range, with the same frames as a full decode', async () => {
    const windowed=(await prepareVideos(comp({ trimStart: 75 }), dir)).get('clip')!, full=(await prepareVideos(comp({ trimStart: 75, loop: true }), dir)).get('clip')!;
    expect(windowed.first).toBe(75); expect(full.first).toBe(0); expect(full.count).toBe(120);
    expect((await readdir(windowed.dir)).filter(f => f.endsWith('.jpg')).length).toBeLessThanOrEqual(32);
    for (const index of [75, 76, 90, 104]) expect(await readFile(videoFrameFile(windowed, index))).toEqual(await readFile(videoFrameFile(full, index)));
  });
  it('covers every layer of a source, at its playback rate', async () => { const two=loadComposition({ version: '1.0', id: 'v', name: 'V', width: 160, height: 90, fps: 30, durationFrames: 20, assets: [{ id: 'clip', type: 'video', src: './clip.mp4' }],
      scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 20, layers: [{ id: 'a', type: 'video', src: 'clip', trimStart: 30 }, { id: 'b', type: 'video', src: 'clip', trimStart: 50, playbackRate: 2, startFrame: 10 }] }] });
    const v=(await prepareVideos(two, dir)).get('clip')!; expect(v.first).toBe(30); expect(v.count).toBeGreaterThanOrEqual(50 + 10*2); });
  it('falls back to the whole source when the trim starts past its end, holding the last frame', async () => { const late=comp({ trimStart: 500 }); const v=(await prepareVideos(late, dir)).get('clip')!;
    expect(v.first).toBe(0); expect(v.count).toBe(120); const r=await createRenderer(late, { baseDir: dir }); try { expect((await r.renderFrame(5)).subarray(1, 4).toString()).toBe('PNG'); } finally { await r.close(); } });
});
