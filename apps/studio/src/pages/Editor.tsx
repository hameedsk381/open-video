import { useCallback, useEffect, useRef, useState } from 'react';
import { slotName } from '../slotName';
import { api, cleanUserStatus, dur, runJob, type Block, type Detail, type Job, type Library, type Revision, type Scene, type TextLayer, type Variable } from '../api';
import { composeNotesKey } from '../composeReport';
import { PlayerView, type PlayerHandle } from '../Player';
import { editorPath, go, planPath } from '../router';
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  Badge,
  Button,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  Field,
  FilmIcon,
  LayersIcon,
  Notice,
  PaletteIcon,
  ShieldIcon,
  SparklesIcon,
  Spinner,
  useUi,
} from '../ui';

const tabs = [
  ['edit', 'Content', FilmIcon] as const,
  ['ai', 'AI Director', SparklesIcon] as const,
  ['look', 'Style & Themes', PaletteIcon] as const,
  ['history', 'Revisions', ClockIcon] as const,
  ['export', 'Export', DownloadIcon] as const,
];

const themeNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight', 'fontDisplay', 'fontBody', 'texture', 'textureColor', 'textureOpacity', 'motion', 'transition', 'layout', 'density'];

export function Editor({ id, tab }: { id: string; tab: string }) {
  const { toast } = useUi();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [composeNotes, setComposeNotes] = useState<string[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState('');
  const [aiRevert, setAiRevert] = useState<{ n: number; label: string } | null>(null);
  const [exportIntent, setExportIntent] = useState<{ kind: 'review' | 'render'; nonce: number } | null>(null);
  const frameAt = useRef(0);
  const player = useRef<PlayerHandle>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const file = `${id}/composition.json`;
  const planFile = `${id}/production.json`;

  const load = useCallback((keepFrame: boolean) => {
    if (keepFrame) frameAt.current = player.current?.frame() ?? 0;
    else frameAt.current = 0;
    return api<Detail>(`/api/project?id=${encodeURIComponent(id)}`).then(setDetail, e => setError(e.message));
  }, [id]);

  useEffect(() => {
    setDetail(null);
    load(false);
  }, [load]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(composeNotesKey(id));
      const notes: unknown = raw ? JSON.parse(raw) : [];
      setComposeNotes(Array.isArray(notes) ? notes.filter((note): note is string => typeof note === 'string' && note.trim() !== '') : []);
    } catch { setComposeNotes([]); }
  }, [id]);

  // A selected scene that no longer exists after a reload stops being selected.
  useEffect(() => {
    if (detail && selectedSceneId && !detail.scenes.some(scene => scene.id === selectedSceneId)) setSelectedSceneId(null);
  }, [detail, selectedSceneId]);

  // The tab row scrolls sideways in the 420px pane; keep the open tab in view.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  // Edits save on the spot, so the only way to lose one is to close the tab mid-save.
  useEffect(() => {
    if (note !== 'Saving changes…') return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [note]);

  const dismissComposeNotes = () => {
    setComposeNotes([]);
    try { sessionStorage.removeItem(composeNotesKey(id)); } catch {}
  };

  if (error) {
    return (
      <div className="center">
        <h2>Could not open project</h2>
        <Notice tone="error">{error}</Notice>
        <Button onClick={() => go('#/projects')}>Back to Projects</Button>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="center">
        <Spinner size={32} />
        <p className="sub" style={{ marginTop: 14 }}>Loading project studio…</p>
      </div>
    );
  }

  const save = async (path: string, body: unknown, done = 'Saved') => {
    setNote('Saving changes…');
    try {
      await api(path, body);
      setNote(done);
      await load(true);
      setTimeout(() => setNote(''), 3000);
    } catch (e) {
      setNote('');
      toast((e as Error).message, 'error');
      throw e;
    }
  };

  const props = { detail, file, planFile, save, reload: load, setNote };
  const focusScene = (scene: Scene | null) => {
    setSelectedSceneId(scene?.id ?? null);
    if (scene) player.current?.seek(scene.startFrame);
  };
  const selectedScene = selectedSceneId ? detail.scenes.find(scene => scene.id === selectedSceneId) ?? null : null;
  const selectedIndex = selectedScene ? detail.scenes.indexOf(selectedScene) : -1;
  // The instruction names the scene so the AI edits that beat rather than the whole video.
  const askScene = () => {
    if (!selectedScene) return;
    const span = `${dur(selectedScene.durationFrames / detail.fps)}`;
    setAiDraft(`Focus on scene ${selectedIndex + 1} (“${selectedScene.name}”, ${span}): `);
    go(editorPath(id, 'ai'));
  };
  const openExport = (kind: 'review' | 'render') => {
    setExportIntent({ kind, nonce: Date.now() });
    go(editorPath(id, 'export'));
  };

  return (
    <div className="editor">
      <div className="stage">
        {composeNotes.length ? (
          <Notice tone="warn" title="What the studio adjusted" onDismiss={dismissComposeNotes}>
            <ul className="issue-list" style={{ margin: '4px 0 0' }}>
              {composeNotes.map(change => <li key={change}>{change}</li>)}
            </ul>
          </Notice>
        ) : null}
        <div className="etop">
          <Button size="sm" variant="ghost" icon={<ArrowLeftIcon size={14} />} onClick={() => go('#/projects')}>
            Projects
          </Button>
          <TitleInput detail={detail} save={name => save('/api/project/rename', { id, name }, 'Renamed')} />
          <Button size="sm" variant="secondary" icon={<LayersIcon size={14} />} onClick={() => go(planPath(id))}>
            Storyboard
          </Button>
          <span className="grow" />
          {note ? (
            <span className="saved" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}>
              <CheckIcon size={12} /> {note}
            </span>
          ) : null}
          <div className="etop-actions">
            <Button size="sm" variant="ghost" icon={<ShieldIcon size={14} />} onClick={() => openExport('review')}>
              Review
            </Button>
            <Button size="sm" variant="primary" icon={<DownloadIcon size={14} />} onClick={() => openExport('render')}>
              Export
            </Button>
          </div>
        </div>

        <PlayerView
          ref={player}
          detail={detail}
          startFrame={frameAt.current}
          selectedSceneId={selectedSceneId}
          onSelectScene={setSelectedSceneId}
        />

        <div className="scene-focus">
          <select
            className="input scene-select"
            aria-label="Scene to edit"
            value={selectedSceneId ?? ''}
            onChange={e => focusScene(detail.scenes.find(scene => scene.id === e.target.value) ?? null)}
          >
            <option value="">All scenes · {detail.scenes.length}</option>
            {detail.scenes.map((scene, idx) => (
              <option key={scene.id} value={scene.id}>
                Scene {idx + 1} · {scene.name} · {dur(scene.durationFrames / detail.fps)}
              </option>
            ))}
          </select>
          {selectedScene ? (
            <>
              <span className="scene-meta">
                Scene {selectedIndex + 1} · {selectedScene.name} · {dur(selectedScene.durationFrames / detail.fps)}
              </span>
              <Button size="sm" variant="secondary" icon={<SparklesIcon size={13} />} onClick={askScene}>
                Ask AI about this scene
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedSceneId(null)}>
                Clear
              </Button>
            </>
          ) : (
            <span className="scene-meta">Pick a scene on the timeline to edit just that scene.</span>
          )}
        </div>
      </div>

      <div className="side">
        <div className="tabs" ref={tabsRef}>
          {tabs.map(([key, label, Icon]) => (
            <button
              key={key}
              className={tab === key ? 'on' : ''}
              onClick={() => go(editorPath(id, key))}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="pane">
          {tab === 'ai' ? (
            <AskAi
              {...props}
              draft={aiDraft}
              onDraft={setAiDraft}
              scene={selectedScene}
              sceneIndex={selectedIndex}
              onClearScene={() => setSelectedSceneId(null)}
              revert={aiRevert}
              onApplied={setAiRevert}
            />
          ) : tab === 'look' ? (
            <Look {...props} />
          ) : tab === 'history' ? (
            <History {...props} />
          ) : tab === 'export' ? (
            <Export {...props} intent={exportIntent} onIntentDone={() => setExportIntent(null)} />
          ) : (
            <Edit {...props} />
          )}
        </div>
      </div>
    </div>
  );
}

type PaneProps = {
  detail: Detail;
  file: string;
  planFile: string;
  save: (path: string, body: unknown, done?: string) => Promise<void>;
  reload: (keepFrame: boolean) => Promise<void>;
  setNote: (note: string) => void;
};

function TitleInput({ detail, save }: { detail: Detail; save: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(detail.name);
  useEffect(() => setValue(detail.name), [detail.name]);

  return (
    <input
      className="input title"
      value={value}
      aria-label="Project name"
      onChange={e => setValue(e.target.value)}
      onBlur={() => {
        const v = value.trim();
        if (!v) setValue(detail.name);
        else if (v !== detail.name) void save(v);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

function Edit({ detail, save, reload, setNote }: PaneProps) {
  const [values, setValues] = useState<Record<string, any>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const { toast } = useUi();

  useEffect(() => {
    setValues(Object.fromEntries(detail.variables.map(v => [v.name, v.type === 'list' ? JSON.stringify(v.value, null, 2) : v.value])));
    setTexts(Object.fromEntries(detail.texts.map(t => [t.path, t.content])));
  }, [detail]);

  const fields = detail.variables.filter(v => !themeNames.includes(v.name));

  const apply = async () => {
    setBusy(true);
    try {
      if (detail.mode === 'template') {
        const out: Record<string, unknown> = {};
        for (const v of fields) {
          const x = values[v.name];
          out[v.name] = v.type === 'number' ? Number(x) : v.type === 'list' ? JSON.parse(x) : x;
        }
        await save('/api/variables', { id: detail.id, values: out });
      } else {
        const changed = detail.texts.filter(t => texts[t.path]?.trim() && texts[t.path] !== t.content);
        for (const t of changed) await api('/api/text', { id: detail.id, path: t.path, content: texts[t.path] });
        setNote(changed.length ? 'Changes saved' : 'No changes detected');
        if (changed.length) await reload(true);
      }
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Please check your list format' : (e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const label = (v: Variable) => v.description || v.name.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ');

  return (
    <>
      <h2>Content & Copy</h2>
      <p className="sub">
        {detail.mode === 'template'
          ? 'Customize your text and message. All motion animations update automatically.'
          : 'Edit copy for each scene in the order it appears on screen.'}
      </p>

      {detail.mode === 'template' ? (
        fields.length ? (
          fields.map(v => (
            <Field key={v.name} label={label(v)}>
              {v.type === 'boolean' ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!values[v.name]}
                    onChange={e => setValues({ ...values, [v.name]: e.target.checked })}
                  />
                  <span>Enable {label(v)}</span>
                </label>
              ) : v.type === 'color' ? (
                <input
                  className="input"
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(values[v.name]) ? values[v.name] : '#000000'}
                  onChange={e => setValues({ ...values, [v.name]: e.target.value })}
                />
              ) : v.type === 'number' ? (
                <input
                  className="input"
                  type="number"
                  value={values[v.name] ?? ''}
                  onChange={e => setValues({ ...values, [v.name]: e.target.value })}
                />
              ) : (
                <textarea
                  className="input"
                  style={{
                    minHeight: v.type === 'list' ? 120 : String(values[v.name] ?? '').length > 60 ? 90 : 44,
                    fontFamily: v.type === 'list' ? 'var(--mono)' : undefined,
                  }}
                  value={values[v.name] ?? ''}
                  onChange={e => setValues({ ...values, [v.name]: e.target.value })}
                />
              )}
            </Field>
          ))
        ) : (
          <p className="sub">No editable text slots in this video. You can ask AI to refine the scene, or add new scenes from Style.</p>
        )
      ) : detail.texts.length ? (
        detail.texts.map((t: TextLayer) => (
          <Field key={t.path} label={`${t.scene} · ${slotName(t.scene, t.id)}`}>
            <textarea
              className="input"
              style={{ minHeight: t.content.length > 60 ? 90 : 44 }}
              value={texts[t.path] ?? ''}
              onChange={e => setTexts({ ...texts, [t.path]: e.target.value })}
            />
          </Field>
        ))
      ) : (
        <p className="sub">No text found in this video.</p>
      )}

      {(detail.mode === 'template' ? fields.length : detail.texts.length) ? (
        <Button variant="primary" loading={busy} onClick={apply}>
          Save Changes
        </Button>
      ) : null}
    </>
  );
}

type AskAiProps = PaneProps & {
  draft: string;
  onDraft: (text: string) => void;
  scene: Scene | null;
  sceneIndex: number;
  onClearScene: () => void;
  revert: { n: number; label: string } | null;
  onApplied: (revision: { n: number; label: string } | null) => void;
};

function AskAi({ detail, file, reload, setNote, draft, onDraft, scene, sceneIndex, onClearScene, revert, onApplied }: AskAiProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [reverting, setReverting] = useState(false);
  const { toast } = useUi();

  const run = async () => {
    if (!draft.trim()) return;
    setError('');
    setNotes([]);
    setBusy(true);
    // The revision that is active now is what this change replaces, so it is what Revert goes back to.
    try {
      const history = await api<{ revisions: Revision[] }>(`/api/history?file=${encodeURIComponent(file)}`);
      const active = history.revisions.at(-1);
      const result = await runJob<{ warnings?: string[] }>(
        '/api/refine',
        { file, instruction: draft.trim() },
        (j: Job) => setNote(cleanUserStatus(j.messages.at(-1)))
      );
      const warnings = result?.warnings ?? [];
      setNotes(warnings);
      setNote(warnings.length ? `AI refinement applied · ${warnings.length} note${warnings.length === 1 ? '' : 's'}` : 'AI refinement applied');
      onDraft('');
      onApplied(active ? { n: active.n, label: active.label } : null);
      await reload(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = async () => {
    if (!revert) return;
    setReverting(true);
    try {
      await api('/api/restore', { file, n: revert.n });
      setNote(`Reverted to version #${revert.n}`);
      setNotes([]);
      setError('');
      onApplied(null);
      await reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setReverting(false);
    }
  };

  const chips = [
    '⚡ Make it faster & punchier',
    '✍️ Shorten headlines for high impact',
    '🎯 Add strong call to action',
    '✨ Modern, clean & minimal tone',
    '🔥 Bolder typography & high energy',
  ];

  return (
    <>
      <h2>Ask the studio</h2>
      <p className="sub">
        Describe any change in plain words. The studio adjusts the type, timing and layout to match.
      </p>

      {scene ? (
        <div className="ai-scene">
          <SparklesIcon size={14} />
          <div>
            <b>Scene {sceneIndex + 1} · {scene.name}</b>
            <small>{dur(scene.durationFrames / detail.fps)} · frames {scene.startFrame}–{scene.startFrame + scene.durationFrames}</small>
          </div>
          <Button size="sm" variant="ghost" onClick={onClearScene}>Clear</Button>
        </div>
      ) : null}

      <textarea
        className="input"
        style={{ minHeight: 120 }}
        placeholder="e.g. Make the pacing 20% faster, emphasize our 99.9% guarantee, and give the closing line more punch…"
        value={draft}
        onChange={e => onDraft(e.target.value)}
      />

      <div className="chips">
        {chips.map(chipText => (
          <button key={chipText} className="chip" onClick={() => onDraft(chipText.slice(3))}>
            {chipText}
          </button>
        ))}
      </div>

      {detail.mode === 'template' ? (
        <Notice tone="neutral">
          This video is built from a template, so edits change its variables (text, colours, theme) rather than individual layers.
        </Notice>
      ) : null}

      {error ? <Notice tone="error" title="Could not apply change">{error}</Notice> : null}

      {notes.length ? (
        <Notice tone="warn" title="Applied, with notes">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        </Notice>
      ) : null}

      {revert ? (
        <div className="ai-revert">
          <div>
            <b>Newest change is live.</b>
            <small>Version #{revert.n} · {revert.label}</small>
          </div>
          <Button size="sm" loading={reverting} onClick={undo}>Revert to #{revert.n}</Button>
        </div>
      ) : null}

      <Button variant="primary" loading={busy} icon={<SparklesIcon size={14} />} onClick={run}>
        {busy ? 'Directing AI…' : 'Apply AI Direction'}
      </Button>
    </>
  );
}

function Look({ detail, save }: PaneProps) {
  const [lib, setLib] = useState<Library | null>(null);
  const [category, setCategory] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    api<Library>('/api/library').then(setLib, e => setError(e.message));
  }, []);

  const canTheme = Object.keys(detail.theme).length > 0;
  const categories = lib ? ['all', ...new Set(lib.blocks.map(b => b.category))] : [];

  return (
    <>
      <h2>Color Palettes & Themes</h2>
      <p className="sub">Apply a curated brand theme across all video scenes instantly.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="themes">
        {lib?.themes.map(t => (
          <button
            key={t.id}
            className="theme"
            disabled={!canTheme}
            title={canTheme ? t.description : 'This video has custom colors'}
            onClick={() => void save('/api/theme', { id: detail.id, theme: t.id }, `Theme applied: ${t.name}`).catch(() => {})}
          >
            <div className="swatches">
              {['bg', 'surface', 'accent', 'accent2'].map(k => (
                <i key={k} style={{ background: String(t.variables[k]) }} />
              ))}
            </div>
            <b>{t.name}</b>
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 32 }}>Add Scene from Catalog</h2>
      <p className="sub">Insert production-ready scene blocks and overlays into your video.</p>

      <select
        className="input"
        style={{ marginBottom: 10 }}
        value={category}
        onChange={e => setCategory(e.target.value)}
      >
        {categories.map(c => (
          <option key={c} value={c}>
            {c === 'all' ? 'All categories' : c}
          </option>
        ))}
      </select>

      {lib?.blocks
        .filter(b => category === 'all' || b.category === category)
        .map((b: Block) => (
          <div className="row" key={b.id}>
            <div>
              <b>{b.name}</b>
              <small>{b.description}</small>
            </div>
            <Button size="sm" onClick={() => void save('/api/add-block', { id: detail.id, block: b.id }, `Added ${b.name}`).catch(() => {})}>
              Add Scene
            </Button>
          </div>
        ))}
    </>
  );
}

function History({ detail, file, planFile, reload, setNote }: PaneProps) {
  const [timeline, setTimeline] = useState<Revision[] | null>(null);
  const [plan, setPlan] = useState<Revision[] | null>(null);
  const [error, setError] = useState('');
  const { toast } = useUi();

  const load = () =>
    Promise.all([
      api<{ revisions: Revision[] }>(`/api/history?file=${encodeURIComponent(file)}`),
      api<{ revisions: Revision[] }>(`/api/history?file=${encodeURIComponent(planFile)}`),
    ]).then(
      ([c, p]) => {
        setTimeline([...c.revisions].reverse());
        setPlan([...p.revisions].reverse());
      },
      e => setError(e.message)
    );

  useEffect(() => {
    void load();
  }, [detail]);

  const restore = (target: string, n: number, what: 'timeline' | 'plan') =>
    api('/api/restore', { file: target, n }).then(
      () => {
        if (what === 'timeline') {
          setNote(`Restored version #${n}`);
          return reload(false);
        }
        toast(`Restored plan version #${n}`, 'success');
        return load();
      },
      e => toast(e.message, 'error')
    );

  const rows = (list: Revision[] | null, what: 'timeline' | 'plan') => list?.map((r, i) => (
    <div className="row" key={`${what}-${r.n}`}>
      <div>
        <b>Version #{r.n} · {r.kind}</b>
        <small>{r.label}</small>
        <small>{new Date(r.at).toLocaleString()}</small>
      </div>
      {i === 0 ? (
        <Badge tone="green" dot>Active</Badge>
      ) : (
        <Button size="sm" onClick={() => void restore(what === 'plan' ? planFile : file, r.n, what)}>
          Restore
        </Button>
      )}
    </div>
  ));

  return (
    <>
      <h2>Edit history</h2>
      <p className="sub">Every change is saved automatically. The timeline and the storyboard keep separate histories.</p>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <h3 className="history-group">Timeline</h3>
      {timeline === null ? <p className="sub">Loading…</p> : timeline.length === 0 ? <p className="sub">No timeline revisions yet.</p> : rows(timeline, 'timeline')}

      <h3 className="history-group">Storyboard</h3>
      {plan === null ? <p className="sub">Loading…</p> : plan.length === 0 ? <p className="sub">No storyboard revisions yet. Start one from the Storyboard workspace.</p> : rows(plan, 'plan')}
    </>
  );
}

function Export({ detail, file, intent, onIntentDone }: PaneProps & {
  intent: { kind: 'review' | 'render'; nonce: number } | null;
  onIntentDone: () => void;
}) {
  const [scale, setScale] = useState('1');
  const [busy, setBusy] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [video, setVideo] = useState<{ url: string; relative: string } | null>(null);
  const [picture, setPicture] = useState<{ title: string; url: string; items?: string[] } | null>(null);

  const run = async (kind: string, work: () => Promise<void>) => {
    setError('');
    setBusy(kind);
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      setLabel('');
    }
  };

  const progress = (j: Job) => setLabel(cleanUserStatus(j.messages.at(-1)));

  const render = () =>
    run('render', async () => {
      const r = await runJob('/api/render', { file, output: 'out.mp4', scale: Number(scale) }, progress);
      setPicture(null);
      setVideo(r);
    });

  const check = () =>
    run('check', async () => {
      const r = await runJob('/api/review', { file }, progress);
      setVideo(null);
      setPicture({
        title: r.issues.length ? `${r.issues.length} design recommendations found` : 'Design quality audit passed',
        url: r.url,
        items: r.issues.slice(0, 12).map((i: any) => i.message ?? String(i)),
      });
    });

  const thumb = () =>
    run('thumb', async () => {
      const r = await runJob('/api/thumbnail', { file }, progress);
      setVideo(null);
      setPicture({ title: 'Video Poster Cover', url: r.url });
    });

  // The top bar's Review and Export buttons land here already meaning to start; the nonce stops a rerun.
  const handled = useRef(0);
  useEffect(() => {
    if (!intent || intent.nonce === handled.current) return;
    handled.current = intent.nonce;
    onIntentDone();
    void (intent.kind === 'render' ? render() : check());
  }, [intent]);

  return (
    <>
      <h2>Export Video</h2>
      <p className="sub">
        {detail.width}×{detail.height} · {dur(detail.durationFrames / detail.fps)} · MP4 Video
      </p>

      <Field label="Quality">
        <select className="input" value={scale} onChange={e => setScale(e.target.value)}>
          <option value="1">High quality (1080p)</option>
          <option value="0.5">Standard (720p, faster)</option>
          <option value="0.25">Draft (quick check)</option>
        </select>
      </Field>

      <Button
        variant="primary"
        loading={busy === 'render'}
        disabled={!!busy}
        icon={<DownloadIcon size={14} />}
        onClick={() => void render()}
      >
        {busy === 'render' ? label || 'Rendering video…' : 'Download Video (MP4)'}
      </Button>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <Button
          loading={busy === 'check'}
          disabled={!!busy}
          icon={<ShieldIcon size={14} />}
          onClick={() => void check()}
        >
          Check the design
        </Button>
        <Button
          loading={busy === 'thumb'}
          disabled={!!busy}
          icon={<FilmIcon size={14} />}
          onClick={() => void thumb()}
        >
          Poster Cover
        </Button>
      </div>

      {error ? <Notice tone="error" title="Export failed">{error}</Notice> : null}

      {video ? (
        <div className="result">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <b>Video is ready to download!</b>
            <Badge tone="green" dot>Export Complete</Badge>
          </div>
          <video src={video.url} controls autoPlay />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12 }}>
            <a className="btn primary sm" href={video.url} download={`${detail.id}.mp4`}>
              <DownloadIcon size={14} /> Download MP4
            </a>
          </div>
        </div>
      ) : null}

      {picture ? (
        <div className="result">
          <b>{picture.title}</b>
          {picture.items?.length ? (
            <ul style={{ margin: '8px 0', paddingLeft: 20, fontSize: 13, color: 'var(--muted)' }}>
              {picture.items.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          ) : null}
          <img src={`${picture.url}?t=${Date.now()}`} alt="" />
          {picture.title === 'Video Poster Cover' ? (
            <div style={{ marginTop: 12 }}>
              <a className="btn primary sm" href={picture.url} download={`${detail.id}.png`}>
                <DownloadIcon size={14} /> Download Poster (PNG)
              </a>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
