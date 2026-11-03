import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisQueue, redisConnection, type JobRequest } from '@ove/jobs';
import { runWorker } from '@ove/worker';
import type { Principal } from '@ove/storage';

// The durable queue and the worker that drains it, against a real Redis (OVE_TEST_REDIS_URL=redis://127.0.0.1:6379). Skipped without one.
const url = process.env.OVE_TEST_REDIS_URL;
const alice: Principal = { userId: 'alice', tenantId: 'acme' }, mallory: Principal = { userId: 'mallory', tenantId: 'evil' };
const ask = (kind: JobRequest['kind'], input: Record<string, unknown>, who: Principal = alice): JobRequest => ({ kind, input, who });
const settle = async (queue: RedisQueue, id: string, who: Principal = alice) => { for (let i = 0; i < 200; i++) { const job = await queue.get(id, who); if (job && (job.status === 'done' || job.status === 'error')) return job; await new Promise(r => setTimeout(r, 50)); } throw new Error('the job did not finish'); };

describe.skipIf(!url)('durable queue and worker', () => {
  let queue: RedisQueue, render: ReturnType<typeof runWorker>, ai: ReturnType<typeof runWorker>; const timeouts: string[] = [], logs: string[] = [];
  const prefix = `/srv/data`;
  beforeAll(async () => {
    const connection = redisConnection(url!); queue = new RedisQueue(connection, message => message.split(prefix).join('<storage>'));
    const runner = async (request: JobRequest, progress: (message: string) => void) => {
      progress(`starting ${request.kind}`);
      if (request.input.hang) await new Promise(() => {});
      if (request.input.fail) throw new Error(`could not open ${prefix}/acme/p/composition.json`);
      return { file: `${prefix}/acme/p/out.mp4`, relative: 'p/out.mp4', url: '/files/p/out.mp4', lane: request.kind };
    };
    const common = { connection, runner, redact: (text: string) => text.split(prefix).join('<storage>'), log: (line: string) => { logs.push(line); } };
    render = runWorker({ ...common, lane: 'render', timeoutSeconds: 1, onTimeout: () => { timeouts.push('render'); } });
    ai = runWorker({ ...common, lane: 'ai', timeoutSeconds: 30 });
  });
  afterAll(async () => { await render?.close(true); await ai?.close(true); await queue?.close(); });

  it('runs a job in the right lane, with its progress and a result free of server paths', async () => {
    const queued = await queue.enqueue(ask('render', {}));
    expect(queued.id).toMatch(/^r-/); expect(['queued', 'running']).toContain(queued.status);
    const done = await settle(queue, queued.id);
    expect(done).toMatchObject({ status: 'done', kind: 'render', messages: ['starting render'] });
    expect(done.result).toEqual({ file: '<storage>/acme/p/out.mp4', relative: 'p/out.mp4', url: '/files/p/out.mp4', lane: 'render' });
    const ai = await settle(queue, (await queue.enqueue(ask('refine', {}))).id); expect(ai.id).toMatch(/^a-/); expect(ai.result).toMatchObject({ lane: 'refine' });
  });
  it('reports a failure without server paths', async () => {
    const job = await settle(queue, (await queue.enqueue(ask('import', { fail: true }))).id);
    expect(job.status).toBe('error'); expect(job.error).toBe('could not open <storage>/acme/p/composition.json');
  });
  it('shows a job only to its owner, in lists, lookups and live events', async () => {
    const heard: { who: string; status: string }[] = [];
    const offA = queue.subscribe(alice, job => heard.push({ who: 'alice', status: job.status })), offM = queue.subscribe(mallory, job => heard.push({ who: 'mallory', status: job.status }));
    await new Promise(r => setTimeout(r, 300));                                   // the event streams connect
    const mine = await queue.enqueue(ask('refine', {})); await settle(queue, mine.id); await new Promise(r => setTimeout(r, 400));
    expect(await queue.get(mine.id, mallory)).toBeUndefined(); expect((await queue.recent(mallory)).some(job => job.id === mine.id)).toBe(false); expect((await queue.recent(alice)).some(job => job.id === mine.id)).toBe(true);
    expect(heard.filter(h => h.who === 'mallory')).toEqual([]); expect(heard.some(h => h.who === 'alice' && h.status === 'done')).toBe(true);
    offA(); offM(); expect(await queue.get('x-nothing', alice)).toBeUndefined();
  });
  it('stops waiting on a job that outlives its time limit (the process would exit and the queue would call it stalled)', async () => {
    const hung = await queue.enqueue(ask('thumbnail', { hang: true }));
    for (let i = 0; i < 60 && !timeouts.length; i++) await new Promise(r => setTimeout(r, 100));
    expect(timeouts).toEqual(['render']); expect(logs.some(line => line.includes(`job ${hung.id}`) && line.includes('ran past 1s'))).toBe(true);
  }, 20_000);
});
