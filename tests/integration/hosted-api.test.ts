import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request, createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp, createAccounts, createQuotas, MemoryUserStore, type App } from '@ove/api';
import { InProcessQueue, createJobRunner } from '@ove/jobs';
import { FsProjectStore } from '@ove/storage';
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
  root = await mkdtemp(join(tmpdir(), 'ove-hosted-'));
  const store = new FsProjectStore(root), users = new MemoryUserStore(), provider = createProvider({ provider: 'mock' });
  const runner = createJobRunner(jobEnvFor(store, () => provider, () => ({ provider: provider.id, model: provider.model }), false));
  const queue = new InProcessQueue(runner.run);
  const auth = createAccounts({ users, publicOrigin: ORIGIN, rateLimits: { signups: 500, logins: 500 }, mailer: { send: async (to, _subject, text) => { mails.push({ to, text }); } } });
  const quotas = createQuotas({ users, storageUsed: who => store.usedBytes(who), limits: { maxProjects: 3, maxUploadBytes: 1000, jobsPerDay: { ai: 2, render: 1 } } });
  app = createApp({ mode: 'hosted', store, queue, validate: runner.validate, auth, quotas, library: studioLibrary, player: studioPlayer, app: studioApp, makeThumbnail, providerState: () => ({ provider: { id: 'mock' }, error: null }), allowHosts: [HOST], publicOrigin: ORIGIN });
  ({ server, port } = await app.listen({ host: '127.0.0.1', port: 3600 }));
});
afterAll(async () => { server?.close(); server?.closeAllConnections(); if (root) await rm(root, { recursive: true, force: true }); });

describe('signing in', () => {
  it('turns away everyone who is not signed in, but serves the front door and the sign-in routes', async () => {
    const nobody = new Client();
    for (const path of ['/api/projects', '/api/project?id=x', '/api/library', '/api/jobs', '/api/job?id=1', '/api/events', '/api/history?file=x/composition.json', '/files/x/composition.json', '/api/thumb?id=x']) expect((await nobody.get(path)).status, path).toBe(401);
    for (const path of ['/api/project/new', '/api/compose', '/api/render', '/api/variables', '/api/upload?project=x&name=a.png']) expect((await nobody.post(path, {})).status, path).toBe(401);
    expect((await nobody.get('/api/auth/me')).json).toMatchObject({ user: null, mode: 'hosted' });
    expect((await nobody.get('/')).status).toBe(200);
  });

  it('signs people up, checks their email and password, and keeps accounts unique', async () => {
    const c = new Client();
    expect((await c.post('/api/auth/signup', { email: 'not-an-email', password })).json.error).toMatch(/valid email/);
    expect((await c.post('/api/auth/signup', { email: 'a@example.com', password: 'short' })).json.error).toMatch(/at least 10/);
    const made = await c.post('/api/auth/signup', { email: ' Alice@Example.com ', password });
    expect(made.status).toBe(201); expect(made.json.user).toMatchObject({ email: 'alice@example.com', verified: false });
    expect(String(made.headers['set-cookie'])).toMatch(/HttpOnly; SameSite=Lax/);
    expect((await c.get('/api/auth/me')).json.user.email).toBe('alice@example.com');
    expect((await new Client().post('/api/auth/signup', { email: 'alice@example.com', password })).status).toBe(409);
    await new Promise(r => setTimeout(r, 50)); expect(mails.some(m => m.to === 'alice@example.com' && /confirm your email/i.test(m.text))).toBe(true);
  });

  it('answers a wrong password and an unknown email alike, locks an account after repeated failures, and signs out', async () => {
    const victim = new Client(); await victim.post('/api/auth/signup', { email: 'victim@example.com', password });
    const guess = new Client();
    const wrong = await guess.post('/api/auth/login', { email: 'victim@example.com', password: 'not the password' }), unknown = await guess.post('/api/auth/login', { email: 'nobody@example.com', password: 'not the password' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]); expect(wrong.json).toEqual(unknown.json);
    for (let i = 0; i < 4; i++) await guess.post('/api/auth/login', { email: 'victim@example.com', password: `wrong ${i} password` });
    const locked = await guess.post('/api/auth/login', { email: 'victim@example.com', password });
    expect(locked.status).toBe(429); expect(locked.json.error).toMatch(/locked/);
    const out = new Client(); await out.post('/api/auth/signup', { email: 'leaver@example.com', password });
    expect((await out.get('/api/projects')).status).toBe(200); await out.post('/api/auth/logout');
    expect((await out.get('/api/projects')).status).toBe(401);
  });

  it('resets a password with a one-time link, ends the old sessions, and keeps the answer the same for unknown addresses', async () => {
    const c = new Client(); await c.post('/api/auth/signup', { email: 'forgetful@example.com', password });
    expect((await new Client().post('/api/auth/forgot', { email: 'nobody-here@example.com' })).json).toEqual({ ok: true });
    expect((await new Client().post('/api/auth/forgot', { email: 'forgetful@example.com' })).json).toEqual({ ok: true });
    await new Promise(r => setTimeout(r, 50));
    const token = /#\/reset\/([A-Za-z0-9_-]+)/.exec(mails.filter(m => m.to === 'forgetful@example.com' && /new password/.test(m.text)).at(-1)!.text)![1]!;
    expect((await new Client().post('/api/auth/reset', { token, password: 'tiny' })).status).toBe(400);
    expect((await new Client().post('/api/auth/reset', { token, password: 'a brand new password' })).status).toBe(200);
    expect((await new Client().post('/api/auth/reset', { token, password: 'another new password' })).status).toBe(400);        // used once
    expect((await c.get('/api/projects')).status).toBe(401);                                                                    // the old session ended
    expect((await new Client().post('/api/auth/login', { email: 'forgetful@example.com', password: 'a brand new password' })).status).toBe(200);
    expect((await new Client().post('/api/auth/login', { email: 'forgetful@example.com', password })).status).toBe(401);
  });

  it('refuses a request meant for another host or from another site', async () => {
    const c = new Client();
    expect((await c.get('/api/auth/me', { host: 'attacker.example' })).status).toBe(403);
    expect((await c.call('POST', '/api/auth/login', { email: 'a@b.co', password }, { origin: 'https://attacker.example' })).status).toBe(403);
    expect((await c.call('POST', '/api/auth/login', { email: 'a@b.co', password }, { 'content-type': 'text/plain' })).status).toBe(403);
  });
});

describe('one account cannot reach another', () => {
  const alice = new Client(), bob = new Client(); let project = '';
  it('keeps projects, files, history, thumbnails and uploads apart', async () => {
    await alice.post('/api/auth/signup', { email: 'alice2@example.com', password }); await bob.post('/api/auth/signup', { email: 'bob2@example.com', password });
    project = (await alice.post('/api/project/blank', { name: 'Private Plan' })).json.id;
    const block = (await alice.get('/api/library')).json.blocks.find((b: any) => b.kind === 'scene');
    expect((await alice.post('/api/add-block', { id: project, block: block.id })).status).toBe(200);
    expect((await alice.call('POST', `/api/upload?project=${project}&name=logo.png`, undefined, {}, png)).json.assets).toHaveLength(1);
    expect((await alice.get(`/files/${project}/assets/logo.png`)).status).toBe(200);

    expect((await bob.get('/api/projects')).json.projects).toEqual([]);
    for (const path of [`/api/project?id=${project}`, `/api/history?file=${project}/composition.json`, `/api/thumb?id=${project}`, `/files/${project}/composition.json`, `/files/${project}/assets/logo.png`]) expect((await bob.get(path)).status, path).toBeGreaterThanOrEqual(400);
    for (const [path, body] of [['/api/project/rename', { id: project, name: 'Mine now' }], ['/api/project/duplicate', { id: project }], ['/api/project/delete', { id: project }], ['/api/variables', { id: project, values: {} }],
      ['/api/theme', { id: project, theme: 'midnight' }], ['/api/add-block', { id: project, block: block.id }], ['/api/restore', { file: `${project}/composition.json`, n: 1 }], ['/api/render', { file: `${project}/composition.json` }], ['/api/refine', { file: `${project}/composition.json`, instruction: 'x' }], ['/api/text', { id: project, path: 'scenes[0].layers[0]', content: 'x' }], ['/api/texts', { id: project, edits: [{ path: 'scenes[0].layers[0]', content: 'x' }] }], ['/api/layer/snap', { id: project, moves: [{ path: 'scenes[0].layers[0]', dx: 1, dy: 1 }] }]] as const) {
      const reply = await bob.post(path, body); expect(reply.status, path).toBe(400); expect(reply.json.error, path).toMatch(/no project|must be inside|not valid/i);
    }
    expect((await bob.call('POST', `/api/upload?project=${project}&name=evil.png`, undefined, {}, png)).status).toBe(400);
    expect((await alice.get(`/api/project?id=${project}`)).json.name).toBe('Private Plan');                // untouched
    expect((await alice.get(`/api/project?id=${project}`)).json.assets).toHaveLength(1);
  });

  it('refuses paths that climb into another account\'s folder', async () => {
    const aliceTenant = (await alice.get('/api/auth/me')).json.user.id as string;
    expect((await bob.get(`/files/../${aliceTenant}/${project}/composition.json`)).status).toBeGreaterThanOrEqual(400);
    expect((await bob.get(`/files/%2e%2e/${aliceTenant}/${project}/composition.json`)).status).toBeGreaterThanOrEqual(400);
    expect((await bob.get(`/files/..%2F..%2F_tenants%2F${aliceTenant}%2F${project}%2Fcomposition.json`)).status).toBeGreaterThanOrEqual(400);
    expect((await bob.post('/api/render', { file: `../_tenants/${aliceTenant}/${project}/composition.json` })).status).toBe(400);
    expect((await bob.get(`/api/project?id=..%2F_tenants%2F${aliceTenant}%2F${project}`)).status).toBe(400);
    expect((await bob.get('/files/_tenants/anything')).status).toBeGreaterThanOrEqual(400);
  });

  it('keeps jobs, results and live events apart', async () => {
    const started = await alice.post('/api/import', { json: JSON.stringify({ version: '1.0', id: 'j', name: 'J', width: 100, height: 100, fps: 30, durationFrames: 30, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [] }] }) });
    expect(started.status).toBe(202); const id = started.json.job.id as string;
    for (let i = 0; i < 100 && (await alice.get(`/api/job?id=${id}`)).json.job.status !== 'done'; i++) await new Promise(r => setTimeout(r, 50));
    expect((await alice.get(`/api/job?id=${id}`)).json.job.status).toBe('done');
    expect((await bob.get(`/api/job?id=${id}`)).status).toBe(404); expect((await bob.get('/api/jobs')).json.jobs).toEqual([]); expect((await alice.get('/api/jobs')).json.jobs.length).toBeGreaterThan(0);
    expect(JSON.stringify((await bob.get('/api/status')).json.jobs)).toBe('[]');
    expect((await bob.get('/api/status')).json.outDir).not.toContain(root);                              // no server paths shown
  });
});

describe('hosted limits and closed doors', () => {
  it('stops work that has to run on this machine, and keeps files that run as pages from running', async () => {
    const c = new Client(); await c.post('/api/auth/signup', { email: 'limits@example.com', password });
    expect((await c.get('/api/still?file=x/composition.json')).status).toBe(404); expect((await c.post('/api/prompt', { brief: 'x' })).status).toBe(404);
    expect((await c.post('/api/transcribe', { audio: 'C:/Windows/x.wav' })).json.error).toMatch(/your own machine/);
    expect((await c.post('/api/batch', { rows: 'x.json', brief: 'b' })).json.error).toMatch(/your own machine/);
  });
  it('keeps a video to the files of its own project, even when a template variable is the one carrying the path', async () => {
    const c = new Client(); await c.post('/api/auth/signup', { email: 'paths@example.com', password });
    const template = { version: '1.0', id: 't', name: 'T', width: 100, height: 100, fps: 30, durationFrames: 30,
      variables: { photo: { type: 'string', default: 'assets/logo.png' } },
      scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'i', type: 'image', src: '{{photo}}', width: 50, height: 50 }] }] };
    // A template project keeps "{{photo}}" in its saved file (an import would flatten it), so the variable is what a person edits later.
    const id = (await c.post('/api/project/blank', { name: 'Paths' })).json.id as string, tenant = (await c.get('/api/auth/me')).json.user.id as string;
    await writeFile(join(root, '_tenants', tenant, id, 'composition.json'), JSON.stringify(template));

    for (const value of ['/etc/hostname', 'C:/Windows/win.ini', '../../_tenants/someone-else/p/assets/logo.png', '..\\..\\x.png', 'https://example.com/a.png', '\\\\server\\share\\a.png']) {
      const refused = await c.post('/api/variables', { id, values: { photo: value } });
      expect(refused.status, value).toBe(400); expect(refused.json.error, value).toMatch(/outside its own project/);
    }
    expect((await c.post('/api/variables', { id, values: { photo: 'assets/other.png' } })).status).toBe(200);
    expect((await c.get(`/api/project?id=${id}`)).json.source.raw.variables.photo.default).toBe('assets/other.png');
  });

  it("brings a block's React bundle into the project, renders it, and lets nothing else put a script there", async () => {
    const c = new Client(); await c.post('/api/auth/signup', { email: 'effects@example.com', password });
    const id = (await c.post('/api/project/blank', { name: 'Effects' })).json.id as string;
    const scene = (await c.get('/api/library')).json.blocks.find((b: any) => b.kind === 'scene');
    expect((await c.post('/api/add-block', { id, block: scene.id })).status).toBe(200);
    expect((await c.post('/api/add-block', { id, block: 'fx-counter-hero', set: { value: 12 } })).status).toBe(200);

    const bundle = await c.get(`/files/${id}/fx.bundle.js`);
    expect(bundle.status).toBe(200); expect(bundle.text).toContain('__oveReactMount');
    expect(JSON.stringify((await c.get(`/api/project?id=${id}`)).json.source.raw)).toContain('"type":"react"');

    // An upload is media only: a script cannot arrive that way, under any name.
    for (const name of ['evil.js', 'fx.bundle.js', 'evil.html', 'evil.svg']) expect((await c.call('POST', `/api/upload?project=${id}&name=${name}`, undefined, {}, Buffer.from('alert(1)'))).status, name).toBe(400);
    // Nobody else can read it.
    const other = new Client(); await other.post('/api/auth/signup', { email: 'effects-other@example.com', password });
    expect((await other.get(`/files/${id}/fx.bundle.js`)).status).toBeGreaterThanOrEqual(400);

    // And the render worker draws it: a react layer through the hosted job path, confinement and all.
    const started = await c.post('/api/render', { file: `${id}/composition.json`, scale: 0.1 }); expect(started.status).toBe(202);
    let job: any; for (let i = 0; i < 400 && !['done', 'failed'].includes((job = (await c.get(`/api/job?id=${started.json.job.id}`)).json.job).status); i++) await new Promise(r => setTimeout(r, 100));
    expect(job.error, 'the render failed').toBeUndefined(); expect(job.status).toBe('done');
  }, 120_000);

  it('enforces the per-person limits with plain sentences', async () => {
    const c = new Client(); await c.post('/api/auth/signup', { email: 'quota@example.com', password });
    const ids = []; for (let i = 0; i < 3; i++) ids.push((await c.post('/api/project/blank', { name: `p${i}` })).json.id);
    expect((await c.post('/api/project/blank', { name: 'p3' })).json.error).toMatch(/keep 3 projects/);
    expect((await c.post('/api/project/duplicate', { id: ids[0] })).json.error).toMatch(/keep 3 projects/);
    expect((await c.call('POST', `/api/upload?project=${ids[0]}&name=big.png`, undefined, {}, Buffer.alloc(2000))).json.error).toMatch(/up to/);
    const ai = { instruction: 'x', file: `${ids[0]}/composition.json` };
    expect((await c.post('/api/refine', ai)).status).toBe(202); expect((await c.post('/api/refine', ai)).status).toBe(202);
    expect((await c.post('/api/refine', ai)).json.error).toMatch(/today's 2 AI requests/);
    expect((await c.post('/api/render', { file: `${ids[0]}/composition.json`, scale: 0.1 })).status).toBe(202);
    expect((await c.post('/api/render', { file: `${ids[0]}/composition.json`, scale: 0.1 })).json.error).toMatch(/today's 1 renders/);
    const other = new Client(); await other.post('/api/auth/signup', { email: 'quota2@example.com', password });
    expect((await other.post('/api/project/blank', { name: 'fresh' })).status).toBe(200);               // someone else's limits are their own
  });

  it('keeps result delivery on the operator side: a request cannot point webhooks or object storage at its own targets', async () => {
    const hits: string[] = [];
    const listener = createServer((_req, res) => { hits.push('hit'); res.end(); });
    await new Promise<void>(ok => listener.listen(0, '127.0.0.1', ok));
    const port = (listener.address() as AddressInfo).port;
    try {
      const c = new Client(); await c.post('/api/auth/signup', { email: 'delivery@example.com', password });
      const id = (await c.post('/api/project/blank', { name: 'deliv' })).json.id;
      const reply = await c.post('/api/render', {
        file: `${id}/composition.json`, scale: 0.1,
        webhookUrl: `http://127.0.0.1:${port}/hook`, webhookSecret: 'stolen', s3Key: 'renders/evil', s3Config: { bucket: 'evil' },
      });
      expect(reply.status).toBe(202);
      for (let attempt = 0; attempt < 300; attempt++) {
        const job = (await c.get(`/api/job?id=${reply.json.job.id}`)).json.job;
        if (job.status === 'done' || job.status === 'error') break;
        await delay(200);
      }
      await delay(500);                                                                              // a webhook would fire right after the job ends
      expect(hits).toEqual([]);
    } finally { listener.close(); listener.closeAllConnections(); }
  });
});
