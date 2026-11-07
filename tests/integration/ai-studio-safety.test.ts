import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// What the studio must not do on a pasted composition, an input path or a served file, whatever page it is talking to.
let root: string, studio: AiStudioServer, port: number;
type Reply = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
const base = () => `http://127.0.0.1:${port}`;

function send(method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Reply> {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => {
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => ok({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', fail);
    req.end(body);
  });
}
const json = (reply: Reply) => JSON.parse(reply.body.toString('utf8'));
const post = (path: string, body: unknown) => send('POST', path, { origin: base(), 'content-type': 'application/json' }, JSON.stringify(body));

async function finished(reply: Reply) {
  expect(reply.status).toBe(202);
  const started = json(reply).job;
  for (let attempt = 0; attempt < 300; attempt++) {
    const job = json(await send('GET', `/api/job?id=${started.id}`)).job;
    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error);
    await delay(100);
  }
  throw new Error('The studio job did not finish in time');
}

const words = { id: 't', type: 'text', content: 'Hello there', x: 20, y: 20, fontSize: 48 };
const pasted = (id: string, layers: any[] = [words]) => JSON.stringify({ version: '1.0', id, name: id, width: 640, height: 360, fps: 30, durationFrames: 30,
  scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers }] });

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ove-ai-safety-'));
  studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3495 });
  port = Number(new URL(studio.url).port);
});
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('pasted compositions', () => {
  it('go into a new folder each time and never replace a project', async () => {
    const first = await finished(await post('/api/import', { json: pasted('pasted') }));
    expect(first.relative).toBe('pasted/composition.json');
    const before = await readFile(join(root, 'pasted', 'composition.json'), 'utf8');

    const second = await finished(await post('/api/import', { json: pasted('pasted') }));
    expect(second.relative).toBe('pasted-2/composition.json');

    await expect(finished(await post('/api/import', { json: pasted('pasted'), folder: 'pasted' }))).rejects.toThrow(/already has a composition/);
    expect(await readFile(join(root, 'pasted', 'composition.json'), 'utf8')).toBe(before);
  });

  it.each([
    ['an image on another drive or folder', [{ id: 'leak', type: 'image', src: 'C:/Users/x/private.png', width: 100, height: 100 }]],
    ['a web address', [{ id: 'web', type: 'image', src: 'https://x.test/a.png', width: 100, height: 100 }]],
    ['a code layer', [{ id: 'sketch', type: 'code', code: 'function draw(ctx) {}', width: 100, height: 100 }]],
    ['a React layer', [{ id: 'ui', type: 'react', src: 'ui.bundle.js', width: 100, height: 100, durationInFrames: 30 }]],
  ])('refuse %s', async (_name, layers) => {
    await expect(finished(await post('/api/import', { json: pasted('hostile', [...layers, words]) }))).rejects.toThrow(/outside its project/);
  });

  it('may use files inside their own project and built-in sounds', async () => {
    const result = await finished(await post('/api/import', { json: pasted('inside', [{ id: 'pic', type: 'image', src: 'assets/pic.png', width: 100, height: 100 }, { id: 'pop', type: 'audio', src: 'sfx:pop' }, words]) }));
    expect(result.relative).toBe('inside/composition.json');
  });
});

describe('served files', () => {
  it('can never run as a page of the studio', async () => {
    for (const headers of [{}, { range: 'bytes=0-9' }] as Record<string, string>[]) {
      const reply = await send('GET', '/files/pasted/composition.json', headers);
      expect(reply.status).toBe(headers.range ? 206 : 200);
      expect(reply.headers['content-security-policy']).toBe('sandbox');
      expect(reply.headers['x-content-type-options']).toBe('nosniff');
    }
  });
});

describe('input files', () => {
  it('must be audio for captions and .json for batch rows', async () => {
    const audio = await post('/api/transcribe', { audio: 'notes.txt' });
    expect(audio.status).toBeGreaterThanOrEqual(400); expect(audio.body.toString('utf8')).toMatch(/audio must be a/);
    const rows = await post('/api/batch', { rows: 'secrets.csv', brief: 'a test' });
    expect(rows.status).toBeGreaterThanOrEqual(400); expect(rows.body.toString('utf8')).toMatch(/rows must be a \.json file/);
  });
});
