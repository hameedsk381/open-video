import { useCallback, useEffect, useState } from 'react';
import {
  ApiError,
  api,
  dur,
  type CompileProductionResult,
  type Detail,
  type Production,
  type ProductionIssue,
  type ProductionShot,
  type ProductionState,
  type ProductionSummaryState,
  type SaveProductionResult,
} from '../api';
import { editorPath, go, planPath } from '../router';
import { groupShots, issuesBySection, newShot, planSeconds, planSections, sectionLabels, shotMedia, type PlanSection } from '../productionPlan';
import {
  ArrowLeftIcon,
  Badge,
  Button,
  CheckIcon,
  DownloadIcon,
  Empty,
  Field,
  FilmIcon,
  LayersIcon,
  Notice,
  PlayIcon,
  SlidersIcon,
  Spinner,
  TypeIcon,
  useUi,
} from '../ui';

const sectionIcons: Record<PlanSection, typeof FilmIcon> = { brief: FilmIcon, script: TypeIcon, storyboard: LayersIcon, shots: SlidersIcon, compile: PlayIcon };
const transitions = ['push', 'fade', 'slide', 'wipe', 'zoom', 'dip'] as const;
const textures = ['none', 'grid', 'dots', 'scanlines', 'paper'] as const;
const exportFormats = ['mp4', 'webm', 'mov', 'gif', 'png'] as const;
const productionTypes = ['motion-graphics', 'cinematic', 'story', 'commercial', 'explainer', 'music-video', 'hybrid'] as const;

type Edit = (mutate: (draft: any) => void) => void;

/** The plan workspace: the brief, script, storyboard and shot list of production.json, and the compile step. */
export function ProductionPlan({ id, section }: { id: string; section: string }) {
  const { toast, confirm } = useUi();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [plan, setPlan] = useState<Production | null>(null);
  const [base, setBase] = useState(`/files/${id}/`);
  const [summary, setSummary] = useState<ProductionSummaryState | null>(null);
  const [issues, setIssues] = useState<ProductionIssue[]>([]);
  const [modified, setModified] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'init' | 'save' | 'check' | 'compile'>('');
  const [report, setReport] = useState<CompileProductionResult | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [state, project] = await Promise.all([
        api<ProductionState>(`/api/production?id=${encodeURIComponent(id)}`),
        api<Detail>(`/api/project?id=${encodeURIComponent(id)}`),
      ]);
      setDetail(project);
      setPlan(state.production as Production | null);
      setBase(state.base);
      setSummary(state.summary);
      setIssues(state.issues);
      setModified(state.modified);
      setDirty(false);
      setConflict(false);
      setReport(null);
      setMissing(false);
    } catch (e) {
      if ((e as ApiError).status === 400 || (e as ApiError).status === 404) setMissing(true);
      else setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const edit: Edit = useCallback(mutate => {
    setPlan(current => {
      if (!current) return current;
      const next = structuredClone(current) as any;
      mutate(next);
      return next as Production;
    });
    setDirty(true);
    setReport(null);
  }, []);

  const start = async () => {
    setBusy('init');
    setError('');
    try {
      const result = await api<SaveProductionResult>('/api/production/init', { id });
      setPlan(result.production as Production);
      setBase(result.base);
      setSummary(result.summary);
      setIssues(result.issues);
      setModified(result.modified);
      setDirty(false);
      toast('Plan started from the timeline', 'success');
    } catch (e) {
      setError((e as Error).message);
      if ((e as ApiError).status === 409) await load();
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!plan) return;
    setBusy('save');
    setError('');
    setConflict(false);
    try {
      const result = await api<SaveProductionResult>('/api/production', { id, production: plan, baseModified: modified });
      setPlan(result.production as Production);
      setBase(result.base);
      setSummary(result.summary);
      setIssues(result.issues);
      setModified(result.modified);
      setDirty(false);
      setReport(null);
      toast(result.revision.changes.length ? `Plan saved · ${result.revision.changes.join(' · ')}` : 'Plan saved', 'success');
    } catch (e) {
      const failure = e as ApiError;
      if (failure.status === 409) setConflict(true);
      if (Array.isArray(failure.body?.issues)) setIssues(failure.body.issues);
      setError(failure.message);
    } finally {
      setBusy('');
    }
  };

  const check = async () => {
    setBusy('check');
    setError('');
    setReport(null);
    try {
      setReport(await api<CompileProductionResult>('/api/production/compile', { id, dryRun: true }));
    } catch (e) {
      const failure = e as ApiError;
      if (Array.isArray(failure.body?.issues)) setIssues(failure.body.issues);
      setError(failure.message);
    } finally {
      setBusy('');
    }
  };

  const compile = async () => {
    if (!report) return;
    const scenes = report.composition.scenes;
    if (!(await confirm(`Replace the timeline with ${scenes} scene${scenes === 1 ? '' : 's'} from this plan? The plan is kept, and the current timeline is saved as a revision.`, 'Replace the timeline'))) return;
    setBusy('compile');
    setError('');
    try {
      const result = await api<CompileProductionResult>('/api/production/compile', { id });
      toast(`Timeline compiled${result.revision ? ` · version #${result.revision.n}` : ''}`, 'success');
      go(editorPath(id, 'edit'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };

  if (missing) {
    return (
      <div className="center">
        <h2>Could not open project</h2>
        <Notice tone="error">There is no project “{id}”.</Notice>
        <Button onClick={() => go('#/')}>Back to Projects</Button>
      </div>
    );
  }

  if (!detail && !plan) {
    return (
      <div className="center">
        <Spinner size={32} />
        <p className="sub" style={{ marginTop: 14 }}>Loading the production plan…</p>
      </div>
    );
  }

  const active: PlanSection = (planSections as readonly string[]).includes(section) ? (section as PlanSection) : 'brief';
  const counts = issuesBySection(issues);
  const badge = !plan
    ? { tone: 'neutral' as const, text: 'Not started' }
    : issues.length
      ? { tone: 'red' as const, text: `${issues.length} to fix` }
      : dirty
        ? { tone: 'amber' as const, text: 'Unsaved changes' }
        : { tone: 'green' as const, text: 'Ready' };

  return (
    <div className="plan-page">
      <div className="plan-head">
        <Button size="sm" variant="ghost" icon={<ArrowLeftIcon size={14} />} onClick={() => go(editorPath(id))}>Editor</Button>
        <div className="plan-title">
          <h1>{plan?.name ?? detail?.name ?? 'Production plan'}</h1>
          <small>{detail ? `${detail.width}×${detail.height} · ${dur(detail.durationFrames / detail.fps)}` : `Project ${id}`}</small>
        </div>
        <span className="grow" />
        <Badge tone={badge.tone} dot>{badge.text}</Badge>
        {plan && dirty ? <span className="saved">Not saved yet</span> : null}
        {plan ? (
          <Button size="sm" variant="primary" loading={busy === 'save'} disabled={!dirty || busy === 'save'} icon={<CheckIcon size={14} />} onClick={() => void save()}>
            Save plan
          </Button>
        ) : null}
      </div>

      {plan ? (
        <div className="plan-wrap">
          <nav className="plan-nav">
            {planSections.map(key => {
              const Icon = sectionIcons[key];
              const count = counts[key];
              return (
                <button key={key} className={active === key ? 'on' : ''} onClick={() => go(planPath(id, key))}>
                  <Icon size={15} />
                  <span>{sectionLabels[key]}</span>
                  {count ? <Badge tone="red">{count}</Badge> : null}
                </button>
              );
            })}
            <div className="plan-nav-meta">
              <ClockNote plan={plan} />
            </div>
          </nav>

          <div className="plan-body">
            {conflict ? (
              <Notice tone="warn" title="This plan changed somewhere else">
                <p style={{ margin: '0 0 10px' }}>Another tab or window saved a newer version. Reload it before editing, or your changes will overwrite that save.</p>
                <Button size="sm" onClick={() => void load()}>Reload the plan</Button>
              </Notice>
            ) : null}
            {error && !conflict ? <Notice tone="error" title="The plan was not saved">{error}</Notice> : null}
            {issues.length ? (
              <Notice tone="error" title={`${issues.length} problem${issues.length === 1 ? '' : 's'} to fix`}>
                <ul className="issue-list">
                  {issues.slice(0, 20).map((issue, index) => (
                    <li key={`${issue.path}-${index}`}><code>{issue.path || 'plan'}</code> {issue.message}</li>
                  ))}
                </ul>
                {issues.length > 20 ? <p className="sub" style={{ margin: '8px 0 0' }}>…and {issues.length - 20} more.</p> : null}
              </Notice>
            ) : null}

            {active === 'brief' ? <Brief plan={plan} edit={edit} /> : null}
            {active === 'script' ? <Script plan={plan} edit={edit} /> : null}
            {active === 'storyboard' ? <Storyboard plan={plan} base={base} /> : null}
            {active === 'shots' ? <Shots plan={plan} edit={edit} /> : null}
            {active === 'compile' ? (
              <Compile
                plan={plan}
                summary={summary}
                report={report}
                dirty={dirty}
                busy={busy}
                check={() => void check()}
                compile={() => void compile()}
                save={() => void save()}
              />
            ) : null}
          </div>
        </div>
      ) : (
        <div className="plan-empty">
          <Empty icon={<LayersIcon size={38} />} title="No production plan yet">
            <p style={{ maxWidth: 480, margin: '8px auto 0' }}>
              A plan turns this timeline into a brief, a script and a shot list. Edit it here, then compile it back into the video.
            </p>
            <Button variant="primary" loading={busy === 'init'} onClick={() => void start()}>
              Start a plan from this video
            </Button>
          </Empty>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      )}
    </div>
  );
}

function ClockNote({ plan }: { plan: Production }) {
  const seconds = planSeconds(plan);
  return (
    <span>
      {plan.shots?.length ?? 0} shot{(plan.shots?.length ?? 0) === 1 ? '' : 's'} · {seconds}s planned
    </span>
  );
}

/* ==================== fields ==================== */

function TextField({ label, value, onChange, hint, placeholder, rows }: { label: string; value?: string | number; onChange: (value: string) => void; hint?: string; placeholder?: string; rows?: number }) {
  return (
    <Field label={label} hint={hint}>
      {rows ? (
        <textarea className="input" style={{ minHeight: rows * 22 }} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      ) : (
        <input className="input" value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      )}
    </Field>
  );
}

function NumberField({ label, value, onChange, hint, min = 0, step = 1 }: { label: string; value?: number; onChange: (value: number | undefined) => void; hint?: string; min?: number; step?: number | 'any' }) {
  return (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={min} step={step} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
    </Field>
  );
}

function SelectField({ label, value, options, onChange, hint }: { label: string; value?: string; options: readonly { value: string; label: string }[]; onChange: (value: string) => void; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <select className="input" value={value ?? ''} onChange={e => onChange(e.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </Field>
  );
}

function ColorField({ label, value, onChange }: { label: string; value?: string; onChange: (value: string) => void }) {
  const valid = /^#[0-9a-fA-F]{6}$/.test(value ?? '');
  return (
    <Field label={label}>
      <div className="color-field">
        <input type="color" value={valid && value ? value : '#000000'} onChange={e => onChange(e.target.value)} />
        <input className="input" value={value ?? ''} placeholder="#0b0c10" onChange={e => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function setMedia(shot: any, key: 'image' | 'video' | 'fit', value: string) {
  shot.media ??= {};
  if (key === 'fit') shot.media.fit = value; else if (value.trim()) shot.media[key] = value.trim(); else delete shot.media[key];
  if (!shot.media.image && !shot.media.video && !shot.media.fit) delete shot.media;
}

/* ==================== brief ==================== */

function Brief({ plan, edit }: { plan: Production; edit: Edit }) {
  const brief: any = plan.brief ?? {};
  const format: any = plan.format ?? {};
  const style: any = plan.style ?? {};
  const audio: any = plan.audio ?? {};
  const output: any = plan.export ?? {};
  const palette: any = style.palette ?? {};
  const fonts: any = style.fonts ?? {};

  const look = (field: string, value: string) => edit(draft => {
    draft.style ??= {};
    if (value) draft.style[field] = value; else delete draft.style[field];
  });

  return (
    <>
      <h2>Brief</h2>
      <p className="sub">What the film is, who it is for, and the look it should hold.</p>

      <div className="plan-grid">
        <TextField label="Name" value={plan.name} onChange={value => edit(draft => { draft.name = value; })} />
        <SelectField label="Production type" value={plan.productionType} options={productionTypes.map(value => ({ value, label: value.replace(/-/g, ' ') }))} onChange={value => edit(draft => { draft.productionType = value; })} />
      </div>
      <TextField label="What is this video for?" value={brief.prompt} rows={3} onChange={value => edit(draft => { (draft.brief ??= { prompt: '' }).prompt = value; })} hint="The request in your own words." />
      <div className="plan-grid">
        <TextField label="Audience" value={brief.audience} onChange={value => edit(draft => { (draft.brief ??= { prompt: '' }).audience = value || undefined; })} />
        <TextField label="Goal" value={brief.goal} onChange={value => edit(draft => { (draft.brief ??= { prompt: '' }).goal = value || undefined; })} />
        <NumberField label="Target length (seconds)" value={brief.targetDurationSeconds} min={0.1} step="any" onChange={value => edit(draft => { (draft.brief ??= { prompt: '' }).targetDurationSeconds = value && value > 0 ? value : undefined; })} />
        <TextField label="Notes" value={brief.notes} onChange={value => edit(draft => { (draft.brief ??= { prompt: '' }).notes = value || undefined; })} />
      </div>

      <h2 style={{ marginTop: 26 }}>Canvas</h2>
      <p className="sub">Compiling the plan resizes the timeline to this format.</p>
      <div className="plan-grid plan-grid-three">
        <NumberField label="Width" value={format.width} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).width = Math.round(value); })} />
        <NumberField label="Height" value={format.height} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).height = Math.round(value); })} />
        <NumberField label="FPS" value={format.fps} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).fps = Math.round(value); })} />
      </div>

      <h2 style={{ marginTop: 26 }}>Look</h2>
      <p className="sub">The art direction the compiled timeline starts from.</p>
      <div className="plan-grid">
        <TextField label="Genre" value={style.genre} onChange={value => look('genre', value)} />
        <TextField label="Visual language" value={style.visualLanguage} onChange={value => look('visualLanguage', value)} />
        <TextField label="Lighting" value={style.lighting} onChange={value => look('lighting', value)} />
        <TextField label="Camera language" value={style.cameraLanguage} onChange={value => look('cameraLanguage', value)} />
        <TextField label="Motion" value={style.motion} onChange={value => look('motion', value)} hint="rise, blur, slide, pop or fade" />
        <SelectField label="Default transition" value={style.transition} options={[{ value: '', label: 'Cut' }, ...transitions.map(value => ({ value, label: title(value) }))]} onChange={value => look('transition', value)} />
        <SelectField label="Texture" value={style.texture} options={[{ value: '', label: 'None' }, ...textures.filter(value => value !== 'none').map(value => ({ value, label: title(value) }))]} onChange={value => look('texture', value)} />
        <TextField label="Display font" value={fonts.display} onChange={value => edit(draft => { draft.style ??= {}; draft.style.fonts ??= {}; if (value) draft.style.fonts.display = value; else delete draft.style.fonts.display; })} />
        <TextField label="Body font" value={fonts.body} onChange={value => edit(draft => { draft.style ??= {}; draft.style.fonts ??= {}; if (value) draft.style.fonts.body = value; else delete draft.style.fonts.body; })} />
      </div>

      <div className="plan-grid plan-grid-three">
        {(['bg', 'surface', 'text', 'muted', 'accent', 'accent2'] as const).map(token => (
          <ColorField key={token} label={token} value={palette[token]} onChange={value => edit(draft => { draft.style ??= {}; draft.style.palette ??= {}; if (value) draft.style.palette[token] = value; else delete draft.style.palette[token]; })} />
        ))}
      </div>

      <h2 style={{ marginTop: 26 }}>Sound & output</h2>
      <div className="plan-grid">
        <TextField label="Music" value={audio.music} onChange={value => edit(draft => { draft.audio ??= {}; if (value) draft.audio.music = value; else delete draft.audio.music; })} hint="An asset id or a path in the project." />
        <NumberField label="Music volume" value={audio.volume ?? 1} min={0} step={0.05} onChange={value => edit(draft => { draft.audio ??= {}; draft.audio.volume = value ?? 1; })} />
        <SelectField label="Export format" value={output.format} options={[{ value: '', label: 'MP4 (default)' }, ...exportFormats.filter(value => value !== 'mp4').map(value => ({ value, label: value.toUpperCase() }))]} onChange={value => edit(draft => { draft.export ??= {}; if (value) draft.export.format = value; else delete draft.export.format; })} />
        <NumberField label="Loudness (LUFS)" value={output.loudness} min={-40} step={0.5} onChange={value => edit(draft => { draft.export ??= {}; if (value !== undefined) draft.export.loudness = value; else delete draft.export.loudness; })} />
        <NumberField label="Grain" value={output.grain} min={0} step={0.01} onChange={value => edit(draft => { draft.export ??= {}; if (value !== undefined) draft.export.grain = value; else delete draft.export.grain; })} />
        <label className="check plan-check">
          <input type="checkbox" checked={audio.duck !== false} onChange={e => edit(draft => { draft.audio ??= {}; draft.audio.duck = e.target.checked; })} />
          <span>Duck the music under narration</span>
        </label>
      </div>
    </>
  );
}

/* ==================== script ==================== */

function Script({ plan, edit }: { plan: Production; edit: Edit }) {
  const script: any = plan.script ?? {};
  const beats: any[] = Array.isArray(script.beats) ? script.beats : [];
  const sources: any[] = Array.isArray(script.sources) ? script.sources : [];

  const setScript = (mutate: (draft: any) => void) => edit(draft => {
    draft.script ??= { beats: [] };
    if (!Array.isArray(draft.script.beats)) draft.script.beats = [];
    mutate(draft.script);
  });

  const addBeat = () => setScript(draft => {
    if (!Array.isArray(draft.beats)) draft.beats = [];
    const used = new Set(draft.beats.map((beat: any) => beat.id));
    let n = draft.beats.length + 1;
    while (used.has(`beat-${n}`)) n++;
    draft.beats.push({ id: `beat-${n}`, name: 'New beat', onScreen: 'The line on screen' });
  });

  const removeBeat = (index: number) => edit(draft => {
    const [removed] = draft.script.beats.splice(index, 1);
    for (const shot of draft.shots ?? []) if (removed && shot.beatId === removed.id) delete shot.beatId;
  });

  const addSource = () => setScript(draft => {
    if (!Array.isArray(draft.sources)) draft.sources = [];
    const used = new Set(draft.sources.map((source: any) => source.id));
    let n = draft.sources.length + 1;
    while (used.has(`s${n}`)) n++;
    draft.sources.push({ id: `s${n}` });
  });

  const removeSource = (index: number) => setScript(draft => {
    const [removed] = draft.sources.splice(index, 1);
    if (!removed) return;
    for (const beat of draft.beats ?? []) {
      beat.sourceIds = (beat.sourceIds ?? []).filter((sourceId: string) => sourceId !== removed.id);
      for (const datum of beat.data ?? []) datum.sourceIds = (datum.sourceIds ?? []).filter((sourceId: string) => sourceId !== removed.id);
    }
  });

  if (!plan.script) {
    return (
      <>
        <h2>Script</h2>
        <p className="sub">What the film says, beat by beat, with the source behind every claim.</p>
        <Empty icon={<TypeIcon size={32} />} title="This plan has no script">
          <p style={{ maxWidth: 420, margin: '8px auto 0' }}>Write the spoken and on-screen lines, then link each shot to the beat it renders.</p>
          <Button variant="primary" onClick={() => edit(draft => { draft.script = { beats: [{ id: 'beat-1', name: 'Hook', onScreen: 'The first line' }], sources: [] }; })}>
            Write a script
          </Button>
        </Empty>
      </>
    );
  }

  return (
    <>
      <h2>Script</h2>
      <p className="sub">What the film says, beat by beat. A claim or figure needs a cited source, and a cited source needs its quote.</p>

      <div className="plan-grid">
        <TextField label="Audience" value={script.audience} onChange={value => setScript(draft => { if (value) draft.audience = value; else delete draft.audience; })} />
        <TextField label="Promise" value={script.promise} onChange={value => setScript(draft => { if (value) draft.promise = value; else delete draft.promise; })} />
        <TextField label="Call to action" value={script.cta} onChange={value => setScript(draft => { if (value) draft.cta = value; else delete draft.cta; })} />
      </div>

      <div className="plan-section-head">
        <h2>Beats</h2>
        <Button size="sm" onClick={addBeat}>Add beat</Button>
      </div>
      {beats.length ? beats.map((beat, index) => (
        <div className="plan-card" key={beat.id ?? index}>
          <div className="plan-card-head">
            <code className="plan-id">{beat.id}</code>
            <Badge tone="neutral">Beat {index + 1}</Badge>
            <span className="grow" />
            <Button size="sm" variant="ghost" onClick={() => removeBeat(index)}>Remove</Button>
          </div>
          <div className="plan-grid">
            <TextField label="Name" value={beat.name} onChange={value => setScript(draft => { draft.beats[index].name = value; })} />
            <NumberField label="Seconds" value={beat.seconds} min={0.1} step="any" onChange={value => setScript(draft => { if (value) draft.beats[index].seconds = value; else delete draft.beats[index].seconds; })} />
          </div>
          <TextField label="On screen" value={beat.onScreen} onChange={value => setScript(draft => { draft.beats[index].onScreen = value; })} />
          <TextField label="Narration" value={beat.narration} rows={2} onChange={value => setScript(draft => { if (value) draft.beats[index].narration = value; else delete draft.beats[index].narration; })} />
          <div className="plan-grid">
            <TextField label="Claim" value={beat.claim} onChange={value => setScript(draft => { if (value) draft.beats[index].claim = value; else delete draft.beats[index].claim; })} hint="The factual assertion this beat makes, if any." />
            <TextField label="Sources" value={(beat.sourceIds ?? []).join(', ')} onChange={value => setScript(draft => { draft.beats[index].sourceIds = value.split(',').map((item: string) => item.trim()).filter(Boolean); })} hint="Comma-separated source ids." />
            <TextField label="Entrance" value={beat.motion} onChange={value => setScript(draft => { if (value) draft.beats[index].motion = value; else delete draft.beats[index].motion; })} hint="Optional: rise, pop, fade." />
          </div>

          <div className="plan-section-head">
            <b>Figures</b>
            <Button size="sm" variant="ghost" onClick={() => setScript(draft => { draft.beats[index].data ??= []; draft.beats[index].data.push({ label: 'New figure', value: '0', sourceIds: [] }); })}>Add figure</Button>
          </div>
          {(beat.data ?? []).map((datum: any, datumIndex: number) => (
            <div className="plan-subcard" key={datumIndex}>
              <div className="plan-grid plan-grid-three">
                <TextField label="Label" value={datum.label} onChange={value => setScript(draft => { draft.beats[index].data[datumIndex].label = value; })} />
                <TextField label="Value" value={datum.value} onChange={value => setScript(draft => { draft.beats[index].data[datumIndex].value = value; })} />
                <TextField label="Unit" value={datum.unit} onChange={value => setScript(draft => { if (value) draft.beats[index].data[datumIndex].unit = value; else delete draft.beats[index].data[datumIndex].unit; })} />
                <TextField label="Period" value={datum.period} onChange={value => setScript(draft => { if (value) draft.beats[index].data[datumIndex].period = value; else delete draft.beats[index].data[datumIndex].period; })} />
                <TextField label="Sources" value={(datum.sourceIds ?? []).join(', ')} onChange={value => setScript(draft => { draft.beats[index].data[datumIndex].sourceIds = value.split(',').map((item: string) => item.trim()).filter(Boolean); })} />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setScript(draft => { draft.beats[index].data.splice(datumIndex, 1); })}>Remove figure</Button>
            </div>
          ))}
        </div>
      )) : <p className="sub">No beats yet. Add one so each shot has something to say.</p>}

      <div className="plan-section-head">
        <h2>Sources</h2>
        <Button size="sm" onClick={addSource}>Add source</Button>
      </div>
      {sources.length ? sources.map((source, index) => (
        <div className="plan-card" key={source.id ?? index}>
          <div className="plan-card-head">
            <code className="plan-id">{source.id}</code>
            <span className="grow" />
            <Button size="sm" variant="ghost" onClick={() => removeSource(index)}>Remove</Button>
          </div>
          <div className="plan-grid">
            <TextField label="Title" value={source.title} onChange={value => setScript(draft => { if (value) draft.sources[index].title = value; else delete draft.sources[index].title; })} />
            <TextField label="URL" value={source.url} onChange={value => setScript(draft => { if (value) draft.sources[index].url = value; else delete draft.sources[index].url; })} />
          </div>
          <TextField label="Verified quote" value={source.quote} rows={2} onChange={value => setScript(draft => { if (value) draft.sources[index].quote = value; else delete draft.sources[index].quote; })} hint="The exact excerpt that backs the claims citing this source." />
        </div>
      )) : <p className="sub">No sources yet. Add one before citing a claim or figure.</p>}
    </>
  );
}

/* ==================== storyboard ==================== */

function Storyboard({ plan, base }: { plan: Production; base: string }) {
  const shots: ProductionShot[] = Array.isArray(plan.shots) ? plan.shots : [];
  const groups = groupShots(plan);

  return (
    <>
      <h2>Storyboard</h2>
      <p className="sub">The shot list as cards, in the order the viewer sees them. {shots.length} shot{shots.length === 1 ? '' : 's'}, {planSeconds(plan)} seconds planned.</p>

      {groups.length ? groups.map((group, index) => (
        <div key={`${group.sceneId}-${index}`}>
          <div className="scene-head">
            <b>{group.sceneId}</b>
            <small>{group.shots.length} shot{group.shots.length === 1 ? '' : 's'} · {Math.round(group.shots.reduce((total, shot) => total + (Number(shot.durationSeconds) || 0), 0) * 10) / 10}s</small>
          </div>
          <div className="storyboard">
            {group.shots.map(shot => <StoryCard key={shot.id} plan={plan} base={base} shot={shot} />)}
          </div>
        </div>
      )) : <Empty icon={<FilmIcon size={32} />} title="This plan has no shots"><p>Add shots in the Shots section.</p></Empty>}
    </>
  );
}

function StoryCard({ plan, base, shot }: { plan: Production; base: string; shot: ProductionShot }) {
  const media = shotMedia(plan, base, shot);
  return (
    <div className="story-card">
      <div className="story-media">
        {media?.kind === 'image' ? <img src={media.url} alt="" loading="lazy" /> : media?.kind === 'video' ? <video src={media.url} muted loop preload="metadata" /> : <span className="story-placeholder"><FilmIcon size={22} />No media yet</span>}
        <Badge tone="neutral">{Number(shot.durationSeconds) || 0}s</Badge>
        {shot.onScreen ? <span className="story-onscreen">{shot.onScreen}</span> : null}
      </div>
      <div className="story-copy">
        <b>{shot.name || shot.id}</b>
        <small>{shot.action}</small>
        <div className="story-meta">
          <code>{shot.id}</code>
          {shot.beatId ? <code>{shot.beatId}</code> : null}
          <span>{shot.transition ?? 'cut'}</span>
        </div>
      </div>
    </div>
  );
}

/* ==================== shots ==================== */

function Shots({ plan, edit }: { plan: Production; edit: Edit }) {
  const shots: ProductionShot[] = Array.isArray(plan.shots) ? plan.shots : [];
  const beats: any[] = Array.isArray((plan as any).script?.beats) ? (plan as any).script.beats : [];
  const beatOptions = [{ value: '', label: 'No beat' }, ...beats.map((beat: any) => ({ value: beat.id, label: `${beat.id} — ${beat.name ?? beat.id}` }))];

  const set = (index: number, mutate: (shot: any) => void) => edit(draft => mutate(draft.shots[index]));

  const move = (index: number, by: number) => edit(draft => {
    const to = index + by;
    if (to < 0 || to >= draft.shots.length) return;
    const [shot] = draft.shots.splice(index, 1);
    draft.shots.splice(to, 0, shot);
  });

  const duplicate = (index: number) => edit(draft => {
    const copy = structuredClone(draft.shots[index]);
    copy.id = newShot({ shots: draft.shots }, copy.sceneId).id;
    draft.shots.splice(index + 1, 0, copy);
  });

  const remove = (index: number) => edit(draft => { draft.shots.splice(index, 1); });

  const add = () => edit(draft => {
    draft.shots ??= [];
    const sceneId = draft.shots.at(-1)?.sceneId ?? 'scene';
    draft.shots.push(newShot({ shots: draft.shots }, sceneId));
  });

  return (
    <>
      <h2>Shots</h2>
      <p className="sub">One card per shot: what happens, what it says, and which media to use. Shot media is an asset id or a path in the project.</p>

      <div className="shot-list">
        {shots.map((shot, index) => (
          <div className="plan-card" key={shot.id ?? index}>
            <div className="plan-card-head">
              <code className="plan-id">{shot.id}</code>
              <Badge tone="neutral">Shot {index + 1}</Badge>
              <span className="grow" />
              <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => move(index, -1)} title="Move earlier">↑</Button>
              <Button size="sm" variant="ghost" disabled={index === shots.length - 1} onClick={() => move(index, 1)} title="Move later">↓</Button>
              <Button size="sm" variant="ghost" onClick={() => duplicate(index)}>Duplicate</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(index)}>Remove</Button>
            </div>

            <div className="plan-grid plan-grid-three">
              <TextField label="Scene" value={shot.sceneId} onChange={value => set(index, draft => { draft.sceneId = value; })} hint="Consecutive shots sharing a scene form one group." />
              <TextField label="Name" value={shot.name} onChange={value => set(index, draft => { if (value) draft.name = value; else delete draft.name; })} />
              <NumberField label="Seconds" value={shot.durationSeconds} min={0.1} step="any" onChange={value => set(index, draft => { draft.durationSeconds = value ?? 0; })} />
            </div>
            <TextField label="Action" value={shot.action} rows={2} onChange={value => set(index, draft => { draft.action = value; })} hint="What happens on screen, as a physical action." />
            <TextField label="On screen" value={shot.onScreen} onChange={value => set(index, draft => { if (value) draft.onScreen = value; else delete draft.onScreen; })} />
            <div className="plan-grid plan-grid-three">
              <SelectField label="Beat" value={shot.beatId} options={beatOptions} onChange={value => set(index, draft => { if (value) draft.beatId = value; else delete draft.beatId; })} />
              <SelectField label="Transition" value={shot.transition} options={[{ value: '', label: 'Cut' }, ...transitions.map(value => ({ value, label: title(value) }))]} onChange={value => set(index, draft => { if (value) draft.transition = value; else delete draft.transition; })} />
              <SelectField label="Media fit" value={shot.media?.fit} options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }, { value: 'fill', label: 'Fill' }]} onChange={value => set(index, draft => setMedia(draft, 'fit', value))} />
            </div>
            <div className="plan-grid">
              <TextField label="Image" value={shot.media?.image} placeholder="asset id or assets/picture.png" onChange={value => set(index, draft => setMedia(draft, 'image', value))} />
              <TextField label="Video" value={shot.media?.video} placeholder="asset id or assets/take.mp4" onChange={value => set(index, draft => setMedia(draft, 'video', value))} />
              <TextField label="Audio" value={shot.audio?.src} placeholder="asset id or assets/line.wav" onChange={value => set(index, draft => { if (value.trim()) { draft.audio ??= {}; draft.audio.src = value.trim(); } else delete draft.audio; })} />
              <NumberField label="Audio volume" value={shot.audio?.volume} min={0} step={0.05} onChange={value => set(index, draft => { if (draft.audio) draft.audio.volume = value ?? 1; })} />
            </div>
          </div>
        ))}
      </div>

      <div className="form-actions" style={{ marginTop: 14 }}>
        <Button variant="primary" onClick={add}>Add shot</Button>
      </div>
    </>
  );
}

/* ==================== compile ==================== */

function Compile({ plan, summary, report, dirty, busy, check, compile, save }: {
  plan: Production;
  summary: ProductionSummaryState | null;
  report: CompileProductionResult | null;
  dirty: boolean;
  busy: string;
  check: () => void;
  compile: () => void;
  save: () => void;
}) {
  const seconds = report ? report.composition.durationFrames / report.composition.fps : summary?.plannedSeconds ?? planSeconds(plan);

  return (
    <>
      <h2>Compile</h2>
      <p className="sub">Check the plan in memory first, then replace the timeline with its scenes. The plan itself is kept.</p>

      {dirty ? (
        <Notice tone="warn" title="Save before checking">
          <p style={{ margin: '0 0 10px' }}>Compile reads the saved plan, so unsaved edits would be left out.</p>
          <Button size="sm" variant="primary" onClick={save}>Save the plan</Button>
        </Notice>
      ) : null}

      <div className="summary-grid">
        <div className="summary-stat"><b>{summary?.shots ?? plan.shots?.length ?? 0}</b><small>shots</small></div>
        <div className="summary-stat"><b>{summary?.scenes.length ?? '–'}</b><small>scenes</small></div>
        <div className="summary-stat"><b>{seconds.toFixed(1)}s</b><small>{summary?.targetSeconds ? `target ${summary.targetSeconds}s` : 'planned'}</small></div>
        <div className="summary-stat"><b>{summary ? `${summary.readyShots}/${summary.shots}` : '–'}</b><small>shots with media</small></div>
        <div className="summary-stat"><b>{summary?.approvedShots ?? 0}</b><small>approved takes</small></div>
        <div className="summary-stat"><b>{summary?.pendingShots ?? 0}</b><small>still to shoot</small></div>
        <div className="summary-stat"><b>{summary?.beats ?? 0}</b><small>script beats</small></div>
        <div className="summary-stat"><b>{summary?.unusedBeats.length ?? 0}</b><small>beats not rendered</small></div>
      </div>

      <div className="form-actions" style={{ marginTop: 18 }}>
        <Button loading={busy === 'check'} disabled={dirty || !!busy} icon={<CheckIcon size={14} />} onClick={check}>
          {busy === 'check' ? 'Checking the plan…' : 'Check the plan'}
        </Button>
        <Button variant="primary" loading={busy === 'compile'} disabled={!report || dirty || !!busy} icon={<DownloadIcon size={14} />} onClick={compile}>
          {busy === 'compile' ? 'Compiling the timeline…' : 'Replace the timeline'}
        </Button>
      </div>

      {report ? (
        <div className="result">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b>The plan compiles</b>
            <Badge tone="green" dot>Checked, not applied</Badge>
          </div>
          <p className="sub" style={{ margin: '6px 0 10px' }}>
            {report.composition.scenes} scene{report.composition.scenes === 1 ? '' : 's'} · {dur(seconds)} · {report.composition.width}×{report.composition.height} at {report.composition.fps} fps
          </p>

          {report.changes.length ? (
            <>
              <b>What the timeline will change</b>
              <ul className="issue-list" style={{ margin: '6px 0 12px' }}>{report.changes.map(change => <li key={change}>{change}</li>)}</ul>
            </>
          ) : <p className="sub">The timeline already matches this plan.</p>}

          {report.notes.length ? (
            <Notice tone="warn" title="What compile will improvise">
              <ul className="issue-list">{report.notes.map(note => <li key={note}>{note}</li>)}</ul>
            </Notice>
          ) : null}

          {summary?.unusedBeats.length ? (
            <Notice tone="neutral" title="Beats no shot renders">
              <p style={{ margin: 0 }}>{summary.unusedBeats.join(', ')}</p>
            </Notice>
          ) : null}

          <Button variant="primary" style={{ marginTop: 8 }} onClick={compile}>Replace the timeline</Button>
        </div>
      ) : null}

      {plan.shots?.length && summary && summary.pendingShots ? (
        <Notice tone="neutral" title={`${summary.pendingShots} shot${summary.pendingShots === 1 ? ' has' : 's have'} no media yet`}>
          <p style={{ margin: 0 }}>{summary.pendingShots === 1 ? 'It compiles as a text card from its on-screen copy. Add an image, video or approved take to show footage instead.' : 'They compile as text cards from their on-screen copy. Add an image, video or approved take to show footage instead.'}</p>
        </Notice>
      ) : null}

      {plan.shots?.length === 0 ? <Notice tone="warn">The plan has no shots, so there is nothing to compile.</Notice> : null}
    </>
  );
}
