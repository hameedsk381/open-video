import { describe, it, expect, beforeAll, afterAll } from 'vitest'; import { spawnSync } from 'node:child_process'; import { mkdtemp, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { loadComposition, renderMedia, renderDistributed, httpWorker, ffmpegPath, ffprobePath } from '@ove/core'; import { startWorker, type WorkerServer } from '../../packages/cli/src/worker';
// End to end: a real `ove worker` over HTTP renders the chunks, the coordinator joins them and mixes the sound once. The joined video must
// match a single-machine render in length, frame count and where its sounds fall, with built-in sounds and a soundtrack.
let dir: string, worker: WorkerServer;
const probe = (file: string, entries: string, stream = 'v:0') => spawnSync(ffprobePath(), ['-v','error','-select_streams',stream,'-count_frames','-show_entries',entries,'-of','csv=p=0',file], { encoding: 'utf8' }).stdout.trim();
// When sound first rises above silence after `from` seconds.
const onset = (file: string, from: number) => { const log = spawnSync(ffmpegPath(), ['-hide_banner','-nostats','-ss',String(from),'-i',file,'-vn','-af','silencedetect=n=-40dB:d=0.05','-f','null','-'], { encoding: 'utf8' }).stderr; const end = /silence_end: ([\d.]+)/.exec(log); return end ? from + Number(end[1]) : from; };
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-dist-')); worker = await startWorker({ port: 4470, concurrency: 1 });
  spawnSync(ffmpegPath(), ['-v','error','-y','-f','lavfi','-i','sine=frequency=220:duration=0.3','-af','apad=whole_dur=3',join(dir, 'bed.wav')]); });
afterAll(async () => { await worker?.close(); if (dir) await rm(dir, { recursive: true, force: true }); });
describe('distributed rendering with a real worker', () => {
  it('joins chunks that match a local render, with built-in sounds placed on their frames', async () => {
    const composition = loadComposition({ version: '1.0', id: 'd', name: 'D', width: 160, height: 90, fps: 30, durationFrames: 75, assets: [{ id: 'bed', type: 'audio', src: './bed.wav' }], export: { audio: 'bed' },
      scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 75, layers: [
        { id: 'dot', type: 'circle', y: 45, width: 20, fill: '#22d3ee', animations: [{ property: 'x', keyframes: [{ frame: 0, value: 10 }, { frame: 74, value: 150 }] }] },
        { id: 'hit', type: 'audio', src: 'sfx:thump', startFrame: 45 } ] }] });
    const local = join(dir, 'local.mp4'), joined = join(dir, 'joined.mp4');
    await renderMedia(composition, { baseDir: dir, output: local, concurrency: 1 });
    const result = await renderDistributed(composition, { baseDir: dir, output: joined, workers: [httpWorker(worker.url, worker.token)], chunkSize: 25 });
    expect(result.frames).toBe(75);
    expect(probe(joined, 'stream=nb_read_frames')).toBe('75'); expect(probe(joined, 'stream=codec_name', 'a:0')).toBe('aac');
    expect(Number(probe(joined, 'format=duration', 'v:0'))).toBeCloseTo(Number(probe(local, 'format=duration', 'v:0')), 1);
    // The soundtrack's tone ends at 0.3 s; the thump starts at frame 45 (1.5 s). Both renders must put it there, within a frame.
    const hitLocal = onset(local, 0.8), hitJoined = onset(joined, 0.8); expect(hitLocal).toBeCloseTo(1.5, 1); expect(Math.abs(hitJoined - hitLocal)).toBeLessThan(1/30 + 0.01);
  });
});
