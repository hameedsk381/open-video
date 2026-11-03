import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// The Studio as a product: projects are folders, and everything the editor does goes through these routes.
let root: string, studio: AiStudioServer, port: number;
type Reply = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer };
const base = () => `http://127.0.0.1:${port}`;
function send(method: string, path: string, headers: Record<string, string> = {}, body?: string | Buffer): Promise<Reply> {
  return new Promise((ok, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => {
      const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => ok({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', fail); req.end(body);
  });
}
const json = (reply: Reply) => JSON.parse(reply.body.toString('utf8'));
const post = (path: string, body: unknown) => send('POST', path, { origin: base(), 'content-type': 'application/json' }, JSON.stringify(body));
const get = async (path: string) => json(await send('GET', path));
// A 1x1 PNG.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-studio-projects-')); studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3485 }); port = Number(new URL(studio.url).port); });
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('Studio projects', () => {
  let id = '';
  it('starts empty, then makes a blank project and fills it from the library', async () => {
    expect((await get('/api/projects')).projects).toEqual([]);
    id = (json(await post('/api/project/blank', { name: 'Spring Sale', aspect: '1:1' })) as { id: string }).id;
    expect(id).toBe('spring-sale');
    const library = await get('/api/library');
    expect(library.blocks.length).toBeGreaterThan(10); expect(library.themes.length).toBeGreaterThan(2); expect(library.templates.length).toBeGreaterThan(5);
    const scene = library.blocks.find((block: any) => block.kind === 'scene');
    const added = json(await post('/api/add-block', { id, block: scene.id }));
    expect(added.where).toMatch(/^scene /);
    const list = (await get('/api/projects')).projects;
    expect(list).toHaveLength(1); expect(list[0]).toMatchObject({ id, name: 'Spring Sale', width: 1080, height: 1080, mode: 'template', scenes: 1 });
  });

  it('describes a project for the editor: variables, theme, scenes and where its files are served', async () => {
    const detail = await get(`/api/project?id=${id}`);
    expect(detail).toMatchObject({ id, mode: 'template', width: 1080 });
    expect(detail.scenes).toHaveLength(1); expect(detail.variables.length).toBeGreaterThan(0); expect(Object.keys(detail.theme)).toContain('accent');
    expect(detail.source.base).toBe(`/files/${id}/`); expect(detail.source.raw.scenes).toHaveLength(1);
  });

  it('saves edited text and a new look as revisions, keeping the template editable', async () => {
    const before = await get(`/api/project?id=${id}`), text = before.variables.find((variable: any) => variable.type === 'string');
    if (text) {
      expect((await post('/api/variables', { id, values: { [text.name]: 'Hello there' } })).status).toBe(200);
      expect((await get(`/api/project?id=${id}`)).variables.find((variable: any) => variable.name === text.name).value).toBe('Hello there');
    }
    const themes = (await get('/api/library')).themes, other = themes.find((theme: any) => theme.id !== 'midnight');
    expect((await post('/api/theme', { id, theme: other.id })).status).toBe(200);
    expect((await get(`/api/project?id=${id}`)).theme.accent).toBe(other.variables.accent);
    expect((await get(`/api/project?id=${id}`)).mode).toBe('template');
    expect((await get(`/api/history?file=${id}/composition.json`)).revisions.length).toBeGreaterThanOrEqual(2);
    const refused = await post('/api/variables', { id, values: { notAThing: 1 } });
    expect(refused.status).toBe(400); expect(json(refused).error).toMatch(/not something/);
  });

  it('makes a thumbnail once and serves it from the cache after', async () => {
    const first = await send('GET', `/api/thumb?id=${id}`);
    expect(first.status).toBe(200); expect(first.headers['content-type']).toBe('image/png'); expect(first.body.subarray(1, 4).toString()).toBe('PNG');
    expect((await readdir(join(root, id, '.studio'))).includes('thumb.png')).toBe(true);
    expect((await send('GET', `/api/thumb?id=${id}`)).body.equals(first.body)).toBe(true);
  });

  it('renames, duplicates (without history) and moves a deleted project to .trash', async () => {
    expect((await post('/api/project/rename', { id, name: 'Summer Sale' })).status).toBe(200);
    const copy = (json(await post('/api/project/duplicate', { id })) as { id: string }).id;
    expect(copy).not.toBe(id); expect((await readdir(join(root, copy))).includes('history')).toBe(false);
    expect((await get('/api/projects')).projects.map((project: any) => project.name).sort()).toEqual(['Summer Sale', 'Summer Sale copy']);
    expect((await post('/api/project/delete', { id: copy })).status).toBe(200);
    expect((await get('/api/projects')).projects).toHaveLength(1);
    expect((await readdir(join(root, '.trash'))).some(name => name.startsWith(copy))).toBe(true);
  });

  it('accepts pictures only as uploads into a project, from the studio page itself', async () => {
    const octet = { origin: base(), 'content-type': 'application/octet-stream' };
    const stored = json(await send('POST', `/api/upload?project=${id}&name=logo.png`, octet, png));
    expect(stored.assets).toEqual([expect.objectContaining({ name: 'logo.png', kind: 'image', path: 'assets/logo.png' })]);
    expect(json(await send('POST', `/api/upload?project=${id}&name=logo.png`, octet, png)).assets.map((asset: any) => asset.name)).toEqual(['logo-2.png', 'logo.png']);
    expect((await send('GET', `/files/${id}/assets/logo.png`)).status).toBe(200);
    expect((await send('POST', `/api/upload?project=${id}&name=run.exe`, octet, png)).status).toBe(400);
    expect((await send('POST', `/api/upload?project=${id}&name=a.png`, { origin: 'https://evil.example', 'content-type': 'application/octet-stream' }, png)).status).toBe(403);
    expect((await send('POST', `/api/upload?project=../..&name=a.png`, octet, png)).status).toBe(400);
    expect((await send('POST', '/api/project/delete', octet, JSON.stringify({ id }))).status).toBe(403);
  });

  it.skipIf(!existsSync(join(process.cwd(), 'packages/cli/studio/index.html')))('serves the built web app, its assets, and keeps the API apart', async () => {
    const page = await send('GET', '/');
    expect(page.status).toBe(200); expect(page.body.toString('utf8')).toContain('<div id="root">');
    const asset = /\/assets\/[^"']+\.js/.exec(page.body.toString('utf8'))![0];
    const script = await send('GET', asset);
    expect(script.status).toBe(200); expect(String(script.headers['content-type'])).toMatch(/javascript/);
    expect((await send('GET', '/assets/../../package.json')).status).not.toBe(200);
    expect((await send('GET', '/api/nothing')).status).toBe(404);
  });

  it('serves what the Player needs next to itself', async () => {
    expect((await send('GET', '/sfx/whoosh.wav')).status).toBeLessThan(500);
    expect((await send('GET', '/sfx/not-a-sound.wav')).status).toBe(404);
    expect((await send('GET', '/fonts/not-a-font.woff2')).status).toBe(404);
  });
});
