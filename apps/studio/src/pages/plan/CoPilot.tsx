import { type Production, type ProductionIssue, type ProductionShot, type ProductionSummaryState } from '../../api';
import { sectionOf, shotTake, type PlanReview, type PlanSection } from '../../productionPlan';
import { Badge, Button, CheckIcon, PlayIcon, SparklesIcon, useUi } from '../../ui';
import { Edit, plural, approveTake, rejectTake } from './shared';

export type CopilotStep = { key: string; title: string; detail?: string; section: PlanSection; tone: 'neutral' | 'amber' | 'red' | 'green' };

export function copilotSteps(plan: Production, review: PlanReview, issues: ProductionIssue[], dirty: boolean, coverage?: ProductionSummaryState['coverage']): CopilotStep[] {
  const steps: CopilotStep[] = [];
  const first = issues[0];
  if (issues.length) {
    steps.push({
      key: 'issues',
      title: `${plural(issues.length, 'problem')} to fix`,
      detail: first ? `${first.path || 'plan'} — ${first.message}` : undefined,
      section: first ? sectionOf(first.path) : 'brief',
      tone: 'red',
    });
  }
  if (!plan.brief?.prompt?.trim()) steps.push({ key: 'brief', title: 'Say what the video is for', detail: 'One sentence in the brief keeps every shot on topic.', section: 'brief', tone: 'amber' });
  if (!plan.script?.beats?.length) steps.push({ key: 'script', title: 'Write the script lines', detail: 'Every scene needs one line.', section: 'script', tone: 'amber' });
  if (!review.total) steps.push({ key: 'shots', title: 'Add shots to the plan', detail: 'The video needs at least one shot.', section: 'shots', tone: 'amber' });
  if (review.unusedBeats.length) {
    steps.push({ key: 'beats', title: `${plural(review.unusedBeats.length, 'line')} no scene uses`, detail: review.unusedBeats.slice(0, 4).join(', '), section: 'storyboard', tone: 'amber' });
  }
  if (review.unreviewed) {
    steps.push({ key: 'review', title: `${plural(review.unreviewed, 'take')} to approve`, detail: 'Approving picks the take the timeline uses.', section: 'storyboard', tone: 'neutral' });
  }
  if (review.pending) {
    steps.push({ key: 'pending', title: `${plural(review.pending, 'shot')} will build as text cards`, detail: 'Add media or approve a take to show footage.', section: 'storyboard', tone: 'neutral' });
  }
  // Assets the plan says it needs: counted from approvals, so an uploaded file nobody approved for its job still shows here.
  if (coverage?.missing) {
    const first = coverage.outstanding.filter(item => item.status === 'missing').slice(0, 3).map(item => `${item.role}${item.instruction ? ` (${item.instruction})` : ''}`);
    steps.push({ key: 'assets-missing', title: `${plural(coverage.missing, 'required asset')} missing`, detail: first.join(', '), section: 'storyboard', tone: 'amber' });
  } else if (coverage?.candidate) {
    steps.push({ key: 'assets-review', title: `${plural(coverage.candidate, 'asset')} to approve`, detail: 'Approved assets are the ones the shots may use.', section: 'storyboard', tone: 'neutral' });
  }
  if (coverage?.total && coverage.beatsWithoutRequirements.length) {
    steps.push({ key: 'assets-beats', title: `${plural(coverage.beatsWithoutRequirements.length, 'line')} with no asset requirement`, detail: coverage.beatsWithoutRequirements.slice(0, 4).join(', '), section: 'script', tone: 'neutral' });
  }
  if (review.missingCopy.length) {
    steps.push({ key: 'copy', title: `${plural(review.missingCopy.length, 'shot')} without on-screen copy`, detail: review.missingCopy.slice(0, 4).join(', '), section: 'storyboard', tone: 'neutral' });
  }
  if (dirty) steps.push({ key: 'dirty', title: 'Save the storyboard first', detail: 'Building reads the saved storyboard.', section: 'compile', tone: 'amber' });
  if (!steps.length) {
    steps.push({ key: 'ready', title: 'The storyboard is ready to build', detail: `${plural(review.total, 'shot')} · ${review.approved} approved`, section: 'compile', tone: 'green' });
  }
  return steps;
}

export function CoPilot({ plan, review, issues, dirty, coverage, busy, active, selected, edit, save, onClose, goSection }: {
  plan: Production;
  coverage?: ProductionSummaryState['coverage'];
  review: PlanReview;
  issues: ProductionIssue[];
  dirty: boolean;
  busy: string;
  active: PlanSection;
  selected: ProductionShot | null;
  edit: Edit;
  save: () => void;
  onClose: () => void;
  goSection: (key: PlanSection) => void;
}) {
  const { toast } = useUi();
  const steps = copilotSteps(plan, review, issues, dirty, coverage);
  const percent = review.total ? Math.round((review.ready / review.total) * 100) : 0;
  const take = selected ? shotTake(plan, selected) : null;

  return (
    <aside className="plan-copilot" aria-label="Plan co-pilot">
      <div className="copilot-head">
        <SparklesIcon size={15} />
        <b>Plan co-pilot</b>
        <span className="grow" />
        <button className="copilot-close" onClick={onClose} aria-label="Hide the co-pilot">×</button>
      </div>
      <p className="copilot-intro">Readiness checks that update as you edit. Nothing leaves this page.</p>

      <div className="copilot-meter">
        <div className="copilot-meter-row"><b>{review.ready}/{review.total}</b><span>shots with footage</span></div>
        <div className="meter"><span style={{ width: `${percent}%` }} /></div>
        <div className="copilot-counts">
          <span><b>{review.approved}</b> approved</span>
          <span><b>{review.pending}</b> pending</span>
          <span><b>{review.unreviewed}</b> to review</span>
        </div>
      </div>

      <div className="copilot-section-title">Next steps</div>
      <div className="copilot-steps">
        {steps.map(step => (
          <button key={step.key} className={`copilot-step${active === step.section ? ' on' : ''}`} onClick={() => goSection(step.section)}>
            <span className={`copilot-dot ${step.tone}`} />
            <span className="copilot-step-copy">
              <b>{step.title}</b>
              {step.detail ? <small>{step.detail}</small> : null}
            </span>
          </button>
        ))}
      </div>

      {selected && take ? (
        <div className="copilot-shot">
          <div className="copilot-section-title">Selected shot</div>
          <div className="copilot-shot-head">
            <b>{selected.name || selected.id}</b>
            <Badge tone={take.tone} dot>{take.label}</Badge>
          </div>
          <small>{selected.action}</small>
          <div className="copilot-shot-meta">
            <span>{selected.id}</span>
            <span>{selected.sceneId}</span>
            <span>{Number(selected.durationSeconds) || 0}s</span>
            {selected.beatId ? <span>{selected.beatId}</span> : null}
          </div>
          {selected.onScreen ? <blockquote className="copilot-quote">{selected.onScreen}</blockquote> : <p className="copilot-hint">No on-screen copy yet; the build uses the action line.</p>}
          {selected.generation?.error ? <p className="copilot-hint is-error">{selected.generation.error}</p> : null}
          <div className="copilot-actions">
            {take.canApprove ? (
              <Button size="sm" variant="primary" icon={<CheckIcon size={12} />} onClick={() => { approveTake(edit, selected, take.assetId!); toast(`Take approved · ${selected.name || selected.id}`, 'success'); }}>
                Approve take
              </Button>
            ) : null}
            {take.canReject ? (
              <Button size="sm" variant="ghost" onClick={() => { rejectTake(edit, selected); toast(`Take rejected · ${selected.name || selected.id}`, 'info'); }}>
                Reject
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => goSection('shots')}>Edit shot</Button>
          </div>
          {!take.canApprove && selected.media ? <p className="copilot-hint">This footage is a path, not a registered asset, so it can play but not be approved as a take.</p> : null}
        </div>
      ) : (
        <div className="copilot-empty">
          <p>Select a shot on the storyboard to review its take, copy and status.</p>
        </div>
      )}

      <div className="copilot-foot">
        {dirty ? <Button size="sm" variant="primary" loading={busy === 'save'} onClick={save}>Save plan</Button> : null}
        <Button size="sm" variant={dirty ? 'ghost' : 'primary'} icon={<PlayIcon size={12} />} onClick={() => goSection('compile')}>Build video</Button>
      </div>
    </aside>
  );
}

/* ==================== shots ==================== */
