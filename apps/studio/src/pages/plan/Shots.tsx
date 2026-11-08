import { type Production, type ProductionShot } from '../../api';
import { newShot } from '../../productionPlan';
import { Badge, Button } from '../../ui';
import { Edit, transitions, TextField, NumberField, SelectField, title, setMedia } from './shared';

export function Shots({ plan, edit }: { plan: Production; edit: Edit }) {
  const shots: ProductionShot[] = Array.isArray(plan.shots) ? plan.shots : [];
  const beats: any[] = Array.isArray((plan as any).script?.beats) ? (plan as any).script.beats : [];
  const beatOptions = [{ value: '', label: 'No line' }, ...beats.map((beat: any) => ({ value: beat.id, label: `${beat.id} — ${beat.name ?? beat.id}` }))];

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
              <SelectField label="Script line" value={shot.beatId} options={beatOptions} onChange={value => set(index, draft => { if (value) draft.beatId = value; else delete draft.beatId; })} />
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
