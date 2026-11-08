import { useCallback, useEffect, useState } from 'react';
import { api, type StockStatus } from '../api';
import { Badge, Button, Field, Notice, useUi } from '../ui';

/** The person's stock library connections: null while loading. */
export function useStockStatus() {
  const [status, setStatus] = useState<StockStatus | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => api<StockStatus>('/api/stock/settings').then(setStatus, cause => setError((cause as Error).message)), []);
  useEffect(() => { void reload(); }, [reload]);
  return { status, error, reload, set: setStatus };
}

/** Settings: connect Pexels and Pixabay with your own free keys, to search photos and video inside the editor. */
export function StockConnectionCard() {
  const { toast } = useUi();
  const { status, error, set } = useStockStatus();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<Record<string, string>>({});

  if (error) return <Notice tone="error" title="Could not load your stock connections">{error}</Notice>;
  if (!status) return null;

  const run = async (id: string, kind: 'save' | 'remove') => {
    setBusy(`${id}:${kind}`); setProblem(current => ({ ...current, [id]: '' }));
    try {
      set(await api<StockStatus>(kind === 'save' ? '/api/stock/settings' : '/api/stock/clear', kind === 'save' ? { provider: id, apiKey: (keys[id] ?? '').trim() } : { provider: id }));
      setKeys(current => ({ ...current, [id]: '' }));
      toast(kind === 'save' ? 'Connected. You can search it from the Media tab.' : 'Disconnected', 'success');
    } catch (cause) {
      setProblem(current => ({ ...current, [id]: (cause as Error).message }));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="brand-kit-head">
        <div>
          <b>Stock photos and video</b>
          <p>Search free pictures and clips from the editor's Media tab. Each library gives you a free key; paste it here. It is kept for you only and never shown again. Pexels and Pixabay ask that their work is credited, and the studio keeps each file's credit with it.</p>
        </div>
      </div>
      <div className="brand-kit">
        {status.providers.map(item => (
          <div key={item.id} className="stock-key">
            <div className="stock-key-head">
              <b>{item.label}</b>
              {item.connected ? <Badge tone="green">Connected {item.keyHint}</Badge> : <Badge tone="amber">Not connected</Badge>}
              <a href={item.keyUrl} target="_blank" rel="noreferrer noopener">Get a free key</a>
            </div>
            <Field label={item.connected ? 'Replace the key' : 'API key'}>
              <input className="input" type="password" autoComplete="off" value={keys[item.id] ?? ''} placeholder={item.connected ? 'Paste a new key to replace it' : `Paste your ${item.label} key`} onChange={event => setKeys(current => ({ ...current, [item.id]: event.target.value }))} />
            </Field>
            {problem[item.id] ? <Notice tone="error" title={`${item.label} did not connect`}>{problem[item.id]}</Notice> : null}
            <div className="brand-kit-foot">
              <Button variant="primary" loading={busy === `${item.id}:save`} disabled={!(keys[item.id] ?? '').trim()} onClick={() => void run(item.id, 'save')}>{item.connected ? 'Replace key' : 'Connect'}</Button>
              {item.connected ? <Button variant="ghost" loading={busy === `${item.id}:remove`} onClick={() => void run(item.id, 'remove')}>Disconnect</Button> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
