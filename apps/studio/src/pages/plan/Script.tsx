import { type Production } from '../../api';
import { Badge, Button, Empty, TypeIcon } from '../../ui';
import { Edit, TextField, NumberField } from './shared';

export function Script({ plan, edit }: { plan: Production; edit: Edit }) {
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
    draft.beats.push({ id: `beat-${n}`, name: 'New line', onScreen: 'The line on screen' });
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
        <p className="sub">What the film says, line by line, with the source behind every claim.</p>
        <Empty icon={<TypeIcon size={32} />} title="This plan has no script">
          <p style={{ maxWidth: 420, margin: '8px auto 0' }}>Write the spoken and on-screen lines, then link each scene to the line it says.</p>
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
      <p className="sub">What the film says, line by line. A claim or figure needs a cited source, and a cited source needs its quote.</p>

      <div className="plan-grid">
        <TextField label="Audience" value={script.audience} onChange={value => setScript(draft => { if (value) draft.audience = value; else delete draft.audience; })} />
        <TextField label="Promise" value={script.promise} onChange={value => setScript(draft => { if (value) draft.promise = value; else delete draft.promise; })} />
        <TextField label="Call to action" value={script.cta} onChange={value => setScript(draft => { if (value) draft.cta = value; else delete draft.cta; })} />
      </div>

      <div className="plan-section-head">
        <h2>Script lines</h2>
        <Button size="sm" onClick={addBeat}>Add line</Button>
      </div>
      {beats.length ? beats.map((beat, index) => (
        <div className="plan-card" key={beat.id ?? index}>
          <div className="plan-card-head">
            <code className="plan-id">{beat.id}</code>
            <Badge tone="neutral">Line {index + 1}</Badge>
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
            <TextField label="Claim" value={beat.claim} onChange={value => setScript(draft => { if (value) draft.beats[index].claim = value; else delete draft.beats[index].claim; })} hint="The factual assertion this line makes, if any." />
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
      )) : <p className="sub">No lines yet. Add one so each scene has something to say.</p>}

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
