import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { slotName } from '../slotName';
import { api, cleanUserStatus, dur, runJob, type Block, type CompileProductionResult, type Detail, type Job, type Library, type ProductionState, type Revision, type SaveProductionResult, type Scene, type TextLayer, type Variable } from '../api';
import { composeNotesKey } from '../composeReport';
import { PlayerView, type CompareTarget, type PlayerHandle } from '../Player';
import { editorPath, go, planPath } from '../router';
import {
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
  PlusIcon,
  ShieldIcon,
  SlidersIcon,
  SparklesIcon,
  Spinner,
  TypeIcon,
  useUi,
} from '../ui';

const tabs = [
  ['edit', 'Content', FilmIcon] as const,
  ['script', 'Script & Beats', TypeIcon] as const,
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
  const [compareTarget, setCompareTarget] = useState<CompareTarget | null>(null);
  const [selectedTextPath, setSelectedTextPath] = useState<string | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
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

  const openCompare = useCallback(async (n: number, label: string) => {
    try {
      const data = await api<{ raw: any; revision: Revision }>(`/api/revision?file=${encodeURIComponent(file)}&n=${n}`);
      setCompareTarget({ n, label, raw: data.raw });
      toast(`Comparing version #${n} with live draft`, 'info');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [file, toast]);

  const saveDirectText = useCallback(async (path: string, content: string, variableName?: string) => {
    if (!detail) return;
    try {
      if (detail.mode === 'template' && variableName) {
        await api('/api/variables', { id: detail.id, values: { [variableName]: content } });
      } else {
        await api('/api/text', { id: detail.id, path, content });
      }
      setNote('Text updated');
      toast('Text updated on canvas', 'success');
      await load(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [detail, load, setNote, toast]);

  const snapLayer = useCallback(async (path: string, dx: number, dy: number) => {
    if (!detail) return;
    try {
      await api('/api/layer/snap', { id: detail.id, path, dx, dy });
      setNote('Snapped to safe area');
      toast('Moved layer into platform safe zone', 'success');
      await load(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }, [detail, load, setNote, toast]);

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
          compareTarget={compareTarget}
          onCloseCompare={() => setCompareTarget(null)}
          onRestoreCompare={async n => {
            await api('/api/restore', { file, n });
            setNote(`Restored version #${n}`);
            setCompareTarget(null);
            await load(true);
          }}
          onFrame={f => {
            frameAt.current = f;
            setCurrentFrame(f);
          }}
          selectedLayerPath={selectedTextPath}
          onSelectLayerPath={setSelectedTextPath}
          onSaveLayerText={saveDirectText}
          onSnapLayer={snapLayer}
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
          {tab === 'script' ? (
            <ScriptTab
              {...props}
              currentFrame={currentFrame}
              onSeek={f => player.current?.seek(f)}
            />
          ) : tab === 'ai' ? (
            <AskAi
              {...props}
              draft={aiDraft}
              onDraft={setAiDraft}
              scene={selectedScene}
              sceneIndex={selectedIndex}
              onClearScene={() => setSelectedSceneId(null)}
              revert={aiRevert}
              onApplied={setAiRevert}
              onCompare={openCompare}
            />
          ) : tab === 'look' ? (
            <Look {...props} />
          ) : tab === 'history' ? (
            <History {...props} onCompare={openCompare} />
          ) : tab === 'export' ? (
            <Export {...props} intent={exportIntent} onIntentDone={() => setExportIntent(null)} />
          ) : (
            <Edit {...props} selectedTextPath={selectedTextPath} onSelectTextPath={setSelectedTextPath} />
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

function Edit({
  detail,
  save,
  reload,
  setNote,
  selectedTextPath,
  onSelectTextPath,
}: PaneProps & {
  selectedTextPath?: string | null;
  onSelectTextPath?: (path: string | null) => void;
}) {
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
        detail.texts.map((t: TextLayer) => {
          const isSelected = selectedTextPath === t.path;
          return (
            <Field key={t.path} label={`${t.scene} · ${slotName(t.scene, t.id)}`}>
              <textarea
                className="input"
                style={{
                  minHeight: t.content.length > 60 ? 90 : 44,
                  borderColor: isSelected ? 'var(--accent)' : undefined,
                  boxShadow: isSelected ? '0 0 10px rgba(70, 147, 241, 0.35)' : undefined,
                }}
                value={texts[t.path] ?? ''}
                onFocus={() => onSelectTextPath?.(t.path)}
                onChange={e => setTexts({ ...texts, [t.path]: e.target.value })}
              />
            </Field>
          );
        })
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

type ScriptTabProps = PaneProps & {
  currentFrame: number;
  onSeek: (frame: number) => void;
};

function ScriptTab({ detail, reload, setNote, currentFrame, onSeek }: ScriptTabProps) {
  const { toast } = useUi();
  const [planState, setPlanState] = useState<ProductionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [beats, setBeats] = useState<any[]>([]);

  const loadPlan = useCallback(async () => {
    try {
      setLoading(true);
      const state = await api<ProductionState>(`/api/production?id=${encodeURIComponent(detail.id)}`);
      setPlanState(state);
      const scriptBeats = (state.production as any)?.script?.beats ?? [];
      setBeats(scriptBeats);
      setDirty(false);
    } catch {
      setPlanState(null);
    } finally {
      setLoading(false);
    }
  }, [detail.id]);

  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const initPlan = async () => {
    try {
      setLoading(true);
      const result = await api<SaveProductionResult>('/api/production/init', { id: detail.id });
      setPlanState({
        production: result.production,
        valid: true,
        issues: result.issues,
        summary: result.summary,
        modified: result.modified,
        base: result.base,
      });
      setBeats((result.production as any)?.script?.beats ?? []);
      toast('Narrative script created from timeline scenes', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const updateBeat = (index: number, key: string, value: any) => {
    setBeats(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
    setDirty(true);
  };

  const saveScript = async () => {
    if (!planState?.production) return;
    setSaving(true);
    try {
      const currentPlan = structuredClone(planState.production) as any;
      currentPlan.script = currentPlan.script ?? {};
      currentPlan.script.beats = beats;
      const res = await api<SaveProductionResult>('/api/production', {
        id: detail.id,
        production: currentPlan,
        baseModified: planState.modified,
      });
      setPlanState({
        production: res.production,
        valid: true,
        issues: res.issues,
        summary: res.summary,
        modified: res.modified,
        base: res.base,
      });
      setDirty(false);
      setNote('Script saved');
      toast('Script changes saved', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const compileToTimeline = async () => {
    setCompiling(true);
    try {
      if (dirty && planState?.production) {
        const currentPlan = structuredClone(planState.production) as any;
        currentPlan.script = currentPlan.script ?? {};
        currentPlan.script.beats = beats;
        await api('/api/production', { id: detail.id, production: currentPlan, baseModified: planState.modified });
      }
      const report = await api<CompileProductionResult>('/api/production/compile', { id: detail.id, apply: true });
      toast(`Video compiled: ${report.changes.length ? report.changes.join(', ') : 'Timeline synced'}`, 'success');
      setNote('Timeline updated from script');
      setDirty(false);
      await reload(true);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setCompiling(false);
    }
  };

  const addBeat = () => {
    const n = beats.length + 1;
    const newBeat = {
      id: `beat-${n}`,
      name: `Scene ${n} Beat`,
      onScreen: `Key message for scene ${n}`,
      speech: '',
    };
    setBeats(prev => [...prev, newBeat]);
    setDirty(true);
  };

  if (loading) {
    return (
      <div style={{ padding: '20px 0' }}>
        <Spinner size={20} />
        <p className="sub" style={{ marginTop: 8 }}>Loading narrative script…</p>
      </div>
    );
  }

  if (!planState?.production || !beats.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Script & Narrative Beats</h2>
        <p className="sub">
          Link spoken voiceover and on-screen copy directly to your video scenes. Editing lines updates and synchronizes with your timeline.
        </p>
        <Notice tone="neutral" title="No script linked yet">
          <p style={{ margin: '4px 0 12px' }}>
            Initialize a narrative production script from your current scenes. Each scene becomes an editable narrative beat linked to playback.
          </p>
          <Button variant="primary" icon={<TypeIcon size={14} />} onClick={initPlan}>
            Start Script from Timeline
          </Button>
        </Notice>
      </div>
    );
  }

  const scenes = detail.scenes ?? [];
  const fps = detail.fps || 30;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2>Script & Narrative Beats</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant={dirty ? 'primary' : 'secondary'} loading={saving} disabled={!dirty} onClick={saveScript}>
            Save
          </Button>
          <Button size="sm" variant="primary" loading={compiling} icon={<SparklesIcon size={13} />} onClick={compileToTimeline} title="Compile script into active video timeline">
            Sync to Video
          </Button>
        </div>
      </div>
      <p className="sub">
        Click any beat to jump the video playhead. The active beat glows as the video scrubs or plays.
      </p>

      {dirty ? (
        <Notice tone="warn" title="Unsynced script edits">
          <p style={{ margin: 0 }}>Click <b>Sync to Video</b> to compile your edited lines into the active video layers.</p>
        </Notice>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
        {beats.map((beat, idx) => {
          const matchingScene = scenes[idx];
          const startF = matchingScene ? matchingScene.startFrame : idx * 90;
          const durationF = matchingScene ? matchingScene.durationFrames : 90;
          const endF = startF + durationF;
          const isActive = currentFrame >= startF && currentFrame < endF;

          return (
            <div
              key={beat.id || idx}
              style={{
                border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isActive ? 'color-mix(in srgb, var(--accent) 9%, var(--surface))' : 'var(--surface)',
                borderRadius: 'var(--radius-sm)',
                padding: '12px 14px',
                transition: 'border-color 0.15s ease, background 0.15s ease',
                boxShadow: isActive ? '0 0 14px rgba(70, 147, 241, 0.15)' : 'none',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  cursor: 'pointer',
                }}
                onClick={() => onSeek(startF)}
                title="Click to seek player to this beat"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ fontSize: 11, color: 'var(--muted)', background: 'var(--surface-2)', padding: '2px 5px', borderRadius: 4 }}>
                    {beat.id || `beat-${idx + 1}`}
                  </code>
                  <b style={{ fontSize: 13, color: isActive ? 'var(--accent)' : 'var(--text)' }}>
                    {beat.name || `Beat ${idx + 1}`}
                  </b>
                  {isActive ? <Badge tone="green" dot>Playing now</Badge> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                    {dur(durationF / fps)} · f{startF}–{endF}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Field label="On-Screen Text (Visual)">
                  <textarea
                    className="input"
                    rows={2}
                    value={beat.onScreen ?? ''}
                    placeholder="Text the viewer reads on screen…"
                    onChange={e => updateBeat(idx, 'onScreen', e.target.value)}
                  />
                </Field>

                <Field label="Spoken Dialogue / Voiceover">
                  <input
                    className="input"
                    value={beat.speech ?? ''}
                    placeholder="Spoken narration words…"
                    onChange={e => updateBeat(idx, 'speech', e.target.value)}
                  />
                </Field>
              </div>
            </div>
          );
        })}

        <Button size="sm" variant="secondary" icon={<PlusIcon size={14} />} onClick={addBeat}>
          Add Script Beat
        </Button>
      </div>
    </>
  );
}

type CompDiffItem = {
  type: 'duration' | 'scene_time' | 'text' | 'theme' | 'scene_count';
  title: string;
  before: string;
  after: string;
  badge?: string;
  tone?: 'positive' | 'negative' | 'neutral' | 'accent';
};

function computeCompositionDiff(beforeRaw: any, afterRaw: any, fps: number): CompDiffItem[] {
  if (!beforeRaw || !afterRaw) return [];
  const diffs: CompDiffItem[] = [];

  // 1. Duration
  const bDur = Number(beforeRaw.durationFrames) || 0;
  const aDur = Number(afterRaw.durationFrames) || 0;
  if (bDur !== aDur && bDur > 0 && aDur > 0) {
    const diffSec = (aDur - bDur) / fps;
    diffs.push({
      type: 'duration',
      title: 'Total Video Duration',
      before: `${(bDur / fps).toFixed(1)}s`,
      after: `${(aDur / fps).toFixed(1)}s`,
      badge: `${diffSec > 0 ? '+' : ''}${diffSec.toFixed(1)}s`,
      tone: diffSec < 0 ? 'positive' : 'neutral',
    });
  }

  // 2. Scene count & per-scene retiming
  const bScenes = Array.isArray(beforeRaw.scenes) ? beforeRaw.scenes : [];
  const aScenes = Array.isArray(afterRaw.scenes) ? afterRaw.scenes : [];
  if (bScenes.length !== aScenes.length) {
    const dCount = aScenes.length - bScenes.length;
    diffs.push({
      type: 'scene_count',
      title: 'Scene Count',
      before: `${bScenes.length} scenes`,
      after: `${aScenes.length} scenes`,
      badge: `${dCount > 0 ? '+' : ''}${dCount} scenes`,
      tone: 'accent',
    });
  }

  for (let i = 0; i < Math.min(bScenes.length, aScenes.length); i++) {
    const bs = bScenes[i];
    const as = aScenes[i];
    const bsFrames = Number(bs.durationFrames) || 0;
    const asFrames = Number(as.durationFrames) || 0;
    if (bsFrames !== asFrames && bsFrames > 0 && asFrames > 0) {
      const dSec = (asFrames - bsFrames) / fps;
      diffs.push({
        type: 'scene_time',
        title: `Scene ${i + 1} (${as.name || bs.name || 'Beat'}) Timing`,
        before: `${(bsFrames / fps).toFixed(1)}s`,
        after: `${(asFrames / fps).toFixed(1)}s`,
        badge: `${dSec > 0 ? '+' : ''}${dSec.toFixed(1)}s`,
        tone: dSec < 0 ? 'positive' : 'neutral',
      });
    }
  }

  // 3. Text content changes
  const extractTextMap = (comp: any) => {
    const map = new Map<string, string>();
    if (!comp || !Array.isArray(comp.scenes)) return map;
    comp.scenes.forEach((s: any, sIdx: number) => {
      const walk = (layers: any[], basePath: string) => {
        if (!Array.isArray(layers)) return;
        layers.forEach((l: any, lIdx: number) => {
          if (!l) return;
          const path = `${basePath}[${lIdx}]`;
          const id = l.id || `s${sIdx + 1}-layer${lIdx + 1}`;
          if (l.type === 'group') walk(l.children, `${path}.children`);
          else if (l.type === 'text') {
            let text = typeof l.content === 'string' ? l.content : '';
            if (!text && Array.isArray(l.spans)) text = l.spans.map((sp: any) => sp.text || '').join('');
            if (text) map.set(id, text);
          }
        });
      };
      walk(s.layers, `scenes[${sIdx}].layers`);
    });
    return map;
  };

  const bTexts = extractTextMap(beforeRaw);
  const aTexts = extractTextMap(afterRaw);

  for (const [id, aVal] of aTexts.entries()) {
    const bVal = bTexts.get(id);
    if (bVal !== undefined && bVal !== aVal) {
      diffs.push({
        type: 'text',
        title: `Text Layer "${id}"`,
        before: bVal,
        after: aVal,
        badge: 'Copy changed',
        tone: 'accent',
      });
    }
  }

  // 4. Theme & brand colors
  if (beforeRaw.theme !== afterRaw.theme && (beforeRaw.theme || afterRaw.theme)) {
    diffs.push({
      type: 'theme',
      title: 'Visual Theme',
      before: beforeRaw.theme || 'Auto',
      after: afterRaw.theme || 'Auto',
      badge: 'Theme update',
      tone: 'accent',
    });
  }

  return diffs;
}

type AskAiProps = PaneProps & {
  draft: string;
  onDraft: (text: string) => void;
  scene: Scene | null;
  sceneIndex: number;
  onClearScene: () => void;
  revert: { n: number; label: string } | null;
  onApplied: (revision: { n: number; label: string } | null) => void;
  onCompare: (n: number, label: string) => void;
};

function AskAi({ detail, file, reload, setNote, draft, onDraft, scene, sceneIndex, onClearScene, revert, onApplied, onCompare }: AskAiProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [reverting, setReverting] = useState(false);
  const [beforeRaw, setBeforeRaw] = useState<any>(null);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const { toast } = useUi();

  useEffect(() => {
    if (!revert) {
      setBeforeRaw(null);
      return;
    }
    let live = true;
    setLoadingBefore(true);
    api<{ raw: any; revision: Revision }>(`/api/revision?file=${encodeURIComponent(file)}&n=${revert.n}`)
      .then(res => {
        if (live) setBeforeRaw(res.raw);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoadingBefore(false);
      });
    return () => { live = false; };
  }, [file, revert]);

  const diffs = useMemo(() => {
    if (!beforeRaw || !detail?.source?.raw) return [];
    return computeCompositionDiff(beforeRaw, detail.source.raw, detail.fps || 30);
  }, [beforeRaw, detail]);

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

      {/* Structured AI Diff Inspector & Decision Card */}
      {revert ? (
        <div
          className="ai-diff-inspector"
          style={{
            background: 'var(--surface-2)',
            border: '1px solid color-mix(in srgb, var(--accent) 55%, var(--border))',
            borderRadius: 'var(--radius)',
            padding: 14,
            margin: '14px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SparklesIcon size={14} style={{ color: 'var(--accent)' }} />
              <b style={{ fontSize: 13, color: 'var(--text)' }}>AI Proposed Modifications</b>
              {diffs.length ? (
                <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>
                  {diffs.length} {diffs.length === 1 ? 'change' : 'changes'}
                </span>
              ) : null}
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              vs #{revert.n}
            </span>
          </div>

          {/* Diffs List */}
          {loadingBefore ? (
            <div style={{ padding: '8px 0', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Spinner size={12} /> Loading revision AST diff…
            </div>
          ) : diffs.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
              {diffs.map((d, idx) => (
                <div key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <b style={{ color: 'var(--text)', fontSize: 12 }}>{d.title}</b>
                    {d.badge ? (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: d.tone === 'positive' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(70, 147, 241, 0.15)', color: d.tone === 'positive' ? '#34d399' : 'var(--accent)' }}>
                        {d.badge}
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontFamily: d.type === 'text' ? 'inherit' : 'var(--mono)', fontSize: 11.5 }}>
                    <div style={{ color: '#f87171', display: 'flex', gap: 6, textDecoration: 'line-through', opacity: 0.85 }}>
                      <span style={{ userSelect: 'none', color: '#f87171' }}>−</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.before}</span>
                    </div>
                    <div style={{ color: '#34d399', display: 'flex', gap: 6, fontWeight: 500 }}>
                      <span style={{ userSelect: 'none', color: '#34d399' }}>+</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.after}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="sub" style={{ margin: 0 }}>
              Refinement applied: animation curves or internal styling adjusted.
            </p>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
            <Button size="sm" variant="secondary" icon={<SlidersIcon size={12} />} onClick={() => onCompare(revert.n, revert.label)} title="Launch side-by-side / split visual scrubber">
              Compare Split
            </Button>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" loading={reverting} onClick={undo} title="Discard changes and restore previous version">
                Revert to #{revert.n}
              </Button>
              <Button size="sm" variant="primary" icon={<CheckIcon size={12} />} onClick={() => { onApplied(null); setNote('Changes accepted'); }} title="Accept and keep newest version">
                Keep Changes
              </Button>
            </div>
          </div>
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

function History({ detail, file, planFile, reload, setNote, onCompare }: PaneProps & {
  onCompare: (n: number, label: string) => void;
}) {
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
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {what === 'timeline' ? (
            <Button size="sm" variant="ghost" icon={<SlidersIcon size={12} />} onClick={() => onCompare(r.n, r.label)}>
              Compare
            </Button>
          ) : null}
          <Button size="sm" onClick={() => void restore(what === 'plan' ? planFile : file, r.n, what)}>
            Restore
          </Button>
        </div>
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
