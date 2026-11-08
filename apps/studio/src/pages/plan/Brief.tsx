import { type Production } from '../../api';
import { Edit, transitions, textures, exportFormats, productionTypes, TextField, NumberField, SelectField, ColorField, title } from './shared';

export function Brief({ plan, edit }: { plan: Production; edit: Edit }) {
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
      <p className="sub">Building the video resizes the timeline to this format.</p>
      <div className="plan-grid plan-grid-three">
        <NumberField label="Width" value={format.width} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).width = Math.round(value); })} />
        <NumberField label="Height" value={format.height} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).height = Math.round(value); })} />
        <NumberField label="FPS" value={format.fps} min={1} onChange={value => edit(draft => { if (value) (draft.format ??= {}).fps = Math.round(value); })} />
      </div>

      <h2 style={{ marginTop: 26 }}>Look</h2>
      <p className="sub">The art direction the built video starts from.</p>
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
