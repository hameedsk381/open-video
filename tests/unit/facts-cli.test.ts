import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lookupsFrom, runFacts } from '../../packages/cli/src/facts';

// `mr facts` turns three short forms (or a file of lookups) into the fixed lookups, refuses anything else with the reason, and prints each fact
// with its source and date, or as JSON.
const json = (body: unknown) => new Response(JSON.stringify(body));
const stub = (async (url: string) => {
  if (url.includes('frankfurter')) return json({ base: 'USD', date: '2026-11-06', rates: { INR: 93.92 } });
  return new Response('{}', { status: 404 });
}) as unknown as typeof fetch;

afterEach(() => { vi.restoreAllMocks(); process.exitCode = undefined; });

describe('mr facts lookups', () => {
  it('reads the three short forms', async () => {
    expect(await lookupsFrom(['facts', 'wikipedia', 'Load balancing'])).toEqual([{ type: 'wikipedia', topic: 'Load balancing' }]);
    expect(await lookupsFrom(['facts', 'country', 'India, Brazil', 'gdp'])).toEqual([{ type: 'country', countries: ['India', 'Brazil'], indicator: 'gdp' }]);
    expect(await lookupsFrom(['facts', 'exchange', 'USD', 'INR,EUR'])).toEqual([{ type: 'exchange', base: 'USD', quotes: ['INR', 'EUR'] }]);
  });

  it('refuses what the list does not offer, naming the problem and the choices', async () => {
    await expect(lookupsFrom(['facts', 'country', 'India', 'secret_report'])).rejects.toThrow(/indicator[\s\S]*indicators: population, gdp/);
    await expect(lookupsFrom(['facts', 'exchange', 'DOLLARS', 'INR'])).rejects.toThrow(/Lookup 1 cannot be used/);
    await expect(lookupsFrom(['facts', 'http', 'http://169.254.169.254/'])).rejects.toThrow(/Usage:/);
    await expect(lookupsFrom(['facts'])).rejects.toThrow(/Usage:/);
  });

  it('reads a file of lookups, at most eight, and refuses an empty one', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-facts-'));
    try {
      const many = join(dir, 'many.json'), none = join(dir, 'none.json');
      await writeFile(many, JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ type: 'wikipedia', topic: `T${i}` }))));
      await writeFile(none, '[]');
      expect(await lookupsFrom(['facts', '--lookups', many])).toHaveLength(8);
      await expect(lookupsFrom(['facts', '--lookups', none])).rejects.toThrow(/at least one lookup/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});

describe('mr facts output', () => {
  it('prints each fact with its source, date and address, or as JSON', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args.join(' ')); });
    await runFacts(['facts', 'exchange', 'USD', 'INR'], { fetch: stub });
    expect(lines.join('\n')).toMatch(/- 1 USD = 93.92 INR on 2026-11-06\n {2}European Central Bank, via Frankfurter, 2026-11-06 {2}https:\/\/frankfurter\.dev/);

    lines.length = 0;
    await runFacts(['facts', 'exchange', 'USD', 'INR', '--json'], { fetch: stub });
    expect(JSON.parse(lines.join('\n')).facts[0]).toMatchObject({ source: 'European Central Bank, via Frankfurter', date: '2026-11-06' });
    expect(process.exitCode).toBeUndefined();
  });

  it('exits with an error, and says why, when nothing came back', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { errors.push(args.join(' ')); });
    await runFacts(['facts', 'wikipedia', 'Nothing here'], { fetch: stub });
    expect(errors.join('\n')).toMatch(/Could not look up wikipedia[\s\S]*No facts came back/);
    expect(process.exitCode).toBe(1);
  });

  it('lists the indicators', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { lines.push(args.join(' ')); });
    await runFacts(['facts', 'indicators']);
    expect(lines.join('\n')).toMatch(/population\s+Population\s+\(SP\.POP\.TOTL\)/);
    expect(lines).toHaveLength(8);
  });
});
