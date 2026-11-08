import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, dur, type CompileProductionResult, type Detail, type Production, type ProductionIssue, type ProductionState, type ProductionSummaryState, type SaveProductionResult } from '../api';
import { editorPath, go, planPath } from '../router';
import { issuesBySection, planReview, planSections, sectionLabels, type PlanSection } from '../productionPlan';
import { ArrowLeftIcon, Badge, Button, CheckIcon, Empty, FilmIcon, LayersIcon, Notice, PlayIcon, SlidersIcon, SparklesIcon, Spinner, TypeIcon, useUi } from '../ui';
import { Edit, ClockNote } from './plan/shared';
import { Brief } from './plan/Brief';
import { Script } from './plan/Script';
import { Storyboard } from './plan/Storyboard';
import { CoPilot } from './plan/CoPilot';
import { Shots } from './plan/Shots';
import { Compile } from './plan/Compile';

const sectionIcons: Record<PlanSection, typeof FilmIcon> = { brief: FilmIcon, script: TypeIcon, storyboard: LayersIcon, shots: SlidersIcon, compile: PlayIcon };

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
  const [selected, setSelected] = useState<string | null>(null);
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem('ove-plan-copilot') !== 'off'; } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('ove-plan-copilot', rail ? 'on' : 'off'); } catch { /* private mode */ }
  }, [rail]);

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
      toast(`Video built${result.revision ? ` · version #${result.revision.n}` : ''}`, 'success');
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
        <Button onClick={() => go('#/projects')}>Back to Projects</Button>
      </div>
    );
  }

  if (!detail && !plan) {
    return (
      <div className="center">
        <Spinner size={32} />
        <p className="sub" style={{ marginTop: 14 }}>Loading the storyboard…</p>
      </div>
    );
  }

  const active: PlanSection = (planSections as readonly string[]).includes(section) ? (section as PlanSection) : 'brief';
  const counts = issuesBySection(issues);
  const review = plan ? planReview(plan) : null;
  const selectedShot = plan && selected ? (plan.shots ?? []).find(shot => shot.id === selected) ?? null : null;
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
          <h1>{plan?.name ?? detail?.name ?? 'Storyboard'}</h1>
          <small>{detail ? `${detail.width}×${detail.height} · ${dur(detail.durationFrames / detail.fps)}` : `Project ${id}`}</small>
        </div>
        <span className="grow" />
        <Badge tone={badge.tone} dot>{badge.text}</Badge>
        {plan && dirty ? <span className="saved">Not saved yet</span> : null}
        {plan ? (
          <>
            <Button size="sm" variant="ghost" className={rail ? 'on' : ''} icon={<SparklesIcon size={14} />} onClick={() => setRail(value => !value)} title={rail ? 'Hide the plan co-pilot' : 'Show the plan co-pilot'}>
              Co-pilot
            </Button>
            <Button size="sm" variant="primary" loading={busy === 'save'} disabled={!dirty || busy === 'save'} icon={<CheckIcon size={14} />} onClick={() => void save()}>
              Save plan
            </Button>
          </>
        ) : null}
      </div>

      {plan ? (
        <div className={`plan-wrap${rail ? '' : ' rail-off'}`}>
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
            {active === 'storyboard' && review ? <Storyboard plan={plan} base={base} edit={edit} review={review} selected={selected} onSelect={setSelected} onCompile={() => go(planPath(id, 'compile'))} /> : null}
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

          {rail && review ? (
            <CoPilot
              plan={plan}
              coverage={summary?.coverage}
              review={review}
              issues={issues}
              dirty={dirty}
              busy={busy}
              active={active}
              selected={selectedShot}
              edit={edit}
              save={() => void save()}
              onClose={() => setRail(false)}
              goSection={key => go(planPath(id, key))}
            />
          ) : null}
        </div>
      ) : (
        <div className="plan-empty">
          <Empty icon={<LayersIcon size={38} />} title="No storyboard yet">
            <p style={{ maxWidth: 480, margin: '8px auto 0' }}>
              The storyboard turns this timeline into a brief, a script and a shot list. Edit it here, then build it back into the video.
            </p>
            <Button variant="primary" loading={busy === 'init'} onClick={() => void start()}>
              Start a storyboard from this video
            </Button>
          </Empty>
          {error ? <Notice tone="error">{error}</Notice> : null}
        </div>
      )}
    </div>
  );
}
