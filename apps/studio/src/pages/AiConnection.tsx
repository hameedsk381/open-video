import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Button, Field, Notice, useUi } from '../ui';

type Provider = { id: string; label: string; model: string };
type Saved = { provider: string; model: string; baseUrl?: string; keyHint: string };
type State = { settings: Saved | null; providers: Provider[] };

/** The person's saved AI connection on the hosted service: null while loading, `settings: null` when none is saved yet. */
export function useAiConnection(enabled: boolean) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(() => api<State>('/api/ai-settings').then(setState, cause => setError((cause as Error).message)), []);
  useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);
  return { state, error, reload };
}

/** Settings for the hosted service: the person connects their own AI provider, model and key. The service has none of its own. */
export function AiConnectionCard() {
  const { toast } = useUi();
  const { state, error, reload } = useAiConnection(true);
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'remove' | ''>('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!state) return;
    const saved = state.settings;
    setProvider(saved?.provider ?? state.providers[0]?.id ?? '');
    setModel(saved?.model ?? state.providers[0]?.model ?? '');
    setBaseUrl(saved?.baseUrl ?? '');
    setApiKey('');
  }, [state]);

  if (error) return <Notice tone="error" title="Could not load your AI connection">{error}</Notice>;
  if (!state) return null;

  const saved = state.settings;
  const choose = (id: string) => {
    setProvider(id); setResult(null);
    const next = state.providers.find(item => item.id === id);
    if (next && (!model || state.providers.some(item => item.model === model))) setModel(next.model);
  };
  const body = () => ({ provider, model: model.trim(), baseUrl: baseUrl.trim() || undefined, apiKey: apiKey.trim() || undefined });
  const run = async (kind: 'save' | 'test' | 'remove') => {
    setBusy(kind); setResult(null);
    try {
      if (kind === 'test') {
        const outcome = await api<{ ok: boolean; error?: string }>('/api/ai-settings/test', body());
        setResult({ ok: outcome.ok, text: outcome.ok ? 'Connected. The model answered.' : outcome.error ?? 'The model did not answer.' });
      } else if (kind === 'save') {
        await api('/api/ai-settings', body());
        toast('AI connection saved', 'success');
        await reload();
      } else {
        await api('/api/ai-settings/clear', {});
        toast('AI connection removed', 'success');
        await reload();
      }
    } catch (cause) {
      setResult({ ok: false, text: (cause as Error).message });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="brand-kit-head">
        <div>
          <b>Your AI model</b>
          <p>The studio has no AI of its own. Connect yours: pick a provider, a model and your API key, and your videos are made with it. The key is stored encrypted and never shown again.</p>
        </div>
        {saved ? <Badge tone="green">Connected</Badge> : <Badge tone="amber">Not connected</Badge>}
      </div>

      <div className="brand-kit">
        <div className="brand-kit-grid">
          <Field label="Provider">
            <select className="input" value={provider} onChange={event => choose(event.target.value)} aria-label="AI provider">
              {state.providers.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Model" hint="The exact model name your provider uses">
            <input className="input" value={model} onChange={event => { setModel(event.target.value); setResult(null); }} placeholder="Model name" />
          </Field>
        </div>

        {provider === 'custom' || baseUrl ? (
          <Field label="Service address" hint={provider === 'custom' ? 'The OpenAI-compatible address, for example https://api.example.com/v1' : 'Leave blank to use the provider’s own address'}>
            <input className="input" value={baseUrl} onChange={event => { setBaseUrl(event.target.value); setResult(null); }} placeholder="https://…" />
          </Field>
        ) : null}

        <Field label="API key" hint={saved && saved.provider === provider ? `Saved (${saved.keyHint}). Leave blank to keep it.` : 'From your provider’s dashboard'}>
          <input className="input" type="password" autoComplete="off" value={apiKey} onChange={event => { setApiKey(event.target.value); setResult(null); }} placeholder={saved && saved.provider === provider ? saved.keyHint : 'Paste your key'} />
        </Field>

        {result ? <Notice tone={result.ok ? 'success' : 'error'} title={result.ok ? 'Connection works' : 'Could not connect'}>{result.text}</Notice> : null}

        <div className="brand-kit-foot">
          <Button variant="primary" loading={busy === 'save'} onClick={() => void run('save')}>Save</Button>
          <Button variant="secondary" loading={busy === 'test'} onClick={() => void run('test')}>Test connection</Button>
          {saved ? <Button variant="ghost" loading={busy === 'remove'} onClick={() => void run('remove')}>Remove</Button> : null}
        </div>
      </div>
    </div>
  );
}
