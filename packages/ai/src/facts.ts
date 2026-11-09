// Real facts for explainer scripts, from a few public APIs with no key: Wikipedia (what a thing is), the World Bank (country figures) and
// Frankfurter (exchange rates, from the European Central Bank). A script's numbers should come from here, not from a model's memory.
//
// This is a fixed list of lookups, never a URL a person or a model supplies: every request goes to one of three known hosts, the parts that
// come from outside are encoded into the path, replies are size- and time-limited, and one lookup failing never stops the others.
import { z } from 'zod';
import { extractJson } from './json';
import type { AiProvider } from './providers';

/** One checked statement, with where it came from and when, ready to hand to the script writer (and to be kept with the script). */
export type Fact = { text: string; source: string; url: string; date: string };

export const factIndicators = {
  population: { id: 'SP.POP.TOTL', label: 'Population', kind: 'count' },
  gdp: { id: 'NY.GDP.MKTP.CD', label: 'GDP', kind: 'usd' },
  gdp_per_capita: { id: 'NY.GDP.PCAP.CD', label: 'GDP per person', kind: 'usd' },
  life_expectancy: { id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth', kind: 'years' },
  internet_users: { id: 'IT.NET.USER.ZS', label: 'People using the internet', kind: 'percent' },
  inflation: { id: 'FP.CPI.TOTL.ZG', label: 'Yearly consumer price inflation', kind: 'percent' },
  unemployment: { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment', kind: 'percent' },
  urban_population: { id: 'SP.URB.TOTL.IN.ZS', label: 'People living in cities', kind: 'percent' },
} as const;
export type FactIndicator = keyof typeof factIndicators;
const indicatorNames = Object.keys(factIndicators) as [FactIndicator, ...FactIndicator[]];

const text = (max: number) => z.string().trim().min(1).max(max);
export const lookupSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wikipedia'), topic: text(80) }),
  z.object({ type: z.literal('country'), countries: z.array(text(60)).min(1).max(5), indicator: z.enum(indicatorNames) }),
  z.object({ type: z.literal('exchange'), base: z.string().trim().regex(/^[A-Za-z]{3}$/), quotes: z.array(z.string().trim().regex(/^[A-Za-z]{3}$/)).min(1).max(5) }),
]);
export type Lookup = z.infer<typeof lookupSchema>;

const HOSTS = new Set(['en.wikipedia.org', 'api.worldbank.org', 'api.frankfurter.dev']);
const AGENT = 'MotionRender/1.0 (https://motionrender.io; explainer fact lookup)';
// The World Bank answers in anything from a fifth of a second to several seconds, so a request gets 20 s and one more try.
const MAX_BYTES = 1_500_000, TIMEOUT_MS = 20_000;

export type FactsOptions = { fetch?: typeof fetch; signal?: AbortSignal; now?: () => Date };

async function getJson(url: string, options: FactsOptions, attempt = 1): Promise<unknown> {
  const host = new URL(url).hostname;
  if (!HOSTS.has(host)) throw new Error(`${host} is not a source this lookup may use`);
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
  try {
    const response = await (options.fetch ?? fetch)(url, { signal, redirect: 'error', headers: { 'user-agent': AGENT, accept: 'application/json' } });
    if (response.status >= 500 && attempt < 2) return getJson(url, options, attempt + 1);
    if (!response.ok) throw new Error(`${host} answered ${response.status}`);
    const body = await response.text();
    if (body.length > MAX_BYTES) throw new Error(`${host} sent more than ${MAX_BYTES} bytes`);
    return JSON.parse(body);
  } catch (error) {
    if (attempt < 2 && !options.signal?.aborted && (error as Error).name === 'TimeoutError') return getJson(url, options, attempt + 1);
    throw error;
  }
}

const compact = (value: number): string => {
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2).replace(/\.?0+$/, '')} trillion`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2).replace(/\.?0+$/, '')} billion`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(2).replace(/\.?0+$/, '')} million`;
  return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
};

function formatValue(kind: typeof factIndicators[FactIndicator]['kind'], value: number): string {
  switch (kind) {
    case 'usd': return `US$ ${compact(value)}`;
    case 'percent': return `${value.toFixed(1)}%`;
    case 'years': return `${value.toFixed(1)} years`;
    default: return compact(value);
  }
}

type WbCountry = { id: string; iso2Code: string; name: string; region?: { value?: string } };
let countryList: Promise<WbCountry[]> | undefined;
async function countries(options: FactsOptions): Promise<WbCountry[]> {
  if (options.fetch) return loadCountries(options); // a caller's own fetch (tests) is not cached with the real one
  return (countryList ??= loadCountries(options).catch(error => { countryList = undefined; throw error; }));
}
async function loadCountries(options: FactsOptions): Promise<WbCountry[]> {
  const reply = await getJson('https://api.worldbank.org/v2/country?format=json&per_page=400', options) as [unknown, WbCountry[]?];
  return (reply[1] ?? []).filter(country => country.region?.value && !/aggregates/i.test(country.region.value));
}

/** A country by name, two- or three-letter code ("India", "in", "IND"); aggregates such as "World" or "Euro area" are not countries here. */
export async function findCountry(name: string, options: FactsOptions = {}): Promise<WbCountry | undefined> {
  const wanted = name.trim().toLowerCase(), list = await countries(options);
  return list.find(country => country.name.toLowerCase() === wanted || country.iso2Code.toLowerCase() === wanted || country.id.toLowerCase() === wanted)
    ?? list.find(country => country.name.toLowerCase().startsWith(wanted) && wanted.length >= 4);
}

async function wikipedia(topic: string, options: FactsOptions): Promise<Fact[]> {
  const found = await getJson(`https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=${encodeURIComponent(topic)}`, options) as [string, string[]?];
  const title = found[1]?.[0];
  if (!title) throw new Error(`Wikipedia has no page for "${topic}"`);
  const page = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, options) as { extract?: string; type?: string; content_urls?: { desktop?: { page?: string } }; timestamp?: string };
  if (page.type === 'disambiguation' || !page.extract) throw new Error(`Wikipedia's page for "${title}" has no summary to use`);
  return [{ text: page.extract.trim().slice(0, 900), source: `Wikipedia: ${title}`, url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, date: (page.timestamp ?? '').slice(0, 10) }];
}

async function countryFigures(names: string[], indicator: FactIndicator, options: FactsOptions): Promise<Fact[]> {
  const info = factIndicators[indicator], found = await Promise.all(names.map(async name => ({ name, country: await findCountry(name, options) })));
  const known = found.filter((item): item is { name: string; country: WbCountry } => item.country !== undefined);
  if (!known.length) throw new Error(`No country named ${names.map(name => `"${name}"`).join(', ')}`);
  const codes = known.map(item => item.country.iso2Code).join(';'), year = (options.now?.() ?? new Date()).getFullYear();
  const reply = await getJson(`https://api.worldbank.org/v2/country/${codes}/indicator/${info.id}?format=json&per_page=200&date=${year - 6}:${year}`, options) as [unknown, { country: { id: string; value: string }; date: string; value: number | null }[]?];
  const url = `https://data.worldbank.org/indicator/${info.id}`;
  // The latest year that has a figure, for each country: the newest years are often still empty.
  const latest = new Map<string, { country: { id: string; value: string }; date: string; value: number | null }>();
  for (const row of reply[1] ?? []) if (typeof row.value === 'number' && (latest.get(row.country.id)?.date ?? '') < row.date) latest.set(row.country.id, row);
  return [...latest.values()].map(row => ({
    text: `${row.country.value}, ${info.label.toLowerCase()}: ${formatValue(info.kind, row.value!)} (${row.date})`, source: 'World Bank, World Development Indicators', url, date: row.date,
  }));
}

async function exchange(base: string, quotes: string[], options: FactsOptions): Promise<Fact[]> {
  const reply = await getJson(`https://api.frankfurter.dev/v1/latest?base=${base.toUpperCase()}&symbols=${quotes.map(quote => quote.toUpperCase()).join(',')}`, options) as { base: string; date: string; rates: Record<string, number> };
  return Object.entries(reply.rates ?? {}).map(([quote, rate]) => ({ text: `1 ${reply.base} = ${rate} ${quote} on ${reply.date}`, source: 'European Central Bank, via Frankfurter', url: 'https://frankfurter.dev', date: reply.date }));
}

/** Runs every lookup; the facts that came back, and a plain note for each lookup that did not. */
export async function gatherFacts(lookups: Lookup[], options: FactsOptions = {}): Promise<{ facts: Fact[]; notes: string[] }> {
  const results = await Promise.all(lookups.map(async lookup => {
    try {
      const facts = lookup.type === 'wikipedia' ? await wikipedia(lookup.topic, options)
        : lookup.type === 'country' ? await countryFigures(lookup.countries, lookup.indicator, options)
        : await exchange(lookup.base, lookup.quotes, options);
      return { facts, note: facts.length ? undefined : `No figures came back for ${JSON.stringify(lookup)}` };
    } catch (error) {
      return { facts: [] as Fact[], note: `Could not look up ${lookup.type} (${(error as Error).message})` };
    }
  }));
  return { facts: results.flatMap(result => result.facts), notes: results.flatMap(result => (result.note ? [result.note] : [])) };
}

/** Asks the model which lookups would help with a brief. It names topics only; everything that is fetched comes from the fixed list above. */
export async function planLookups(provider: AiProvider, brief: string, options: { max?: number; signal?: AbortSignal } = {}): Promise<{ lookups: Lookup[]; notes: string[] }> {
  const max = Math.max(1, Math.min(options.max ?? 5, 8));
  const system = [
    'You choose which public facts to look up before a short explainer video is written. Reply with one JSON object and nothing else, {"lookups":[...]}, at most ' + max + ' items in the list, each one of:',
    '{"type":"wikipedia","topic":"the name of the thing to explain"}: a summary of what it is. Usually one or two.',
    `{"type":"country","countries":["India","Brazil"],"indicator":"${indicatorNames.join('|')}"}: the latest World Bank figure for up to five countries. Only when the video compares or describes countries.`,
    '{"type":"exchange","base":"USD","quotes":["INR","EUR"]}: today\'s exchange rates. Only when the video is about currencies or prices abroad.',
    'Choose only lookups that clearly help. For a topic with no numbers or no countries, return just the wikipedia lookups. Return {"lookups":[]} if none would help.',
  ].join('\n');
  const reply = await provider.chat([{ role: 'system', content: system }, { role: 'user', content: brief }], { signal: options.signal });
  const notes: string[] = [];
  let raw: unknown;
  try { raw = extractJson(reply); } catch { return { lookups: [], notes: ['The model did not name any lookups in a form that could be read'] }; }
  const lookups: Lookup[] = [];
  const list = (raw as { lookups?: unknown } | null)?.lookups;
  for (const item of Array.isArray(list) ? list.slice(0, max) : []) {
    const parsed = lookupSchema.safeParse(item);
    if (parsed.success) lookups.push(parsed.data); else notes.push(`Skipped a lookup the list does not offer: ${JSON.stringify(item).slice(0, 120)}`);
  }
  return { lookups, notes };
}

/** The brief's lookups, planned and fetched: what the script writer is given. */
export async function researchFacts(provider: AiProvider, brief: string, options: FactsOptions & { max?: number } = {}): Promise<{ facts: Fact[]; notes: string[] }> {
  const planned = await planLookups(provider, brief, { max: options.max, signal: options.signal });
  if (!planned.lookups.length) return { facts: [], notes: planned.notes };
  const gathered = await gatherFacts(planned.lookups, options);
  return { facts: gathered.facts, notes: [...planned.notes, ...gathered.notes] };
}
