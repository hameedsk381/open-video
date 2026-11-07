// `mr script`: the content block travels on its own. A script can be read out of a video, reviewed or translated, and put
// back — and an imported script is checked against the same evidence rules a generated one is, so a claim cannot arrive
// without the quote that backs it.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { contentSchema, loadComposition, type VideoContent } from '@ove/schema';

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };

const seconds = (value: number | undefined) => value === undefined ? '' : ` (${value.toFixed(1)} s)`;

/** A readable script: what is said, what is shown, and where every figure came from. */
export function scriptMarkdown(name: string, content: VideoContent): string {
  const lines = [`# ${name}${content.promise ? `: ${content.promise}` : ''}`, ''];
  if (content.audience) lines.push(`Audience: ${content.audience}`);
  if (content.cta) lines.push(`Call to action: ${content.cta}`);
  if (content.audience || content.cta) lines.push('');
  content.beats.forEach((beat, index) => {
    lines.push(`## ${index + 1}. ${beat.name}${seconds(beat.seconds)}`);
    if (beat.narration) lines.push(`Says: ${beat.narration}`);
    lines.push(`Shows: ${beat.onScreen}`);
    if (beat.claim) lines.push(`Claim: ${beat.claim}${beat.sourceIds.length ? ` [${beat.sourceIds.join(', ')}]` : ''}`);
    for (const datum of beat.data) lines.push(`Data: ${[datum.value, datum.unit].filter(Boolean).join(' ')} ${datum.label}${datum.period ? `, ${datum.period}` : ''}${datum.sourceIds.length ? ` [${datum.sourceIds.join(', ')}]` : ''}`);
    lines.push('');
  });
  if (content.sources.length) {
    lines.push('## Sources', '');
    for (const source of content.sources) {
      lines.push(`- ${source.id}: ${source.title ?? 'untitled'}${source.publisher ? `, ${source.publisher}` : ''}${source.url ? ` — ${source.url}` : ''}${source.retrievedAt ? ` (read ${source.retrievedAt})` : ''}`);
      if (source.quote) lines.push(`  "${source.quote}"`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Reads an imported script and refuses one whose claims or figures are not backed by its quotes. */
export function readScript(raw: unknown): VideoContent {
  const parsed = contentSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`The script cannot be used:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || 'content'}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

export async function runScript(argv: string[]): Promise<number> {
  const file = argv[1];
  if (!file || file.startsWith('--')) throw new Error('Usage: mr script <composition.json> [--output script.md|script.json] [--json]\n   or: mr script <composition.json> --set script.json');
  const path = resolve(file);
  const raw = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));

  const set = option(argv, '--set');
  if (set) {
    const content = readScript(JSON.parse((await readFile(resolve(set), 'utf8')).replace(/^\uFEFF/, '')));
    const next = { ...raw, content };
    loadComposition(next);                                  // the whole video must still be valid, not just the script
    await writeFile(path, JSON.stringify(next, null, 2) + '\n');
    console.log(`Updated ${path} with ${content.beats.length} beat${content.beats.length === 1 ? '' : 's'} and ${content.sources.length} source${content.sources.length === 1 ? '' : 's'} from ${resolve(set)}`);
    return 0;
  }

  const composition = loadComposition(raw);
  if (!composition.content) throw new Error(`${path} has no content script. "mr ai compose" writes one; --set script.json adds a written script.`);
  const content = composition.content;
  const output = option(argv, '--output');
  const asJson = Boolean(output && /\.json$/i.test(output)) || (!output && argv.includes('--json'));
  const text = asJson ? JSON.stringify(content, null, 2) + '\n' : scriptMarkdown(composition.name, content);
  if (output) {
    await writeFile(resolve(output), text);
    console.log(`Wrote ${asJson ? 'script JSON' : 'script'} to ${resolve(output)} (${content.beats.length} beats, ${content.sources.length} sources)`);
  } else process.stdout.write(text);
  return 0;
}
