import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProvider } from '@ove/ai';
import { InProcessQueue, canvasFor, createFsPaths, createJobRunner, folderName, jobClass, localInputFile, type JobEnv, type JobRequest } from '@ove/jobs';
import { FsProjectStore, LOCAL_PRINCIPAL, type Principal } from '@ove/storage';

// The studio's jobs run with no HTTP: a folder store, the mock provider and a queue are enough.
let root = '', store: FsProjectStore;
const alice: Principal = { userId: 'alice', tenantId: 'acme' }, mallory: Principal = { userId: 'mallory', tenantId: 'evil' };
const wait = async (queue: InProcessQueue, id: string, who: Principal = LOCAL_PRINCIPAL) => { for (let i = 0; i < 400; i++) { const job = (await queue.get(id, who))!; if (job.status === 'done' || job.status === 'error') return job; await new Promise(r => setTimeout(r, 25)); } throw new Error('the job did not finish'); };
const composition = { version: '1.0', id: 'j', name: 'J', width: 100, height: 100, fps: 30, durationFrames: 30, background: '#000000', scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'sq', type: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#ff0000' }] }] };
const ask = (kind: JobRequest['kind'], input: Record<string, unknown>, who: Principal = LOCAL_PRINCIPAL): JobRequest => ({ kind, input, who });

const makeEnv = (local: boolean) => (who: Principal): JobEnv => {
  const provider = createProvider({ provider: 'mock' });
  return {
    who, paths: createFsPaths(store, who), provider: () => provider, providerInfo: () => ({ provider: provider.id, model: provider.model }), assets: id => store.assets(who, id),
    capabilities: { composeSmart: async () => { throw new Error('not used here'); }, narrateSmart: async () => { throw new Error('not used here'); }, makeThumbnail: async () => ({ png: Buffer.from('png-bytes'), frame: 3, width: 100, height: 100 }) },
    ...(local ? { local: { inputFile: localInputFile } } : {}),
  };
};
let local: ReturnType<typeof createJobRunner>, hosted: ReturnType<typeof createJobRunner>, queue: InProcessQueue;

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-jobs-')); store = new FsProjectStore(root); local = createJobRunner(makeEnv(true)); hosted = createJobRunner(makeEnv(false)); queue = new InProcessQueue(local.run); });
afterAll(() => rm(root, { recursive: true, force: true }));

describe('queue', () => {
  it('runs jobs one at a time in order, reports progress, and keeps a failed job\'s message', async () => {
    const order: string[] = [], seen: string[] = [];
    const q = new InProcessQueue(async (request, progress) => { if (request.kind === 'render') { progress('half'); await new Promise(r => setTimeout(r, 40)); order.push('a'); return { ok: 1 }; } order.push('b'); throw new Error('boom'); });
    q.subscribe(LOCAL_PRINCIPAL, job => seen.push(`${job.id}:${job.status}`));
    const a = await q.enqueue(ask('render', {})), b = await q.enqueue(ask('review', {}));
    expect(a.status).toBe('running'); expect(b.status).toBe('queued');      // the first starts at once, the second waits for it
    const [doneA, doneB] = [await wait(q, a.id), await wait(q, b.id)];
    expect(order).toEqual(['a', 'b']); expect(doneA).toMatchObject({ status: 'done', result: { ok: 1 }, messages: ['half'] }); expect(doneB).toMatchObject({ status: 'error', error: 'boom' });
    expect(seen.indexOf('1:running')).toBeLessThan(seen.indexOf('2:running')); expect((await q.recent(LOCAL_PRINCIPAL)).map(job => job.id)).toEqual(['1', '2']);
  });
  it('stops telling a listener that unsubscribed or throws', async () => {
    const q = new InProcessQueue(async () => 1); let calls = 0;
    const off = q.subscribe(LOCAL_PRINCIPAL, () => { calls++; }); q.subscribe(LOCAL_PRINCIPAL, () => { throw new Error('bad listener'); });
    await wait(q, (await q.enqueue(ask('import', {}))).id); const before = calls; off();
    await wait(q, (await q.enqueue(ask('import', {}))).id); expect(calls).toBe(before);
  });
  it('shows a person only their own jobs, events and results', async () => {
    const q = new InProcessQueue(async request => ({ for: request.who.userId })); const heardByMallory: string[] = [];
    q.subscribe(mallory, job => heardByMallory.push(job.id));
    const mine = await q.enqueue(ask('import', {}, alice)); await wait(q, mine.id, alice);
    expect(await q.get(mine.id, mallory)).toBeUndefined(); expect(await q.recent(mallory)).toEqual([]); expect(heardByMallory).toEqual([]);
    expect((await q.get(mine.id, alice))?.result).toEqual({ for: 'alice' }); expect(await q.recent(alice)).toHaveLength(1);
  });
  it('sends drawing jobs to render workers and the rest to AI workers', () => {
    expect(['render', 'thumbnail', 'review', 'batch'].map(kind => jobClass(kind as any))).toEqual(['render', 'render', 'render', 'render']);
    expect(['compose', 'refine', 'import', 'narrate', 'transcribe', 'image'].map(kind => jobClass(kind as any)).every(c => c === 'ai')).toBe(true);
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
    const refuse = (kind: JobRequest['kind'], input: Record<string, unknown>) => () => hosted.validate(ask(kind, input));
    expect(refuse('compose', {})).toThrow(/brief is required/); expect(refuse('refine', { file: 'p/composition.json' })).toThrow(/instruction is required/);
    expect(refuse('render', { file: '../escape/composition.json' })).toThrow(/must be inside/); expect(refuse('render', { file: 'p/composition.json', preset: 'warp' })).toThrow(/preset must be one of/);
    expect(refuse('import', {})).toThrow(/JSON content is required/); expect(refuse('image', {})).toThrow(/prompt is required/); expect(refuse('narrate', { file: 'p/composition.json' })).toThrow(/script or a brief/);
    expect(() => hosted.validate(ask('nothing' as any, {}))).toThrow(/no job called/);
  });
  it('keeps jobs that read arbitrary files for the local studio only', () => {
    expect(() => hosted.validate(ask('transcribe', { audio: 'C:/Users/me/voice.wav' }))).toThrow(/only available when the studio runs on your own machine/);
    expect(() => hosted.validate(ask('batch', { rows: 'rows.json', brief: 'x' }))).toThrow(/only available when the studio runs on your own machine/);
    expect(() => localInputFile('voice.exe', 'audio', ['.wav'])).toThrow(/must be a .wav file/);
  });
});

describe('handlers', () => {
  it('imports pasted JSON into a new project, refusing files outside it and never replacing a project', async () => {
    const first = await wait(queue, (await queue.enqueue(ask('import', { json: JSON.stringify(composition), folder: 'pasted' }))).id);
    expect(first).toMatchObject({ status: 'done', result: { id: 'pasted', frames: 30, scenes: 1 } });
    expect(await store.exists(LOCAL_PRINCIPAL, 'pasted')).toBe(true);
    const again = await wait(queue, (await queue.enqueue(ask('import', { json: JSON.stringify(composition), folder: 'pasted' }))).id);
    expect(again.status).toBe('error'); expect(again.error).toMatch(/already has a composition/);
    expect((await wait(queue, (await queue.enqueue(ask('import', { json: JSON.stringify(composition) }))).id)).result).toMatchObject({ id: 'j' });
    const outside = { ...composition, assets: [{ id: 'x', type: 'image', src: '../../etc/passwd.png' }] };
    const refused = await wait(queue, (await queue.enqueue(ask('import', { json: JSON.stringify(outside) }))).id);
    expect(refused.status).toBe('error'); expect(refused.error).toMatch(/outside its project/);
  });

  it('draws a thumbnail into its project and describes the file with a url', async () => {
    const job = await wait(queue, (await queue.enqueue(ask('thumbnail', { file: 'pasted/composition.json' }))).id);
    expect(job).toMatchObject({ status: 'done', result: { relative: 'pasted/thumbnail.png', url: '/files/pasted/thumbnail.png', frame: 3 } });
    expect((await readFile(join(root, 'pasted', 'thumbnail.png'))).toString()).toBe('png-bytes');
  });

  it('makes the folder a thumbnail goes into', async () => {
    const job = await wait(queue, (await queue.enqueue(ask('thumbnail', { file: 'pasted/composition.json', output: '.studio/thumb.png' }))).id);
    expect(job.status).toBe('done'); expect((await readFile(join(root, 'pasted', '.studio', 'thumb.png'))).toString()).toBe('png-bytes');
  });

  it('refines with the mock provider and keeps the change as a revision', async () => {
    const job = await wait(queue, (await queue.enqueue(ask('refine', { file: 'pasted/composition.json', instruction: 'make it bolder' }))).id);
    expect(job.status).toBe('done'); expect(job.result).toMatchObject({ relative: 'pasted/composition.json', instruction: 'make it bolder' });
    expect((await store.revisions(LOCAL_PRINCIPAL, 'pasted')).some(revision => revision.kind === 'refine')).toBe(true);
  }, 60_000);

  it('keeps every file name inside the requester\'s space', async () => {
    await writeFile(join(root, 'stray.json'), '{}');
    expect(() => local.validate(ask('thumbnail', { file: 'pasted/composition.json', output: '../../stray.png' }))).toThrow(/must be inside/);
    expect(() => local.validate(ask('render', { file: join(root, '..', 'elsewhere', 'composition.json') }))).toThrow(/must be inside/);
    // another person's space is out of reach even by the name of their project
    expect(() => local.validate(ask('render', { file: join(root, 'pasted', 'composition.json') }, alice))).toThrow(/must be inside/);
  });
});
