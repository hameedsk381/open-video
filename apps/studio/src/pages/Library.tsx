import { useEffect, useState } from 'react';
import { api, dur, type Block, type Library as Lib, type Project, type Status } from '../api';
import { editorPath, go } from '../router';
import { Badge, Button, LayersIcon, Notice, Page, PaletteIcon, PlusIcon, SparklesIcon, useUi } from '../ui';

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

      <div className="section-title" style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
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
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Status>('/api/status').then(setStatus, e => setError(e.message));
  }, []);

  return (
    <Page
      title="Studio Settings"
      subtitle="Workspace storage location, video output directory, and AI connection status."
      narrow
    >
      {error ? <Notice tone="error" title="Settings error">{error}</Notice> : null}

      {status ? (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <b>AI Engine Status</b>
              {status.provider ? (
                <Badge tone="green" dot>Operational</Badge>
              ) : (
                <Badge tone="red" dot>Not Connected</Badge>
              )}
            </div>

            <div className="kv" style={{ borderTop: '1px solid var(--border)' }}>
              <b>Provider</b>
              <span style={{ textTransform: 'capitalize' }}>{status.provider?.id || 'None'}</span>
            </div>
            <div className="kv">
              <b>Model</b>
              <code>{status.provider?.model || 'None'}</code>
            </div>
            <div className="kv" style={{ borderBottom: 0 }}>
              <b>Video Workspace</b>
              <code>{status.outDir}</code>
            </div>
          </div>

          {status.error ? (
            <Notice tone="error" title="AI Provider Setup Required">
              {status.error}
              {'\n'}Set your AI provider key or FreeLLMAPI instance in your .env configuration.
            </Notice>
          ) : (
            <Notice tone="success" title="Ready to Create">
              Your AI provider is connected and ready. Automated video composition, kinetic script generation, and creative direction are active.
            </Notice>
          )}

          <p className="sub" style={{ marginTop: 24, fontSize: 13 }}>
            Exported videos and project assets are safely stored in your local workspace.
          </p>
        </>
      ) : null}
    </Page>
  );
}
