// `pnpm check:templates`: every shipped template is resolved and reviewed exactly as the renderer will see it, so the
// catalogue cannot regress into a layout that cuts text, hides copy under a platform's UI, or plays too quietly. A
// template's defaults are what every filled video inherits, so warnings fail the check just like errors; `info` findings
// (a note about deliberate choices such as mixed transitions) are printed but do not fail it.
//
//   pnpm check:templates                 # every template
//   pnpm check:templates slideshow       # only the named ones
//
// Needs FFmpeg, like the review itself. Exits non-zero when any template fails to validate or does not review clean.
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadComposition, reviewComposition } from '@ove/core';
import { readTemplate, templatesDir } from '../packages/cli/src/templates';

const only = process.argv.slice(2).filter(argument => !argument.startsWith('-'));
const ids = (await readdir(templatesDir, { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
const started = Date.now();
let clean = 0, failed = 0;

for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  // A folder without template.json is an ordinary project (the starter), not a catalogue entry.
  if (!(await stat(join(templatesDir, id, 'template.json')).then(() => true, () => false))) continue;

  let template;
  try {
    template = await readTemplate(id);
  } catch (error) {
    failed++;
    console.error(`✗ ${id}: ${(error as Error).message}`);
    continue;
  }

  const composition = loadComposition(template.composition);
  const review = await reviewComposition(composition, {
    baseDir: template.dir,
    allowCode: true,
    audio: true,
    every: Math.round(composition.fps),
    sheetFrames: 1,
  });
  const label = `${id} (${composition.width}×${composition.height}, ${(composition.durationFrames / composition.fps).toFixed(1)} s)`;
  const problems = review.issues.filter(issue => issue.severity !== 'info');
  if (!problems.length) {
    clean++;
    console.log(`✓ ${label}`);
    continue;
  }
  failed++;
  console.error(`✗ ${label}`);
  for (const issue of problems) {
    const where = [issue.frame === undefined ? '' : `frame ${issue.frame}`, issue.layer ?? ''].filter(Boolean).join(', ');
    console.error(`    ${issue.severity} [${issue.code}]${where ? ` ${where}` : ''}: ${issue.message}`);
  }
}

if (!clean && !failed) {
  console.error('No templates were found to check.');
  process.exit(1);
}
console.log(`\n${clean}/${clean + failed} templates clean in ${((Date.now() - started) / 1000).toFixed(1)} s.`);
if (failed) process.exit(1);
