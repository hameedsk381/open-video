import { useEffect, useState } from 'react';
import { api, useHostMode, type Status } from '../api';
import { Badge, Button, Notice, Page, useUi } from '../ui';

export function Settings() {
  const { toast } = useUi();
  const hostMode = useHostMode();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');

  // BYOK Gateway Preferences
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
      toast('AI Engine & Gateway preferences saved!', 'success');
      setTimeout(() => setSaved(false), 2500);
    } catch {
      toast('Failed to save preferences to browser storage', 'error');
    }
  };

  return (
    <Page
      title="Studio Settings"
      subtitle="Workspace storage preferences, custom AI models, and gateway configuration."
      narrow
    >
      {error ? <Notice tone="error" title="Settings error">{error}</Notice> : null}

      {hostMode === 'hosted' ? (
        <Notice tone="neutral" title="Managed AI">
          AI runs on the service's managed gateway — there is nothing to configure. Pick a model on the Create page if you want one; the Auto Router chooses well on its own.
        </Notice>
      ) : (
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <b>Creative Engine & Custom Gateway (BYOK)</b>
          <Badge tone={modelPreset === 'custom' ? 'green' : 'blue'}>
            {modelPreset === 'custom' ? 'Custom BYOK Active' : 'Managed Presets'}
          </Badge>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--muted)' }}>
          Configure your preferred LLM provider. Bring your own API key to connect OpenRouter, LiteLLM, a local Ollama instance, or any OpenAI-compatible gateway.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>Model Selection</label>
            <select
              className="input"
              value={modelPreset}
              onChange={e => setModelPreset(e.target.value)}
            >
              <option value="auto">Auto Router (task-aware: the gateway picks the best model per task)</option>
              <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Anthropic)</option>
              <option value="deepseek-r1">DeepSeek-R1 (DeepSeek)</option>
              <option value="qwen3.8-27b">Qwen 3.8 27B (gateway favourite for most tasks)</option>
              <option value="gpt-4o">OpenAI GPT-4o (OpenAI)</option>
              <option value="custom">Custom OpenAI-Compatible Gateway / BYOK</option>
            </select>
          </div>

          {modelPreset === 'custom' ? (
            <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Gateway Base URL</label>
                <input
                  className="input"
                  placeholder="https://openrouter.ai/api/v1 (or http://localhost:11434/v1 for Ollama)"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Custom Model Identifier</label>
                <input
                  className="input"
                  placeholder="anthropic/claude-3.7-sonnet, deepseek/deepseek-r1, or any model ID"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>API Key</label>
                <input
                  className="input"
                  type="password"
                  placeholder="sk-..."
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                />
                <span style={{ fontSize: 11, color: 'var(--faint)', display: 'block', marginTop: 4 }}>
                  Stored only in your local browser storage. Never sent to any third party.
                </span>
              </div>
            </div>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <Button variant="primary" onClick={saveSettings}>
              {saved ? '✓ Preferences Saved' : 'Save AI Preferences'}
            </Button>
            {saved ? <Badge tone="green">Active</Badge> : null}
          </div>
        </div>
      </div>
      )}

      {status ? (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <b>Creative Generation Engine</b>
              {status.provider ? (
                <Badge tone="green" dot>Active & Ready</Badge>
              ) : (
                <Badge tone="amber" dot>Offline</Badge>
              )}
            </div>

            <div className="kv" style={{ borderTop: '1px solid var(--border)' }}>
              <b>System Status</b>
              <span>{status.provider ? 'All creative systems operational' : 'Engine offline'}</span>
            </div>
            {status.provider ? (
              <>
                <div className="kv">
                  <b>AI Provider</b>
                  <span>{status.provider.id === 'freellmapi' ? 'FreeLLMAPI' : status.provider.id}</span>
                </div>
                <div className="kv">
                  <b>Model</b>
                  <span>{status.provider.model}</span>
                </div>
              </>
            ) : null}
            <div className="kv">
              <b>Capabilities</b>
              <span>Autonomous Composition, Kinetic Scripting, Scene Layouts & Pacing</span>
            </div>
            <div className="kv" style={{ borderBottom: 0 }}>
              <b>Workspace Storage</b>
              <code>{status.outDir}</code>
            </div>
          </div>

          {status.error ? (
            <Notice tone="warn" title="Creative Engine Notice">
              {status.error}
            </Notice>
          ) : (
            <Notice tone="success" title="Studio Ready">
              The creative motion engine is active and ready to produce videos.
            </Notice>
          )}

          <p className="sub" style={{ marginTop: 24, fontSize: 13 }}>
            Exported videos, project files, and uploaded brand assets are safely saved inside your workspace directory.
          </p>
        </>
      ) : null}
    </Page>
  );
}
