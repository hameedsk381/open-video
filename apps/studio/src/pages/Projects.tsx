import { useEffect, useMemo, useRef, useState } from 'react';
import { ago, api, dur, type Project } from '../api';
import { discoverPath, editorPath, go, planPath } from '../router';
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

type Sort = 'recent' | 'name' | 'longest';

const shape = (project: Project) => project.width > project.height ? 'Landscape' : project.width < project.height ? 'Vertical' : 'Square';

export function Projects() {
  const { toast, confirm } = useUi();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');

  const load = () =>
    api<{ projects: Project[] }>('/api/projects').then(
      result => setProjects(result.projects),
      cause => setError(cause.message)
    );

  useEffect(() => {
    load();
  }, []);

  const shown = useMemo(() => {
    const matches = (projects ?? []).filter(project => project.name.toLowerCase().includes(query.toLowerCase()));
    return matches.sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'longest' ? b.seconds - a.seconds : b.modified - a.modified);
  }, [projects, query, sort]);

  const total = projects?.reduce((seconds, project) => seconds + project.seconds, 0) ?? 0;

  const run = (promise: Promise<unknown>, done: string) =>
    promise.then(
      () => {
        toast(done, 'success');
        load();
      },
      cause => toast((cause as Error).message, 'error')
    );

  return (
    <Page
      title="Projects"
      subtitle={projects?.length
        ? `${projects.length} ${projects.length === 1 ? 'production' : 'productions'} · ${dur(total)} of finished video`
        : 'Every motion piece in this studio, ready to edit, review or export.'}
      actions={<Button variant={projects?.length ? 'primary' : 'secondary'} icon={<PlusIcon size={14} />} onClick={() => go('#/new')}>New video</Button>}
    >
      {error ? <Notice tone="error" title="Could not load projects">{error}</Notice> : null}

      {projects === null && !error ? (
        <div className="project-grid">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div className="project-tile" key={n}>
              <Skeleton height={168} radius={0} />
              <div className="project-body">
                <Skeleton width="70%" height={16} />
                <Skeleton width="45%" height={12} />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {projects && projects.length === 0 ? (
        <Empty icon={<FilmIcon size={34} />} title="No video projects yet">
          <p style={{ maxWidth: 440, margin: '8px auto 0' }}>
            Describe a piece above, or start from a prompt in Discover. The studio writes the script, designs the look and opens an editable timeline.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => go('#/new')}>Create a video</Button>
            <Button variant="secondary" icon={<SparklesIcon size={14} />} onClick={() => go(discoverPath)}>Browse Discover</Button>
          </div>
        </Empty>
      ) : null}

      {projects && projects.length > 0 ? (
        <>
          <div className="projects-toolbar">
            <div className="search-wrap">
              <SearchIcon size={15} />
              <input
                className="input"
                placeholder="Search projects…"
                value={query}
                onChange={event => setQuery(event.target.value)}
                aria-label="Search projects"
              />
            </div>
            <div className="segmented">
              {([['recent', 'Recent'], ['name', 'Name'], ['longest', 'Longest']] as const).map(([id, label]) => (
                <button key={id} className={sort === id ? 'on' : ''} onClick={() => setSort(id)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="project-grid">
            {shown.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onDuplicate={() => run(api('/api/project/duplicate', { id: project.id }), 'Project duplicated')}
                onDelete={async () => {
                  if (await confirm(`Move “${project.name}” to Trash? You can restore it later if needed.`, 'Move to Trash')) {
                    run(api('/api/project/delete', { id: project.id }), 'Project moved to trash');
                  }
                }}
              />
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="empty-note">No projects match “{query}”.</p>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}

function ProjectCard({ project, onDuplicate, onDelete }: { project: Project; onDuplicate: () => void; onDelete: () => void }) {
  const [broken, setBroken] = useState(false);
  const [src, setSrc] = useState<string>();
  const holder = useRef<HTMLDivElement>(null);
  const open = () => go(editorPath(project.id));

  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    const seen = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setSrc(`/api/thumb?id=${encodeURIComponent(project.id)}&v=${Math.round(project.modified)}`);
      seen.disconnect();
    });
    seen.observe(element);
    return () => seen.disconnect();
  }, [project.id, project.modified]);

  return (
    <article className="project-tile">
      <div className="project-thumb" ref={holder} onClick={open}>
        {src && !broken ? (
          <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
        ) : (
          <span className="project-thumb-empty"><FilmIcon size={20} /><span>{broken ? 'No preview' : 'Loading preview…'}</span></span>
        )}
        <span className="project-duration">{dur(project.seconds)}</span>
      </div>

      <div className="project-body" onClick={open}>
        <b title={project.name}>{project.name}</b>
        <div className="project-meta">
          <span>{project.width}×{project.height}</span>
          <span>{shape(project)}</span>
          <span>{project.scenes} {project.scenes === 1 ? 'scene' : 'scenes'}</span>
        </div>
        <div className="project-meta">
          <span>Edited {ago(project.modified)}</span>
          <Badge tone="neutral">{project.mode === 'template' ? 'Dynamic' : 'Custom motion'}</Badge>
        </div>
      </div>

      <div className="project-actions">
        <Button size="sm" variant="secondary" onClick={open}>Open</Button>
        <Button size="sm" variant="ghost" icon={<LayersIcon size={12} />} onClick={() => go(planPath(project.id))} title="Production plan">Plan</Button>
        <Button size="sm" variant="ghost" icon={<CopyIcon size={12} />} onClick={onDuplicate} title="Duplicate project">Duplicate</Button>
        <Button size="sm" variant="ghost" icon={<TrashIcon size={12} />} onClick={onDelete} title="Delete project">Delete</Button>
      </div>
    </article>
  );
}
