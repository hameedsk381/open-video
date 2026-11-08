import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { detailSchema, errorSchema, historySchema, jobEnvelopeSchema, jobSchema, librarySchema, projectListSchema, resultFileSchema, revisionRawSchema, statusSchema } from '@ove/contracts';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// What the studio server sends is what @ove/contracts says it sends, which is also what the web app's types are.
let root: string, studio: AiStudioServer, port: number;
type Reply = { status: number; body: Buffer };
const base = () => `http://127.0.0.1:${port}`;
function send(method: string, path: string, body?: string): Promise<Reply> {
  return new Promise((ok, fail) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
    if (method === 'POST') { headers.origin = base(); headers['content-type'] = 'application/json'; }
    const req = request({ host: '127.0.0.1', port, method, path, headers }, res => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => ok({ status: res.statusCode!, body: Buffer.concat(chunks) })); });
    req.on('error', fail); req.end(body);
  });
}
const get = async (path: string) => JSON.parse((await send('GET', path)).body.toString('utf8'));
const post = async (path: string, body: unknown) => { const reply = await send('POST', path, JSON.stringify(body)); return { status: reply.status, json: JSON.parse(reply.body.toString('utf8')) }; };

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-contracts-')); studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3487 }); port = Number(new URL(studio.url).port); });
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('studio API follows @ove/contracts', () => {
  it('sends the shapes the schemas describe', async () => {
    const blank = await post('/api/project/blank', { name: 'Contract check', aspect: '1:1' });
    expect(blank.status).toBe(200); const id = blank.json.id as string;
    const library = librarySchema.parse(await get('/api/library'));
    const scene = library.blocks.find(block => block.kind === 'scene')!;
    expect((await post('/api/add-block', { id, block: scene.id })).status).toBe(200);
    expect(projectListSchema.parse(await get('/api/projects')).projects).toHaveLength(1);
    expect(detailSchema.parse(await get(`/api/project?id=${id}`))).toMatchObject({ id, mode: 'template' });
    expect(historySchema.parse(await get(`/api/history?file=${id}/composition.json`)).revisions.length).toBeGreaterThan(0);
    const first = revisionRawSchema.parse(await get(`/api/revision?file=${id}/composition.json&n=1`));
    expect(first.revision.n).toBe(1);
    expect(first.raw).toMatchObject({ scenes: expect.any(Array) });
    expect((await send('GET', `/api/revision?file=${id}/composition.json&n=999`)).status).toBe(404);
    expect((await send('GET', `/api/revision?file=${id}/composition.json&n=0`)).status).toBe(400);
    expect((await send('GET', `/api/revision?file=${id}/../secret.json&n=1`)).status).toBeGreaterThanOrEqual(400);
    expect(statusSchema.parse(await get('/api/status')).provider?.id).toBe('mock');
  });

  it('sends jobs and finished-file results in the job schema', async () => {
    const id = (await get('/api/projects')).projects[0].id as string;
    const started = jobEnvelopeSchema.parse((await post('/api/thumbnail', { file: `${id}/composition.json` })).json).job;
    for (let attempt = 0; attempt < 150; attempt++) {
      const job = jobSchema.parse((await get(`/api/job?id=${started.id}`)).job);
      if (job.status === 'done') { resultFileSchema.parse(job.result); return; }
      if (job.status === 'error') throw new Error(job.error);
      await delay(200);
    }
    throw new Error('The thumbnail job did not finish');
  }, 60_000);

  it('answers a request that breaks its schema with a 400 and the first problem, in the error shape', async () => {
    const id = (await get('/api/projects')).projects[0].id as string;
    for (const [path, body, message] of [
      ['/api/project/rename', { id, name: '   ' }, /name is required/], ['/api/variables', { id }, /expected record|values|Invalid input/i], ['/api/theme', { id }, /theme is required/],
      ['/api/text', { id, path: 'scenes[0].layers[0]', content: '' }, /text is required/], ['/api/add-block', { id }, /block is required/], ['/api/restore', { file: `${id}/composition.json`, n: 0 }, /too small|>=1|Invalid/i],
      ['/api/project/new', {}, /name is required|Invalid input/i],
    ] as const) {
      const reply = await post(path, body);
      expect(reply.status, path).toBe(400); expect(errorSchema.parse(reply.json).error, path).toMatch(message);
    }
  });
});
