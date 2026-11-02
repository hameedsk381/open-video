import { describe, it, expect, beforeAll, afterAll } from 'vitest'; import { request } from 'node:http'; import { mkdtemp, readFile, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { initProject } from '../../packages/cli/src/init'; import { startDevServer, type DevServer } from '../../packages/cli/src/dev';
// The dev server must only answer its own page: a web page elsewhere in the browser can send it requests (simple POSTs need no CORS
// preflight) or reach it through a domain resolving to 127.0.0.1 (DNS rebinding).
let root: string, file: string, dev: DevServer, port: number;
const send = (method: string, path: string, headers: Record<string, string>, body?: string) => new Promise<number>((ok, fail) => { const req = request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, res => { res.resume(); res.on('end', () => ok(res.statusCode!)); }); req.on('error', fail); req.end(body); });
const edit = JSON.stringify({ id: 'tagline', set: { y: 999 } }), own = () => `http://127.0.0.1:${port}`, saved = async () => (await readFile(file, 'utf8')).includes('"y": 999');
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-dev-')); await initProject(join(root, 'p'), { skill: false }); file = join(root, 'p', 'composition.json'); dev = await startDevServer(file, { port: 3480, concurrency: 1 }); port = Number(new URL(dev.url).port); });
afterAll(async () => { await dev?.close(); if (root) await rm(root, { recursive: true, force: true }); });
describe('dev server requests', () => {
  it('refuses changes from other sites, whatever they send', async () => {
    expect(await send('POST', '/api/layer', { origin: 'https://evil.example', 'content-type': 'text/plain' }, edit)).toBe(403);
    expect(await send('POST', '/api/layer', { origin: 'https://evil.example', 'content-type': 'application/json' }, edit)).toBe(403);
    expect(await send('POST', '/api/layer', { 'content-type': 'application/json' }, edit)).toBe(403);
    expect(await send('POST', '/api/undo', { origin: 'https://evil.example', 'content-type': 'application/json' }, '{}')).toBe(403);
    expect(await saved()).toBe(false); });
  it('refuses changes that are not JSON, even from its own page', async () => { expect(await send('POST', '/api/layer', { origin: own(), 'content-type': 'text/plain' }, edit)).toBe(403); expect(await saved()).toBe(false); });
  it('refuses any request naming another host (DNS rebinding)', async () => { for (const path of ['/', '/api/state', '/api/source', '/media/assets/logo.svg', '/player.js']) expect(await send('GET', path, { host: `attacker.example:${port}` })).toBe(403);
    expect(await send('GET', '/api/state', { host: `127.0.0.1:${port+1}` })).toBe(403); });
  it('serves its own page and accepts its edits and undo', async () => { expect(await send('GET', '/api/state', {})).toBe(200); expect(await send('GET', '/api/state', { host: `localhost:${port}` })).toBe(200);
    expect(await send('POST', '/api/layer', { origin: own(), 'content-type': 'application/json' }, edit)).toBe(200); expect(await saved()).toBe(true);
    expect(await send('POST', '/api/undo', { origin: own(), 'content-type': 'application/json; charset=utf-8' }, '{}')).toBe(200); expect(await saved()).toBe(false); });
  it('answers extra host names given with allowHosts (a proxy in front)', async () => { const proxied = await startDevServer(file, { port: 3490, concurrency: 1, allowHosts: ['Preview.Test'] }); const main = port; port = Number(new URL(proxied.url).port);
    try { expect(await send('GET', '/api/state', { host: `preview.test:${port}` })).toBe(200); expect(await send('POST', '/api/undo', { host: `preview.test:${port}`, origin: `http://preview.test:${port}`, 'content-type': 'application/json' }, '{}')).not.toBe(403);
      expect(await send('GET', '/api/state', { host: `other.test:${port}` })).toBe(403); } finally { port = main; await proxied.close(); } });
});
