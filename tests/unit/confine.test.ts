import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSourcesConfined, escapingSources } from '@ove/ai';
import { createFsPaths } from '@ove/jobs';
import { FsProjectStore, type Principal } from '@ove/storage';

// A render reads whatever a source names from the machine it runs on. On a shared volume that is another person's file, so a
// hosted video may only use files of its own project. These pin what counts as leaving it, and that the job paths refuse
// such a video before anything is drawn, however the path got into it.

const layers = (...sources: string[]) => ({ scenes: [{ layers: sources.map(src => ({ type: 'image', src })) }] });

describe('escapingSources', () => {
  it('allows what stays inside the project: ids, relative paths, built-in sounds and inline data', () => {
    expect(escapingSources({ assets: [{ id: 'logo', src: './assets/logo.png' }], export: { audio: 'sfx:whoosh' }, ...layers('logo', 'assets/a.png', './assets/b.jpg', 'sfx:pop', 'data:image/png;base64,AA==', 'sub/dir/c.webp') })).toEqual([]);
  });

  it('flags absolute paths, drive letters, UNC paths, parent steps and network addresses', () => {
    const bad = ['/etc/passwd', '\\windows\\win.ini', 'C:/Windows/win.ini', 'c:\\x.png', '\\\\server\\share\\a.png', '../x.png', 'a/../../x.png', '..\\x.png', 'https://example.com/a.png', 'file:///etc/hostname', 'ftp://h/a.png'];
    expect(escapingSources(layers(...bad)).sort()).toEqual([...bad].sort());
  });

  it('finds sources wherever they sit: assets, nested groups, the soundtrack and pictures inside html layers', () => {
    const composition = {
      assets: [{ id: 'font', type: 'font', src: '/usr/share/fonts/a.ttf' }], export: { audio: '../music.mp3' },
      scenes: [{ layers: [{ type: 'group', children: [{ type: 'video', src: '/data/_tenants/x/p/assets/v.mp4' }] }, { type: 'html', html: '<img src="/etc/logo.png"><div style="background:url(/etc/bg.png)"></div>' }] }],
    };
    expect(escapingSources(composition)).toEqual(expect.arrayContaining(['/usr/share/fonts/a.ttf', '../music.mp3', '/data/_tenants/x/p/assets/v.mp4']));
  });

  it('says what is wrong in words a person can act on, and caps the list', () => {
    expect(() => assertSourcesConfined(layers('/a.png', '/b.png', '/c.png', '/d.png', '/e.png'))).toThrow(/outside its own project \("\/a\.png", "\/b\.png", "\/c\.png", and 2 more\)/);
    expect(() => assertSourcesConfined(layers('assets/a.png'))).not.toThrow();
  });
});

describe('job paths', () => {
  let root = ''; let store: FsProjectStore;
  const alice: Principal = { userId: 'alice', tenantId: 'acme' };
  const video = (src: string) => ({ version: '1.0', id: 'v', name: 'V', width: 100, height: 100, fps: 30, durationFrames: 30, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [{ id: 'i', type: 'image', src, width: 50, height: 50 }] }] });
  beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-confine-')); store = new FsProjectStore(root); });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('refuses to load a hosted video that names a file outside its project, and still loads one that does not', async () => {
    const bad = await store.create(alice, 'bad'), good = await store.create(alice, 'good');
    // Written straight to the store, as a stale or hand-edited file would be: the render must not depend on every write path having checked.
    await store.writeRaw(alice, bad, video('/data/_tenants/someone-else/p/assets/secret.png'));
    await store.writeRaw(alice, good, video('assets/logo.png'));
    const hosted = createFsPaths(store, alice, undefined, { confine: true });
    await expect(hosted.loadForRender(hosted.fileInside(`${bad}/composition.json`, 'composition'))).rejects.toThrow(/outside its own project/);
    await expect(hosted.loadForRender(hosted.fileInside(`${good}/composition.json`, 'composition'))).resolves.toMatchObject({ composition: { id: 'v' } });
  });

  it('leaves the local studio free to use files anywhere on the person\'s own machine', async () => {
    const id = await store.create(alice, 'local-use');
    await store.writeRaw(alice, id, video('/home/me/pictures/a.png'));
    const local = createFsPaths(store, alice);
    await expect(local.loadForRender(local.fileInside(`${id}/composition.json`, 'composition'))).resolves.toBeDefined();
  });
});
