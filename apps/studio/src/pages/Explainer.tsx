import { useState } from 'react';
import { api, runJob } from '../api';
import { go } from '../router';
import { Button, Field, Notice, Page, WandIcon } from '../ui';

// A topic in, a script out, then a video: the model writes what each scene shows and says, the person edits the words, and the same compiler
// the command line uses draws the scenes. Nothing here is drawn by the model, so any topic comes out looking like the rest.
type Scene = { kind: string; say?: string; [key: string]: unknown };
type Script = { topic: string; series?: string; handle?: string; look?: string; aspect?: string; sketch?: boolean; voice?: string; scenes: Scene[]; [key: string]: unknown };

const looks = ['navy', 'ink', 'paper', 'forest', 'sunset'];
const aspects: [string, string][] = [['9:16', 'Vertical 9:16 (reels, shorts)'], ['4:5', 'Portrait 4:5 (feed posts)'], ['1:1', 'Square 1:1'], ['16:9', 'Wide 16:9 (YouTube)']];
const blank: Script = { topic: 'My topic', series: 'EXPLAINED', handle: '@you', look: 'navy', aspect: '9:16', scenes: [
  { kind: 'title', lines: ['What is', 'MY TOPIC', 'really?'], say: 'Here is the idea in one minute.' },
  { kind: 'closing', title: 'Remember this', points: ['One clear idea', 'One simple picture'], cta: 'FOLLOW FOR MORE', say: 'That is the whole idea.' },
] };

export function Explainer() {
  const [brief, setBrief] = useState('');
  const [scenes, setScenes] = useState('5');
  const [language, setLanguage] = useState('');
  const [images, setImages] = useState(false);
  const [script, setScript] = useState<Script | null>(null);
  const [raw, setRaw] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [voice, setVoice] = useState(true);
  const [busy, setBusy] = useState<'' | 'write' | 'make'>('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const adopt = (next: Script) => { setScript(next); setRaw(JSON.stringify(next, null, 2)); };
  const change = (patch: Partial<Script>) => script && adopt({ ...script, ...patch });
  const say = (index: number, value: string) => script && adopt({ ...script, scenes: script.scenes.map((scene, i) => (i === index ? { ...scene, say: value || undefined } : scene)) });
  const dropScene = (index: number) => script && script.scenes.length > 1 && adopt({ ...script, scenes: script.scenes.filter((_, i) => i !== index) });

  const write = async () => {
    setBusy('write'); setError(''); setStatus('Writing the script…');
    try {
      const result = await runJob<{ script: Script }>('/api/explainer', { brief: brief.trim(), writeOnly: true, scenes: Number(scenes), images, ...(language.trim() ? { language: language.trim() } : {}) }, job => setStatus(job.messages.at(-1) ?? 'Writing the script…'));
      adopt(result.script);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(''); setStatus(''); }
  };

  const applyRaw = (): Script | null => {
    try { const next = JSON.parse(raw) as Script; setScript(next); setError(''); return next; } catch (cause) { setError(`The script is not valid JSON: ${(cause as Error).message}`); return null; }
  };

  const make = async () => {
    const final = showRaw ? applyRaw() : script;
    if (!final) return;
    setBusy('make'); setError('');
    try {
      const project = await api<{ id: string }>('/api/project/new', { name: final.topic || 'Explainer', kind: 'reel' });
      const { job } = await api<{ job: { id: string } }>('/api/explainer', { script: final, folder: project.id, voice, ...(brief.trim() ? { brief: brief.trim() } : {}) });
      go(`#/making/${encodeURIComponent(project.id)}/${job.id}`);
    } catch (cause) { setError((cause as Error).message); setBusy(''); }
  };

  return (
    <Page title="Explainer" subtitle="Say what to explain. Get a script you can edit, then a finished video with a voice." narrow>
      {error ? <Notice tone="error" title="That did not work">{error}</Notice> : null}
      {!script ? (
        <div className="card" style={{ padding: 20, display: 'grid', gap: 14 }}>
          <Field label="What should the video explain?" hint="A topic, a question or a few notes. One idea works best.">
            <textarea className="input" rows={4} value={brief} onChange={event => setBrief(event.target.value)} placeholder="How does a load balancer spread traffic across servers?" />
          </Field>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Field label="Scenes"><select className="input" value={scenes} onChange={event => setScenes(event.target.value)}>{[3, 4, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n}</option>)}</select></Field>
            <Field label="Language" hint="Optional"><input className="input" value={language} onChange={event => setLanguage(event.target.value)} placeholder="English" /></Field>
            <Field label="Pictures" hint="Needs a model that can draw"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={images} onChange={event => setImages(event.target.checked)} />Let the script ask for drawn pictures</label></Field>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Button variant="primary" icon={<WandIcon />} loading={busy === 'write'} disabled={!brief.trim()} onClick={() => void write()}>Write the script</Button>
            <Button variant="ghost" onClick={() => adopt(blank)}>I have my own script</Button>
            {status ? <span className="muted">{status}</span> : null}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="card" style={{ padding: 20, display: 'grid', gap: 12 }}>
            <Field label="Title in the header"><input className="input" value={script.topic} onChange={event => change({ topic: event.target.value })} /></Field>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Field label="Shape"><select className="input" value={script.aspect ?? '9:16'} onChange={event => change({ aspect: event.target.value })}>{aspects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Look"><select className="input" value={script.look ?? 'navy'} onChange={event => change({ look: event.target.value })}>{looks.map(value => <option key={value} value={value}>{value}</option>)}</select></Field>
              <Field label="Hand-drawn"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={Boolean(script.sketch)} onChange={event => change({ sketch: event.target.checked })} />Sketch every shape</label></Field>
            </div>
          </div>

          {showRaw ? (
            <div className="card" style={{ padding: 20 }}>
              <Field label="Script (JSON)" hint="Every scene kind and field is described in the documentation. Mistakes are listed when you make the video."><textarea className="input" rows={22} spellCheck={false} value={raw} onChange={event => setRaw(event.target.value)} style={{ fontFamily: 'monospace' }} /></Field>
            </div>
          ) : script.scenes.map((scene, index) => (
            <div key={index} className="card" style={{ padding: 16, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{index + 1} · {scene.kind}</b>
                <Button variant="ghost" size="sm" disabled={script.scenes.length < 2} onClick={() => dropScene(index)}>Remove</Button>
              </div>
              <Field label="Spoken line" hint="The scene lasts as long as the line. Leave it empty for a silent scene.">
                <textarea className="input" rows={2} value={scene.say ?? ''} onChange={event => say(index, event.target.value)} />
              </Field>
            </div>
          ))}

          <div className="card" style={{ padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} />Record a voice for each line</label>
            <span style={{ flex: 1 }} />
            <Button variant="ghost" onClick={() => { if (showRaw) { const next = applyRaw(); if (next) setShowRaw(false); } else { setRaw(JSON.stringify(script, null, 2)); setShowRaw(true); } }}>{showRaw ? 'Back to the simple view' : 'Edit as JSON'}</Button>
            <Button variant="ghost" onClick={() => { setScript(null); setShowRaw(false); }}>Start over</Button>
            <Button variant="primary" loading={busy === 'make'} onClick={() => void make()}>Make the video</Button>
          </div>
        </div>
      )}
    </Page>
  );
}
