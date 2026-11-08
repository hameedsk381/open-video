// Writes the shipped templates: packages/cli/templates/<id>/{composition.json,template.json} from scripts/templates/*.mjs.
// Run with `pnpm build:templates` (it needs tsx, which the repository has). Each template is checked as it is written: it must load with
// its defaults, review cleanly structure-wise, and convert to a React video without losing anything (see unsupportedFeatures).
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadComposition } from '@ove/core';
import { unsupportedFeatures } from '@ove/react';

const root = resolve(import.meta.dirname, '..');
const sources = join(root, 'scripts', 'templates');
const target = join(root, 'packages', 'cli', 'templates');
const only = process.argv.slice(2);

const files = (await readdir(sources)).filter(name => name.endsWith('.mjs') && name !== 'kit.mjs').sort();
let failed = 0;
for (const file of files) {
  const { default: template } = await import(pathToFileURL(join(sources, file)).href);
  if (only.length && !only.includes(template.id)) continue;
  try {
    const composition = template.build();
    const loaded = loadComposition(composition);                       // the defaults must make a valid video
    const missing = unsupportedFeatures(loaded);                       // and one the React view can draw
    if (missing.length) throw new Error(`the React view cannot draw: ${missing.join(', ')}`);
    const dir = join(target, template.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'composition.json'), JSON.stringify(composition, null, 2) + '\n');
    await writeFile(join(dir, 'template.json'), JSON.stringify(template.meta, null, 2) + '\n');
    if (template.data) await writeFile(join(dir, 'data.example.json'), JSON.stringify(template.data, null, 2) + '\n');
    console.log(`  ${template.id.padEnd(20)} ${loaded.width}x${loaded.height}  ${(loaded.durationFrames / loaded.fps).toFixed(1)} s  ${loaded.scenes.length} scenes`);
  } catch (error) {
    failed++;
    console.error(`  ${file}: ${error instanceof Error ? error.message : error}`);
  }
}
if (failed) { console.error(`${failed} template${failed === 1 ? '' : 's'} failed`); process.exit(1); }
