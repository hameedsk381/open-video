import { useEffect, useState } from 'react';
import { modKeyLabel } from '../platform';
import { ago, api, cleanUserStatus, dur, useJobs, type Job, type Library, type Project, type TemplateSummary } from '../api';
import { discoverPath, editorPath, go } from '../router';
import {
  Badge,
  Button,
  CompassIcon,
  FilmIcon,
  ImagesIcon,
  LayersIcon,
  PlusIcon,
  SlidersIcon,
  SparklesIcon,
  Skeleton,
  TypeIcon,
  useUi,
} from '../ui';

const examples = [
  'A 20-second launch film for a pocket finance app, calm and premium',
  'Vertical reel announcing our design conference in Berlin, kinetic type',
  '30-second product story for a ceramic mug brand, warm and tactile',
];

const presetOrder = ['hook-reel', 'product-spotlight', 'stats-showcase', 'logo-sting', 'tutorial-steps', 'quote-card'];
const presetIcons: Record<string, typeof FilmIcon> = {
  'hook-reel': FilmIcon,
  'product-spotlight': ImagesIcon,
  'stats-showcase': LayersIcon,
  'logo-sting': SparklesIcon,
  'tutorial-steps': LayersIcon,
  'quote-card': TypeIcon,
};
const presetMeta = (template: TemplateSummary) => {
  const ratio = template.width && template.height ? (template.width === template.height ? '1:1' : template.width > template.height ? '16:9' : '9:16') : '';
  const seconds = template.durationSeconds ? `${Math.round(template.durationSeconds)}s` : '';
  return [ratio, seconds].filter(Boolean).join(' · ') || 'Template';
};

const jobLabels: Record<string, string> = {
  compose: 'Composing the video',
  refine: 'Applying your direction',
  render: 'Rendering',
  review: 'Reviewing design',
  narrate: 'Voicing the script',
  transcribe: 'Timing captions',
  image: 'Generating imagery',
  thumbnail: 'Making a preview',
  batch: 'Building a batch',
  import: 'Importing media',
};

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

const jobTone = (job: Job) => (job.status === 'done' ? 'green' : job.status === 'error' ? 'red' : job.status === 'running' ? 'blue' : 'neutral') as 'green' | 'red' | 'blue' | 'neutral';

export function Home({ email }: { email?: string }) {
  const { toast } = useUi();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [prompt, setPrompt] = useState('');
  const jobs = useJobs();

  useEffect(() => {
    api<{ projects: Project[] }>('/api/projects').then(result => setProjects(result.projects), error => toast(error.message, 'error'));
    api<Library>('/api/library').then(setLibrary, () => {});
  }, []);

  const ordered = Object.values(jobs).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  const active = ordered.filter(job => job.status === 'running' || job.status === 'queued');
  const recent = [...active, ...ordered.filter(job => job.status === 'done' || job.status === 'error')].slice(0, 5);
  const name = email?.split('@')[0];
  const allTemplates = library?.templates ?? [];
  const curated = presetOrder.map(id => allTemplates.find(template => template.id === id)).filter((template): template is TemplateSummary => !!template);
  const presets = curated.length >= 4 ? curated : allTemplates.slice(0, 6);

  const start = () => {
    const brief = prompt.trim();
    go(brief ? `#/new?prompt=${encodeURIComponent(brief)}` : '#/new');
  };

  return (
    <div className="page home">
      <section className="home-hero">
        <div className="home-eyebrow"><span className="pulse-dot" /> {greeting()}{name ? `, ${name}` : ''}</div>
        <h1>What are we making?</h1>
        <p className="home-lede">
          Describe the piece. The studio plans it, writes the script, designs the look and hands you an editable timeline.
        </p>

        <div className="composer">
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); start(); }
            }}
            placeholder="e.g. A 30-second launch film for our analytics product, confident but not loud, ending on a clear call to action…"
            aria-label="Describe your video"
          />
          <div className="composer-bar">
            <span className="composer-hint">{modKeyLabel('↵')} to continue · <a href="#/new">Choose format and length</a></span>
            <Button variant="primary" icon={<SparklesIcon size={14} />} onClick={start}>
              Continue
            </Button>
          </div>
        </div>

        <div className="home-examples">
          <span>Try</span>
          {examples.map(example => (
            <button key={example} type="button" className="chip" onClick={() => setPrompt(example)}>
              {example.length > 58 ? `${example.slice(0, 56)}…` : example}
            </button>
          ))}
        </div>

        {presets.length ? (
          <div className="home-presets">
            <span className="home-presets-label">Or start from a preset</span>
            <div className="home-preset-grid">
              {presets.map(template => {
                const Icon = presetIcons[template.id] ?? FilmIcon;
                return (
                  <button
                    key={template.id}
                    type="button"
                    className="home-preset"
                    title={template.description}
                    onClick={() => go(`#/new?template=${encodeURIComponent(template.id)}`)}
                  >
                    <span className="home-preset-icon"><Icon size={14} /></span>
                    <span className="home-preset-copy">
                      <b>{template.name}</b>
                      <small>{presetMeta(template)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      <div className="home-columns">
        <section className="home-section">
          <div className="home-section-head">
            <h2>Recent projects</h2>
            <a href="#/projects">View all</a>
          </div>

          {projects === null ? (
            <div className="home-projects">
              {[1, 2, 3, 4].map(n => <Skeleton key={n} height={76} radius={10} />)}
            </div>
          ) : projects.length === 0 ? (
            <div className="home-empty">
              <FilmIcon size={22} />
              <div>
                <b>No videos yet</b>
                <small>1. Write a brief above, or copy one from <a href={discoverPath}>Discover</a>. 2. Generate it. 3. Edit scenes and export.</small>
              </div>
              <Button size="sm" variant="secondary" icon={<PlusIcon size={12} />} onClick={() => go('#/new')}>New video</Button>
            </div>
          ) : (
            <div className="home-projects">
              {projects.slice(0, 4).map(project => (
                <button key={project.id} type="button" className="home-project" onClick={() => go(editorPath(project.id))}>
                  <span className="home-project-thumb">
                    <FilmIcon size={18} />
                    <img src={`/api/thumb?id=${encodeURIComponent(project.id)}&v=${Math.round(project.modified)}`} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />
                  </span>
                  <span className="home-project-meta">
                    <b>{project.name}</b>
                    <small>{dur(project.seconds)} · {project.scenes} {project.scenes === 1 ? 'scene' : 'scenes'} · edited {ago(project.modified)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="home-aside">
          <section className="home-panel">
            <div className="home-panel-head">
              <h3>Live activity</h3>
              {active.length ? <Badge tone="green" dot>{active.length} active</Badge> : null}
            </div>
            {recent.length === 0 ? (
              <p className="home-muted">No jobs yet. Start a video and the agent’s progress appears here.</p>
            ) : (
              <div className="home-jobs">
                {recent.map(job => (
                  <div className="home-job" key={job.id}>
                    <span className={`job-dot ${job.status}`} />
                    <div>
                      <b>{jobLabels[job.kind] ?? job.kind}</b>
                      <small>
                        {job.status === 'running' || job.status === 'queued'
                          ? cleanUserStatus(job.messages.at(-1))
                          : job.status === 'error' ? (job.error || 'Failed') : 'Finished'}
                      </small>
                    </div>
                    <Badge tone={jobTone(job)}>{job.status === 'running' ? 'working' : job.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="home-panel">
            <h3>Workspace</h3>
            <div className="home-links">
              <a href={discoverPath}><CompassIcon size={14} /> Browse Discover</a>
              <a href="#/library"><LayersIcon size={14} /> Open asset library</a>
              <a href="#/settings"><SlidersIcon size={14} /> Engine settings</a>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
