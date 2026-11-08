import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp, createAccounts, createQuotas, MemoryUserStore, type App } from '@ove/api';
import { InProcessQueue, createJobRunner } from '@ove/jobs';
import { AiSettingsStore, FsProjectStore } from '@ove/storage';
import { jobEnvFor, studioApp, studioLibrary, studioPlayer } from '../../packages/cli/src/ai-studio';
import { createProvider } from '@ove/ai';
import { makeThumbnail } from '../../packages/cli/src/thumbnail';
import type { Server } from 'node:http';

// The hosted API: nobody gets in without an account, and what one account owns is out of reach of every other account, on every route.
let root = '', port = 0, server: Server, app: App; const mails: { to: string; text: string }[] = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const HOST = 'studio.test', ORIGIN = 'http://studio.test';
type Reply = { status: number; headers: Record<string, string | string[] | undefined>; text: string; json: any };
class Client {
  cookie = '';
  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, raw?: Buffer): Promise<Reply> {
    return new Promise((ok, fail) => {
      const headers: Record<string, string> = { host: HOST };
      if (method === 'POST') { headers.origin = ORIGIN; headers['content-type'] = raw ? 'application/octet-stream' : 'application/json'; }
      Object.assign(headers, extra);
      if (this.cookie) headers.cookie = this.cookie;
      const req = request({ host: '127.0.0.1', port, method, path, headers }, res => {
        const chunks: Buffer[] = []; res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const set = res.headers['set-cookie']?.[0]; if (set) this.cookie = set.startsWith('ove_session=;') ? '' : set.split(';')[0]!;
          const text = Buffer.concat(chunks).toString('utf8'); let json: any; try { json = JSON.parse(text); } catch { /* not json */ }
          ok({ status: res.statusCode!, headers: res.headers, text, json });
        });
      });
      req.on('error', fail); req.end(raw ?? (body === undefined ? undefined : JSON.stringify(body)));
    });
  }
  get = (path: string, extra?: Record<string, string>) => this.call('GET', path, undefined, extra);
  post = (path: string, body: unknown = {}) => this.call('POST', path, body);
}
const password = 'correct horse battery';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ove-hosted-ai-'));
  const store = new FsProjectStore(root), users = new MemoryUserStore(), provider = createProvider({ provider: 'mock' });
  const aiSettings = new AiSettingsStore(store, 'test-settings-secret');
  const runner = createJobRunner(jobEnvFor(store, () => provider, () => ({}), false));
  const queue = new InProcessQueue(runner.run);
  const auth = createAccounts({ users, publicOrigin: ORIGIN, rateLimits: { signups: 500, logins: 500 }, mailer: { send: async (to, _subject, text) => { mails.push({ to, text }); } } });
  app = createApp({ mode: 'hosted', store, queue, validate: runner.validate, auth, library: studioLibrary, player: studioPlayer, app: studioApp, makeThumbnail, providerState: () => ({ provider: null, error: null }), aiSettings, allowHosts: [HOST], publicOrigin: ORIGIN });
  ({ server, port } = await app.listen({ host: '127.0.0.1', port: 3601 }));
});
afterAll(async () => { server?.close(); server?.closeAllConnections(); if (root) await rm(root, { recursive: true, force: true }); });

describe('each person connects their own AI', () => {
  it('has no AI until one is saved, and says so before queueing work', async () => {
    const c = new Client();
    expect((await c.get('/api/ai-settings')).status).toBe(401);                                  // not signed in
    await c.post('/api/auth/signup', { email: 'ann@example.com', password });
    expect((await c.get('/api/ai-settings')).json).toMatchObject({ settings: null });
    expect((await c.get('/api/status')).json.provider).toBeNull();
    const refused = await c.post('/api/compose', { brief: 'A launch video', kind: 'reel' });
    expect(refused.status).toBe(400); expect(refused.json.error).toMatch(/Add your AI model in Settings/);
  });

  it('checks what is saved, never sends the key back, and keeps each account apart', async () => {
    const ann = new Client(), bob = new Client();
    await ann.post('/api/auth/signup', { email: 'ann2@example.com', password });
    await bob.post('/api/auth/signup', { email: 'bob@example.com', password });
    expect((await ann.post('/api/ai-settings', { provider: 'nope', model: 'x', apiKey: 'k' })).json.error).toMatch(/Choose a provider/);
    expect((await ann.post('/api/ai-settings', { provider: 'groq', model: '', apiKey: 'k' })).json.error).toMatch(/model/);
    expect((await ann.post('/api/ai-settings', { provider: 'groq', model: 'm' })).json.error).toMatch(/API key/);
    expect((await ann.post('/api/ai-settings', { provider: 'custom', model: 'm', apiKey: 'k' })).json.error).toMatch(/address/);
    expect((await ann.post('/api/ai-settings', { provider: 'custom', model: 'm', apiKey: 'k', baseUrl: 'http://127.0.0.1:9/v1' })).status).toBe(400);   // an internal address
    const saved = await ann.post('/api/ai-settings', { provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: 'gsk_live_wxyz9876' });
    expect(saved.status).toBe(200); expect(saved.text).not.toContain('gsk_live'); expect(saved.json.settings).toMatchObject({ provider: 'groq', keyHint: '••••9876' });
    expect((await ann.get('/api/status')).json.provider).toMatchObject({ id: 'groq', model: 'openai/gpt-oss-120b' });
    expect((await bob.get('/api/ai-settings')).json.settings).toBeNull();
    // A blank key keeps the saved one while the provider is unchanged.
    expect((await ann.post('/api/ai-settings', { provider: 'groq', model: 'openai/gpt-oss-20b' })).json.settings).toMatchObject({ model: 'openai/gpt-oss-20b', keyHint: '••••9876' });
    // A request cannot pick the AI itself: the person's saved connection decides.
    expect((await ann.post('/api/compose', { brief: 'A launch video', kind: 'reel', provider: 'openai', apiKey: 'x', baseUrl: 'http://10.0.0.1' })).status).toBe(202);
    await ann.post('/api/ai-settings/clear');
    expect((await ann.get('/api/ai-settings')).json.settings).toBeNull();
  });
});
