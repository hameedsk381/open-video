import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProvider } from '@ove/ai';
import { InProcessQueue, canvasFor, createFsPaths, createHandlers, folderName, localInputFile, type JobEnv } from '@ove/jobs';
import { FsProjectStore, LOCAL_PRINCIPAL } from '@ove/storage';

// The studio's jobs run with no HTTP: a folder store, the mock provider and a queue are enough.
let root = '', store: FsProjectStore, env: JobEnv;
const wait = async (queue: InProcessQueue, id: string) => { for (let i = 0; i < 400; i++) { const job = queue.get(id)!; if (job.status === 'done' || job.status === 'error') return job; await new Promise(r => setTimeout(r, 25)); } throw new Error('the job did not finish'); };
const composition = { version: '1.0', id: 'j', name: 'J', width: 100, height: 100, fps: 30, durationFrames: 30, background: '#000000', scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'sq', type: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' }] }] };

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ove-jobs-')); store = new FsProjectStore(root);
  const provider = createProvider({ provider: 'mock' });
  env = {
    who: LOCAL_PRINCIPAL, paths: createFsPaths(store, LOCAL_PRINCIPAL), provider: () => provider, providerInfo: () => ({ provider: provider.id, model: provider.model }), assets: id => store.assets(LOCAL_PRINCIPAL, id),
    capabilities: {
      composeSmart: async () => { throw new Error('not used here'); }, narrateSmart: async () => { throw new Error('not used here'); },
      makeThumbnail: async () => ({ png: Buffer.from('png-bytes'), frame: 3, width: 100, height: 100 }),
    },
  };
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('queue', () => {
  it('runs jobs one at a time in order, reports progress, and keeps a failed job\'s message', async () => {
    const queue = new InProcessQueue(), seen: string[] = [], order: string[] = [];
    queue.subscribe(job => seen.push(`${job.id}:${job.status}`));
    const a = queue.enqueue({ kind: 'render', run: async progress => { progress('half'); await new Promise(r => setTimeout(r, 40)); order.push('a'); return { ok: 1 }; } });
    const b = queue.enqueue({ kind: 'review', run: async () => { order.push('b'); throw new Error('boom'); } });
    expect(a.status).toBe('running'); expect(b.status).toBe('queued');   // the first starts at once, the second waits for it
    const [doneA, doneB] = [await wait(queue, a.id), await wait(queue, b.id)];
    expect(order).toEqual(['a', 'b']); expect(doneA).toMatchObject({ status: 'done', result: { ok: 1 }, messages: ['half'] }); expect(doneB).toMatchObject({ status: 'error', error: 'boom' });
    expect(seen.indexOf('1:running')).toBeLessThan(seen.indexOf('2:running')); expect(queue.recent().map(job => job.id)).toEqual(['1', '2']);
  });
  it('stops telling a listener that unsubscribed or throws', async () => {
    const queue = new InProcessQueue(); let calls = 0;
    const off = queue.subscribe(() => { calls++; }); queue.subscribe(() => { throw new Error('bad listener'); });
    const job = queue.enqueue({ kind: 'import', run: async () => 1 }); await wait(queue, job.id); const before = calls; off();
    await wait(queue, queue.enqueue({ kind: 'import', run: async () => 2 }).id); expect(calls).toBe(before);
  });
});

describe('request checks', () => {
  it('turns kind, aspect and length into a canvas, and refuses what it cannot', () => {
    expect(canvasFor({ kind: 'reel' })).toMatchObject({ width: 1080, height: 1920, durationSeconds: 20, fps: 30 });
    expect(canvasFor({ kind: 'promo', aspect: '640x360', duration: '5' })).toMatchObject({ width: 640, height: 360, durationSeconds: 5 });
    expect(() => canvasFor({ kind: 'nope' })).toThrow(/kind must be one of/); expect(() => canvasFor({ aspect: '7:3' })).toThrow(/aspect must be/); expect(() => canvasFor({ duration: 0 })).toThrow(/duration/);
    expect(folderName('A big, Big Idea!')).toBe('a-big-big-idea');
  });
  it('refuses a bad request before anything is queued', () => {
    const handlers = createHandlers(env);
    expect(() => handlers.compose({})).toThrow(/brief is required/); expect(() => handlers.refine({ file: 'p/composition.json' })).toThrow(/instruction is required/);
    expect(() => handlers.render({ file: '../escape/composition.json' })).toThrow(/must be inside/); expect(() => handlers.render({ file: 'p/composition.json', preset: 'warp' })).toThrow(/preset must be one of/);
    expect(() => handlers.import({})).toThrow(/JSON content is required/); expect(() => handlers.image({})).toThrow(/prompt is required/);
    expect(() => handlers.narrate({ file: 'p/composition.json' })).toThrow(/script or a brief/);
  });
  it('keeps jobs that read arbitrary files for the local studio only', () => {
    const handlers = createHandlers(env);                                       // env has no `local`
    expect(() => handlers.transcribe({ audio: 'C:/Users/me/voice.wav' })).toThrow(/only available when the studio runs on your own machine/);
    expect(() => handlers.batch({ rows: 'rows.json', brief: 'x' })).toThrow(/only available when the studio runs on your own machine/);
    expect(() => localInputFile('voice.exe', 'audio', ['.wav'])).toThrow(/must be a .wav file/);
  });
});

describe('handlers', () => {
  it('imports pasted JSON into a new project, refusing files outside it and never replacing a project', async () => {
    const queue = new InProcessQueue(), handlers = createHandlers(env);
    const first = await wait(queue, queue.enqueue(handlers.import({ json: JSON.stringify(composition), folder: 'pasted' })).id);
    expect(first).toMatchObject({ status: 'done', result: { id: 'pasted', frames: 30, scenes: 1 } });
    expect(await store.exists(LOCAL_PRINCIPAL, 'pasted')).toBe(true);
    const again = await wait(queue, queue.enqueue(handlers.import({ json: JSON.stringify(composition), folder: 'pasted' })).id);
    expect(again.status).toBe('error'); expect(again.error).toMatch(/already has a composition/);
    const unnamed = await wait(queue, queue.enqueue(handlers.import({ json: JSON.stringify(composition) })).id);
    expect(unnamed.result).toMatchObject({ id: 'j' });
    const outside = { ...composition, assets: [{ id: 'x', type: 'image', src: '../../etc/passwd.png' }] };
    const refused = await wait(queue, queue.enqueue(handlers.import({ json: JSON.stringify(outside) })).id);
    expect(refused.status).toBe('error'); expect(refused.error).toMatch(/outside its project/);
  });

  it('draws a thumbnail into its project and describes the file with a url', async () => {
    const queue = new InProcessQueue(), handlers = createHandlers(env);
    const job = await wait(queue, queue.enqueue(handlers.thumbnail({ file: 'pasted/composition.json' })).id);
    expect(job).toMatchObject({ status: 'done', result: { relative: 'pasted/thumbnail.png', url: '/files/pasted/thumbnail.png', frame: 3 } });
    expect((await readFile(join(root, 'pasted', 'thumbnail.png'))).toString()).toBe('png-bytes');
  });

  it('refines with the mock provider and keeps the change as a revision', async () => {
    const queue = new InProcessQueue(), handlers = createHandlers(env);
    const job = await wait(queue, queue.enqueue(handlers.refine({ file: 'pasted/composition.json', instruction: 'make it bolder' })).id);
    expect(job.status).toBe('done'); expect(job.result).toMatchObject({ relative: 'pasted/composition.json', instruction: 'make it bolder' });
    expect((await store.revisions(LOCAL_PRINCIPAL, 'pasted')).some(revision => revision.kind === 'refine')).toBe(true);
  }, 60_000);

  it('keeps every file name inside the requester\'s space', async () => {
    await writeFile(join(root, 'stray.json'), '{}');
    const handlers = createHandlers(env);
    expect(() => handlers.thumbnail({ file: 'pasted/composition.json', output: '../../stray.png' })).toThrow(/must be inside/);
    expect(() => handlers.render({ file: join(root, '..', 'elsewhere', 'composition.json') })).toThrow(/must be inside/);
  });
});
