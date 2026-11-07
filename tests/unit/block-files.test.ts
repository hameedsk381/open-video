import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { loadComposition, parseComposition } from '@ove/schema';
import { FsProjectStore, type Principal } from '@ove/storage';
import { addBlock, blockFilePath, copyBlockFiles, emptyComposition, listBlocks, readBlock } from '../../packages/cli/src/blocks';

// The html layer is gone: its seven users, the fx-* blocks, draw from one React bundle that ships beside the blocks and is copied into
// a project when a block is added. These pin that every block is consistent with that, and that nothing can name a file outside it.

const layersOf = (value: any): any[] => [...(value?.layers ?? []), ...(value?.children ?? [])].flatMap((layer: any) => [layer, ...layersOf(layer)]);
const sceneBase = () => { const base = emptyComposition('t', 1080, 1920, 30); base.scenes = [{ id: 'base', name: 'Base', startFrame: 0, durationFrames: 200, layers: [] }]; base.durationFrames = 200; return base; };

describe('block support files', () => {
  it('has no html layer in any block', async () => {
    for (const block of await listBlocks()) expect(JSON.stringify(block.layers), block.id).not.toContain('"type":"html"');
  });

  it('ships every file a block names, and every react layer in a block draws from one of them', async () => {
    for (const block of await listBlocks()) {
      const files = block.files ?? [];
      for (const file of files) expect((await stat(blockFilePath(file))).size, `${block.id} ${file}`).toBeGreaterThan(1000);
      for (const layer of layersOf(block).filter(layer => layer.type === 'react')) expect(files.map(file => basename(file)), `${block.id} layer ${layer.id}`).toContain(layer.src);
    }
  });

  it('ships a bundle that registers a component, so a react layer can mount it', async () => {
    const bundle = await readFile(blockFilePath('support/fx.bundle.js'), 'utf8');
    expect(bundle).toContain('__oveReactMount');
  });

  it('reports the files an added block needs, and the result loads', async () => {
    for (const id of ['fx-counter-hero', 'fx-highlighter', 'fx-strike-rewrite', 'fx-timeline']) {
      const added = addBlock(sceneBase(), await readBlock(id));
      expect(added.files, id).toEqual(['support/fx.bundle.js']);
      expect(() => loadComposition(added.composition), id).not.toThrow();
    }
    expect(addBlock(sceneBase(), await readBlock('fx-counter-hero')).composition.components.fx_counter_hero.layers.some((layer: any) => layer.type === 'react')).toBe(true);
  });

  it('turns the canvas-sized expressions in a block into the numbers its react layer is given', async () => {
    const added = addBlock(sceneBase(), await readBlock('fx-counter-hero'), { set: { value: 80, suffix: '%' } });
    const layer = layersOf(loadComposition(added.composition).scenes[0]).find((candidate: any) => candidate.type === 'react');
    expect(layer.props).toMatchObject({ effect: 'counter', value: 80, suffix: '%', size: 259, weight: 900, align: 'center', duration: 70 });
    expect(typeof layer.props.size).toBe('number');
  });

  it('refuses a name that is not a support file the product ships', () => {
    for (const bad of ['../../package.json', 'support/../x.bundle.js', 'support/x.js', '/etc/passwd', 'C:/x.bundle.js', 'support/sub/x.bundle.js', 'fx.bundle.js', 'support/.hidden.bundle.js', 'support/X.bundle.js']) {
      expect(() => blockFilePath(bad), bad).toThrow(/not a block support file/);
    }
    expect(blockFilePath('support/fx.bundle.js')).toMatch(/blocks[\\/]support[\\/]fx\.bundle\.js$/);
  });
});

describe('copying a block\'s files', () => {
  let dir = '';
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-block-files-')); });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('puts the bundle beside the composition under its own name and replaces an older copy', async () => {
    await writeFile(join(dir, 'fx.bundle.js'), 'old');
    await copyBlockFiles(['support/fx.bundle.js'], dir);
    expect((await stat(join(dir, 'fx.bundle.js'))).size).toBeGreaterThan(1000);
    await expect(copyBlockFiles(['../outside.bundle.js'], dir)).rejects.toThrow(/not a block support file/);
  });
});

describe('a project store and support files', () => {
  let root = ''; let store: FsProjectStore; const who: Principal = { userId: 'u', tenantId: 'acme' };
  beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-support-')); store = new FsProjectStore(root); });
  afterAll(() => rm(root, { recursive: true, force: true }));

  it('writes only a named bundle into the project, never an upload-shaped name', async () => {
    const id = await store.create(who, 'with-effects');
    await store.putSupportFile(who, id, 'fx.bundle.js', Buffer.from('bundle'));
    expect((await readFile(join(store.projectDir(who, id), 'fx.bundle.js'), 'utf8'))).toBe('bundle');
    for (const bad of ['evil.js', '../fx.bundle.js', 'a/b.bundle.js', 'FX.bundle.js', '.bundle.js', 'x.html', 'x.bundle.js.png', 'a'.repeat(70) + '.bundle.js']) {
      await expect(store.putSupportFile(who, id, bad, Buffer.from('x')), bad).rejects.toThrow(/not a support file name/);
    }
    // And it stays out of the list of pictures, clips and sounds.
    expect((await store.assets(who, id)).map(asset => asset.name)).not.toContain('fx.bundle.js');
  });
});

describe('an html layer in an older file', () => {
  const withLayer = (layer: unknown) => ({ version: '1.0', id: 'old', name: 'Old', width: 100, height: 100, fps: 30, durationFrames: 30, scenes: [{ id: 's', name: 'S', startFrame: 0, durationFrames: 30, layers: [layer] }] });
  const html = { id: 'card', type: 'html', width: 100, height: 50, html: '<b>x</b>', css: '' };

  it('says what to do about it, instead of listing the layer types it expected', () => {
    for (const load of [() => parseComposition(withLayer(html)), () => loadComposition(withLayer(html))]) {
      expect(load).toThrow(/html layers \("card"\), which are no longer supported/);
      expect(load).toThrow(/react layer \(ove build video\.tsx\)/);
    }
  });

  it('finds it inside a group and inside a block that an older version put into the file', () => {
    expect(() => loadComposition(withLayer({ id: 'g', type: 'group', children: [html] }))).toThrow(/"card"/);
    const old = { ...withLayer({ id: 'text', type: 'text', content: 'x' }), components: { fx_counter_hero: { params: {}, layers: [{ ...html, id: 'count' }] } } };
    expect(() => loadComposition(old)).toThrow(/"count".*add the block again/);
  });

  it('names the first three and counts the rest', () => {
    const many = withLayer({ id: 'g', type: 'group', children: ['a', 'b', 'c', 'd', 'e'].map(id => ({ ...html, id })) });
    expect(() => loadComposition(many)).toThrow(/"a", "b", "c", and 2 more/);
  });

  it('does not mistake other things called html for a layer', () => {
    expect(() => loadComposition(withLayer({ id: 'm', type: 'text', content: 'type html here' }))).not.toThrow();
  });
});
