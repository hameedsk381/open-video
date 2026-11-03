import { useEffect, useMemo, useRef, useState } from 'react';
import { ago, api, dur, type Project } from '../api';
import { editorPath, go } from '../router';
import { Badge, Button, Empty, Notice, Page, useUi } from '../ui';

export function Projects() {
  const { toast, confirm } = useUi();
  const [projects, setProjects] = useState<Project[] | null>(null), [error, setError] = useState(''), [query, setQuery] = useState('');
  const load = () => api<{ projects: Project[] }>('/api/projects').then(r => setProjects(r.projects), e => setError(e.message));
  useEffect(() => { load(); }, []);
  const shown = useMemo(() => (projects ?? []).filter(p => p.name.toLowerCase().includes(query.toLowerCase())), [projects, query]);
  const run = (promise: Promise<unknown>, done: string) => promise.then(() => { toast(done); load(); }, e => toast(e.message, 'error'));
  return <Page title="Projects" subtitle="Every video is a project you can open, edit and export.">
    {error ? <Notice tone="error">{error}</Notice> : null}
    {projects === null && !error ? <p className="sub">Loading…</p> : null}
    {projects && projects.length === 0 ? <Empty title="Make your first video"><p>Describe it, add your pictures, and get a video you can change line by line.</p><Button variant="primary" onClick={() => go('#/new')}>Create a video</Button></Empty> : null}
    {projects && projects.length > 0 ? <>
      <div className="toolbar"><input className="input" placeholder="Search projects…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="grid">{shown.map(project => <ProjectCard key={project.id} project={project}
        onDuplicate={() => run(api('/api/project/duplicate', { id: project.id }), 'Duplicated')}
        onDelete={async () => { if (await confirm(`Delete "${project.name}"? It moves to the .trash folder, so it can be brought back by hand.`, 'Delete')) run(api('/api/project/delete', { id: project.id }), 'Deleted'); }} />)}</div>
      {shown.length === 0 ? <p className="sub">No project matches "{query}".</p> : null}
    </> : null}
  </Page>;
}

function ProjectCard({ project, onDuplicate, onDelete }: { project: Project; onDuplicate: () => void; onDelete: () => void }) {
  const open = () => go(editorPath(project.id)), [broken, setBroken] = useState(false), [src, setSrc] = useState<string>();
  const holder = useRef<HTMLDivElement>(null);
  // Previews are made on first sight and kept, so they load when the card scrolls into view rather than all at once.
  useEffect(() => { const el = holder.current; if (!el) return; const seen = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSrc(`/api/thumb?id=${encodeURIComponent(project.id)}&v=${Math.round(project.modified)}`); seen.disconnect(); } }); seen.observe(el); return () => seen.disconnect(); }, [project.id, project.modified]);
  return <div className="card">
    <div className="thumb" ref={holder} onClick={open}>{src && !broken ? <img src={src} alt="" onError={() => setBroken(true)} /> : <span className="ph">{broken ? 'No preview' : ''}</span>}</div>
    <div className="card-body"><b title={project.name}>{project.name}</b>
      <div className="meta"><span>{project.width}×{project.height}</span><span>·</span><span>{dur(project.seconds)}</span><span>·</span><span>{project.scenes} scenes</span></div>
      <div className="meta"><span>Edited {ago(project.modified)}</span><Badge tone={project.mode === 'template' ? 'blue' : 'neutral'}>{project.mode === 'template' ? 'Editable text' : 'Finished'}</Badge></div></div>
    <div className="card-foot"><Button size="sm" onClick={open}>Open</Button><Button size="sm" variant="ghost" onClick={onDuplicate}>Duplicate</Button><Button size="sm" variant="ghost" onClick={onDelete}>Delete</Button></div>
  </div>;
}
