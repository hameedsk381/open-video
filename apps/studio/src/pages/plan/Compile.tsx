import { dur, type CompileProductionResult, type Production, type ProductionSummaryState } from '../../api';
import { planSeconds } from '../../productionPlan';
import { Badge, Button, CheckIcon, DownloadIcon, Notice } from '../../ui';

export function Compile({ plan, summary, report, dirty, busy, check, compile, save }: {
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
      <h2>Build the video</h2>
      <p className="sub">Check the storyboard first, then replace the timeline with its scenes. The storyboard itself is kept.</p>

      {dirty ? (
        <Notice tone="warn" title="Save before checking">
          <p style={{ margin: '0 0 10px' }}>Building reads the saved storyboard, so unsaved edits would be left out.</p>
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
        <div className="summary-stat"><b>{summary?.beats ?? 0}</b><small>script lines</small></div>
        <div className="summary-stat"><b>{summary?.unusedBeats.length ?? 0}</b><small>lines no scene uses</small></div>
      </div>

      <div className="form-actions" style={{ marginTop: 18 }}>
        <Button loading={busy === 'check'} disabled={dirty || !!busy} icon={<CheckIcon size={14} />} onClick={check}>
          {busy === 'check' ? 'Checking the plan…' : 'Check the plan'}
        </Button>
        <Button variant="primary" loading={busy === 'compile'} disabled={!report || dirty || !!busy} icon={<DownloadIcon size={14} />} onClick={compile}>
          {busy === 'compile' ? 'Building the video…' : 'Build the video'}
        </Button>
      </div>

      {report ? (
        <div className="result">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b>The storyboard is ready</b>
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
            <Notice tone="warn" title="What the build will fill in">
              <ul className="issue-list">{report.notes.map(note => <li key={note}>{note}</li>)}</ul>
            </Notice>
          ) : null}

          {summary?.unusedBeats.length ? (
            <Notice tone="neutral" title="Script lines no scene uses">
              <p style={{ margin: 0 }}>{summary.unusedBeats.join(', ')}</p>
            </Notice>
          ) : null}

          <Button variant="primary" style={{ marginTop: 8 }} onClick={compile}>Build the video</Button>
        </div>
      ) : null}

      {plan.shots?.length && summary && summary.pendingShots ? (
        <Notice tone="neutral" title={`${summary.pendingShots} shot${summary.pendingShots === 1 ? ' has' : 's have'} no media yet`}>
          <p style={{ margin: 0 }}>{summary.pendingShots === 1 ? 'It builds as a text card from its on-screen copy. Add an image, video or approved take to show footage instead.' : 'They build as text cards from their on-screen copy. Add an image, video or approved take to show footage instead.'}</p>
        </Notice>
      ) : null}

      {plan.shots?.length === 0 ? <Notice tone="warn">The storyboard has no shots, so there is nothing to build.</Notice> : null}
    </>
  );
}
