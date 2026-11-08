import { useState } from 'react';
import { api, type Asset, type StockResult, type StockSearch } from '../api';
import { Button, CheckIcon, FilmIcon, Notice, PlusIcon, SearchIcon, Spinner, useUi } from '../ui';
import { useStockStatus } from './StockConnection';

type Kind = 'photo' | 'video';
const SITES: Record<string, { name: string; url: string; line: string }> = {
  pexels: { name: 'Pexels', url: 'https://www.pexels.com', line: 'Photos and video provided by' },
  pixabay: { name: 'Pixabay', url: 'https://pixabay.com', line: 'Images and videos from' },
};
const fileName = (result: StockResult) => `${result.provider}-${result.id}${result.ext}`;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;

/** Free photos and video from the libraries the person has connected. Adding one puts it in the project's own files, with its credit. */
export function StockSearchPanel({ projectId, assets, reload, setNote, onAdded }: {
  projectId: string;
  assets: Asset[];
  reload: (keepFrame: boolean) => Promise<void>;
  setNote: (note: string) => void;
  onAdded: () => void;
}) {
  const { toast } = useUi();
  const { status, error: statusError } = useStockStatus();
  const [provider, setProvider] = useState('');
  const [kind, setKind] = useState<Kind>('photo');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState('');
  const [found, setFound] = useState<StockResult[] | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');
  const [adding, setAdding] = useState<string | null>(null);

  if (statusError) return <Notice tone="error" title="Could not load your stock connections">{statusError}</Notice>;
  if (!status) return <div className="media-loading"><Spinner size={18} /></div>;

  const connected = status.providers.filter(item => item.connected);
  if (!connected.length) {
    return (
      <Notice tone="neutral" title="Connect a stock library">
        <p style={{ margin: '4px 0 12px' }}>Search free photos and video from Pexels or Pixabay without leaving the editor. Each gives you a free key; add it once in Settings.</p>
        <a className="btn primary sm" href="#/settings">Open Settings</a>
      </Notice>
    );
  }
  const active = connected.some(item => item.id === provider) ? provider : connected[0]!.id;
  const site = SITES[active]!;

  const run = async (next: { provider: string; kind: Kind; q: string; page: number }) => {
    setLoading(true); setProblem('');
    try {
      const reply = await api<StockSearch>(`/api/stock/search?provider=${next.provider}&kind=${next.kind}&q=${encodeURIComponent(next.q)}&page=${next.page}`);
      setFound(current => (next.page > 1 && current ? [...current, ...reply.results] : reply.results));
      setMore(reply.hasMore); setPage(next.page); setSearched(next.q);
    } catch (cause) {
      setProblem((cause as Error).message);
      if (next.page === 1) setFound(null);
    } finally {
      setLoading(false);
    }
  };
  const submit = (event: { preventDefault(): void }) => { event.preventDefault(); if (query.trim().length >= 2) void run({ provider: active, kind, q: query.trim(), page: 1 }); };
  const switchTo = (change: { provider?: string; kind?: Kind }) => {
    const next = { provider: change.provider ?? active, kind: change.kind ?? kind };
    setProvider(next.provider); setKind(next.kind); setFound(null); setMore(false);
    if (searched) void run({ ...next, q: searched, page: 1 });
  };

  const add = async (result: StockResult) => {
    setAdding(fileName(result));
    try {
      await api('/api/stock/import', { id: projectId, provider: result.provider, stockId: result.id, kind: result.kind, file: result.file, ext: result.ext, author: result.author, authorUrl: result.authorUrl, pageUrl: result.pageUrl });
      toast(`Added to your files (credit: ${result.author})`, 'success');
      setNote('Stock file added');
      await reload(true);
      onAdded();
    } catch (cause) {
      toast((cause as Error).message, 'error');
    } finally {
      setAdding(null);
    }
  };

  return (
    <>
      <form className="stock-form" onSubmit={submit}>
        <label className="disc-search">
          <SearchIcon size={15} />
          <input type="search" placeholder={kind === 'photo' ? 'Search photos, e.g. city at night' : 'Search video, e.g. ocean waves'} aria-label="Search stock" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <Button variant="primary" size="sm" type="submit" loading={loading && page === 1} disabled={query.trim().length < 2}>Search</Button>
      </form>
      <div className="stock-filters">
        <div className="segmented" role="tablist" aria-label="Kind">
          {(['photo', 'video'] as const).map(item => (
            <button key={item} role="tab" aria-selected={kind === item} className={kind === item ? 'on' : ''} onClick={() => switchTo({ kind: item })}>{item === 'photo' ? 'Photos' : 'Video'}</button>
          ))}
        </div>
        {connected.length > 1 ? (
          <div className="segmented" role="tablist" aria-label="Library">
            {connected.map(item => (
              <button key={item.id} role="tab" aria-selected={active === item.id} className={active === item.id ? 'on' : ''} onClick={() => switchTo({ provider: item.id })}>{item.label}</button>
            ))}
          </div>
        ) : null}
      </div>
      {connected.length < status.providers.length ? <p className="stock-hint">Another library can be connected in <a href="#/settings">Settings</a>.</p> : null}
      {problem ? <Notice tone="error" title="Search did not work">{problem}</Notice> : null}

      {found === null ? (
        loading ? <div className="media-loading"><Spinner size={18} /></div> : problem ? null : <p className="sub">Free to use, including in commercial videos. Adding a file keeps its credit with it.</p>
      ) : found.length === 0 ? (
        <p className="sub">Nothing found for “{searched}”. Try different words.</p>
      ) : (
        <>
          <div className="media-grid">
            {found.map(result => {
              const name = fileName(result), have = assets.some(asset => asset.name === name), busy = adding === name;
              return (
                <div className="media-card" key={`${result.provider}-${result.kind}-${result.id}`}>
                  <div className="media-thumb">
                    {result.thumb ? <img src={result.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="media-icon"><FilmIcon size={26} /></span>}
                    {result.kind === 'video' && result.duration ? <span className="stock-duration">{clock(result.duration)}</span> : null}
                  </div>
                  <div className="media-info">
                    <b title={result.author}>{result.author}</b>
                    <small>{result.kind === 'video' ? 'video' : 'photo'}{result.width ? ` · ${result.width}×${result.height}` : ''}</small>
                  </div>
                  <div className="media-actions">
                    {have ? (
                      <Button size="sm" variant="ghost" icon={<CheckIcon size={13} />} disabled>In your files</Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon={<PlusIcon size={13} />} loading={busy} disabled={adding !== null} onClick={() => void add(result)}>Add</Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {more ? <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}><Button variant="secondary" size="sm" loading={loading} onClick={() => void run({ provider: active, kind, q: searched, page: page + 1 })}>More results</Button></div> : null}
        </>
      )}
      <p className="stock-credit">{site.line} <a href={site.url} target="_blank" rel="noreferrer noopener">{site.name}</a></p>
    </>
  );
}
