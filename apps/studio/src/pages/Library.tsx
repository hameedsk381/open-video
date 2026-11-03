import { useEffect, useState } from 'react';
import { api, dur, type Block, type Library as Lib, type Project, type Status } from '../api';
import { editorPath, go } from '../router';
import { Badge, Button, Notice, Page, useUi } from '../ui';

export function Library() {
  const { toast } = useUi();
  const [lib, setLib] = useState<Lib | null>(null), [projects, setProjects] = useState<Project[]>([]), [error, setError] = useState(''), [target, setTarget] = useState<Record<string, string>>({});
  useEffect(() => { api<Lib>('/api/library').then(setLib, e => setError(e.message)); api<{ projects: Project[] }>('/api/projects').then(r => setProjects(r.projects), () => {}); }, []);
  const add = (block: Block) => {
    const id = target[block.id] || projects[0]?.id; if (!id) { toast('Make a video first', 'error'); return; }
    api('/api/add-block', { id, block: block.id }).then(() => go(editorPath(id)), e => toast(e.message, 'error'));
  };
  const categories = lib ? [...new Set(lib.blocks.map(b => b.category))] : [];
  return <Page title="Library" subtitle="Scenes, effects and looks you can add to any video.">
    {error ? <Notice tone="error">{error}</Notice> : null}
    <div className="section-title" style={{ marginTop: 0 }}>Themes</div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))' }}>{lib?.themes.map(t => <div className="card" key={t.id} style={{ padding: 12 }}>
      <div className="swatches">{['bg', 'surface', 'accent', 'accent2'].map(k => <i key={k} style={{ background: String(t.variables[k]) }} />)}</div><b>{t.name}</b><div className="meta">{t.description}</div></div>)}</div>
    {categories.map(category => <section key={category}><div className="section-title">{category}</div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>{lib!.blocks.filter(b => b.category === category).map(block => <div className="card" key={block.id} style={{ padding: 16, gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{block.name}</b><Badge>{block.kind === 'overlay' ? 'Overlay' : 'Scene'} · {dur(block.durationFrames / 30)}</Badge></div>
        <div className="meta" style={{ marginTop: 0 }}>{block.description}</div>
        {projects.length ? <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <select className="input" style={{ height: 30, padding: '0 8px', fontSize: 13 }} value={target[block.id] ?? projects[0]!.id} onChange={e => setTarget({ ...target, [block.id]: e.target.value })}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <Button size="sm" onClick={() => add(block)}>Add</Button></div> : null}
      </div>)}</div></section>)}
  </Page>;
}

export function Settings() {
  const [status, setStatus] = useState<Status | null>(null), [error, setError] = useState('');
  useEffect(() => { api<Status>('/api/status').then(setStatus, e => setError(e.message)); }, []);
  return <Page title="Settings" subtitle="Where your videos live and which AI is behind the studio." narrow>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {status ? <>
      <div className="kv"><b>Videos are saved in</b><code>{status.outDir}</code></div>
      <div className="kv"><b>AI provider</b><span>{status.provider ? <>{status.provider.id} <code>{status.provider.model}</code></> : <Badge tone="red">Not connected</Badge>}</span></div>
      {status.error ? <Notice tone="error">{status.error}{'\n'}Put your key in a .env file as GROQ_API_KEY=... and start the studio again.</Notice>
        : <Notice>Connected. Creating videos, voiceovers and AI changes use this provider; editing, previewing and exporting do not.</Notice>}
      <p className="sub">Use <code>ove ai studio --out folder</code> to keep videos somewhere else.</p>
    </> : null}
  </Page>;
}
