import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// The studio is a local server with write access to a folder, so it must answer only its own page and confine every
// path to the output folder. It also has to run the same compose -> still -> render chain the CLI runs.
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
  for (let attempt = 0; attempt < 900; attempt++) {
    const job = json(await send('GET', `/api/job?id=${started.id}`)).job;
    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error);
    await delay(200);
  }
  throw new Error('The studio job did not finish in time');
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ove-ai-studio-'));
  studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3470 });
  port = Number(new URL(studio.url).port);
});
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('AI studio server', () => {
  it('serves its page and reports the provider and output folder', async () => {
    const page = await send('GET', '/');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.body.toString('utf8')).toContain('MotionRender Studio');

    const status = json(await send('GET', '/api/status'));
    expect(status.outDir.replace(/\\/g, '/')).toBe(root.replace(/\\/g, '/'));
    expect(status.provider).toMatchObject({ id: 'mock', model: 'mock-1', capabilities: { image: true, speech: false } });
  });

  it('refuses changes from another site, without a JSON body, or through another host name', async () => {
    const body = JSON.stringify({ brief: 'test' });
    expect((await send('POST', '/api/compose', { origin: 'https://evil.example', 'content-type': 'application/json' }, body)).status).toBe(403);
    expect((await send('POST', '/api/compose', { origin: base(), 'content-type': 'text/plain' }, body)).status).toBe(403);
    expect((await send('POST', '/api/compose', { 'content-type': 'application/json' }, body)).status).toBe(403);
    expect((await send('GET', '/api/status', { host: `attacker.example:${port}` })).status).toBe(403);
  });

  it('confines file reads and writes to the output folder', async () => {
    // %2F keeps the traversal inside one URL path segment, so it reaches the file handler instead of being normalised away.
    expect((await send('GET', '/files/%2e%2e%2Foutside.txt')).status).toBe(403);
    const escape = await post('/api/compose', { brief: 'test', folder: '../escape' });
    expect(escape.status).toBe(400);
    expect(json(escape).error).toMatch(/inside/);
  });

  it('fills a matching template unless every layer is asked for', async () => {
    const filled = await finished(await post('/api/compose', { brief: 'A launch reel', kind: 'reel', folder: 'from-template' }));
    expect(filled.frames).toBe(600); expect(filled.scenes).toBe(3);
    const written = await finished(await post('/api/compose', { brief: 'A launch reel', kind: 'reel', duration: 0.5, fps: 10, full: true, folder: 'full-layers' }));
    expect(written.frames).toBe(5);
  });

  it('composes a brief into a project other commands can read', async () => {
    const result = await finished(await post('/api/compose', { brief: 'A tiny test video', kind: 'reel', duration: 0.5, fps: 10, full: true }));
    expect(result.relative).toMatch(/composition\.json$/);
    const composition = JSON.parse(await readFile(join(root, result.relative), 'utf8'));
    expect(composition).toMatchObject({ version: '1.0', width: 1080, height: 1920, fps: 10, durationFrames: 5 });
    expect(result.frames).toBe(5);
    expect(result.scenes).toBe(1);
  });

  it('renders a preview still and a video from the composition', async () => {
    const result = await finished(await post('/api/compose', { brief: 'A tiny test video', kind: 'reel', duration: 0.5, fps: 10, full: true }));
    const still = await send('GET', `/api/still?file=${encodeURIComponent(result.relative)}&frame=2`);
    expect(still.status).toBe(200);
    expect(still.headers['content-type']).toBe('image/png');
    expect([...still.body.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const rendered = await finished(await post('/api/render', { file: result.relative, output: 'out.mp4', scale: 0.25, crf: 35 }));
    expect(rendered.relative).toBe(result.relative.replace(/composition\.json$/, 'out.mp4'));
    expect(rendered.frames).toBe(5);
    const video = await send('GET', `/files/${rendered.relative}`);
    expect(video.status).toBe(200);
    expect(video.headers['content-type']).toBe('video/mp4');
    expect(video.body.byteLength).toBeGreaterThan(1000);
  });

  it('refines an existing composition through /api/refine', async () => {
    const composed = await finished(await post('/api/compose', { brief: 'A tiny test video', kind: 'reel', duration: 0.5, fps: 10, full: true }));
    const refined = await finished(await post('/api/refine', { file: composed.relative, instruction: 'Make the title bigger' }));
    expect(refined.relative).toBe(composed.relative);
    const composition = JSON.parse(await readFile(join(root, refined.relative), 'utf8'));
    expect(composition.name).toContain('(refined)');
    const textLayer = composition.scenes[0].layers.find((l: any) => l.type === 'text');
    expect(textLayer?.content).toContain('[refined]');
  });

  it('keeps every compose and refine as a revision and can restore one', async () => {
    const composed = await finished(await post('/api/compose', { brief: 'A tiny test video', kind: 'reel', duration: 0.5, fps: 10, full: true, folder: 'history-demo' }));
    await finished(await post('/api/refine', { file: composed.relative, instruction: 'Make the title bigger' }));
    const list = json(await send('GET', '/api/history?file=' + encodeURIComponent(composed.relative))).revisions;
    expect(list.map((r: any) => r.kind)).toEqual(['compose', 'refine']);
    const restored = json(await post('/api/restore', { file: composed.relative, n: 1 })).revision;
    expect(restored).toMatchObject({ kind: 'restore', restoredFrom: 1, n: 3 });
    const back = JSON.parse(await readFile(join(root, composed.relative), 'utf8'));
    expect(back.name).not.toContain('(refined)');
    expect((await post('/api/restore', { file: composed.relative, n: 99 })).status).toBeGreaterThanOrEqual(400);
  });

  it('makes a thumbnail PNG beside the composition', async () => {
    const composed = await finished(await post('/api/compose', { brief: 'A tiny test video', kind: 'reel', duration: 0.5, fps: 10, full: true, folder: 'thumb-demo' }));
    const made = await finished(await post('/api/thumbnail', { file: composed.relative, title: 'Cover title', frame: 2 }));
    expect(made.relative).toBe('thumb-demo/thumbnail.png'); expect(made.frame).toBe(2);
    const png = await readFile(join(root, made.relative)); expect(png.subarray(1, 4).toString()).toBe('PNG');
  });

  it('generates a system/user prompt for external AI chat through /api/prompt', async () => {
    const reply = await post('/api/prompt', { brief: 'A clean coffee promo', aspect: '9:16', duration: 15 });
    expect(reply.status).toBe(200);
    const body = json(reply);
    expect(body.prompt).toContain('# MotionRender composition format');
    expect(body.prompt).toContain('A clean coffee promo');
    expect(body.prompt).toContain('WIDTH=1080 HEIGHT=1920');
  });

  it('imports external AI markdown/JSON through /api/import without an API key', async () => {
    const simulatedChatGptResponse = `
Here is the MotionRender composition JSON for your coffee promo:

\`\`\`json
{
  "version": "1.0",
  "id": "imported-coffee",
  "name": "Imported Coffee Promo",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationFrames": 60,
  "background": "#1e1b4b",
  "scenes": [
    {
      "id": "intro",
      "name": "Intro Scene",
      "startFrame": 0,
      "durationFrames": 60,
      "layers": [
        {
          "id": "heading",
          "type": "text",
          "content": "Fresh Roast Coffee",
          "fontSize": 72,
          "color": "#ffffff",
          "startFrame": 0,
          "endFrame": 60
        }
      ]
    }
  ]
}
\`\`\`

Enjoy your video!
`;
    const result = await finished(await post('/api/import', { json: simulatedChatGptResponse, folder: 'coffee-imported' }));
    expect(result.relative).toBe('coffee-imported/composition.json');
    expect(result.frames).toBe(60);
    expect(result.scenes).toBe(1);

    const saved = JSON.parse(await readFile(join(root, result.relative), 'utf8'));
    expect(saved.name).toBe('Imported Coffee Promo');
    expect(saved.scenes[0].layers[0].content).toBe('Fresh Roast Coffee');

    // And verify still preview works on the imported composition
    const still = await send('GET', `/api/still?file=${encodeURIComponent(result.relative)}&frame=10`);
    expect(still.status).toBe(200);
    expect(still.headers['content-type']).toBe('image/png');
  });
});
