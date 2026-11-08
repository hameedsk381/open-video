import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fingerprintFile, sha256Of, verifyAssetHashes } from '@ove/assets';
import { createProvider, generateImage } from '@ove/ai';
import { FsProjectStore, LOCAL_PRINCIPAL } from '@ove/storage';
import { loadComposition } from '@ove/core';
import { assetNoteLines, collectAssetNotes } from '../../packages/cli/src/asset-notes';

let dir: string;
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-assets-')); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('hashing files', () => {
  it('hashes a file the same way as the bytes it holds', async () => {
    await writeFile(join(dir, 'x.bin'), 'abc');
    expect(await fingerprintFile(join(dir, 'x.bin'))).toEqual({ sha256: sha256Of(Buffer.from('abc')), bytes: 3 });
  });

  it('flags a file that changed or went missing, and leaves URLs, built-in sounds and unhashed assets alone', async () => {
    await writeFile(join(dir, 'kept.png'), 'one');
    await writeFile(join(dir, 'changed.png'), 'two');
    const hash = (text: string) => sha256Of(Buffer.from(text));
    const notes = await verifyAssetHashes([
      { id: 'kept', src: 'kept.png', sha256: hash('one') },
      { id: 'changed', src: 'changed.png', sha256: hash('before') },
      { id: 'gone', src: 'gone.png', sha256: hash('x') },
      { id: 'remote', src: 'https://example.com/a.png', sha256: hash('x') },
      { id: 'sound', src: 'sfx:pop', sha256: hash('x') },
      { id: 'nohash', src: 'changed.png' },
    ], dir);
    expect(notes.map(n => `${n.assetId}:${n.code}`)).toEqual(['changed:hash-mismatch', 'gone:file-missing']);
    expect(notes.every(n => n.severity === 'warning')).toBe(true);
  });
});

describe('an uploaded file records its hash once', () => {
  it('writes a manifest next to the files and lists the hash, and drops it when the file is replaced by hand', async () => {
    const store = new FsProjectStore(join(dir, 'projects'));
    const id = await store.create(LOCAL_PRINCIPAL, 'upload test');
    const png = Buffer.from('not really a png, but the bytes are what is hashed');
    const listed = await store.putAsset(LOCAL_PRINCIPAL, id, 'logo.png', png);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.sha256).toBe(sha256Of(png));
    expect(typeof listed[0]!.addedAt).toBe('string');

    // The manifest is not itself an asset.
    const folder = join(store['projectDir'](LOCAL_PRINCIPAL, id), 'assets');
    const manifest = JSON.parse(await readFile(join(folder, '.manifest.json'), 'utf8'));
    expect(manifest['logo.png'].originalName).toBe('logo.png');

    // Replaced by hand with different bytes: the recorded hash would now be false, so it is not reported.
    await writeFile(join(folder, 'logo.png'), 'a different, longer file than the one that was uploaded');
    const after = await store.assets(LOCAL_PRINCIPAL, id);
    expect(after[0]!.sha256).toBeUndefined();

    // A file put there by hand never had a record.
    await writeFile(join(folder, 'hand.png'), 'by hand');
    expect((await store.assets(LOCAL_PRINCIPAL, id)).find(a => a.name === 'hand.png')?.sha256).toBeUndefined();
  });
});

describe('a generated image says what made it', () => {
  it('registers the provider, the prompt, the hash and an honest "unknown" for rights', async () => {
    const composition = loadComposition({ version: '1.0', id: 'g', name: 'g', width: 320, height: 180, fps: 30, durationFrames: 30, scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [] }] });
    const target = join(dir, 'generated');
    await mkdir(target, { recursive: true });
    const result = await generateImage(createProvider({ provider: 'mock' }), { out: join(target, 'mug'), prompt: 'a ceramic mug on a table', composition, compositionPath: join(target, 'composition.json'), id: 'mug' });
    const asset = result.composition!.assets.find(a => a.id === 'mug')!;
    expect(asset.provenance?.origin).toBe('generated');
    expect(asset.provenance?.provider).toBe('mock');
    expect(asset.provenance?.prompt).toBe('a ceramic mug on a table');
    expect(asset.rights?.commercialUse).toBe('unknown');
    expect(asset.sha256).toBe(sha256Of(await readFile(result.file)));
    // And what it recorded is what verification finds on disk.
    expect(await verifyAssetHashes([asset], target)).toEqual([]);
  });
});

describe('what validate prints', () => {
  it('lists assets without recorded rights on one line, and gives each warning its own', async () => {
    const lines = assetNoteLines(await collectAssetNotes([
      { id: 'a', type: 'image', src: 'a.png', metadata: {} }, { id: 'b', type: 'image', src: 'b.png', metadata: {} },
      { id: 'c', type: 'image', src: 'c.png', metadata: {}, rights: { commercialUse: 'restricted', restrictions: ['editorial only'] } },
    ] as any, dir));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^note: 2 assets have no recorded rights.*\(a, b\)/);
    expect(lines[1]).toMatch(/^warning: .*"c" is restricted.*editorial only/);
  });

  it('prints nothing when every asset has its rights recorded', async () => {
    expect(assetNoteLines(await collectAssetNotes([{ id: 'a', type: 'image', src: 'a.png', metadata: {}, rights: { commercialUse: 'allowed' } }] as any, dir))).toEqual([]);
  });
});
