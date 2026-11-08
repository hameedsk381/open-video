import { type Production, type ProductionShot } from '../../api';
import { groupShots, planSeconds, shotMedia, shotTake, type PlanReview } from '../../productionPlan';
import { Badge, Button, CheckIcon, Empty, FilmIcon, PlayIcon, useUi } from '../../ui';
import { Edit, plural, approveTake, rejectTake } from './shared';

export function Storyboard({ plan, base, edit, review, selected, onSelect, onCompile }: {
  plan: Production;
  base: string;
  edit: Edit;
  review: PlanReview;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onCompile: () => void;
}) {
  const { toast } = useUi();
  const shots: ProductionShot[] = Array.isArray(plan.shots) ? plan.shots : [];
  const groups = groupShots(plan);

  const approve = (shot: ProductionShot) => {
    const take = shotTake(plan, shot);
    if (!take.assetId) return;
    approveTake(edit, shot, take.assetId);
    toast(`Take approved · ${shot.name || shot.id}`, 'success');
  };

  const reject = (shot: ProductionShot) => {
    rejectTake(edit, shot);
    toast(`Take rejected · ${shot.name || shot.id}`, 'info');
  };

  return (
    <>
      <div className="plan-section-head storyboard-head">
        <div>
          <h2>Storyboard</h2>
          <p className="sub">The shot list in the order the viewer sees them. {plural(shots.length, 'shot')}, {planSeconds(plan)} seconds planned. Select a card to review its take.</p>
        </div>
        <div className="storyboard-actions">
          <span className="storyboard-ready">{review.ready}/{review.total} with footage</span>
          <Button size="sm" variant="primary" icon={<PlayIcon size={13} />} onClick={onCompile}>Review &amp; build</Button>
        </div>
      </div>

      {groups.length ? (
        <div className="storyboard-groups">
          {groups.map((group, index) => (
            <div key={`${group.sceneId}-${index}`}>
              <div className="scene-head">
                <b>{group.sceneId}</b>
                <small>{plural(group.shots.length, 'shot')} · {Math.round(group.shots.reduce((total, shot) => total + (Number(shot.durationSeconds) || 0), 0) * 10) / 10}s</small>
              </div>
              <div className="storyboard">
                {group.shots.map(shot => (
                  <StoryCard key={shot.id} plan={plan} base={base} shot={shot} selected={selected === shot.id} onSelect={onSelect} approve={approve} reject={reject} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <Empty icon={<FilmIcon size={32} />} title="This plan has no shots"><p>Add shots in the Shots section.</p></Empty>}
    </>
  );
}

export function StoryCard({ plan, base, shot, selected, onSelect, approve, reject }: {
  plan: Production;
  base: string;
  shot: ProductionShot;
  selected: boolean;
  onSelect: (id: string | null) => void;
  approve: (shot: ProductionShot) => void;
  reject: (shot: ProductionShot) => void;
}) {
  const media = shotMedia(plan, base, shot);
  const take = shotTake(plan, shot);
  const toggle = () => onSelect(selected ? null : shot.id);

  return (
    <div
      className={`story-card${selected ? ' on' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={toggle}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      }}
    >
      <div className="story-media">
        {media?.kind === 'image' ? <img src={media.url} alt="" loading="lazy" /> : media?.kind === 'video' ? <video src={media.url} muted loop preload="metadata" /> : <span className="story-placeholder"><FilmIcon size={22} />No media yet</span>}
        <span className="story-take"><Badge tone={take.tone} dot>{take.label}</Badge></span>
        <Badge tone="neutral">{Number(shot.durationSeconds) || 0}s</Badge>
        {media && shot.onScreen ? <span className="story-onscreen">{shot.onScreen}</span> : null}
      </div>
      <div className="story-copy">
        <b>{shot.name || shot.id}</b>
        <small>{shot.action}</small>
        {!media && shot.onScreen ? <p className="story-line">{shot.onScreen}</p> : null}
        <div className="story-meta">
          <code>{shot.id}</code>
          {shot.beatId ? <code>{shot.beatId}</code> : null}
          <span>{shot.transition ?? 'cut'}</span>
        </div>
        <div className="story-actions">
          {take.canApprove ? (
            <Button size="sm" variant="ghost" icon={<CheckIcon size={12} />} onClick={event => { event.stopPropagation(); approve(shot); }}>Approve take</Button>
          ) : null}
          {take.canReject ? (
            <Button size="sm" variant="ghost" onClick={event => { event.stopPropagation(); reject(shot); }}>Reject</Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ==================== co-pilot ==================== */
