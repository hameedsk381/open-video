import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsProjectStore, LOCAL_PRINCIPAL, slugify, within, type Principal } from '@ove/storage';

// Projects are folders reached through a store, as a principal. These are the rules every adapter has to keep.
let root = '', store: FsProjectStore;
const alice: Principal = { userId: 'alice', tenantId: 'acme' }, mallory: Principal = { userId: 'mallory', tenantId: 'evil' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const video = { version: '1.0', id: 'v', name: 'V', width: 10, height: 10, fps: 30, durationFrames: 30, scenes: [] };

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-storage-')); store = new FsProjectStore(root); });
afterAll(() => rm(root, { recursive: true, force: true }));

describe('paths', () => {
  it('knows what is strictly inside a folder', () => {
    expect(within('/a/b', '/a/b/c')).toBe(true); expect(within('/a/b', '/a/b')).toBe(false); expect(within('/a/b', '/a/bc')).toBe(false); expect(within('/a/b', '/a/b/../x')).toBe(false);
  });
  it('makes folder names from titles', () => { expect(slugify('Spring Sale 2026!')).toBe('spring-sale-2026'); expect(slugify('***')).toBe('untitled'); expect(slugify('Ünïcode Café')).toBe('unicode-cafe'); });
  it('keeps every path inside the principal\'s space', () => {
    expect(store.resolve(LOCAL_PRINCIPAL, 'a/composition.json')).toBe(join(root, 'a', 'composition.json'));
    expect(() => store.resolve(LOCAL_PRINCIPAL, '../outside')).toThrow(/must be inside/);
    expect(() => store.resolve(LOCAL_PRINCIPAL, join(root, '..', 'x'))).toThrow(/must be inside/);
    for (const id of ['', '.hidden', '..', 'a/b', 'a\\b', 'c:evil', 'x\0y']) expect(() => store.projectDir(LOCAL_PRINCIPAL, id), id).toThrow(/not valid/);
    expect(() => store.tenantRoot({ userId: 'x', tenantId: '../other' })).toThrow(/not valid/);
    expect(() => store.tenantRoot({ userId: 'x', tenantId: 'a/b' })).toThrow(/not valid/);
  });
});

describe('projects', () => {
  it('creates uniquely named projects with an assets folder', async () => {
    const first = await store.create(LOCAL_PRINCIPAL, 'My Video'), second = await store.create(LOCAL_PRINCIPAL, 'My Video');
    expect([first, second]).toEqual(['my-video', 'my-video-2']);
    expect((await stat(join(root, 'my-video', 'assets'))).isDirectory()).toBe(true);
    expect(await store.exists(LOCAL_PRINCIPAL, first)).toBe(false);          // no composition yet
    await store.writeRaw(LOCAL_PRINCIPAL, first, video);
    expect(await store.exists(LOCAL_PRINCIPAL, first)).toBe(true); expect(await store.readRaw(LOCAL_PRINCIPAL, first)).toMatchObject({ id: 'v' });
    expect(await store.ids(LOCAL_PRINCIPAL)).toEqual(expect.arrayContaining(['my-video', 'my-video-2']));
  });

  it('keeps a revision per change, with the original saved first, and restores one', async () => {
    const id = 'my-video', meta = { kind: 'edit' as const, label: 'first change' };
    await store.writeRaw(LOCAL_PRINCIPAL, id, { ...video, name: 'Changed' }, meta);
    await store.writeRaw(LOCAL_PRINCIPAL, id, { ...video, name: 'Changed again' }, { kind: 'edit', label: 'second change' });
    const revisions = await store.revisions(LOCAL_PRINCIPAL, id);
    expect(revisions).toHaveLength(3);                                  // what was there before, then the two changes
    expect(revisions.slice(1).map(r => r.label)).toEqual(['first change', 'second change']);
    await store.restore(LOCAL_PRINCIPAL, id, revisions[0]!.n);
    expect((await store.readRaw(LOCAL_PRINCIPAL, id)).name).toBe('V');
  }, 20000);

  it('keeps a production plan beside the composition, with its own history', async () => {
    const id = await store.create(LOCAL_PRINCIPAL, 'Planned');
    await store.writeRaw(LOCAL_PRINCIPAL, id, video);
    expect(await store.readProduction(LOCAL_PRINCIPAL, id)).toBeUndefined();
    expect(await store.productionModified(LOCAL_PRINCIPAL, id)).toBeUndefined();

    const plan = { version: '1.0', id: 'p', name: 'Plan', productionType: 'hybrid', brief: { prompt: 'x' }, format: { width: 10, height: 10, fps: 30 },
      shots: [{ id: 's1', sceneId: 'a', action: 'x', durationSeconds: 2 }, { id: 's2', sceneId: 'b', action: 'y', durationSeconds: 3 }] };
    await store.writeProduction(LOCAL_PRINCIPAL, id, plan, { kind: 'edit', label: 'started' });
    expect(await store.readProduction(LOCAL_PRINCIPAL, id)).toMatchObject({ name: 'Plan' });
    await store.writeProduction(LOCAL_PRINCIPAL, id, { ...plan, name: 'Plan v2', shots: [...plan.shots, { id: 's3', sceneId: 'b', action: 'z', durationSeconds: 6 }] }, { kind: 'edit', label: 'added a shot' });

    const revisions = await store.revisions(LOCAL_PRINCIPAL, id, 'production.json');
    expect(revisions.map(revision => revision.label)).toEqual(['started', 'added a shot']);
    expect(revisions[1]).toMatchObject({ n: 2, frames: 330, scenes: 2, changes: expect.arrayContaining(['shots 2 → 3', 'added s3', 'length 5 s → 11 s']) });
    expect(await store.revisions(LOCAL_PRINCIPAL, id)).toEqual([]);          // the composition still has no history of its own

    const old = new Date(Date.now() - 60_000); await utimes(join(root, id, 'composition.json'), old, old);
    expect(await store.modified(LOCAL_PRINCIPAL, id)).toBe(await store.productionModified(LOCAL_PRINCIPAL, id));

    await store.restore(LOCAL_PRINCIPAL, id, 1, 'production.json');
    expect((await store.readProduction(LOCAL_PRINCIPAL, id)).name).toBe('Plan');
    expect((await store.readRaw(LOCAL_PRINCIPAL, id)).id).toBe('v');          // restoring the plan leaves the timeline alone
    expect(() => store.revisions(LOCAL_PRINCIPAL, id, '../other.json' as any)).toThrow(/not one of/);
  });

  it('duplicates without history or the saved thumbnail, and trashes into .trash', async () => {
    const copy = await store.duplicate(LOCAL_PRINCIPAL, 'my-video', raw => ({ ...raw, name: 'Copy' }));
    expect(copy).toBe('my-video-copy'); expect((await store.readRaw(LOCAL_PRINCIPAL, copy)).name).toBe('Copy');
    expect((await readdir(join(root, copy))).includes('history')).toBe(false);
    await store.trash(LOCAL_PRINCIPAL, copy);
    expect(await store.ids(LOCAL_PRINCIPAL)).not.toContain(copy); expect((await readdir(join(root, '.trash'))).some(name => name.startsWith(copy))).toBe(true);
    const [item] = await store.trashed(LOCAL_PRINCIPAL);
    expect(item).toMatchObject({ id: copy, name: 'Copy' });
    await store.create(LOCAL_PRINCIPAL, 'my-video-copy');                                          // the old name was taken again meanwhile
    const back = await store.untrash(LOCAL_PRINCIPAL, item!.key);
    expect(back).toBe('my-video-copy-2'); expect((await store.readRaw(LOCAL_PRINCIPAL, back)).name).toBe('Copy');
    expect(await store.trashed(LOCAL_PRINCIPAL)).toEqual([]);
    await expect(store.untrash(LOCAL_PRINCIPAL, '../escape-1700000000000')).rejects.toThrow(/not a trashed/);
    await expect(store.untrash(LOCAL_PRINCIPAL, item!.key)).rejects.toThrow(/no longer/);
  });

  it('stores pictures, video and audio only, under safe unique names', async () => {
    const id = 'my-video-2'; await store.writeRaw(LOCAL_PRINCIPAL, id, video);
    expect(await store.putAsset(LOCAL_PRINCIPAL, id, 'Logo (final).png', png)).toEqual([expect.objectContaining({ name: 'Logo-final-.png', kind: 'image', path: 'assets/Logo-final-.png' })]);
    expect((await store.putAsset(LOCAL_PRINCIPAL, id, 'Logo (final).png', png)).map(a => a.name).sort()).toEqual(['Logo-final--2.png', 'Logo-final-.png']);
    expect((await store.putAsset(LOCAL_PRINCIPAL, id, '..\\..\\sneaky.png', png)).some(a => a.name === 'sneaky.png')).toBe(true);
    await expect(store.putAsset(LOCAL_PRINCIPAL, id, 'run.exe', png)).rejects.toThrow(/Pictures, video and audio only/);
  });

  it('serves a saved thumbnail only while it is newer than the composition', async () => {
    const id = 'my-video-2';
    expect(await store.thumb(LOCAL_PRINCIPAL, id)).toBeUndefined();
    await store.putThumb(LOCAL_PRINCIPAL, id, png);
    expect((await store.thumb(LOCAL_PRINCIPAL, id))!.equals(png)).toBe(true);
    const later = new Date(Date.now() + 5000); await utimes(join(root, id, 'composition.json'), later, later);
    expect(await store.thumb(LOCAL_PRINCIPAL, id)).toBeUndefined();
  });

  it('hands out the project folder as its workdir', async () => {
    const work = await store.workdir(LOCAL_PRINCIPAL, 'my-video-2');
    expect(work.dir).toBe(join(root, 'my-video-2')); await expect(work.commit()).resolves.toBeUndefined();
  });
});

describe('tenants', () => {
  it('gives each tenant its own space, and the local space does not see them', async () => {
    const mine = await store.create(alice, 'Secret Plan'), theirs = await store.create(mallory, 'Secret Plan');
    expect([mine, theirs]).toEqual(['secret-plan', 'secret-plan']);                    // same name, different spaces: no clash
    await store.writeRaw(alice, mine, { ...video, name: 'Alice only' });
    await store.writeRaw(mallory, theirs, { ...video, name: 'Mallory only' });
    expect((await store.readRaw(alice, mine)).name).toBe('Alice only'); expect((await store.readRaw(mallory, theirs)).name).toBe('Mallory only');
    expect(await store.ids(alice)).toEqual(['secret-plan']); expect(await store.ids(mallory)).toEqual(['secret-plan']);
    expect(await store.ids(LOCAL_PRINCIPAL)).not.toContain('_tenants'); expect(await store.ids(LOCAL_PRINCIPAL)).not.toContain('secret-plan');
    expect(store.tenantRoot(alice)).toBe(join(root, '_tenants', 'acme'));
  });

  it('refuses to reach another tenant by path, by id, or by an absolute path', async () => {
    const theirs = join(root, '_tenants', 'evil', 'secret-plan', 'composition.json');
    expect(() => store.resolve(alice, theirs)).toThrow(/must be inside/);
    expect(() => store.resolve(alice, '../evil/secret-plan/composition.json')).toThrow(/must be inside/);
    expect(() => store.resolve(alice, '../../my-video/composition.json')).toThrow(/must be inside/);
    await expect(store.readRaw(alice, '../evil/secret-plan')).rejects.toThrow(/not valid/);
    await expect(store.readRaw(alice, 'other-thing')).rejects.toThrow();
    await writeFile(join(root, 'plain.txt'), 'x');
    expect(() => store.resolve(alice, join(root, 'plain.txt'))).toThrow(/must be inside/);
  });
});
