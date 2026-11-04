import { useEffect, useRef, useState } from 'react';
import { api, upload, waitJob, type Job } from '../api';
import { go } from '../router';
import { Button, Field, Notice, Page, Spinner } from '../ui';

const kinds = [['reel', 'Social reel', 'Vertical, about 20 seconds'], ['product', 'Product video', 'Square, about 18 seconds'], ['promo', 'Promo', 'Wide, about 30 seconds'], ['project', 'Case study', 'Wide, about a minute']] as const;
const examples = ['Launch video for a budgeting app called Pocket, with three features and a call to download', 'Event invite for a design meetup on May 14 in Berlin', 'Product card for a hand-poured soy candle, price 24 dollars, free shipping'];

export function Create() {
  const [kind, setKind] = useState<string>('reel'), [brief, setBrief] = useState(''), [name, setName] = useState(''), [files, setFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState(''), [aspect, setAspect] = useState(''), [voice, setVoice] = useState(false), [review, setReview] = useState(false), [full, setFull] = useState(false);
  const [urlInput, setUrlInput] = useState(''), [scraping, setScraping] = useState(false), [scrapedBrand, setScrapedBrand] = useState<{ name?: string; colors?: Record<string, string>; logo?: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [over, setOver] = useState(false), picker = useRef<HTMLInputElement>(null);
  const addFiles = (list: FileList | null) => { if (list) setFiles(current => [...current, ...Array.from(list)]); };

  const handleScrapeUrl = async () => {
    if (!urlInput.trim()) return;
    setError('');
    setScraping(true);
    try {
      const res = await api<{ scraped: any; brand: any; suggestedBrief: string }>('/api/brand/scrape', { url: urlInput.trim() });
      setScrapedBrand(res.brand);
      if (res.brand?.name && !name) setName(`${res.brand.name} Launch`);
      if (res.suggestedBrief && (!brief || brief.length < 20)) setBrief(res.suggestedBrief);
    } catch (e) {
      setError(`Could not fetch brand from URL: ${(e as Error).message}`);
    } finally {
      setScraping(false);
    }
  };

  const submit = async () => {
    setError(''); if (!brief.trim()) { setError('Describe the video first'); return; }
    setBusy(true);
    try {
      const made = await api<{ id: string }>('/api/project/new', { name: name.trim() || brief.trim().split(/\s+/).slice(0, 6).join(' '), kind });
      for (const file of files) await upload(made.id, file);
      const body: Record<string, unknown> = { brief: brief.trim(), kind, folder: made.id, narration: voice, review, full };
      if (duration) body.duration = duration; if (aspect) body.aspect = aspect;
      const { job } = await api<{ job: Job }>('/api/compose', body);
      go(`#/making/${encodeURIComponent(made.id)}/${job.id}`);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };
  return <Page title="New video" subtitle="Describe it and the studio picks a design, writes the copy and builds the scenes." narrow>
    {/* Website URL Ingestion */}
    <Field label="Import from Website / Brand URL (optional)">
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="input"
          placeholder="e.g. linear.app, supabase.com, or https://resend.com"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScrapeUrl(); } }}
        />
        <Button variant="secondary" loading={scraping} onClick={handleScrapeUrl}>
          {scraping ? 'Analyzing…' : 'Extract Brand'}
        </Button>
      </div>
      {scrapedBrand ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          {scrapedBrand.logo ? <img src={scrapedBrand.logo} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: 'contain' }} /> : null}
          <div style={{ flex: 1, fontSize: 13 }}>
            <b>{scrapedBrand.name || 'Brand'}</b>
            <span style={{ color: 'var(--muted)', marginLeft: 8 }}>Colors detected:</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {scrapedBrand.colors?.primary ? <span title="Primary" style={{ width: 16, height: 16, borderRadius: '50%', background: scrapedBrand.colors.primary, border: '1px solid var(--border)' }} /> : null}
            {scrapedBrand.colors?.accent ? <span title="Accent" style={{ width: 16, height: 16, borderRadius: '50%', background: scrapedBrand.colors.accent, border: '1px solid var(--border)' }} /> : null}
            {scrapedBrand.colors?.secondary ? <span title="Secondary" style={{ width: 16, height: 16, borderRadius: '50%', background: scrapedBrand.colors.secondary, border: '1px solid var(--border)' }} /> : null}
          </div>
        </div>
      ) : null}
    </Field>

    <Field label="What kind of video?"><div className="tiles">{kinds.map(([id, title, hint]) => <button key={id} type="button" className={`tile ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}><b>{title}</b><span>{hint}</span></button>)}</div></Field>
    <Field label="Describe your video"><textarea className="input" style={{ minHeight: 130 }} placeholder="What is the video about? Who is it for? What should people do after watching?" value={brief} onChange={e => setBrief(e.target.value)} /></Field>
    <div className="chips" style={{ marginTop: -8 }}>{examples.map(example => <button key={example} type="button" className="chip" title={example} onClick={() => setBrief(example)}>{example.length > 56 ? example.slice(0, 54) + '…' : example}</button>)}</div>
    <Field label="Your pictures and footage (optional)">
      <div className={`drop ${over ? 'over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
        Drop files here, or <a onClick={() => picker.current?.click()}>choose files</a>
        <input ref={picker} type="file" multiple accept="image/*,video/*,audio/*" hidden onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length ? <div className="files">{files.map((file, i) => <span key={i} title="Remove" onClick={() => setFiles(list => list.filter((_, j) => j !== i))}>{file.name} ×</span>)}</div> : null}
    </Field>
    <details><summary>More options</summary>
      <Field label="Name"><input className="input" placeholder="Defaults to the first words of the description" value={name} onChange={e => setName(e.target.value)} /></Field>
      <div className="two"><Field label="Length in seconds"><input className="input" type="number" min={3} placeholder="Default" value={duration} onChange={e => setDuration(e.target.value)} /></Field>
        <Field label="Shape"><select className="input" value={aspect} onChange={e => setAspect(e.target.value)}><option value="">Default for this kind</option><option value="9:16">Vertical 9:16</option><option value="1:1">Square 1:1</option><option value="16:9">Wide 16:9</option><option value="4:5">Portrait 4:5</option></select></Field></div>
      <label className="check"><input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} />Add a voiceover with captions (uses your AI provider)</label>
      <label className="check"><input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} />Check the result for problems and fix them (slower)</label>
      <label className="check"><input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />Write every layer from scratch (experimental, without templates)</label>
    </details>
    {error ? <Notice tone="error">{error}</Notice> : null}
    <Button variant="primary" size="lg" loading={busy} onClick={submit}>{busy ? 'Starting…' : 'Create video'}</Button>
  </Page>;
}

export function Making({ id, job }: { id: string; job: string }) {
  const [messages, setMessages] = useState<string[]>([]), [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    waitJob(job, j => { if (live) setMessages(j.messages); }).then(() => { if (live) go(`#/p/${encodeURIComponent(id)}`); }, e => { if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [id, job]);
  return <div className="center">
    {error ? <><h2>That did not work</h2><Notice tone="error">{error}</Notice>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><Button variant="primary" onClick={() => go('#/new')}>Try again</Button><Button onClick={() => api('/api/project/delete', { id }).then(() => go('#/'))}>Delete the empty project</Button></div></>
      : <><Spinner /><h2>Making your video</h2><p className="sub">Choosing a design, writing the text and building the scenes. This usually takes under a minute.</p>
        {messages.length ? <div className="log">{messages.join('\n')}</div> : null}</>}
  </div>;
}
