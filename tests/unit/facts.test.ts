import { describe, expect, it } from 'vitest';
import { explainerPrompt, findCountry, gatherFacts, lookupSchema, planLookups, writeExplainer, type AiProvider, type Fact } from '@ove/ai';

// Real facts for explainer scripts come from three fixed public APIs. These tests run against stand-ins shaped like their real answers (captured
// from the live services), so they pin what is asked, what is kept, and how a lookup that fails is reported, without the network.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const countries = [{ id: 'IND', iso2Code: 'IN', name: 'India', region: { value: 'South Asia' } }, { id: 'BRA', iso2Code: 'BR', name: 'Brazil', region: { value: 'Latin America & Caribbean ' } },
  { id: 'USA', iso2Code: 'US', name: 'United States', region: { value: 'North America' } }, { id: 'WLD', iso2Code: '1W', name: 'World', region: { value: 'Aggregates' } }];
const row = (id: string, name: string, date: string, value: number | null) => ({ country: { id, value: name }, date, value });

function bank(rows: ReturnType<typeof row>[]) {
  const calls: string[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    expect(init?.redirect).toBe('error');
    expect((init?.headers as Record<string, string>)['user-agent']).toMatch(/MotionRender/);
    if (url.includes('/v2/country?')) return json([{}, countries]);
    if (url.includes('/indicator/')) return json([{}, rows]);
    if (url.includes('opensearch')) return json(['x', ['Load balancing (computing)']]);
    if (url.includes('page/summary')) return json({ type: 'standard', extract: 'Load balancing distributes work.', timestamp: '2026-09-11T10:00:00Z', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Load_balancing_(computing)' } } });
    if (url.includes('frankfurter')) return json({ base: 'USD', date: '2026-11-06', rates: { INR: 93.92, EUR: 0.89566 } });
    return json({}, 404);
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

describe('country lookups', () => {
  it('find a country by name or code, and never an aggregate such as "World"', async () => {
    const { fetch } = bank([]);
    expect((await findCountry('India', { fetch }))?.id).toBe('IND');
    expect((await findCountry('br', { fetch }))?.name).toBe('Brazil');
    expect((await findCountry('usa', { fetch }))?.name).toBe('United States');
    expect(await findCountry('World', { fetch })).toBeUndefined();
    expect(await findCountry('Atlantis', { fetch })).toBeUndefined();
  });

  it('keep the latest year that has a figure for each country, in words a script can use', async () => {
    const { fetch, calls } = bank([row('IN', 'India', '2025', 1463865525), row('IN', 'India', '2024', 1450935791), row('BR', 'Brazil', '2025', null), row('BR', 'Brazil', '2024', 212_000_000)]);
    const { facts, notes } = await gatherFacts([{ type: 'country', countries: ['India', 'Brazil'], indicator: 'population' }], { fetch, now: () => new Date('2026-11-09') });
    expect(notes).toEqual([]);
    expect(facts.map(fact => fact.text).sort()).toEqual(['Brazil, population: 212 million (2024)', 'India, population: 1.46 billion (2025)']);
    expect(facts[0]).toMatchObject({ source: 'World Bank, World Development Indicators', url: 'https://data.worldbank.org/indicator/SP.POP.TOTL' });
    expect(calls.find(url => url.includes('/indicator/'))).toContain('/country/IN;BR/indicator/SP.POP.TOTL?format=json&per_page=200&date=2020:2026');
  });

  it('format money, percentages and years', async () => {
    const run = async (indicator: 'gdp' | 'inflation' | 'life_expectancy', value: number) => (await gatherFacts([{ type: 'country', countries: ['India'], indicator }], { fetch: bank([row('IN', 'India', '2025', value)]).fetch })).facts[0]!.text;
    expect(await run('gdp', 3.956e12)).toBe('India, gdp: US$ 3.96 trillion (2025)'.replace('gdp', 'gdp'));
    expect(await run('inflation', 2.4)).toBe('India, yearly consumer price inflation: 2.4% (2025)');
    expect(await run('life_expectancy', 72.2)).toBe('India, life expectancy at birth: 72.2 years (2025)');
  });

  it('report an unknown country as a note, not a failure', async () => {
    const { facts, notes } = await gatherFacts([{ type: 'country', countries: ['Atlantis'], indicator: 'gdp' }], { fetch: bank([]).fetch });
    expect(facts).toEqual([]);
    expect(notes[0]).toMatch(/No country named "Atlantis"/);
  });
});

describe('Wikipedia and exchange lookups', () => {
  it('summarise the best matching page, with its address and date, putting the topic safely into the address', async () => {
    const { fetch, calls } = bank([]);
    const { facts } = await gatherFacts([{ type: 'wikipedia', topic: 'load balancer?&x=1/../' }], { fetch });
    expect(facts).toEqual([{ text: 'Load balancing distributes work.', source: 'Wikipedia: Load balancing (computing)', url: 'https://en.wikipedia.org/wiki/Load_balancing_(computing)', date: '2026-09-11' }]);
    expect(calls[0]).toContain('search=load%20balancer%3F%26x%3D1%2F..%2F');
    expect(calls[1]).toContain('/page/summary/Load_balancing_(computing)');
  });

  it('give one fact per currency, dated', async () => {
    const { facts } = await gatherFacts([{ type: 'exchange', base: 'usd', quotes: ['inr', 'eur'] }], { fetch: bank([]).fetch });
    expect(facts.map(fact => fact.text)).toEqual(['1 USD = 93.92 INR on 2026-11-06', '1 USD = 0.89566 EUR on 2026-11-06']);
    expect(facts[0]!.source).toMatch(/European Central Bank/);
  });
});

describe('a lookup that fails', () => {
  it('does not stop the others, and says what went wrong', async () => {
    const ok = bank([]).fetch;
    const fetch = (async (url: string, init?: RequestInit) => (url.includes('frankfurter') ? new Response('nope', { status: 404 }) : ok(url, init))) as typeof globalThis.fetch;
    const { facts, notes } = await gatherFacts([{ type: 'wikipedia', topic: 'cache' }, { type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch });
    expect(facts).toHaveLength(1);
    expect(notes).toEqual(['Could not look up exchange (api.frankfurter.dev answered 404)']);
  });

  it('is tried once more after a server error, but not after a refusal', async () => {
    let calls = 0;
    const flaky = (async () => (++calls === 1 ? new Response('busy', { status: 503 }) : json({ base: 'USD', date: '2026-11-06', rates: { INR: 93.92 } }))) as unknown as typeof fetch;
    expect((await gatherFacts([{ type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch: flaky })).facts).toHaveLength(1);
    expect(calls).toBe(2);
    let refused = 0;
    const no = (async () => { refused++; return new Response('no', { status: 403 }); }) as unknown as typeof fetch;
    expect((await gatherFacts([{ type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch: no })).notes[0]).toMatch(/403/);
    expect(refused).toBe(1);
  });
});

describe('a slow answer', () => {
  const rate = { base: 'USD', date: '2026-11-06', rates: { INR: 93.92 } };

  it('is raced by a second request after a short wait, and the first to answer wins', async () => {
    const signals: AbortSignal[] = [];
    const slowThenFast = (async (_url: string, init?: RequestInit) => {
      signals.push(init!.signal as AbortSignal);
      if (signals.length === 1) return new Promise<Response>((_ok, fail) => (init!.signal as AbortSignal).addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))));
      return json(rate);
    }) as unknown as typeof fetch;
    const { facts, notes } = await gatherFacts([{ type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch: slowThenFast, hedgeMs: 20 });
    expect(notes).toEqual([]);
    expect(facts).toHaveLength(1);
    expect(signals).toHaveLength(2);
    expect(signals[0]!.aborted).toBe(true); // the slow one was cancelled once the other answered
  });

  it('is not raced when the first answer is a plain failure', async () => {
    let calls = 0;
    const missing = (async () => { calls++; return new Response('no', { status: 404 }); }) as unknown as typeof fetch;
    const { notes } = await gatherFacts([{ type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch: missing, hedgeMs: 20 });
    await new Promise(done => setTimeout(done, 60));
    expect(notes[0]).toMatch(/404/);
    expect(calls).toBe(1);
  });

  it('does not start a second request when the first answers in time', async () => {
    let calls = 0;
    const quick = (async () => { calls++; return json(rate); }) as unknown as typeof fetch;
    await gatherFacts([{ type: 'exchange', base: 'USD', quotes: ['INR'] }], { fetch: quick, hedgeMs: 50 });
    await new Promise(done => setTimeout(done, 120));
    expect(calls).toBe(1);
  });
});

describe('planning the lookups', () => {
  const asks = (reply: string) => ({ id: 'fake', model: 'fake', chat: async () => reply }) as unknown as AiProvider;

  it('only offers lookups from the fixed list, and skips anything else the model comes up with', async () => {
    const reply = JSON.stringify({ lookups: [{ type: 'wikipedia', topic: 'Inflation' }, { type: 'country', countries: ['India'], indicator: 'population' }, { type: 'country', countries: ['India'], indicator: 'secret_report' },
      { type: 'http', url: 'http://169.254.169.254/latest' }, { type: 'exchange', base: 'DOLLARS', quotes: ['INR'] }] });
    const { lookups, notes } = await planLookups(asks(reply), 'Why do prices rise?');
    expect(lookups.map(lookup => lookup.type)).toEqual(['wikipedia', 'country']);
    expect(notes).toHaveLength(3);
  });

  it('keeps to the number asked for, and survives an answer that is not JSON', async () => {
    const many = JSON.stringify({ lookups: Array.from({ length: 9 }, (_, i) => ({ type: 'wikipedia', topic: `Topic ${i}` })) });
    expect((await planLookups(asks(many), 'x', { max: 3 })).lookups).toHaveLength(3);
    expect(await planLookups(asks('I think you should look up Wikipedia'), 'x')).toEqual({ lookups: [], notes: ['The model did not name any lookups in a form that could be read'] });
  });

  it('refuse a currency code or indicator the lists do not have', () => {
    expect(lookupSchema.safeParse({ type: 'exchange', base: 'USD', quotes: ['EURO'] }).success).toBe(false);
    expect(lookupSchema.safeParse({ type: 'country', countries: ['India'], indicator: 'gdp' }).success).toBe(true);
    expect(lookupSchema.safeParse({ type: 'country', countries: [], indicator: 'gdp' }).success).toBe(false);
  });
});

describe('the script writer with facts', () => {
  const facts: Fact[] = [{ text: 'India, population: 1.46 billion (2025)', source: 'World Bank, World Development Indicators', url: 'https://data.worldbank.org/indicator/SP.POP.TOTL', date: '2025' }];

  it('is told to state nothing as fact that is not in the list, and to name the source', () => {
    const system = explainerPrompt('Topic', { facts }).map(message => message.content).join('\n');
    expect(system).toContain('[1] India, population: 1.46 billion (2025) (World Bank, World Development Indicators, 2025)');
    expect(system).toMatch(/State no number, date or claim as fact unless it is here/);
    expect(explainerPrompt('Topic', {}).map(message => message.content).join('\n')).not.toContain('Facts you may use');
  });

  it('keeps the facts with the script it wrote, so the numbers can be checked', async () => {
    const provider = { id: 'fake', model: 'fake', chat: async () => JSON.stringify({ topic: 'T', scenes: [{ kind: 'stat', value: '1.46 B', label: 'people in India', note: 'World Bank, 2025' }] }) } as unknown as AiProvider;
    const { explainer } = await writeExplainer(provider, 'Population', { facts });
    expect(explainer.sources).toEqual(facts);
    expect((await writeExplainer(provider, 'Population')).explainer.sources).toEqual([]);
  });
});
