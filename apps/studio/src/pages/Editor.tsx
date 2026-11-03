import { useCallback, useEffect, useRef, useState } from 'react';
import { api, dur, runJob, type Block, type Detail, type Job, type Library, type Revision, type TextLayer, type Variable } from '../api';
import { PlayerView, type PlayerHandle } from '../Player';
import { editorPath, go } from '../router';
import { Badge, Button, Field, Notice, Spinner, useUi } from '../ui';

const tabs = [['edit', 'Edit'], ['ai', 'Ask AI'], ['look', 'Look'], ['history', 'History'], ['export', 'Export']] as const;
const themeNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight'];

export function Editor({ id, tab }: { id: string; tab: string }) {
  const { toast } = useUi();
  const [detail, setDetail] = useState<Detail | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), frameAt = useRef(0), player = useRef<PlayerHandle>(null);
  const file = `${id}/composition.json`;
  const load = useCallback((keepFrame: boolean) => {
    if (keepFrame) frameAt.current = player.current?.frame() ?? 0; else frameAt.current = 0;
    return api<Detail>(`/api/project?id=${encodeURIComponent(id)}`).then(setDetail, e => setError(e.message));
  }, [id]);
  useEffect(() => { setDetail(null); load(false); }, [load]);
  if (error) return <div className="center"><h2>This project could not be opened</h2><Notice tone="error">{error}</Notice><Button onClick={() => go('#/')}>Back to projects</Button></div>;
  if (!detail) return <div className="center"><Spinner /></div>;
  // Every change goes through one function: write it, then reload the preview where it was.
  const save = async (path: string, body: unknown, done = 'Saved') => {
    setNote('Saving…');
    try { await api(path, body); setNote(done); await load(true); } catch (e) { setNote(''); toast((e as Error).message, 'error'); throw e; }
  };
  const props = { detail, file, save, reload: load, setNote };
  return <div className="editor">
    <div className="stage">
      <div className="etop"><Button size="sm" variant="ghost" onClick={() => go('#/')}>← Projects</Button><TitleInput detail={detail} save={name => save('/api/project/rename', { id, name }, 'Renamed')} /><span className="saved">{note}</span></div>
      <PlayerView ref={player} detail={detail} startFrame={frameAt.current} />
      <div className="scenes">{detail.scenes.map(scene => <button key={scene.id} onClick={() => player.current?.seek(scene.startFrame)}>{scene.name}<small>{dur(scene.durationFrames / detail.fps)}</small></button>)}</div>
    </div>
    <div className="side">
      <div className="tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'on' : ''} onClick={() => go(editorPath(id, key))}>{label}</button>)}</div>
      <div className="pane">
        {tab === 'ai' ? <AskAi {...props} /> : tab === 'look' ? <Look {...props} /> : tab === 'history' ? <History {...props} /> : tab === 'export' ? <Export {...props} /> : <Edit {...props} />}
      </div>
    </div>
  </div>;
}

type PaneProps = { detail: Detail; file: string; save: (path: string, body: unknown, done?: string) => Promise<void>; reload: (keepFrame: boolean) => Promise<void>; setNote: (note: string) => void };

function TitleInput({ detail, save }: { detail: Detail; save: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(detail.name);
  useEffect(() => setValue(detail.name), [detail.name]);
  return <input className="input title" value={value} aria-label="Project name" onChange={e => setValue(e.target.value)} onBlur={() => { const v = value.trim(); if (!v) setValue(detail.name); else if (v !== detail.name) void save(v); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />;
}

function Edit({ detail, save, reload, setNote }: PaneProps) {
  const [values, setValues] = useState<Record<string, any>>({}), [texts, setTexts] = useState<Record<string, string>>({}), [busy, setBusy] = useState(false), { toast } = useUi();
  useEffect(() => { setValues(Object.fromEntries(detail.variables.map(v => [v.name, v.type === 'list' ? JSON.stringify(v.value, null, 2) : v.value]))); setTexts(Object.fromEntries(detail.texts.map(t => [t.path, t.content]))); }, [detail]);
  const fields = detail.variables.filter(v => !themeNames.includes(v.name));
  const apply = async () => {
    setBusy(true);
    try {
      if (detail.mode === 'template') {
        const out: Record<string, unknown> = {};
        for (const v of fields) { const x = values[v.name]; out[v.name] = v.type === 'number' ? Number(x) : v.type === 'list' ? JSON.parse(x) : x; }
        await save('/api/variables', { id: detail.id, values: out });
      } else {
        const changed = detail.texts.filter(t => texts[t.path]?.trim() && texts[t.path] !== t.content);
        for (const t of changed) await api('/api/text', { id: detail.id, path: t.path, content: texts[t.path] });
        setNote(changed.length ? 'Saved' : 'Nothing changed'); if (changed.length) await reload(true);
      }
    } catch (e) { toast(e instanceof SyntaxError ? `A list is not valid JSON: ${e.message}` : (e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const label = (v: Variable) => v.description || v.name.replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ');
  return <>
    <h2>Text</h2><p className="sub">{detail.mode === 'template' ? 'Change the words and colours; the whole design follows.' : 'Every piece of text in the video, in the order it appears.'}</p>
    {detail.mode === 'template' ? (fields.length ? fields.map(v => <Field key={v.name} label={label(v)}>
      {v.type === 'boolean' ? <input type="checkbox" checked={!!values[v.name]} onChange={e => setValues({ ...values, [v.name]: e.target.checked })} />
        : v.type === 'color' ? <input className="input" type="color" value={/^#[0-9a-fA-F]{6}$/.test(values[v.name]) ? values[v.name] : '#000000'} onChange={e => setValues({ ...values, [v.name]: e.target.value })} />
        : v.type === 'number' ? <input className="input" type="number" value={values[v.name] ?? ''} onChange={e => setValues({ ...values, [v.name]: e.target.value })} />
        : <textarea className="input" style={{ minHeight: v.type === 'list' ? 120 : String(values[v.name] ?? '').length > 60 ? 90 : 44, fontFamily: v.type === 'list' ? 'var(--mono)' : undefined }} value={values[v.name] ?? ''} onChange={e => setValues({ ...values, [v.name]: e.target.value })} />}
    </Field>) : <p className="sub">This video has no text fields to edit. Use Ask AI, or add scenes from Look.</p>)
      : detail.texts.length ? detail.texts.map((t: TextLayer) => <Field key={t.path} label={`${t.scene} · ${t.id}`}><textarea className="input" style={{ minHeight: t.content.length > 60 ? 90 : 44 }} value={texts[t.path] ?? ''} onChange={e => setTexts({ ...texts, [t.path]: e.target.value })} /></Field>) : <p className="sub">No text found in this video.</p>}
    {(detail.mode === 'template' ? fields.length : detail.texts.length) ? <Button variant="primary" loading={busy} onClick={apply}>Save changes</Button> : null}
  </>;
}

function AskAi({ detail, file, reload, setNote }: PaneProps) {
  const [text, setText] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async () => {
    if (!text.trim()) return; setError(''); setBusy(true);
    try { const r = await runJob<{ warnings?: string[] }>('/api/refine', { file, instruction: text.trim() }, (j: Job) => setNote(j.messages.at(-1) ?? 'Working…')); setNote('Changed'); setText(''); void r; await reload(false); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <>
    <h2>Ask AI to change it</h2><p className="sub">Describe the change in your own words. Every change is saved in History, so you can go back.</p>
    <textarea className="input" style={{ minHeight: 120 }} placeholder="e.g. Make the pace faster and the headline shorter" value={text} onChange={e => setText(e.target.value)} />
    <div className="chips">{['Make it faster paced', 'Shorten all the text', 'Add a call to action at the end', 'Calmer and more minimal', 'Use bolder, larger headlines'].map(s => <button key={s} className="chip" onClick={() => setText(s)}>{s}</button>)}</div>
    {detail.mode === 'template' ? <Notice tone="warn">After an AI change this video becomes a finished video: text is then edited line by line instead of by field.</Notice> : null}
    {error ? <Notice tone="error">{error}</Notice> : null}
    <Button variant="primary" loading={busy} onClick={run}>{busy ? 'Working…' : 'Apply change'}</Button>
  </>;
}

function Look({ detail, save }: PaneProps) {
  const [lib, setLib] = useState<Library | null>(null), [category, setCategory] = useState('all'), [error, setError] = useState('');
  useEffect(() => { api<Library>('/api/library').then(setLib, e => setError(e.message)); }, []);
  const canTheme = Object.keys(detail.theme).length > 0;
  const categories = lib ? ['all', ...new Set(lib.blocks.map(b => b.category))] : [];
  return <>
    <h2>Look</h2><p className="sub">Pick a colour theme. It restyles every scene.</p>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <div className="themes">{lib?.themes.map(t => <button key={t.id} className="theme" disabled={!canTheme} title={canTheme ? t.description : 'This video does not use a theme'} onClick={() => void save('/api/theme', { id: detail.id, theme: t.id }, 'Look changed').catch(() => {})}>
      <div className="swatches">{['bg', 'surface', 'accent', 'accent2'].map(k => <i key={k} style={{ background: String(t.variables[k]) }} />)}</div><b>{t.name}</b></button>)}</div>
    <h2 style={{ marginTop: 28 }}>Add a scene</h2><p className="sub">Blocks from the library, added at the end.</p>
    <select className="input" style={{ marginBottom: 8 }} value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All kinds' : c}</option>)}</select>
    {lib?.blocks.filter(b => category === 'all' || b.category === category).map((b: Block) => <div className="row" key={b.id}><div><b>{b.name}</b><small>{b.description}</small></div>
      <Button size="sm" onClick={() => void save('/api/add-block', { id: detail.id, block: b.id }, `Added ${b.name}`).catch(() => {})}>Add</Button></div>)}
  </>;
}

function History({ detail, file, reload, setNote }: PaneProps) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null), [error, setError] = useState(''), { toast } = useUi();
  const load = () => api<{ revisions: Revision[] }>(`/api/history?file=${encodeURIComponent(file)}`).then(r => setRevisions([...r.revisions].reverse()), e => setError(e.message));
  useEffect(() => { void load(); }, [detail]);
  const restore = (n: number) => api('/api/restore', { file, n }).then(() => { setNote(`Restored #${n}`); return reload(false); }, e => toast(e.message, 'error'));
  return <>
    <h2>History</h2><p className="sub">Every change is kept. Go back to any version.</p>
    {error ? <Notice tone="error">{error}</Notice> : null}{revisions && revisions.length === 0 ? <p className="sub">No versions yet.</p> : null}
    {revisions?.map((r, i) => <div className="row" key={r.n}><div><b>#{r.n} · {r.kind}</b><small>{r.label}</small><small>{new Date(r.at).toLocaleString()}</small></div>{i === 0 ? <Badge tone="green">Current</Badge> : <Button size="sm" onClick={() => void restore(r.n)}>Restore</Button>}</div>)}
  </>;
}

function Export({ detail, file }: PaneProps) {
  const [scale, setScale] = useState('1'), [busy, setBusy] = useState(''), [label, setLabel] = useState(''), [error, setError] = useState('');
  const [video, setVideo] = useState<{ url: string; relative: string } | null>(null), [picture, setPicture] = useState<{ title: string; url: string; items?: string[] } | null>(null);
  const run = async (kind: string, work: () => Promise<void>) => { setError(''); setBusy(kind); try { await work(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); setLabel(''); } };
  const progress = (j: Job) => setLabel(j.messages.at(-1) ?? '');
  return <>
    <h2>Export</h2><p className="sub">{detail.width}×{detail.height} · {dur(detail.durationFrames / detail.fps)} · MP4</p>
    <Field label="Quality"><select className="input" value={scale} onChange={e => setScale(e.target.value)}><option value="1">Full quality</option><option value="0.5">Half size (faster)</option><option value="0.25">Quick draft</option></select></Field>
    <Button variant="primary" loading={busy === 'render'} disabled={!!busy} onClick={() => run('render', async () => { const r = await runJob('/api/render', { file, output: 'out.mp4', scale: Number(scale) }, progress); setPicture(null); setVideo(r); })}>{busy === 'render' ? label || 'Rendering…' : 'Render video'}</Button>
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <Button loading={busy === 'check'} disabled={!!busy} onClick={() => run('check', async () => { const r = await runJob('/api/review', { file }, progress); setVideo(null); setPicture({ title: r.issues.length ? `${r.issues.length} thing(s) to look at` : 'No problems found', url: r.url, items: r.issues.slice(0, 12).map((i: any) => i.message ?? String(i)) }); })}>Check for problems</Button>
      <Button loading={busy === 'thumb'} disabled={!!busy} onClick={() => run('thumb', async () => { const r = await runJob('/api/thumbnail', { file }, progress); setVideo(null); setPicture({ title: 'Thumbnail', url: r.url }); })}>Make thumbnail</Button>
    </div>
    {error ? <Notice tone="error">{error}</Notice> : null}
    {video ? <div className="result"><b>Your video is ready</b><video src={video.url} controls /><div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}><a className="btn primary sm" href={video.url} download={`${detail.id}.mp4`}>Download MP4</a><span className="saved">{video.relative}</span></div></div> : null}
    {picture ? <div className="result"><b>{picture.title}</b>{picture.items?.length ? <ul>{picture.items.map((t, i) => <li key={i}>{t}</li>)}</ul> : null}<img src={`${picture.url}?t=${Date.now()}`} alt="" />{picture.title === 'Thumbnail' ? <div style={{ marginTop: 10 }}><a className="btn primary sm" href={picture.url} download={`${detail.id}.png`}>Download PNG</a></div> : null}</div> : null}
  </>;
}
