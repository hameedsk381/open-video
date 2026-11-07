import { useEffect, useMemo, useRef, useState } from 'react';
import { ago, api, dur, type Project } from '../api';
import { editorPath, go, planPath } from '../router';
import {
  Badge,
  Button,
  CopyIcon,
  Empty,
  FilmIcon,
  LayersIcon,
  Notice,
  Page,
  PlusIcon,
  SearchIcon,
  Skeleton,
  SparklesIcon,
  TrashIcon,
  useUi,
} from '../ui';

export function Projects() {
  const { toast, confirm } = useUi();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = () =>
    api<{ projects: Project[] }>('/api/projects').then(
      r => setProjects(r.projects),
      e => setError(e.message)
    );

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(
    () => (projects ?? []).filter(p => p.name.toLowerCase().includes(query.toLowerCase())),
    [projects, query]
  );

  const run = (promise: Promise<unknown>, done: string) =>
    promise.then(
      () => {
        toast(done, 'success');
        load();
      },
      e => toast((e as Error).message, 'error')
    );

  return (
    <Page
      title="Video Projects"
      subtitle="All your motion graphics pieces and video campaigns in one studio workspace."
      actions={
        projects && projects.length > 0 ? (
          <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => go('#/new')}>
            New Video
          </Button>
        ) : null
      }
    >
      {error ? <Notice tone="error" title="Could not load projects">{error}</Notice> : null}

      {projects === null && !error ? (
        <div className="grid">
          {[1, 2, 3, 4].map(n => (
            <div className="card" key={n} style={{ padding: 14 }}>
              <Skeleton height={140} style={{ marginBottom: 12 }} />
              <Skeleton width="70%" height={18} style={{ marginBottom: 8 }} />
              <Skeleton width="40%" height={14} />
            </div>
          ))}
        </div>
      ) : null}

      {projects && projects.length === 0 ? (
        <Empty
          icon={<FilmIcon size={38} />}
          title="No video projects yet"
        >
          <p style={{ maxWidth: 460, margin: '8px auto 0' }}>
            Choose from our curated prompt library or describe your idea to synthesize broadcast-grade motion graphics in seconds.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="primary" size="md" icon={<PlusIcon size={14} />} onClick={() => go('#/new')}>
              Create New Video
            </Button>
            <Button variant="secondary" size="md" icon={<SparklesIcon size={14} />} onClick={() => go('#/')}>
              Browse Prompt Showcase
            </Button>
          </div>
        </Empty>
      ) : null}

      {projects && projects.length > 0 ? (
        <>
          <div className="toolbar">
            <div style={{ position: 'relative', width: '100%', maxWidth: 360 }}>
              <span style={{ position: 'absolute', left: 12, top: 10, color: 'var(--muted)', pointerEvents: 'none' }}>
                <SearchIcon size={14} />
              </span>
              <input
                className="input"
                style={{ paddingLeft: 34 }}
                placeholder="Search your video projects…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="grid">
            {shown.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onDuplicate={() => run(api('/api/project/duplicate', { id: project.id }), 'Project duplicated')}
                onDelete={async () => {
                  if (await confirm(`Move "${project.name}" to Trash? You can restore it later if needed.`, 'Move to Trash')) {
                    run(api('/api/project/delete', { id: project.id }), 'Project moved to trash');
                  }
                }}
              />
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="sub" style={{ textAlign: 'center', marginTop: 40 }}>
              No videos matching "{query}".
            </p>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

function ProjectCard({
  project,
  onDuplicate,
  onDelete,
}: {
  project: Project;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const open = () => go(editorPath(project.id));
  const [broken, setBroken] = useState(false);
  const [src, setSrc] = useState<string>();
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const seen = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        setSrc(`/api/thumb?id=${encodeURIComponent(project.id)}&v=${Math.round(project.modified)}`);
        seen.disconnect();
      }
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [project.id, project.modified]);

  return (
    <div className="card bento-card project-card">
      <div className="thumb bento-media" ref={holder} onClick={open}>
        {src && !broken ? (
          <img src={src} alt="" onError={() => setBroken(true)} />
        ) : (
          <span className="ph" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--muted)' }}>
            <FilmIcon size={20} />
            <span>{broken ? 'No preview' : 'Loading preview…'}</span>
          </span>
        )}
      </div>

      <div className="card-body">
        <b title={project.name}>{project.name}</b>
        <div className="meta">
          <span>{project.width}×{project.height}</span>
          <span>·</span>
          <span>{dur(project.seconds)}</span>
          <span>·</span>
          <span>{project.scenes} {project.scenes === 1 ? 'scene' : 'scenes'}</span>
        </div>
        <div className="meta" style={{ marginTop: 6 }}>
          <span>Edited {ago(project.modified)}</span>
          <span className="tag-pill category-tag" style={{ fontSize: 11, padding: '2px 8px' }}>
            {project.mode === 'template' ? 'Dynamic' : 'Custom Motion'}
          </span>
        </div>
      </div>

      <div className="card-foot">
        <Button size="sm" variant="secondary" onClick={open}>
          Open Studio
        </Button>
        <Button size="sm" variant="ghost" icon={<LayersIcon size={12} />} onClick={() => go(planPath(project.id))} title="Open the production plan">
          Plan
        </Button>
        <Button size="sm" variant="ghost" icon={<CopyIcon size={12} />} onClick={onDuplicate} title="Duplicate project">
          Duplicate
        </Button>
        <Button size="sm" variant="ghost" icon={<TrashIcon size={12} />} onClick={onDelete} title="Delete project">
          Delete
        </Button>
      </div>
    </div>
  );
}
