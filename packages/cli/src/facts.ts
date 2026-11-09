// `mr facts`: real, sourced facts for a script, for agents and people who work from the command line (the MCP tool does the same). The sources are
// a fixed list that needs no key: Wikipedia, the World Bank and exchange rates from the European Central Bank.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { factIndicators, gatherFacts, lookupSchema, type FactsOptions, type Lookup } from '@ove/ai';

const USAGE = `Usage:
  mr facts wikipedia "Load balancing"          what a thing is, from Wikipedia
  mr facts country India,Brazil population     the latest World Bank figure for up to 5 countries
  mr facts exchange USD INR,EUR                today's exchange rates (European Central Bank)
  mr facts indicators                          the figures the World Bank lookup offers
  mr facts --lookups lookups.json              several at once: [{"type":"wikipedia","topic":"..."}, ...]
Add --json for data. Every fact comes with its source and date: put them in the scene and in the script's "sources".`;

const option = (argv: string[], name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
const list = (value: string | undefined) => (value ?? '').split(',').map(item => item.trim()).filter(Boolean);

/** The lookups an invocation asks for, checked against the fixed list. */
export async function lookupsFrom(argv: string[]): Promise<Lookup[]> {
  const file = option(argv, '--lookups');
  const raw: unknown[] = file ? JSON.parse((await readFile(resolve(file), 'utf8')).replace(/^﻿/, '')) : (() => {
    const [, type, a, b] = argv;
    if (type === 'wikipedia') return [{ type, topic: a }];
    if (type === 'country') return [{ type, countries: list(a), indicator: b }];
    if (type === 'exchange') return [{ type, base: a, quotes: list(b) }];
    throw new Error(USAGE);
  })();
  if (!Array.isArray(raw) || !raw.length) throw new Error('The lookups file must be a list with at least one lookup');
  return raw.slice(0, 8).map((item, i) => {
    const parsed = lookupSchema.safeParse(item);
    if (!parsed.success) throw new Error(`Lookup ${i + 1} cannot be used:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || 'lookup'}: ${issue.message}`).join('\n')}\n(indicators: ${Object.keys(factIndicators).join(', ')})`);
    return parsed.data;
  });
}

export async function runFacts(argv: string[], options: FactsOptions = {}): Promise<void> {
  if (argv[1] === 'indicators') {
    const rows = Object.entries(factIndicators).map(([name, info]) => ({ name, label: info.label, id: info.id }));
    if (argv.includes('--json')) console.log(JSON.stringify(rows, null, 2)); else for (const row of rows) console.log(`${row.name.padEnd(17)} ${row.label}  (${row.id})`);
    return;
  }
  const lookups = await lookupsFrom(argv);
  const { facts, notes } = await gatherFacts(lookups, options);
  if (argv.includes('--json')) console.log(JSON.stringify({ facts, notes }, null, 2));
  else {
    for (const fact of facts) console.log(`- ${fact.text}\n  ${fact.source}${fact.date ? `, ${fact.date}` : ''}  ${fact.url}`);
    for (const note of notes) console.error(note);
    if (!facts.length) console.error('No facts came back.');
  }
  if (!facts.length) process.exitCode = 1;
}
