// Stock pictures and video from Pexels and Pixabay. A person connects their own free key in Settings; searches and downloads use it.
// Each library's results are turned into one shape here, so the rest of the studio does not care which one a file came from.
import type { StockProviderId } from '@ove/storage';

export type StockKind = 'photo' | 'video';
export type StockResult = {
  provider: StockProviderId; id: string; kind: StockKind;
  /** A small picture for the results list. */
  thumb: string; width: number; height: number; duration?: number;
  author: string; authorUrl?: string;
  /** The file's page at the library: where it is credited to. */
  pageUrl: string;
  /** The file to download, and its extension. */
  file: string; ext: string;
};
export type StockPage = { results: StockResult[]; page: number; hasMore: boolean; total?: number };
export type StockOptions = {
  /** Where each library's API lives (tests point these at a stand-in). */
  bases: Record<StockProviderId, string>;
  fetch: typeof fetch;
  /** Throws unless a file may be downloaded from this address. */
  allowDownload(url: URL): void;
};

export const STOCK_LABELS: Record<StockProviderId, string> = { pexels: 'Pexels', pixabay: 'Pixabay' };
export const STOCK_KEY_URLS: Record<StockProviderId, string> = { pexels: 'https://www.pexels.com/api/', pixabay: 'https://pixabay.com/api/docs/' };
export const STOCK_LICENSES: Record<StockProviderId, string> = { pexels: 'Pexels License', pixabay: 'Pixabay Content License' };

const onSite = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

/** Files and pages are taken only from the libraries' own sites, over https: the server never fetches an address a person made up. */
export function allowStockUrl(url: URL): void {
  const ok = url.protocol === 'https:' && !url.port && !url.username && (onSite(url.hostname, 'pexels.com') || onSite(url.hostname, 'pixabay.com'));
  if (!ok) throw new Error('Files can only come from Pexels or Pixabay');
}

export const defaultStockOptions: StockOptions = {
  bases: { pexels: 'https://api.pexels.com', pixabay: 'https://pixabay.com' },
  fetch: (input, init) => fetch(input, init),
  allowDownload: allowStockUrl,
};

const extOf = (url: string, allowed: string[], fallback: string) => {
  try { const ext = /\.[a-z0-9]+$/i.exec(new URL(url).pathname)?.[0].toLowerCase(); return ext && allowed.includes(ext) ? ext : fallback; } catch { return fallback; }
};
const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'], VIDEO_EXTS = ['.mp4', '.webm', '.mov'];
const str = (value: unknown) => (typeof value === 'string' ? value : '');
const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);

function pexelsPhoto(hit: any): StockResult | undefined {
  const file = str(hit?.src?.large2x) || str(hit?.src?.large) || str(hit?.src?.original);
  if (!file) return undefined;
  return { provider: 'pexels', id: String(hit.id), kind: 'photo', thumb: str(hit.src.medium) || str(hit.src.small) || file, width: num(hit.width), height: num(hit.height),
    author: str(hit.photographer) || 'Unknown', ...(str(hit.photographer_url) ? { authorUrl: str(hit.photographer_url) } : {}), pageUrl: str(hit.url), file, ext: extOf(file, PHOTO_EXTS, '.jpg') };
}

function pexelsVideo(hit: any): StockResult | undefined {
  // The largest mp4 that still fits Full HD on its short side: sharp enough for a 1080 canvas without a huge download.
  const files = list(hit?.video_files).filter(item => str(item?.link) && (!str(item.file_type) || str(item.file_type) === 'video/mp4'));
  const short = (item: any) => Math.min(num(item.width), num(item.height));
  const fits = files.filter(item => short(item) <= 1080).sort((a, b) => short(b) - short(a));
  const pick = fits[0] ?? files.sort((a, b) => short(a) - short(b))[0];
  if (!pick) return undefined;
  return { provider: 'pexels', id: String(hit.id), kind: 'video', thumb: str(hit.image), width: num(pick.width) || num(hit.width), height: num(pick.height) || num(hit.height), duration: num(hit.duration),
    author: str(hit.user?.name) || 'Unknown', ...(str(hit.user?.url) ? { authorUrl: str(hit.user.url) } : {}), pageUrl: str(hit.url), file: str(pick.link), ext: extOf(str(pick.link), VIDEO_EXTS, '.mp4') };
}

function pixabayPhoto(hit: any): StockResult | undefined {
  const file = str(hit?.largeImageURL) || str(hit?.webformatURL);
  if (!file) return undefined;
  return { provider: 'pixabay', id: String(hit.id), kind: 'photo', thumb: str(hit.webformatURL) || str(hit.previewURL) || file, width: num(hit.imageWidth) || num(hit.webformatWidth), height: num(hit.imageHeight) || num(hit.webformatHeight),
    author: str(hit.user) || 'Unknown', pageUrl: str(hit.pageURL), file, ext: extOf(file, PHOTO_EXTS, '.jpg') };
}

function pixabayVideo(hit: any): StockResult | undefined {
  const sizes = hit?.videos ?? {};
  const pick = ['large', 'medium', 'small', 'tiny'].map(name => sizes[name]).find(item => str(item?.url));
  if (!pick) return undefined;
  const thumb = ['medium', 'small', 'tiny', 'large'].map(name => str(sizes[name]?.thumbnail)).find(Boolean) ?? '';
  return { provider: 'pixabay', id: String(hit.id), kind: 'video', thumb, width: num(pick.width), height: num(pick.height), duration: num(hit.duration),
    author: str(hit.user) || 'Unknown', pageUrl: str(hit.pageURL), file: str(pick.url), ext: extOf(str(pick.url), VIDEO_EXTS, '.mp4') };
}

// Pixabay asks that results be kept for a day; Pexels has no such rule, so its results are kept briefly. Neither depends on whose key asked.
const cache = new Map<string, { at: number; page: StockPage }>();
const TTL: Record<StockProviderId, number> = { pexels: 15 * 60_000, pixabay: 24 * 60 * 60_000 };

export type StockQuery = { q: string; kind: StockKind; page: number; perPage?: number };

/** Searches one library with a person's key. Throws a message fit to show when the key is refused, the limit is reached, or the library is down. */
export async function searchStock(provider: StockProviderId, apiKey: string, query: StockQuery, options: StockOptions = defaultStockOptions, fresh = false): Promise<StockPage> {
  const label = STOCK_LABELS[provider], perPage = query.perPage ?? 24;
  const cacheKey = `${provider}|${query.kind}|${query.page}|${perPage}|${query.q.toLowerCase()}`;
  const hit = cache.get(cacheKey);
  if (!fresh && hit && Date.now() - hit.at < TTL[provider]) return hit.page;

  const params = new URLSearchParams();
  let url: string, init: RequestInit = { signal: AbortSignal.timeout(15_000) };
  if (provider === 'pexels') {
    params.set('query', query.q); params.set('per_page', String(perPage)); params.set('page', String(query.page));
    url = `${options.bases.pexels}${query.kind === 'photo' ? '/v1/search' : '/v1/videos/search'}?${params}`;
    init = { ...init, headers: { Authorization: apiKey } };
  } else {
    params.set('key', apiKey); params.set('q', query.q); params.set('per_page', String(Math.max(3, perPage))); params.set('page', String(query.page)); params.set('safesearch', 'true');
    if (query.kind === 'photo') params.set('image_type', 'photo');
    url = `${options.bases.pixabay}${query.kind === 'photo' ? '/api/' : '/api/videos/'}?${params}`;
  }

  let response: Response;
  try { response = await options.fetch(url, init); } catch { throw new Error(`Could not reach ${label}. Check the connection and try again.`); }
  if (response.status === 401 || response.status === 403 || (provider === 'pixabay' && response.status === 400)) throw new Error(`${label} did not accept that key. Copy it again from your ${label} account.`);
  if (response.status === 429) throw new Error(`${label}'s search limit was reached. Try again in a little while.`);
  if (!response.ok) throw new Error(`${label} is not answering right now (HTTP ${response.status}).`);
  const body: any = await response.json().catch(() => ({}));

  const hits = list(provider === 'pexels' ? (query.kind === 'photo' ? body.photos : body.videos) : body.hits);
  const normalise = provider === 'pexels' ? (query.kind === 'photo' ? pexelsPhoto : pexelsVideo) : (query.kind === 'photo' ? pixabayPhoto : pixabayVideo);
  const results = hits.flatMap(item => { const one = normalise(item); return one ? [one] : []; });
  const total = num(provider === 'pexels' ? body.total_results : body.totalHits) || undefined;
  const hasMore = provider === 'pexels' ? Boolean(body.next_page) : (total !== undefined && query.page * perPage < total);
  const page: StockPage = { results, page: query.page, hasMore, ...(total !== undefined ? { total } : {}) };
  cache.set(cacheKey, { at: Date.now(), page });
  if (cache.size > 300) cache.delete(cache.keys().next().value!);
  return page;
}

/** Downloads one file from a library, never following a redirect off the libraries' own sites, and never more than `limit` bytes. */
export async function downloadStock(address: string, options: StockOptions = defaultStockOptions, limit = 150_000_000): Promise<Buffer> {
  let target: URL;
  try { target = new URL(address); } catch { throw new Error('That is not a file address'); }
  for (let hop = 0; hop < 4; hop++) {
    options.allowDownload(target);
    let response: Response;
    try { response = await options.fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(90_000) }); } catch { throw new Error('The download could not start. Try again.'); }
    const next = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && next) { target = new URL(next, target); continue; }
    if (!response.ok || !response.body) throw new Error(`The download failed (HTTP ${response.status})`);
    if (Number(response.headers.get('content-length')) > limit) throw new Error('That file is too large to add');
    const chunks: Buffer[] = []; let size = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error('That file is too large to add'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new Error('The download was sent around too many times');
}
