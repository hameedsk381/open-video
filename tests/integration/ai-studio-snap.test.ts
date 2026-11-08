import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// "Snap to safe" and "Auto-fix all" move layers out of the platform's buttons and captions. They must edit the file as the person wrote it:
// a template keeps its variables, an animated position moves with the layer, and one click is one saved change.
let root: string, studio: AiStudioServer, port: number;
const base = () => `http://127.0.0.1:${port}`;
function send(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
  return new Promise((ok, fail) => {
    const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
    if (method === 'POST') { headers.origin = base(); headers['content-type'] = 'application/json'; }
    const req = request({ host: '127.0.0.1', port, method, path, headers }, res => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); ok({ status: res.statusCode!, json: text ? JSON.parse(text) : {} }); }); });
    req.on('error', fail); req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const text = (id: string, extra: Record<string, unknown>) => ({ id, type: 'text', content: '{{headline}}', x: 100, y: 100, fontSize: 48, ...extra });
const composition = {
  version: '1.0', id: 'snap', name: 'Snap', width: 1080, height: 1920, fps: 30, durationFrames: 60,
  variables: { headline: { type: 'string', default: 'Big news' } },
  scenes: [{ id: 's1', name: 'One', startFrame: 0, durationFrames: 60, layers: [
    text('plain', { y: 1800 }),
    text('moving', { x: 5, animations: [{ property: 'x', keyframes: [{ frame: 0, value: 5 }, { frame: 30, value: 100 }] }] }),
    text('expr', { x: '{{ canvas.width / 2 }}' }),
  ] }],
};
const file = () => join(root, 'snap', 'composition.json');
const read = async () => JSON.parse(await readFile(file(), 'utf8'));

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ove-snap-')); studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3489 }); port = Number(new URL(studio.url).port);
  const made = await send('POST', '/api/project/blank', { name: 'Snap', aspect: '9:16' }); expect(made.json.id).toBe('snap');
  await writeFile(file(), JSON.stringify(composition, null, 2));
});
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('POST /api/layer/snap', () => {
  it('moves several layers in one saved change and leaves the template as written', async () => {
    const reply = await send('POST', '/api/layer/snap', { id: 'snap', moves: [{ path: 'scenes[0].layers[0]', dx: 0, dy: -300 }, { path: 'scenes[0].layers[1]', dx: 40, dy: 0 }] });
    expect(reply).toMatchObject({ status: 200, json: { moved: 2 } });
    const after = await read(); const [plain, moving] = after.scenes[0].layers;
    expect(plain.y).toBe(1500); expect(plain.content).toBe('{{headline}}');
    expect(after.variables.headline.default).toBe('Big news');
    expect(moving.x).toBe(45); expect(moving.animations[0].keyframes.map((k: any) => k.value)).toEqual([45, 140]);
    const labels = (await send('GET', '/api/history?file=snap/composition.json')).json.revisions.map((r: any) => r.label);
    expect(labels.filter((label: string) => /safe zone/.test(label))).toEqual(['Moved 2 layers into the safe zone']);
  });

  it('wraps a text layer to a width, and refuses to on anything else', async () => {
    expect((await send('POST', '/api/layer/snap', { id: 'snap', moves: [{ path: 'scenes[0].layers[0]', dx: -10, dy: 0, maxWidth: 900 }] })).status).toBe(200);
    const layer = (await read()).scenes[0].layers[0];
    expect(layer.maxWidth).toBe(900); expect(layer.x).toBe(90);
    expect((await send('POST', '/api/layer/snap', { id: 'snap', moves: [{ path: 'scenes[0]', dx: 0, dy: 0, maxWidth: 900 }] })).status).toBeGreaterThanOrEqual(400);
  });

  it('still takes one path with dx and dy', async () => {
    expect((await send('POST', '/api/layer/snap', { id: 'snap', path: 'scenes[0].layers[0]', dx: 0, dy: 20 })).status).toBe(200);
    expect((await read()).scenes[0].layers[0].y).toBe(1520);
  });

  it('says so, and changes nothing, when a position is an expression or a request is malformed', async () => {
    const bad = await send('POST', '/api/layer/snap', { id: 'snap', moves: [{ path: 'scenes[0].layers[2]', dx: 10, dy: 0 }] });
    expect(bad.status).toBeGreaterThanOrEqual(400); expect(JSON.stringify(bad.json)).toMatch(/expression/);
    expect((await read()).scenes[0].layers[2].x).toBe('{{ canvas.width / 2 }}');
    expect((await send('POST', '/api/layer/snap', { id: 'snap' })).status).toBeGreaterThanOrEqual(400);
    expect((await send('POST', '/api/layer/snap', { id: 'snap', moves: [{ path: 'scenes[9].layers[0]', dx: 1, dy: 1 }] })).status).toBeGreaterThanOrEqual(400);
  });
});

describe('POST /api/text', () => {
  it('changes one literal line and leaves the template (variables, bound text, defaults) as written', async () => {
    const lit = { id: 'lit', type: 'text', content: 'Literal line', x: 100, y: 300, fontSize: 48 };
    await writeFile(file(), JSON.stringify({ ...composition, scenes: [{ ...composition.scenes[0], layers: [lit, text('bound', { y: 500 })] }] }, null, 2));
    expect((await send('POST', '/api/text', { id: 'snap', path: 'scenes[0].layers[0]', content: 'Edited line' })).status).toBe(200);
    const after = await read(); const [first, bound] = after.scenes[0].layers;
    expect(first.content).toBe('Edited line');
    expect(bound.content).toBe('{{headline}}');
    expect(after.variables.headline.default).toBe('Big news');
    expect(first).not.toHaveProperty('color');
    expect(Object.keys(first).sort()).toEqual(['content', 'fontSize', 'id', 'type', 'x', 'y']);
  });

  it('refuses a layer that is not text and a path that is not there, changing nothing', async () => {
    const before = await readFile(file(), 'utf8');
    expect((await send('POST', '/api/text', { id: 'snap', path: 'scenes[0]', content: 'x' })).status).toBeGreaterThanOrEqual(400);
    expect((await send('POST', '/api/text', { id: 'snap', path: 'scenes[7].layers[0]', content: 'x' })).status).toBeGreaterThanOrEqual(400);
    expect(await readFile(file(), 'utf8')).toBe(before);
  });
});

describe('POST /api/texts and scene beats', () => {
  const two = (extra: Record<string, unknown> = {}) => ({ ...composition, scenes: [{ ...composition.scenes[0], ...extra, layers: [
    { id: 'one', type: 'text', content: 'First', x: 100, y: 300, fontSize: 48 },
    { id: 'two', type: 'text', content: 'Second', x: 100, y: 500, fontSize: 48 },
  ] }] });

  it('saves several edits as one revision, and none of them when one is wrong', async () => {
    await writeFile(file(), JSON.stringify(two(), null, 2));
    const labels = async () => (await send('GET', '/api/history?file=snap/composition.json')).json.revisions.map((r: any) => r.label);
    const before = await labels();
    const reply = await send('POST', '/api/texts', { id: 'snap', edits: [{ path: 'scenes[0].layers[0]', content: 'Uno' }, { path: 'scenes[0].layers[1]', content: 'Dos' }] });
    expect(reply).toMatchObject({ status: 200, json: { edited: 2 } });
    const layers = (await read()).scenes[0].layers;
    expect([layers[0].content, layers[1].content]).toEqual(['Uno', 'Dos']);
    const after = await labels();
    expect(after.length - before.length).toBeLessThanOrEqual(2);
    expect(after.filter((label: string) => label === 'Edited 2 lines of text')).toHaveLength(1);

    const saved = await readFile(file(), 'utf8');
    const bad = await send('POST', '/api/texts', { id: 'snap', edits: [{ path: 'scenes[0].layers[0]', content: 'Changed' }, { path: 'scenes[0].layers[9]', content: 'Nope' }] });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(await readFile(file(), 'utf8')).toBe(saved);
    expect((await send('POST', '/api/texts', { id: 'snap', edits: [] })).status).toBeGreaterThanOrEqual(400);
  });

  it('names the beat a scene renders, so the script can find its scene', async () => {
    await writeFile(file(), JSON.stringify(two({ beat: 'intro' }), null, 2));
    const detail = (await send('GET', '/api/project?id=snap')).json;
    expect(detail.scenes[0]).toMatchObject({ id: 's1', beat: 'intro' });
  });
});
