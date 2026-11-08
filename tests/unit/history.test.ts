import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRevisionRaw } from '@ove/storage';
import { ensureBaseline, listRevisions, restoreRevision, saveRevision, summarizeChange, summarizeProductionChange } from '@ove/ai';

// Every AI change to a composition is kept as a numbered revision, so a bad one can be undone and nothing is lost by restoring.
let dir: string, file: string;
const comp = (scenes: string[], title = 'Hello', frames = 60 * scenes.length) => ({ version: '1.0', id: 'x', name: 'X', width: 640, height: 360, fps: 30, durationFrames: frames,
  variables: { title: { type: 'string', default: title } }, scenes: scenes.map((id, i) => ({ id, name: id, startFrame: i * 60, durationFrames: 60, layers: [] })) });
const write = (composition: unknown) => writeFile(file, JSON.stringify(composition, null, 2) + '\n');
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-history-')); file = join(dir, 'composition.json'); });
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('revision history', () => {
  it('starts empty and numbers revisions in order, keeping each file exactly as written', async () => {
    expect(await listRevisions(file)).toEqual([]);
    await write(comp(['a'])); const first = await saveRevision(file, { kind: 'compose', label: 'a brief', provider: 'groq', model: 'm', attempts: 1 });
    await write(comp(['a', 'b'], 'Changed')); const second = await saveRevision(file, { kind: 'refine', label: 'add b' });
    expect([first.n, second.n]).toEqual([1, 2]); expect(first.changes).toEqual([]);
    expect(second.changes).toEqual(expect.arrayContaining(['scenes 1 → 2', 'added b', 'values changed: title']));
    expect((await listRevisions(file)).map(r => r.kind)).toEqual(['compose', 'refine']);
    expect((await readdir(join(dir, 'history', 'composition'))).sort()).toEqual(['0001.json', '0002.json', 'index.json']);
    expect(JSON.parse(await readFile(join(dir, 'history', 'composition', '0001.json'), 'utf8')).scenes).toHaveLength(1);
  });

  it('keeps what was there before the first AI change as revision 1, once', async () => {
    expect(await ensureBaseline(file)).toBeUndefined();
    await write(comp(['hand', 'made']));
    const baseline = (await ensureBaseline(file))!;
    expect(baseline).toMatchObject({ n: 1, kind: 'baseline', scenes: 2 });
    expect(await ensureBaseline(file)).toBeUndefined();
    await write(comp(['ai'])); await saveRevision(file, { kind: 'refine', label: 'x' });
    expect((await listRevisions(file)).map(r => r.n)).toEqual([1, 2]);
  });

  it('restores an old revision and records the restore, so nothing is lost', async () => {
    await write(comp(['a'])); await saveRevision(file, { kind: 'compose', label: 'one' });
    await write(comp(['a', 'b', 'c'])); await saveRevision(file, { kind: 'refine', label: 'three scenes' });
    const restored = await restoreRevision(file, 1);
    expect(restored).toMatchObject({ n: 3, kind: 'restore', restoredFrom: 1, scenes: 1 });
    expect(JSON.parse(await readFile(file, 'utf8')).scenes).toHaveLength(1);
    expect(JSON.parse(await readFile(join(dir, 'history', 'composition', '0002.json'), 'utf8')).scenes).toHaveLength(3);
    await expect(restoreRevision(file, 9)).rejects.toThrow(/no revision 9/);
  });

  it('reads one revision back as parsed JSON with its record, and nothing for a missing or damaged one', async () => {
    await write(comp(['a'])); await saveRevision(file, { kind: 'compose', label: 'one' });
    await write(comp(['a', 'b'])); await saveRevision(file, { kind: 'refine', label: 'two' });
    const first = await readRevisionRaw(file, 1);
    expect(first?.revision).toMatchObject({ n: 1, label: 'one' });
    expect(first?.raw.scenes).toHaveLength(1);
    expect((await readRevisionRaw(file, 2))?.raw.scenes).toHaveLength(2);
    expect(await readRevisionRaw(file, 7)).toBeUndefined();
    await writeFile(join(dir, 'history', 'composition', '0001.json'), '{ not json');
    expect(await readRevisionRaw(file, 1)).toBeUndefined();
  });

  it('keeps a separate history for each composition file in a folder', async () => {
    const other = join(dir, 'video.json');
    await write(comp(['a'])); await saveRevision(file, { kind: 'compose', label: 'one' });
    await writeFile(other, JSON.stringify(comp(['z']))); await saveRevision(other, { kind: 'compose', label: 'two' });
    expect((await listRevisions(file)).map(r => r.label)).toEqual(['one']); expect((await listRevisions(other)).map(r => r.label)).toEqual(['two']);
  });

  it('describes production plans in their own terms', async () => {
    const productionFile = join(dir, 'production.json');
    const plan = (shots: [string, string, number][], extra: Record<string, unknown> = {}) => ({
      version: '1.0', id: 'p', name: 'P', productionType: 'hybrid', brief: { prompt: 'x' }, format: { width: 1920, height: 1080, fps: 30 },
      shots: shots.map(([id, sceneId, durationSeconds]) => ({ id, sceneId, action: 'a', durationSeconds })), ...extra,
    });
    const save = async (value: unknown) => { await writeFile(productionFile, JSON.stringify(value)); return saveRevision(productionFile, { kind: 'edit', label: 'plan' }); };

    const first = await save(plan([['s1', 'a', 2], ['s2', 'b', 3]]));
    expect(first).toMatchObject({ frames: 150, scenes: 2, changes: [] });
    const second = await save(plan([['s1', 'a', 2], ['s2', 'b', 3], ['s3', 'b', 6]], {
      brief: { prompt: 'x', targetDurationSeconds: 10 },
      script: { beats: [{ id: 'b1', name: 'Hook', onScreen: 'One' }, { id: 'b2', name: 'CTA', onScreen: 'Two' }] },
    }));
    expect(second).toMatchObject({ n: 2, frames: 330, scenes: 2 });
    expect(second.changes).toEqual(expect.arrayContaining(['shots 2 → 3', 'added s3', 'length 5 s → 11 s', 'script beats 0 → 2', 'target 10 s']));

    const restored = await restoreRevision(productionFile, 1);
    expect(restored).toMatchObject({ kind: 'restore', frames: 150, scenes: 2 });
    expect(JSON.parse(await readFile(productionFile, 'utf8')).shots).toHaveLength(2);

    expect(summarizeProductionChange(undefined, plan([]))).toEqual([]);
    const edited = plan([['s1', 'a', 2]]); (edited.shots[0] as any).action = 'changed';
    expect(summarizeProductionChange(plan([['s1', 'a', 2]]), edited)).toEqual(['plan edited']);
  });

  it('describes changes briefly', () => {
    expect(summarizeChange(undefined, comp(['a']))).toEqual([]);
    expect(summarizeChange(comp(['a']), comp(['a']))).toEqual([]);
    expect(summarizeChange(comp(['a', 'b']), comp(['a']))).toEqual(expect.arrayContaining(['scenes 2 → 1', 'removed b', 'length 120 → 60 frames']));
    const edited = comp(['a']); (edited.scenes[0] as any).layers = [{ id: 'l' }];
    expect(summarizeChange(comp(['a']), edited)).toEqual(['layers or timing edited']);
  });
});
