// `ove blocks`, `ove add` and `ove theme`: browse the reusable blocks and themes, copy a block into a composition, switch a theme.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { compositionJsonSchema, loadComposition } from '@ove/schema';
import { labelKeyframes, type TrackPoint } from './track';
import { addBlock, applyTheme, emptyComposition, listBlocks, listThemes, readBlock, readTheme, themeDefaults } from './blocks';

const sizes: Record<string, [number, number]> = { '16:9': [1920, 1080], '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350] };
const option = (argv: string[], name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
const options = (argv: string[], name: string) => argv.flatMap((arg, i) => arg === name && argv[i + 1] !== undefined ? [argv[i + 1]!] : []);
const exists = (file: string) => readFile(file, 'utf8').then(() => true, () => false);
const save = (file: string, raw: unknown) => writeFile(file, JSON.stringify(raw, null, 2) + '\n');

export async function runBlocks(argv: string[]): Promise<void> {
  const [blocks, themes] = [await listBlocks(), await listThemes()];
  if (argv.includes('--json')) { console.log(JSON.stringify({ blocks: blocks.map(({ layers, ...rest }) => rest), themes }, null, 2)); return; }
  const effects = blocks.filter(block => block.category === 'effect'), plain = blocks.filter(block => block.category !== 'effect');
  const line = (id: string, text: string, detail: string) => `  ${id.padEnd(20)} ${text.padEnd(50)} ${detail}`;
  const show = (list: typeof blocks, seconds: boolean) => { for (const block of list) console.log(line(block.id, block.description.slice(0, 50), `${seconds ? `${(block.durationFrames / 30).toFixed(1)}s  ` : ''}${Object.keys(block.params).join(', ')}`)); };
  console.log('Scenes (each becomes a new scene at the end):'); show(plain.filter(block => block.kind === 'scene'), true);
  console.log('\nOverlays (go inside a scene, on top):'); show(plain.filter(block => block.kind === 'overlay'), false);
  console.log('\nEffects (fx-*: motion-graphics effects for footage; add "footage" first, then overlays with --scene footage, or effect scenes with --set footage=clip.mp4):');
  show(effects, true);
  console.log(`\nThemes: ${themes.map(theme => theme.id).join(', ')}  (ove theme <id> <composition.json>)`);
  console.log('Add one with: ove add <block> <composition.json> [--set name=value] [--at frame] [--scene id]');
}

export async function runAdd(argv: string[]): Promise<void> {
  const [, blockId, target] = argv;
  if (!blockId || blockId.startsWith('--') || !target || target.startsWith('--')) throw new Error('Usage: ove add <block> <composition.json> [--set name=value] [--at frame] [--frames n] [--scene id] [--id name] [--aspect 16:9] [--theme id]');
  const file = resolve(target), block = await readBlock(blockId);
  const set: Record<string, unknown> = {};
  for (const pair of options(argv, '--set')) {
    const at = pair.indexOf('=');
    if (at < 1) throw new Error(`--set takes name=value, not "${pair}"`);
    set[pair.slice(0, at)] = pair.slice(at + 1).replace(/\\n/g, '\n');
  }
  const atText = option(argv, '--at'), at = atText === undefined ? undefined : Number(atText);
  const framesText = option(argv, '--frames'), frames = framesText === undefined ? undefined : Number(framesText);
  if (frames !== undefined && !(Number.isInteger(frames) && frames >= 1)) throw new Error('--frames needs a whole number of frames, 1 or more');
  if (at !== undefined && !(Number.isInteger(at) && at >= 0)) throw new Error('--at needs a frame number, 0 or more');
  const trackFile = option(argv, '--track');
  if (trackFile) {
    if (!('xKeys' in block.params)) throw new Error(`${block.id} does not follow a track; --track is for fx-tracked-label`);
    const points = JSON.parse(await readFile(resolve(trackFile), 'utf8')) as TrackPoint[];
    if (!Array.isArray(points) || !points.length || typeof points[0]?.right !== 'number') throw new Error('--track needs a file written by ove track');
    const canvas = await readFile(file, 'utf8').then(text => JSON.parse(text.replace(/^\uFEFF/, '')) as { width: number; height: number }, () => ({ width: 1080, height: 1920 }));
    const keys = labelKeyframes(points, canvas, { width: Math.round(canvas.width * 0.3), height: Math.round(Math.min(canvas.width, canvas.height) * 0.11) });
    set.xKeys = JSON.stringify(keys.xKeys); set.yKeys = JSON.stringify(keys.yKeys);
  }
  const created = !(await exists(file));
  let raw: any;
  if (created) {
    const aspect = option(argv, '--aspect') ?? '16:9', size = sizes[aspect];
    if (!size) throw new Error(`--aspect must be one of ${Object.keys(sizes).join(', ')}`);
    raw = emptyComposition(option(argv, '--name') ?? basename(dirname(file)), size[0], size[1]);
    applyTheme(raw, await readTheme(option(argv, '--theme') ?? themeDefaults.id));
  } else {
    raw = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
    if (argv.includes('--aspect') || argv.includes('--theme')) throw new Error('--aspect and --theme only apply when the composition is created; use ove theme <id> to change the theme');
  }
  const result = addBlock(raw, block, { at, frames, scene: option(argv, '--scene'), id: option(argv, '--id'), set });
  if (created) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(resolve(dirname(file), 'composition.schema.json'), JSON.stringify(compositionJsonSchema, null, 2) + '\n');
  }
  await save(file, result.composition);
  const resolved = loadComposition(result.composition);
  console.log(`${created ? 'Created' : 'Updated'} ${file}\n  added ${block.id} as "${result.placed}" (${result.where}); the video is now ${resolved.durationFrames} frames, ${resolved.scenes.length} scene${resolved.scenes.length === 1 ? '' : 's'}`);
  console.log(`  the block is a component named "${block.id.replace(/-/g, '_')}" in the file: edit it there, or change its text with "with" on the placement`);
}

export async function runTheme(argv: string[]): Promise<void> {
  const [, themeId, target] = argv;
  if (!themeId || themeId.startsWith('--')) {
    const themes = await listThemes();
    if (argv.includes('--json')) { console.log(JSON.stringify(themes, null, 2)); return; }
    for (const theme of themes) console.log(`  ${theme.id.padEnd(10)} ${theme.description}\n  ${''.padEnd(10)} ${['bg', 'surface', 'text', 'muted', 'accent', 'accent2'].map(name => `${name} ${theme.variables[name]}`).join('  ')}`);
    console.log('\nApply one with: ove theme <id> <composition.json>');
    return;
  }
  if (!target || target.startsWith('--')) throw new Error('Usage: ove theme <id> <composition.json>');
  const file = resolve(target), theme = await readTheme(themeId);
  const raw = JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
  applyTheme(raw, theme);
  loadComposition(raw);
  await save(file, raw);
  console.log(`Applied the ${theme.name} theme to ${file}: ${Object.keys(theme.variables).join(', ')} are now variables you can edit`);
}
