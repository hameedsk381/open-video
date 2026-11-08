import { useEffect, useState } from 'react';
import { api, useHostMode, type Library as LibraryData, type Status } from '../api';
import { bundledFont, clearBrandKit, emptyBrandKit, loadBrandKit, readBrandKit, saveBrandKit, type BrandKit } from '../brandKit';
import { Badge, Button, Field, Notice, Page, useUi } from '../ui';
import { AiConnectionCard } from './AiConnection';

const colourRoles = [
  ['primary', 'Primary'],
  ['secondary', 'Secondary'],
  ['accent', 'Accent'],
  ['background', 'Background'],
  ['text', 'Text'],
] as const;

function BrandKitCard() {
  const { toast } = useUi();
  const [kit, setKit] = useState<BrandKit>(() => loadBrandKit() ?? emptyBrandKit());
  const [saved, setSaved] = useState(() => Boolean(loadBrandKit()));
  const [fonts, setFonts] = useState<string[]>([]);
  const [website, setWebsite] = useState('');
  const [filling, setFilling] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    api<LibraryData>('/api/library').then(library => setFonts(library.fonts ?? []), () => {});
  }, []);

  const fillFromWebsite = async () => {
    if (!website.trim()) return;
    setFilling(true); setNote('');
    try {
      const result = await api<{ brand?: { name?: string; colors?: Record<string, string>; fonts?: Record<string, string>; style?: string } }>('/api/brand/scrape', { url: website.trim() });
      const found = result.brand;
      setKit(current => ({
        ...current,
        name: found?.name || current.name,
        style: found?.style || current.style,
        colors: { ...current.colors, ...Object.fromEntries(Object.entries(found?.colors ?? {}).filter(([, value]) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))) },
        fonts: {
          heading: bundledFont(found?.fonts?.heading, fonts) || current.fonts.heading,
          body: bundledFont(found?.fonts?.body, fonts) || current.fonts.body,
        },
      }));
      setNote(found?.name ? `Filled from ${found.name}. Check the details and save.` : 'Filled what the site showed. Check the details and save.');
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setFilling(false);
    }
  };

  const chooseLogo = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) return toast('Use a PNG, JPG, WebP, GIF or SVG logo', 'error');
    if (file.size > 1_500_000) return toast('Use a logo under 1.5 MB', 'error');
    const reader = new FileReader();
    reader.onload = () => setKit(current => ({ ...current, logo: String(reader.result) }));
    reader.readAsDataURL(file);
    setNote('');
  };

  const save = () => {
    const clean = readBrandKit(kit);
    if (!clean) return toast('Add a brand name, colour, font, contact line or logo first', 'error');
    saveBrandKit(clean);
    setKit(clean); setSaved(true); setNote('');
    toast('Brand saved. New videos will use it.', 'success');
  };

  const remove = () => {
    clearBrandKit();
    setKit(emptyBrandKit()); setSaved(false); setNote('');
    toast('Brand removed', 'success');
  };

  const setColour = (role: string, value: string) => setKit(current => {
    const colors = { ...current.colors };
    if (value.trim()) (colors as Record<string, string>)[role] = value.trim(); else delete (colors as Record<string, string>)[role];
    return { ...current, colors };
  });

  return (
    <div className="card" style={{ padding: 20, marginBottom: 20 }}>
      <div className="brand-kit-head">
        <div>
          <b>Your brand</b>
          <p>Saved in this browser. Every new video uses these colours and fonts, prints the contact line, and can sign its closing scene with your logo.</p>
        </div>
        {saved ? <Badge tone="green">In use</Badge> : null}
      </div>

      <div className="brand-kit">
        <div className="brand-kit-grid">
          <Field label="Brand name">
            <input className="input" placeholder="Ember & Oak" value={kit.name} onChange={event => setKit(current => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="Website" hint="Optional: fill the colours, fonts and name from your site">
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" placeholder="emberandoak.com" value={website} onChange={event => setWebsite(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void fillFromWebsite(); } }} />
              <Button variant="secondary" loading={filling} onClick={() => void fillFromWebsite()}>{filling ? 'Reading…' : 'Fill'}</Button>
            </div>
          </Field>
          <Field label="Contact line" hint="Shown in the closing scene: email, website, phone or opening hours">
            <textarea className="input" rows={2} placeholder="hello@emberandoak.com · emberandoak.com" value={kit.contact} onChange={event => setKit(current => ({ ...current, contact: event.target.value }))} />
          </Field>
        </div>

        <Field label="Colours" hint="Leave one blank to let the design choose it">
          <div className="create-colors">
            {colourRoles.map(([role, label]) => (
              <label key={role}>
                <span>{label}</span>
                <span>
                  <input type="color" aria-label={`${label} colour`} value={kit.colors[role] ?? '#000000'} onChange={event => setColour(role, event.target.value)} />
                  <input className="input" aria-label={`${label} hex`} placeholder="Not set" value={kit.colors[role] ?? ''} onChange={event => setColour(role, event.target.value)} />
                </span>
              </label>
            ))}
          </div>
        </Field>

        <div className="brand-kit-grid">
          <Field label="Heading font">
            <select className="input" value={kit.fonts.heading ?? ''} onChange={event => setKit(current => ({ ...current, fonts: { ...current.fonts, heading: event.target.value || undefined } }))}>
              <option value="">Studio's choice</option>
              {fonts.map(font => <option key={font} value={font}>{font}</option>)}
            </select>
          </Field>
          <Field label="Body font">
            <select className="input" value={kit.fonts.body ?? ''} onChange={event => setKit(current => ({ ...current, fonts: { ...current.fonts, body: event.target.value || undefined } }))}>
              <option value="">Studio's choice</option>
              {fonts.map(font => <option key={font} value={font}>{font}</option>)}
            </select>
          </Field>
        </div>

        <div className="brand-kit-logo-row">
          {kit.logo ? <img className="brand-kit-logo" src={kit.logo} alt="Your logo" /> : <span className="brand-kit-nologo">No logo</span>}
          <div className="brand-kit-logo-copy">
            <b>Logo</b>
            <small>PNG, JPG, WebP, GIF or SVG under 1.5 MB.</small>
            <span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" onChange={event => { chooseLogo(event.target.files?.[0]); event.target.value = ''; }} />
            </span>
          </div>
          {kit.logo ? <Button variant="ghost" size="sm" onClick={() => setKit(current => ({ ...current, logo: '' }))}>Remove logo</Button> : null}
        </div>

        <div className="brand-kit-toggles">
          <label className="check">
            <input type="checkbox" checked={kit.enabled} onChange={event => setKit(current => ({ ...current, enabled: event.target.checked }))} />
            <span>Use this brand on new videos</span>
          </label>
          <label className="check">
            <input type="checkbox" checked={kit.logoOnEndCard} onChange={event => setKit(current => ({ ...current, logoOnEndCard: event.target.checked }))} />
            <span>Sign the closing scene with the logo (kept clear of the app's controls)</span>
          </label>
        </div>

        {note ? <Notice tone="neutral" title="Check before saving">{note}</Notice> : null}

        <div className="brand-kit-foot">
          <Button variant="primary" onClick={save}>{saved ? 'Save changes' : 'Save brand'}</Button>
          {saved ? <Button variant="ghost" onClick={remove}>Remove brand</Button> : null}
        </div>
      </div>
    </div>
  );
}

export function Settings() {
  const { toast } = useUi();
  const hostMode = useHostMode();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');

  // A custom AI service, for the rare person who brings their own key.
  const [modelPreset, setModelPreset] = useState(() => {
    try { return (localStorage.getItem('ove-model-preset') || 'auto').replace('qwen2.5-72b', 'qwen3.8-27b'); } catch { return 'auto'; }
  });
  const [customModel, setCustomModel] = useState(() => {
    try { return localStorage.getItem('ove-custom-model') || ''; } catch { return ''; }
  });
  const [customBaseUrl, setCustomBaseUrl] = useState(() => {
    try { return localStorage.getItem('ove-custom-base-url') || ''; } catch { return ''; }
  });
  const [customApiKey, setCustomApiKey] = useState(() => {
    try { return localStorage.getItem('ove-custom-api-key') || ''; } catch { return ''; }
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Status>('/api/status').then(setStatus, e => setError(e.message));
  }, []);

  const saveSettings = () => {
    try {
      localStorage.setItem('ove-model-preset', modelPreset);
      if (customModel) localStorage.setItem('ove-custom-model', customModel);
      else localStorage.removeItem('ove-custom-model');
      if (customBaseUrl) localStorage.setItem('ove-custom-base-url', customBaseUrl);
      else localStorage.removeItem('ove-custom-base-url');
      if (customApiKey) localStorage.setItem('ove-custom-api-key', customApiKey);
      else localStorage.removeItem('ove-custom-api-key');
      setSaved(true);
      toast('Advanced settings saved', 'success');
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast('Could not save these settings in this browser', 'error');
    }
  };

  return (
    <Page
      title="Settings"
      subtitle="How the studio makes your videos, and where it keeps them."
      narrow
    >
      {error ? <Notice tone="error" title="Settings could not be loaded">{error}</Notice> : null}

      <BrandKitCard />

      {hostMode === 'hosted' ? (
        <AiConnectionCard />
      ) : (
      <details className="card" style={{ padding: 20, marginBottom: 20 }}>
        <summary style={{ fontWeight: 600, cursor: 'pointer' }}>Use your own AI service</summary>

        <p style={{ margin: '12px 0 16px', fontSize: 13, color: 'var(--muted)' }}>
          Leave this closed and the studio chooses for you. Open it to connect OpenRouter, a local model, or any compatible service with your own key.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Which AI writes the video</label>
            <select
              className="input"
              aria-label="Model selection"
              value={modelPreset}
              onChange={e => setModelPreset(e.target.value)}
            >
              <option value="auto">Automatic (recommended)</option>
              <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Anthropic)</option>
              <option value="deepseek-r1">DeepSeek-R1 (DeepSeek)</option>
              <option value="qwen3.8-27b">Qwen 3.8 27B</option>
              <option value="gpt-4o">GPT-4o (OpenAI)</option>
              <option value="custom">My own service (advanced)</option>
            </select>
          </div>

          {modelPreset === 'custom' ? (
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Service address</label>
                <input
                  className="input"
                  placeholder="https://openrouter.ai/api/v1 (or http://localhost:11434/v1 for Ollama)"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Model name</label>
                <input
                  className="input"
                  placeholder="anthropic/claude-3.7-sonnet, deepseek/deepseek-r1, or any model ID"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>API key</label>
                <input
                  className="input"
                  type="password"
                  placeholder="sk-..."
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                />
                <span style={{ fontSize: 12, color: 'var(--faint)', display: 'block', marginTop: 4 }}>
                  Stored only in this browser. It is never sent anywhere except the service above.
                </span>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Button variant="primary" onClick={saveSettings}>
              {saved ? '✓ Saved' : 'Save'}
            </Button>
            {saved ? <Badge tone="green">Active</Badge> : null}
          </div>
        </div>
      </details>
      )}

      {status ? (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <b>Video service</b>
              {status.provider ? (
                <Badge tone="green" dot>Ready</Badge>
              ) : (
                <Badge tone="amber" dot>Not connected</Badge>
              )}
            </div>

            <div className="kv" style={{ borderTop: '1px solid var(--border)' }}>
              <b>Status</b>
              <span>{status.provider ? 'Ready to make videos' : 'Not connected'}</span>
            </div>
            <div className="kv">
              <b>What it does</b>
              <span>Writes the script, designs the scenes and renders the video.</span>
            </div>
            <div className="kv" style={{ borderBottom: 0 }}>
              <b>Where files are saved</b>
              <code>{status.outDir}</code>
            </div>
          </div>

          {status.error ? (
            <Notice tone="warn" title="A problem with the video service">
              {status.error}
            </Notice>
          ) : null}

          <p className="sub" style={{ marginTop: 24, fontSize: 13 }}>
            Exported videos, project files and uploaded brand files are saved inside your project folder.
          </p>
        </>
      ) : null}
    </Page>
  );
}
