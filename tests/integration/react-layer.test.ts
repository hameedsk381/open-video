import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadComposition, renderStill } from '@ove/core';
import { runBuild } from '../../packages/cli/src/build';

// A React video: ove build bundles the component, the renderer draws it once per frame (react-dom/server markup through the html path),
// frames are identical wherever and however often they are drawn, and it needs --allow-code like any code that runs while rendering.
let dir = '', raw: any;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const withProps = (props: Record<string, unknown>) => loadComposition({ ...raw, scenes: [{ ...raw.scenes[0], layers: [{ ...raw.scenes[0].layers[0], props: { ...raw.scenes[0].layers[0].props, ...props } }] }] });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ove-react-'));
  await writeFile(join(dir, 'dot.png'), png);
  await runBuild(['build', join(process.cwd(), 'tests/integration/fixtures/react-fixture.tsx'), '--output', join(dir, 'composition.json')]);
  raw = JSON.parse(await readFile(join(dir, 'composition.json'), 'utf8'));
}, 120_000);
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('react layer', () => {
  it('is built into a composition with one react layer and a bundle beside it', async () => {
    expect(raw).toMatchObject({ id: 'fixture', width: 320, height: 180, durationFrames: 60, assets: [{ id: 'dot', type: 'image' }] });
    expect(raw.scenes[0].layers[0]).toMatchObject({ type: 'react', src: 'react-fixture.bundle.js', durationInFrames: 60, props: { color: '#ffcc00' } });
    expect((await readFile(join(dir, 'react-fixture.bundle.js'), 'utf8')).length).toBeGreaterThan(50_000);
  });

  it('does not render unless the caller allows code', async () => {
    await expect(renderStill(withProps({}), { frame: 0, baseDir: dir })).rejects.toThrow(/--allow-code/);
  });

  it('draws the component for each frame, repeatably, and follows its props, sequences and pictures', async () => {
    const still = (composition: ReturnType<typeof withProps>, frame: number) => renderStill(composition, { frame, baseDir: dir, allowCode: true });
    const base = withProps({});
    const [f0, f40, f40again] = await Promise.all([still(base, 0), still(base, 40), still(base, 40)]);
    expect(f0.equals(f40)).toBe(false);            // the box moved, and the late sequence appeared
    expect(f40.equals(f40again)).toBe(true);       // same frame, same pixels
    expect((await still(withProps({ color: '#00ccff' }), 40)).equals(f40)).toBe(false);
    expect((await still(withProps({ showImage: true }), 40)).equals(f40)).toBe(false);
  });

  it('shows a Sequence only from its first frame', async () => {
    const early = await renderStill(withProps({}), { frame: 29, baseDir: dir, allowCode: true }), late = await renderStill(withProps({}), { frame: 31, baseDir: dir, allowCode: true });
    expect(early.equals(late)).toBe(false);
  });

  it('refuses a file with no config or no component', async () => {
    const bad = join(dir, 'bad.tsx');
    await writeFile(bad, 'export default function X() { return null; }\n');
    await expect(runBuild(['build', bad, '--output', join(dir, 'bad', 'composition.json')])).rejects.toThrow(/export const config/);
    await writeFile(bad, 'export const config = { width: 10, height: 10, durationInFrames: 5 };\n');
    await expect(runBuild(['build', bad, '--output', join(dir, 'bad', 'composition.json')])).rejects.toThrow(/default export/);
  });
});
