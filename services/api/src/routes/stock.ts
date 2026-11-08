import { parseRequest, stockClearRequest, stockImportRequest, stockSettingsRequest } from '@ove/contracts';
import { textOf } from '@ove/jobs';
import { STOCK_PROVIDERS, type StockProviderId } from '@ove/storage';
import { defaultStockOptions, downloadStock, searchStock, STOCK_KEY_URLS, STOCK_LABELS, STOCK_LICENSES, type StockKind, type StockOptions } from '../stock';
import type { Ctx, Route } from '../types';

const PHOTO_EXTS = ['.jpg', '.jpeg', '.png', '.webp'], VIDEO_EXTS = ['.mp4', '.webm', '.mov'];

/** Stock pictures and video: each person's own keys, searching, and bringing a result into a project with its credit. */
export function stockRoutes(): Route[] {
  const keys = (c: Ctx) => { if (!c.deps.stockSettings) throw new Error('This server does not keep stock keys'); return c.deps.stockSettings; };
  const options = (c: Ctx): StockOptions => ({ ...defaultStockOptions, ...c.deps.stock });
  const providerOf = (value: unknown): StockProviderId => {
    if (!STOCK_PROVIDERS.includes(value as StockProviderId)) throw new Error('Choose Pexels or Pixabay');
    return value as StockProviderId;
  };
  const status = (c: Ctx) => {
    const view = keys(c).view(c.who);
    return { providers: STOCK_PROVIDERS.map(id => ({ id, label: STOCK_LABELS[id], keyUrl: STOCK_KEY_URLS[id], ...view[id] })) };
  };

  return [
    { method: 'GET', path: '/api/stock/settings', handle: async c => c.json(200, status(c)) },
    { method: 'POST', path: '/api/stock/settings', handle: async c => {
      const request = parseRequest(stockSettingsRequest, await c.body()), apiKey = request.apiKey.trim();
      // One small search with the key, so a wrong key shows up here and not on the first real search.
      await searchStock(request.provider, apiKey, { q: 'nature', kind: 'photo', page: 1, perPage: 3 }, options(c), true);
      keys(c).set(c.who, request.provider, apiKey);
      c.json(200, status(c));
    } },
    { method: 'POST', path: '/api/stock/clear', handle: async c => {
      keys(c).clear(c.who, parseRequest(stockClearRequest, await c.body()).provider);
      c.json(200, status(c));
    } },
    { method: 'GET', path: '/api/stock/search', handle: async c => {
      const provider = providerOf(c.url.searchParams.get('provider')), label = STOCK_LABELS[provider];
      const q = (c.url.searchParams.get('q') ?? '').trim(), kind = c.url.searchParams.get('kind') === 'video' ? 'video' : 'photo' as StockKind;
      if (q.length < 2) throw new Error('Type at least two letters to search');
      if (q.length > 100) throw new Error('That search is too long');
      const page = Math.min(50, Math.max(1, Math.floor(Number(c.url.searchParams.get('page')) || 1)));
      const apiKey = keys(c).get(c.who)[provider];
      if (!apiKey) return c.json(409, { error: `Connect ${label} in Settings first`, code: 'not_connected' });
      c.json(200, await searchStock(provider, apiKey, { q, kind, page }, options(c)));
    } },
    { method: 'POST', path: '/api/stock/import', handle: async c => {
      const request = parseRequest(stockImportRequest, await c.body()), id = textOf(request.id, 'project'), use = options(c);
      c.deps.store.projectDir(c.who, id);
      if (!await c.deps.store.projectExists(c.who, id)) throw new Error(`There is no project "${id}"`);
      // Every address is checked first, even for a file already here: the credit is shown as links, so its addresses must be the libraries' own pages like the file itself.
      use.allowDownload(new URL(request.file));
      use.allowDownload(new URL(request.pageUrl));
      if (request.authorUrl) use.allowDownload(new URL(request.authorUrl));
      const ext = request.ext.toLowerCase();
      if (!(request.kind === 'photo' ? PHOTO_EXTS : VIDEO_EXTS).includes(ext)) throw new Error('That kind of file cannot be added');
      const name = `${request.provider}-${request.stockId}${ext}`;
      const existing = (await c.deps.store.assets(c.who, id)).find(asset => asset.name === name);
      if (existing) return c.json(200, { assets: await c.deps.store.assets(c.who, id), added: false, name });
      const bytes = await downloadStock(request.file, use);
      await c.deps.quotas?.beforeUpload(c.who, bytes.length);
      const credit = { provider: request.provider, author: request.author, ...(request.authorUrl ? { authorUrl: request.authorUrl } : {}), pageUrl: request.pageUrl, license: STOCK_LICENSES[request.provider] };
      c.json(200, { assets: await c.deps.store.putAsset(c.who, id, name, bytes, credit), added: true, name });
    } },
  ];
}
