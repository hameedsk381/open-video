import { makeGlb } from './glb';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { request } from 'node:http';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
    expect(library.blocks.length).toBeGreaterThan(10); expect(library.themes.length).toBeGreaterThan(2); expect(library.templates).toBeUndefined();
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

    const [trashed] = (await get('/api/trash')).projects as { key: string; id: string; name: string }[];
    expect(trashed).toMatchObject({ id: copy, name: 'Summer Sale copy' });
    expect((await post('/api/trash/restore', { id: '../x' })).status).toBe(400);
    expect(json(await post('/api/trash/restore', { id: trashed!.key }))).toEqual({ id: copy });
    expect((await get('/api/projects')).projects).toHaveLength(2);
    expect((await get('/api/trash')).projects).toEqual([]);
    await post('/api/project/delete', { id: copy });
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
    // A project from "New" has its folder before any composition: a reference or logo may be uploaded straight away.
    const fresh = (json(await post('/api/project/new', { name: 'Fresh References' })) as { id: string }).id;
    expect(json(await send('POST', `/api/upload?project=${fresh}&name=ref.png`, octet, png)).assets).toHaveLength(1);
    expect((await send('POST', `/api/upload?project=missing-project&name=ref.png`, octet, png)).status).toBe(400);
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

describe('Studio media library', () => {
  const octet = () => ({ origin: base(), 'content-type': 'application/octet-stream' });
  const read = async (id: string) => JSON.parse(await readFile(join(root, id, 'composition.json'), 'utf8'));
  let id = '';

  it('lists uploads with how often the video uses each, then puts one into a scene', async () => {
    id = (json(await post('/api/project/blank', { name: 'Media Room', aspect: '9:16' })) as { id: string }).id;
    const scene = (await get('/api/library')).blocks.find((block: any) => block.kind === 'scene');
    await post('/api/add-block', { id, block: scene.id });
    for (const name of ['photo.png', 'clip.mp4', 'voice.mp3']) expect((await send('POST', `/api/upload?project=${id}&name=${name}`, octet(), png)).status).toBe(200);
    const listed = (await get(`/api/project?id=${id}`)).assets;
    expect(listed.map((asset: any) => [asset.name, asset.kind, asset.uses])).toEqual([['clip.mp4', 'video', 0], ['photo.png', 'image', 0], ['voice.mp3', 'audio', 0]]);

    const block = (await read(id)).scenes[0].layers[0].use;
    const bg = await post('/api/asset/use', { id, name: 'photo.png', as: 'background', scene: 0 });
    expect(bg.status).toBe(200);
    const after = await read(id), first = after.scenes[0].layers[0];
    expect(first).toMatchObject({ type: 'image', src: 'assets/photo.png', x: 0, y: 0, width: 1080, height: 1920, objectFit: 'cover' });
    // The block's own backdrop would cover the picture: this scene's block now uses a copy without it, and the original is untouched.
    expect(after.scenes[0].layers[1].use).toBe(`${block}_over_media`);
    expect(after.components[`${block}_over_media`].layers.some((layer: any) => layer.id === 'bg')).toBe(false);
    expect(after.components[block].layers.some((layer: any) => layer.id === 'bg')).toBe(true);

    expect((await post('/api/asset/use', { id, name: 'clip.mp4', as: 'picture', scene: 0 })).status).toBe(200);
    expect((await post('/api/asset/use', { id, name: 'photo.png', as: 'logo', scene: 0 })).status).toBe(200);
    expect((await post('/api/asset/use', { id, name: 'voice.mp3', as: 'sound', scene: 0 })).status).toBe(200);
    const layers = (await read(id)).scenes[0].layers;
    expect(layers.find((layer: any) => layer.type === 'video')).toMatchObject({ src: 'assets/clip.mp4', muted: true, loop: true, objectFit: 'contain' });
    expect(layers.find((layer: any) => layer.id.startsWith('logo-'))).toMatchObject({ type: 'image', fixed: true, objectFit: 'contain' });
    expect(layers.find((layer: any) => layer.type === 'audio')).toMatchObject({ src: 'assets/voice.mp3', volume: 1 });
    expect(new Set(layers.map((layer: any) => layer.id)).size).toBe(layers.length);

    const listedAfter = (await get(`/api/project?id=${id}`)).assets;
    expect(Object.fromEntries(listedAfter.map((asset: any) => [asset.name, asset.uses]))).toEqual({ 'clip.mp4': 1, 'photo.png': 2, 'voice.mp3': 1 });
  });

  it('refuses the wrong kind of file for a use, and a file that is not there, changing nothing', async () => {
    const before = await readFile(join(root, id, 'composition.json'), 'utf8');
    for (const body of [
      { id, name: 'voice.mp3', as: 'background' }, { id, name: 'photo.png', as: 'sound' }, { id, name: 'clip.mp4', as: 'logo' },
      { id, name: 'ghost.png', as: 'background' }, { id, name: '../x.png', as: 'background' }, { id, name: 'photo.png', as: 'wallpaper' },
    ]) expect((await post('/api/asset/use', body)).status, JSON.stringify(body)).toBeGreaterThanOrEqual(400);
    expect(await readFile(join(root, id, 'composition.json'), 'utf8')).toBe(before);
  });

  it('keeps a scene number that is too big inside the video', async () => {
    expect((await post('/api/asset/use', { id, name: 'photo.png', as: 'picture', scene: 99 })).status).toBe(200);
  });

  it('will not delete a file the video uses unless told to, and then removes only that file', async () => {
    const refused = await post('/api/asset/delete', { id, name: 'photo.png' });
    expect(refused.status).toBe(409); expect(json(refused).error).toMatch(/used \d+ times? in this video/);
    expect((await get(`/api/project?id=${id}`)).assets.map((asset: any) => asset.name)).toContain('photo.png');

    const forced = await post('/api/asset/delete', { id, name: 'photo.png', force: true });
    expect(forced.status).toBe(200); expect(json(forced).assets.map((asset: any) => asset.name)).toEqual(['clip.mp4', 'voice.mp3']);
    expect(existsSync(join(root, id, 'assets', 'photo.png'))).toBe(false);
    expect(existsSync(join(root, id, 'assets', 'clip.mp4'))).toBe(true);

    expect((await post('/api/asset/delete', { id, name: 'ghost.png' })).status).toBe(400);
    expect((await post('/api/asset/delete', { id, name: '../composition.json', force: true })).status).toBe(400);
    expect(existsSync(join(root, id, 'composition.json'))).toBe(true);
  });
});

describe('Studio 3D models', () => {
  it('takes a .glb upload and places it in a scene as a slowly turning model, nowhere else', async () => {
    const id = (json(await post('/api/project/blank', { name: 'Model Room', aspect: '9:16' })) as { id: string }).id;
    const scene = (await get('/api/library')).blocks.find((block: any) => block.kind === 'scene');
    await post('/api/add-block', { id, block: scene.id });
    expect((await send('POST', `/api/upload?project=${id}&name=box.glb`, { origin: base(), 'content-type': 'application/octet-stream' }, makeGlb() as any)).status).toBe(200);
    expect((await get(`/api/project?id=${id}`)).assets.map((asset: any) => [asset.name, asset.kind])).toEqual([['box.glb', 'model']]);
    expect((await post('/api/asset/use', { id, name: 'box.glb', as: 'background', scene: 0 })).status).toBeGreaterThanOrEqual(400);
    expect((await post('/api/asset/use', { id, name: 'box.glb', as: 'logo', scene: 0 })).status).toBeGreaterThanOrEqual(400);
    expect((await post('/api/asset/use', { id, name: 'box.glb', as: 'picture', scene: 0 })).status).toBe(200);
    const layer = JSON.parse(await readFile(join(root, id, 'composition.json'), 'utf8')).scenes[0].layers.find((item: any) => item.type === 'model');
    expect(layer).toMatchObject({ src: 'assets/box.glb', spin: 30 });
    expect(layer.objectFit).toBeUndefined();
    expect(Number(layer.width)).toBeGreaterThan(0);
  });
});
