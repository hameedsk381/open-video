import { useEffect, useState } from 'react';
import { api, dur, useHostMode, type Block, type Library as Lib, type Project, type Status } from '../api';
import { editorPath, go } from '../router';
import { Badge, Button, FilmIcon, LayersIcon, Notice, Page, PaletteIcon, PlusIcon, SparklesIcon, WandIcon, useUi } from '../ui';

export function Library() {
  const { toast } = useUi();
  const [lib, setLib] = useState<Lib | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Lib>('/api/library').then(setLib, e => setError(e.message));
    api<{ projects: Project[] }>('/api/projects').then(r => setProjects(r.projects), () => {});
  }, []);

  const add = (block: Block) => {
    const id = target[block.id] || projects[0]?.id;
    if (!id) {
      toast('Please create or open a video project first', 'error');
      return;
    }
    api('/api/add-block', { id, block: block.id }).then(
      () => {
        toast(`Added ${block.name} to project`, 'success');
        go(editorPath(id));
      },
      e => toast((e as Error).message, 'error')
    );
  };

  const categories = lib ? [...new Set(lib.blocks.map(b => b.category))] : [];

  return (
    <Page
      title="Creative Library"
      subtitle="Curated designer color themes, motion effects, and animated scene blocks ready to drop into any video."
    >
      {error ? <Notice tone="error" title="Could not load library">{error}</Notice> : null}

      {lib?.templates?.length ? (
        <section>
          <div className="section-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <FilmIcon size={14} />
              <span>Motion Templates & Production Archetypes</span>
            </div>
            <Badge tone="blue">{lib.templates.length} Ready-Made</Badge>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', marginBottom: 28 }}>
            {lib.templates.map(t => {
              const aspect = t.width && t.height ? (t.width > t.height ? '16:9' : t.width < t.height ? '9:16' : '1:1') : undefined;
              return (
                <div className="card" key={t.id} style={{ padding: 18, gap: 10, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <b style={{ fontSize: 14.5 }}>{t.name}</b>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {aspect ? <Badge tone="blue">{aspect}</Badge> : null}
                      {t.durationSeconds ? <Badge tone="purple">{Math.round(t.durationSeconds)}s</Badge> : null}
                    </div>
                  </div>

                  <div className="meta" style={{ marginTop: 0, flex: 1 }}>
                    {t.description}
                  </div>

                  {t.tags?.length ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
                      {t.tags.slice(0, 4).map(tag => (
                        <span key={tag} style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--surface-sunken)', color: 'var(--muted)' }}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <Button
                    size="sm"
                    variant="primary"
                    icon={<WandIcon size={13} />}
                    onClick={() => go(`#/new?template=${encodeURIComponent(t.id)}`)}
                  >
                    Create Video with this Template
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="section-title" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
        <PaletteIcon size={14} />
        <span>Designer Color Palettes</span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {lib?.themes.map(t => (
          <div className="card" key={t.id} style={{ padding: 14 }}>
            <div className="swatches" style={{ marginBottom: 10 }}>
              {['bg', 'surface', 'accent', 'accent2'].map(k => (
                <i key={k} style={{ background: String(t.variables[k]) }} />
              ))}
            </div>
            <b style={{ fontSize: 14 }}>{t.name}</b>
            <div className="meta" style={{ marginTop: 4 }}>{t.description}</div>
          </div>
        ))}
      </div>

      {categories.map(category => (
        <section key={category}>
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LayersIcon size={14} />
            <span>{category} Scenes</span>
          </div>

          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
            {lib!.blocks
              .filter(b => b.category === category)
              .map(block => (
                <div className="card" key={block.id} style={{ padding: 18, gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <b style={{ fontSize: 14.5 }}>{block.name}</b>
                    <Badge tone={block.kind === 'overlay' ? 'purple' : 'blue'}>
                      {block.kind === 'overlay' ? 'Overlay' : 'Scene'} · {dur(block.durationFrames / 30)}
                    </Badge>
                  </div>

                  <div className="meta" style={{ marginTop: 0 }}>
                    {block.description}
                  </div>

                  {projects.length ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
                      <select
                        className="input"
                        style={{ height: 32, padding: '0 10px', fontSize: 13, flex: 1 }}
                        value={target[block.id] ?? projects[0]!.id}
                        onChange={e => setTarget({ ...target, [block.id]: e.target.value })}
                      >
                        {projects.map(p => (
                          <option key={p.id} value={p.id}>
                            Add to: {p.name}
                          </option>
                        ))}
                      </select>
                      <Button size="sm" variant="secondary" icon={<PlusIcon size={13} />} onClick={() => add(block)}>
                        Insert
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        </section>
      ))}
    </Page>
  );
}

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
        <Notice tone="info" title="Managed AI">
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
