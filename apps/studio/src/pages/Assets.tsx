import { useEffect, useMemo, useState } from 'react';
import { api, dur, type Block, type Library as Lib, type Project, type TemplateSummary, type Theme } from '../api';
import { discoverPath, editorPath, go } from '../router';
import { Badge, Button, Notice, Page, PlusIcon, SearchIcon, Skeleton, useUi, WandIcon } from '../ui';

type Tab = 'templates' | 'blocks' | 'themes';

const hue = (name: string) => [...name].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 7);
const tile = (name: string) => {
  const base = hue(name);
  return { background: `linear-gradient(140deg, hsl(${base} 42% 15%), hsl(${(base + 46) % 360} 52% 27%))` };
};
const matches = (query: string, ...values: (string | undefined)[]) =>
  !query.trim() || values.some(value => value?.toLowerCase().includes(query.trim().toLowerCase()));

export function Assets() {
  const { toast } = useUi();
  const [lib, setLib] = useState<Lib | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('templates');
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<Record<string, string>>({});

  useEffect(() => {
    api<Lib>('/api/library').then(setLib, cause => setError(cause.message));
    api<{ projects: Project[] }>('/api/projects').then(result => setProjects(result.projects), () => {});
  }, []);

  const add = (block: Block) => {
    const id = target[block.id] || projects[0]?.id;
    if (!id) {
      toast('Please create or open a video project first', 'error');
      return;
    }
    api('/api/add-block', { id, block: block.id }).then(
      () => {
        toast(`Added ${block.name} to the project`, 'success');
        go(editorPath(id));
      },
      cause => toast((cause as Error).message, 'error')
    );
  };

  const templates = useMemo(
    () => (lib?.templates ?? []).filter(template => matches(query, template.name, template.description, template.tags?.join(' '))),
    [lib, query]
  );
  const blocks = useMemo(
    () => (lib?.blocks ?? []).filter(block => matches(query, block.name, block.description, block.category, block.kind)),
    [lib, query]
  );
  const themes = useMemo(
    () => (lib?.themes ?? []).filter(theme => matches(query, theme.name, theme.description)),
    [lib, query]
  );
  const categories = [...new Set(blocks.map(block => block.category))];
  const counts = { templates: lib?.templates.length ?? 0, blocks: lib?.blocks.length ?? 0, themes: lib?.themes.length ?? 0 };

  return (
    <Page
      title="Assets"
      subtitle="The templates, scene blocks and themes this studio can build with — ready to drop into any video."
    >
      {error ? <Notice tone="error" title="Could not load the asset library">{error}</Notice> : null}

      <div className="asset-toolbar">
        <div className="segmented">
          {([['templates', 'Templates', counts.templates], ['blocks', 'Scenes', counts.blocks], ['themes', 'Themes', counts.themes]] as const).map(([id, label, count]) => (
            <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}<span className="seg-count">{count}</span>
            </button>
          ))}
        </div>
        <div className="search-wrap">
          <SearchIcon size={15} />
          <input
            className="input"
            placeholder={`Search ${tab}…`}
            value={query}
            onChange={event => setQuery(event.target.value)}
            aria-label="Search assets"
          />
        </div>
      </div>

      {lib === null && !error ? (
        <div className="asset-grid">
          {[1, 2, 3, 4, 5, 6].map(n => <Skeleton key={n} height={190} radius={12} />)}
        </div>
      ) : null}

      {lib && tab === 'templates' ? (
        templates.length ? (
          <div className="asset-grid">
            {templates.map(template => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        ) : (
          <p className="empty-note">No templates match “{query}”.</p>
        )
      ) : null}

      {lib && tab === 'blocks' ? (
        categories.length ? (
          categories.map(category => (
            <section key={category} className="asset-section">
              <div className="asset-section-head">
                <h2>{category}</h2>
                <small>{blocks.filter(block => block.category === category).length} scenes</small>
              </div>
              <div className="asset-grid">
                {blocks.filter(block => block.category === category).map(block => (
                  <BlockCard key={block.id} block={block} projects={projects} target={target[block.id] ?? projects[0]?.id} onTarget={id => setTarget({ ...target, [block.id]: id })} onAdd={() => add(block)} />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="empty-note">No scenes match “{query}”.</p>
        )
      ) : null}

      {lib && tab === 'themes' ? (
        themes.length ? (
          <div className="asset-grid">
            {themes.map(theme => (
              <ThemeCard key={theme.id} theme={theme} />
            ))}
          </div>
        ) : (
          <p className="empty-note">No themes match “{query}”.</p>
        )
      ) : null}

      <p className="sub" style={{ marginTop: 26 }}>
        Looking for ready-made briefs? <a href={discoverPath}>Browse Discover</a> or <a href="#/new">start a new video</a>.
      </p>
    </Page>
  );
}

function TemplateCard({ template }: { template: TemplateSummary }) {
  const aspect = template.width && template.height
    ? (template.width > template.height ? 'Landscape' : template.width < template.height ? 'Vertical' : 'Square')
    : undefined;

  return (
    <article className="asset-card">
      <div className="asset-preview" style={tile(template.name)}>
        <span>{template.name}</span>
        <div className="asset-preview-badges">
          {aspect ? <Badge tone="neutral">{aspect}</Badge> : null}
          {template.durationSeconds ? <Badge tone="neutral">{Math.round(template.durationSeconds)}s</Badge> : null}
        </div>
      </div>
      <div className="asset-body">
        <b>{template.name}</b>
        <p>{template.description}</p>
        {template.tags?.length ? (
          <div className="asset-tags">{template.tags.slice(0, 4).map(tag => <span key={tag}>#{tag}</span>)}</div>
        ) : null}
      </div>
      <div className="asset-actions">
        <Button size="sm" variant="secondary" icon={<WandIcon size={12} />} onClick={() => go(`#/new?template=${encodeURIComponent(template.id)}`)}>
          Use template
        </Button>
      </div>
    </article>
  );
}

function BlockCard({ block, projects, target, onTarget, onAdd }: {
  block: Block;
  projects: Project[];
  target?: string;
  onTarget: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <article className="asset-card compact">
      <div className="asset-body">
        <div className="asset-row">
          <b>{block.name}</b>
          <Badge tone={block.kind === 'overlay' ? 'purple' : 'blue'}>
            {block.kind === 'overlay' ? 'Overlay' : 'Scene'} · {dur(block.durationFrames / 30)}
          </Badge>
        </div>
        <p>{block.description}</p>
      </div>
      {projects.length ? (
        <div className="asset-actions">
          <select className="input" value={target ?? projects[0]!.id} onChange={event => onTarget(event.target.value)} aria-label={`Add ${block.name} to project`}>
            {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <Button size="sm" variant="secondary" icon={<PlusIcon size={12} />} onClick={onAdd}>Insert</Button>
        </div>
      ) : (
        <div className="asset-actions">
          <small>Create a project to insert this scene.</small>
        </div>
      )}
    </article>
  );
}

function ThemeCard({ theme }: { theme: Theme }) {
  const swatches = ['bg', 'surface', 'accent', 'accent2'].map(key => String(theme.variables[key] ?? ''));
  const details = ['font', 'displayFont', 'texture', 'motion'].map(key => (theme.variables[key] ? `${key}: ${theme.variables[key]}` : '')).filter(Boolean);

  return (
    <article className="asset-card compact">
      <div className="asset-swatches">
        {swatches.map((color, index) => <i key={index} style={{ background: color }} />)}
      </div>
      <div className="asset-body">
        <b>{theme.name}</b>
        <p>{theme.description}</p>
        {details.length ? <div className="asset-tags">{details.map(detail => <span key={detail}>{detail}</span>)}</div> : null}
      </div>
    </article>
  );
}
