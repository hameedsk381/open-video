import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAiStudio, type AiStudioServer } from '../../packages/cli/src/ai-studio';

// The production plan lives beside the timeline: it can be scaffolded from it, edited on its own, and compiled back.
// Neither file's history may be touched by the other's edits.
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

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-studio-production-')); studio = await startAiStudio({ outDir: root, provider: 'mock', port: 3489 }); port = Number(new URL(studio.url).port); });
afterAll(async () => { await studio?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe('Studio production plan', () => {
  let id = '', plan: any, planModified = 0, compositionRevisions = 0;

  it('starts without a plan, scaffolds one from the timeline once, and reports it as valid', async () => {
    id = (json(await post('/api/project/blank', { name: 'Night Shift', aspect: '9:16' })) as { id: string }).id;
    const scene = (await get('/api/library')).blocks.find((block: any) => block.kind === 'scene');
    await post('/api/add-block', { id, block: scene.id });
    const before = await get(`/api/production?id=${id}`);
    expect(before).toMatchObject({ production: null, valid: false, issues: [], summary: null, modified: 0, base: `/files/${id}/` });

    const started = await post('/api/production/init', { id });
    expect(started.status).toBe(200);
    const state = json(started);
    expect(state.valid).toBe(true); expect(state.issues).toEqual([]);
    expect(state.summary.shots).toBeGreaterThan(0); expect(state.production.shots).toHaveLength(state.summary.shots);
    expect(state.production.script.beats).toHaveLength(state.summary.shots);
    expect(state.revision).toMatchObject({ kind: 'edit', label: 'Started a production plan' });
    expect(state.base).toBe(`/files/${id}/`);
    plan = structuredClone(state.production); planModified = state.modified;

    expect((await post('/api/production/init', { id })).status).toBe(409);
    const stored = JSON.parse(await readFile(join(root, id, 'production.json'), 'utf8'));
    expect(stored.shots).toHaveLength(plan.shots.length);
    expect(json(await send('GET', `/api/history?file=${id}/production.json`)).revisions.map((revision: any) => revision.label)).toEqual(['Started a production plan']);
  });

  it('refuses an invalid save with the problems to fix, and a stale save with a conflict', async () => {
    const broken = structuredClone(plan); broken.shots[0].durationSeconds = -1;
    const refused = await post('/api/production', { id, production: broken });
    expect(refused.status).toBe(400);
    expect(json(refused).issues).toContainEqual(expect.objectContaining({ path: expect.stringContaining('durationSeconds') }));
    const conflicting = await post('/api/production', { id, production: plan, baseModified: planModified - 1 });
    expect(conflicting.status).toBe(409);
    expect(json(conflicting).error).toMatch(/changed in another tab/);
  });

  it('saves an edited plan as its own revision, with a summary of the change', async () => {
    const edited = structuredClone(plan);
    edited.shots.push({ ...edited.shots[0], id: 'extra', sceneId: 'extra', name: 'Extra', action: 'Extra', durationSeconds: 1 });
    edited.brief.targetDurationSeconds = 30;
    const saved = await post('/api/production', { id, production: edited, baseModified: planModified });
    expect(saved.status).toBe(200);
    const state = json(saved);
    expect(state.valid).toBe(true);
    expect(state.summary.shots).toBe(plan.shots.length + 1);
    expect(state.revision).toMatchObject({ kind: 'edit', label: 'Edited the production plan' });
    expect(state.revision.changes.join(' ')).toMatch(/shots \d+ → \d+|added extra|target/);
    plan = state.production; planModified = state.modified;
    expect((await get(`/api/production?id=${id}`)).production.shots).toHaveLength(plan.shots.length);
  });

  it('compiles a dry run without writing, then compiles for real as a timeline revision', async () => {
    compositionRevisions = (await get(`/api/history?file=${id}/composition.json`)).revisions.length;
    const dry = await post('/api/production/compile', { id, dryRun: true });
    expect(dry.status).toBe(200);
    expect(json(dry).dryRun).toBe(true);
    expect(json(dry).revision).toBeUndefined();
    expect(json(dry).composition).toMatchObject({ fps: 30, scenes: plan.shots.length, width: 1080, height: 1920 });
    expect(Array.isArray(json(dry).changes)).toBe(true);
    expect((await get(`/api/history?file=${id}/composition.json`)).revisions).toHaveLength(compositionRevisions);
    expect((await get(`/api/history?file=${id}/production.json`)).revisions).toHaveLength(2);

    const applied = await post('/api/production/compile', { id });
    expect(applied.status).toBe(200);
    expect(json(applied).dryRun).toBe(false);
    expect(json(applied).revision).toMatchObject({ kind: 'compose', label: `Compiled ${plan.name}` });
    expect((await get(`/api/history?file=${id}/composition.json`)).revisions).toHaveLength(compositionRevisions + 1);
    expect((await get(`/api/project?id=${id}`)).scenes).toHaveLength(plan.shots.length);
    expect((await get(`/api/history?file=${id}/production.json`)).revisions).toHaveLength(2);
  });

  it('restores the plan without touching the timeline, and refuses files that have no history', async () => {
    const before = await get(`/api/history?file=${id}/composition.json`);
    const restored = await post('/api/restore', { file: `${id}/production.json`, n: 1 });
    expect(restored.status).toBe(200);
    expect(json(restored).revision).toMatchObject({ kind: 'restore', restoredFrom: 1 });
    expect((await get(`/api/production?id=${id}`)).production.shots).toHaveLength(plan.shots.length - 1);
    expect((await get(`/api/history?file=${id}/composition.json`)).revisions).toHaveLength(before.revisions.length);

    expect((await send('GET', `/api/history?file=${id}/notes.txt`)).status).toBe(400);
    expect((await post('/api/restore', { file: `${id}/notes.txt`, n: 1 })).status).toBe(400);
  });
});
