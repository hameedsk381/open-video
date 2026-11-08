import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stockSearchSchema, stockStatusSchema } from '@ove/contracts';
import { allowStockUrl } from '@ove/api';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// Stock search: each person's own key, results from both libraries in one shape, and a download that only ever comes from the libraries.
// A stand-in plays Pexels and Pixabay (the real ones need a key), so what is checked is our side: requests made, answers understood.
const PEXELS_KEY = 'pexels-key-1234567890', PIXABAY_KEY = 'pixabay-key-1234567890';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let stand: Server, standPort = 0, root: string, studio: AiStudioServer, port: number;
const hits: string[] = [];
const origin = () => `http://127.0.0.1:${standPort}`;

beforeAll(async () => {
  stand = createServer((req, res) => {
    const url = new URL(req.url!, origin()); hits.push(`${url.pathname}${url.search}`);
    const json = (body: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname.startsWith('/files/')) {
      if (url.pathname === '/files/elsewhere') { res.writeHead(302, { location: 'http://evil.example/steal.jpg' }); return res.end(); }
      res.writeHead(200, { 'content-type': 'application/octet-stream' }); return res.end(png);
    }
    if (url.pathname.startsWith('/v1/')) {
      if (req.headers.authorization !== PEXELS_KEY) return json({ error: 'nope' }, 401);
      if (url.searchParams.get('query') === 'limit') return json({}, 429);
      if (url.pathname === '/v1/search') return json({ page: 1, per_page: 24, total_results: 40, next_page: 'next', photos: [
        { id: 11, width: 4000, height: 3000, url: 'https://www.pexels.com/photo/11/', photographer: 'Ada Lens', photographer_url: 'https://www.pexels.com/@ada', src: { original: `${origin()}/files/o.jpg`, large2x: `${origin()}/files/p11.jpeg?auto=compress`, medium: `${origin()}/files/m11.jpg` } },
        { id: 12, src: {} },
      ] });
      return json({ page: 1, per_page: 24, total_results: 1, videos: [{ id: 21, width: 3840, height: 2160, duration: 12, url: 'https://www.pexels.com/video/21/', image: `${origin()}/files/v21.jpg`, user: { id: 5, name: 'Bo Reel', url: 'https://www.pexels.com/@bo' },
        video_files: [{ id: 1, file_type: 'video/mp4', width: 3840, height: 2160, link: `${origin()}/files/uhd.mp4` }, { id: 2, file_type: 'video/mp4', width: 1920, height: 1080, link: `${origin()}/files/hd.mp4` }, { id: 3, file_type: 'video/mp4', width: 640, height: 360, link: `${origin()}/files/sd.mp4` }, { id: 4, file_type: 'application/x-mpegURL', width: 1920, height: 1080, link: `${origin()}/files/hls.m3u8` }] }] });
    }
    if (url.pathname === '/api/' || url.pathname === '/api/videos/') {
      if (url.searchParams.get('key') !== PIXABAY_KEY) return json('[ERROR 400] Invalid API key', 400);
      if (url.pathname === '/api/') return json({ total: 90, totalHits: 90, hits: [{ id: 31, pageURL: 'https://pixabay.com/photos/x-31/', user: 'cam_er', webformatURL: `${origin()}/files/w31.jpg`, largeImageURL: `${origin()}/files/l31.jpg`, imageWidth: 5000, imageHeight: 3000 }] });
      return json({ total: 3, totalHits: 3, hits: [{ id: 41, pageURL: 'https://pixabay.com/videos/y-41/', user: 'filmer', duration: 9, videos: { large: { url: '', width: 0, height: 0, size: 0, thumbnail: '' }, medium: { url: `${origin()}/files/m41.mp4`, width: 1920, height: 1080, size: 1, thumbnail: `${origin()}/files/t41.jpg` }, small: { url: `${origin()}/files/s41.mp4`, width: 1280, height: 720, size: 1, thumbnail: '' } } }] });
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>(ok => stand.listen(0, '127.0.0.1', ok)); standPort = (stand.address() as AddressInfo).port;
  root = await mkdtemp(join(tmpdir(), 'ove-stock-'));
  studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3491, stock: {
    bases: { pexels: origin(), pixabay: origin() },
    // Like the real rule, but for the stand-in's address: only the "library's" own host is allowed, and nothing else.
    allowDownload: url => { if (!(url.hostname === '127.0.0.1' && url.port === String(standPort)) && !/(^|\.)(pexels|pixabay)\.com$/.test(url.hostname)) throw new Error('Files can only come from Pexels or Pixabay'); },
  } });
  port = Number(new URL(studio.url).port);
});
afterAll(async () => { await studio?.close(); await new Promise(ok => stand?.close(ok)); if (root) await rm(root, { recursive: true, force: true }); });

type Reply = { status: number; json: any };
const base = () => `http://127.0.0.1:${port}`;
const call = (method: string, path: string, body?: unknown): Promise<Reply> => new Promise((ok, fail) => {
  const headers: Record<string, string> = { host: `127.0.0.1:${port}` };
  if (method === 'POST') { headers.origin = base(); headers['content-type'] = 'application/json'; }
  const req = request({ host: '127.0.0.1', port, method, path, headers }, res => { const chunks: Buffer[] = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); ok({ status: res.statusCode!, json: text ? JSON.parse(text) : {} }); }); });
  req.on('error', fail); req.end(body === undefined ? undefined : JSON.stringify(body));
});
const search = (provider: string, q: string, kind = 'photo', page = 1) => call('GET', `/api/stock/search?provider=${provider}&q=${encodeURIComponent(q)}&kind=${kind}&page=${page}`);

describe('which downloads are allowed', () => {
  it('takes files and pages only from the libraries own sites, over https', () => {
    for (const ok of ['https://images.pexels.com/photos/1/p.jpeg', 'https://videos.pexels.com/a.mp4', 'https://cdn.pixabay.com/photo/x.jpg', 'https://pixabay.com/photos/x/', 'https://www.pexels.com/photo/1/']) expect(() => allowStockUrl(new URL(ok)), ok).not.toThrow();
    for (const bad of ['http://images.pexels.com/p.jpg', 'https://pexels.com.evil.example/p.jpg', 'https://evilpexels.com/p.jpg', 'https://images.pexels.com:8443/p.jpg', 'https://user@images.pexels.com/p.jpg', 'https://127.0.0.1/p.jpg', 'https://example.com/p.jpg', 'file:///etc/passwd', 'javascript:alert(1)']) expect(() => allowStockUrl(new URL(bad)), bad).toThrow(/only come from Pexels or Pixabay/);
  });
});

describe('stock keys', () => {
  it('starts with nothing connected, and will not search without a key', async () => {
    const status = stockStatusSchema.parse((await call('GET', '/api/stock/settings')).json);
    expect(status.providers.map(p => [p.id, p.connected])).toEqual([['pexels', false], ['pixabay', false]]);
    const reply = await search('pexels', 'ocean');
    expect(reply.status).toBe(409); expect(reply.json).toMatchObject({ code: 'not_connected', error: expect.stringMatching(/Connect Pexels in Settings/) });
  });

  it('checks a key before keeping it, and never sends it back', async () => {
    const bad = await call('POST', '/api/stock/settings', { provider: 'pexels', apiKey: 'wrong-key-0000000' });
    expect(bad.status).toBe(400); expect(bad.json.error).toMatch(/Pexels did not accept that key/);
    expect((await call('POST', '/api/stock/settings', { provider: 'pixabay', apiKey: 'wrong-key-0000000' })).json.error).toMatch(/Pixabay did not accept that key/);
    expect((await call('POST', '/api/stock/settings', { provider: 'pexels', apiKey: 'short' })).status).toBe(400);
    expect((await call('POST', '/api/stock/settings', { provider: 'flickr', apiKey: PEXELS_KEY })).status).toBe(400);

    const saved = await call('POST', '/api/stock/settings', { provider: 'pexels', apiKey: PEXELS_KEY });
    expect(saved.status).toBe(200);
    expect(saved.json.providers.find((p: any) => p.id === 'pexels')).toMatchObject({ connected: true, keyHint: `••••${PEXELS_KEY.slice(-4)}` });
    expect(JSON.stringify((await call('GET', '/api/stock/settings')).json)).not.toContain(PEXELS_KEY);
    expect((await call('POST', '/api/stock/settings', { provider: 'pixabay', apiKey: PIXABAY_KEY })).status).toBe(200);
  });
});

describe('searching', () => {
  it('turns each library into one shape: Pexels photos and video, Pixabay photos and video', async () => {
    const photos = stockSearchSchema.parse((await search('pexels', 'ocean')).json);
    expect(photos).toMatchObject({ page: 1, hasMore: true, total: 40 });
    expect(photos.results).toHaveLength(1);
    expect(photos.results[0]).toMatchObject({ provider: 'pexels', id: '11', kind: 'photo', author: 'Ada Lens', authorUrl: 'https://www.pexels.com/@ada', pageUrl: 'https://www.pexels.com/photo/11/', ext: '.jpeg', thumb: `${origin()}/files/m11.jpg` });

    const clips = stockSearchSchema.parse((await search('pexels', 'ocean', 'video')).json).results[0]!;
    // The largest mp4 that fits Full HD, and not the 4K one, the small one or the stream.
    expect(clips).toMatchObject({ kind: 'video', id: '21', duration: 12, author: 'Bo Reel', file: `${origin()}/files/hd.mp4`, ext: '.mp4', thumb: `${origin()}/files/v21.jpg` });

    const pixPhoto = stockSearchSchema.parse((await search('pixabay', 'forest')).json);
    expect(pixPhoto.results[0]).toMatchObject({ provider: 'pixabay', id: '31', kind: 'photo', author: 'cam_er', file: `${origin()}/files/l31.jpg`, pageUrl: 'https://pixabay.com/photos/x-31/' });
    expect(pixPhoto).toMatchObject({ total: 90, hasMore: true });

    const pixClip = stockSearchSchema.parse((await search('pixabay', 'forest', 'video')).json).results[0]!;
    expect(pixClip).toMatchObject({ kind: 'video', id: '41', duration: 9, file: `${origin()}/files/m41.mp4`, thumb: `${origin()}/files/t41.jpg` });
  });

  it('asks the library once for the same search, and says so plainly when it refuses', async () => {
    await search('pexels', 'cache me'); const before = hits.length;
    await search('pexels', 'Cache Me'); expect(hits.length).toBe(before);
    expect((await search('pexels', 'cache me', 'photo', 2)).status).toBe(200); expect(hits.length).toBe(before + 1);
    const limited = await search('pexels', 'limit'); expect(limited.status).toBe(400); expect(limited.json.error).toMatch(/search limit was reached/);
    expect((await search('pexels', 'a')).status).toBe(400);
    expect((await search('nope', 'ocean')).status).toBe(400);
  });
});

describe('bringing a result into a project', () => {
  let id = '';
  const pick = async () => (stockSearchSchema.parse((await search('pexels', 'ocean')).json)).results[0]!;
  const body = (result: any, extra: Record<string, unknown> = {}) => ({ id, provider: result.provider, stockId: result.id, kind: result.kind, file: result.file, ext: result.ext, author: result.author, authorUrl: result.authorUrl, pageUrl: result.pageUrl, ...extra });

  it('downloads it into the project with its credit, once', async () => {
    id = (await call('POST', '/api/project/blank', { name: 'Stock Room', aspect: '16:9' })).json.id;
    const scene = (await call('GET', '/api/library')).json.blocks.find((block: any) => block.kind === 'scene');
    expect((await call('POST', '/api/add-block', { id, block: scene.id })).status).toBe(200);
    const result = await pick();
    const added = await call('POST', '/api/stock/import', body(result));
    expect(added.status).toBe(200); expect(added.json).toMatchObject({ added: true, name: 'pexels-11.jpeg' });
    expect(added.json.assets[0]).toMatchObject({ name: 'pexels-11.jpeg', kind: 'image', credit: { provider: 'pexels', author: 'Ada Lens', pageUrl: 'https://www.pexels.com/photo/11/', license: 'Pexels License' } });
    const listed = (await call('GET', `/api/project?id=${id}`)).json.assets;
    expect(listed[0].credit.authorUrl).toBe('https://www.pexels.com/@ada');

    const downloads = hits.filter(h => h.startsWith('/files/p11')).length;
    const again = await call('POST', '/api/stock/import', body(result));
    expect(again.json).toMatchObject({ added: false, name: 'pexels-11.jpeg' });
    expect(hits.filter(h => h.startsWith('/files/p11')).length).toBe(downloads);
  });

  it('refuses addresses off the libraries, odd file types and ids, and a project that is not there', async () => {
    const result = await pick();
    for (const [what, extra] of [
      ['a file on another site', { file: 'https://example.com/p.jpg' }], ['a redirect to another site', { file: `${origin()}/files/elsewhere`, stockId: '98' }],
      ['a credit page on another site', { pageUrl: 'https://example.com/photo' }], ['an author page on another site', { authorUrl: 'https://example.com/me' }],
      ['a script link as the page', { pageUrl: 'javascript:alert(1)' }], ['a program as the file type', { ext: '.exe' }], ['a path as the id', { stockId: '../../x' }],
      ['a video type for a photo', { ext: '.mp4' }], ['no project', { id: 'no-such-project' }], ['another provider name', { provider: 'flickr' }],
    ] as const) expect((await call('POST', '/api/stock/import', body(result, extra))).status, what).toBeGreaterThanOrEqual(400);
    expect((await call('GET', `/api/project?id=${id}`)).json.assets.map((a: any) => a.name)).toEqual(['pexels-11.jpeg']);
  });

  it('brings in a video too, and a disconnected library stops being searchable', async () => {
    const clip = stockSearchSchema.parse((await search('pexels', 'ocean', 'video')).json).results[0]!;
    const added = await call('POST', '/api/stock/import', body(clip));
    expect(added.json.assets.find((a: any) => a.name === 'pexels-21.mp4')).toMatchObject({ kind: 'video', credit: { author: 'Bo Reel' } });

    const cleared = await call('POST', '/api/stock/clear', { provider: 'pexels' });
    expect(cleared.json.providers.find((p: any) => p.id === 'pexels').connected).toBe(false);
    expect((await search('pexels', 'ocean')).status).toBe(409);
    expect((await search('pixabay', 'forest')).status).toBe(200);
  });
});
