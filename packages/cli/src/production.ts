// `mr production`: the manifest stage. validate checks a production the way the renderer will read it — every
// character, prop and asset reference resolved, every shot linked to a beat that exists — and compile turns the shot
// list into a composition.json the existing still/review/render commands understand.
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { productionSchema, type Production } from '@ove/schema';
import { compileProduction, productionSummary } from '@ove/core';
import { assetNoteLines, collectAssetNotes } from './asset-notes';

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };

/** Reads a manifest and reports every broken reference at once, rather than failing on the first. */
export function readProduction(raw: unknown): Production {
  const parsed = productionSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`The production cannot be used:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || 'production'}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

export function summaryText(production: Production, assetLines: readonly string[] = []): string {
  const summary = productionSummary(production);
  const target = summary.targetSeconds === undefined ? '' : ` (brief: ${summary.targetSeconds} s)`;
  const lines = [
    `Valid production "${production.name}" (${production.productionType})`,
    `  ${summary.shots} shot${summary.shots === 1 ? '' : 's'} in ${summary.scenes.length} scene${summary.scenes.length === 1 ? '' : 's'}: ${summary.scenes.join(', ')}`,
    `  Runs ${summary.plannedSeconds.toFixed(1)} s${target}`,
    `  Cast: ${summary.characters} character${summary.characters === 1 ? '' : 's'}, ${summary.environments} environment${summary.environments === 1 ? '' : 's'}`,
    `  Footage: ${summary.readyShots} shot${summary.readyShots === 1 ? '' : 's'} ready, ${summary.pendingShots} still planned${summary.approvedShots ? `, ${summary.approvedShots} generated take${summary.approvedShots === 1 ? '' : 's'} approved` : ''}`,
    `  Script: ${summary.beats} beat${summary.beats === 1 ? '' : 's'}${summary.unusedBeats.length ? `, not rendered: ${summary.unusedBeats.join(', ')}` : ''}`,
  ];
  if (summary.targetSeconds !== undefined && Math.abs(summary.plannedSeconds - summary.targetSeconds) > 0.5) lines.push(`  The shot list and the brief disagree about length.`);
  const coverage = summary.coverage;
  if (coverage.total) {
    lines.push(`  Assets: ${coverage.approved} of ${coverage.total} required approved (${coverage.percent}%)${coverage.missing ? `, ${coverage.missing} missing` : ''}${coverage.candidate ? `, ${coverage.candidate} awaiting approval` : ''}`);
    for (const item of coverage.outstanding.slice(0, 6)) {
      const where = item.shotId ? `shot ${item.shotId}` : item.entityId ? item.entityId : item.beatId ? `beat ${item.beatId}` : '';
      lines.push(`    ${item.status}: ${item.role} for ${where} (${item.strategy})${item.instruction ? ` — ${item.instruction}` : ''}`);
    }
    if (coverage.outstanding.length > 6) lines.push(`    …and ${coverage.outstanding.length - 6} more`);
    if (coverage.beatsWithoutRequirements.length) lines.push(`  Beats with no asset requirement: ${coverage.beatsWithoutRequirements.join(', ')}`);
  }
  for (const line of assetLines) lines.push(`  ${line}`);
  return lines.join('\n') + '\n';
}

export async function runProduction(argv: string[]): Promise<number> {
  const sub = argv[1], file = argv[2];
  if (!sub || sub.startsWith('--') || !file || file.startsWith('--')) throw new Error('Usage: mr production validate <production.json>\n   or: mr production compile <production.json> [--output composition.json]');
  if (sub !== 'validate' && sub !== 'compile') throw new Error(`Unknown production command "${sub}"; use validate or compile`);

  const path = resolve(file);
  const production = readProduction(JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, '')));

  if (sub === 'validate') {
    const notes = await collectAssetNotes(production.assets, dirname(path));
    if (argv.includes('--json')) console.log(JSON.stringify({ ...productionSummary(production), assetNotes: notes }, null, 2));
    else process.stdout.write(summaryText(production, assetNoteLines(notes)));
    return 0;
  }

  const { composition, notes } = compileProduction(production);
  const output = resolve(option(argv, '--output') ?? `${dirname(path)}/composition.json`);
  if (output === path) throw new Error('--output must not overwrite the production manifest');
  await writeFile(output, JSON.stringify(composition, null, 2) + '\n');
  process.stdout.write(summaryText(production));
  console.log(`Compiled ${composition.scenes.length} scenes, ${composition.durationFrames} frames to ${output}`);
  for (const note of notes) console.log(`  note: ${note}`);
  return 0;
}
