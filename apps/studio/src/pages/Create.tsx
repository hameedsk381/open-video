import { useEffect, useRef, useState } from 'react';
import { api, upload, waitJob, type Job } from '../api';
import { go } from '../router';
import {
  AlertCircleIcon,
  Badge,
  Button,
  CheckIcon,
  Field,
  FilmIcon,
  GlobeIcon,
  Notice,
  Page,
  SparklesIcon,
  Spinner,
  WandIcon,
} from '../ui';

const kinds = [
  ['reel', 'Social Reel', 'Vertical 9:16 · TikTok, Instagram Reels & YouTube Shorts'],
  ['product', 'Product Spotlight', 'Square 1:1 · Social feeds, promo cards & ads'],
  ['promo', 'Brand Promo', 'Widescreen 16:9 · Landing pages & presentations'],
  ['project', 'Narrative Story', 'Widescreen 16:9 · Case studies, pitch & explainers'],
] as const;

const examples = [
  'Launch video for a personal finance app called Pocket with 3 key benefits and a call to download',
  'Exclusive invitation to our annual design conference in Berlin on May 14',
  'Product highlight for handcrafted ceramic mug, premium matte black finish with free shipping',
];

export function Create() {
  const [kind, setKind] = useState<string>('reel');
  const [brief, setBrief] = useState('');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState('');
  const [aspect, setAspect] = useState('');
  const [voice, setVoice] = useState(false);
  const [review, setReview] = useState(true);
  const [full, setFull] = useState(false);
  const [theme, setTheme] = useState('');

  const [urlInput, setUrlInput] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapedBrand, setScrapedBrand] = useState<{ name?: string; colors?: Record<string, string>; logo?: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (list) setFiles(current => [...current, ...Array.from(list)]);
  };

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
      setError(`Could not extract brand details from this URL: ${(e as Error).message}`);
    } finally {
      setScraping(false);
    }
  };

  const submit = async () => {
    setError('');
    if (!brief.trim()) {
      setError('Please provide a brief description of what you want to create.');
      return;
    }
    setBusy(true);
    try {
      const made = await api<{ id: string }>('/api/project/new', {
        name: name.trim() || brief.trim().split(/\s+/).slice(0, 6).join(' '),
        kind,
      });
      for (const file of files) await upload(made.id, file);
      const body: Record<string, unknown> = {
        brief: brief.trim(),
        kind,
        folder: made.id,
        narration: voice,
        review,
        full,
      };
      if (theme) body.theme = theme;
      if (duration) body.duration = duration;
      if (aspect) body.aspect = aspect;
      const { job } = await api<{ job: Job }>('/api/compose', body);
      go(`#/making/${encodeURIComponent(made.id)}/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Page
      title="Create New Video"
      subtitle="Describe your idea or connect your brand to generate broadcast-grade motion graphics automatically."
      narrow
    >
      {/* Brand Ingestion Card */}
      <Field label={<span><GlobeIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Import from Brand or Website (optional)</span>} hint="Automatically imports brand colors, logo, and core messaging">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="e.g. acme.com, linear.app, or your company domain"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleScrapeUrl(); } }}
          />
          <Button variant="secondary" loading={scraping} icon={<SparklesIcon size={14} />} onClick={handleScrapeUrl}>
            {scraping ? 'Analyzing…' : 'Extract Brand'}
          </Button>
        </div>

        {scrapedBrand ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
            {scrapedBrand.logo ? (
              <img src={scrapedBrand.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: '#000', padding: 2 }} />
            ) : (
              <GlobeIcon size={24} style={{ color: 'var(--muted)' }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b>{scrapedBrand.name || 'Brand Identity'}</b>
                <Badge tone="green" dot>Active Brand Pack</Badge>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Brand colors and tone synthesized into brief</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {scrapedBrand.colors?.primary ? (
                <span title={`Primary: ${scrapedBrand.colors.primary}`} style={{ width: 20, height: 20, borderRadius: '50%', background: scrapedBrand.colors.primary, border: '2px solid var(--border)' }} />
              ) : null}
              {scrapedBrand.colors?.accent ? (
                <span title={`Accent: ${scrapedBrand.colors.accent}`} style={{ width: 20, height: 20, borderRadius: '50%', background: scrapedBrand.colors.accent, border: '2px solid var(--border)' }} />
              ) : null}
              {scrapedBrand.colors?.secondary ? (
                <span title={`Secondary: ${scrapedBrand.colors.secondary}`} style={{ width: 20, height: 20, borderRadius: '50%', background: scrapedBrand.colors.secondary, border: '2px solid var(--border)' }} />
              ) : null}
            </div>
          </div>
        ) : null}
      </Field>

      {/* Format Selection */}
      <Field label="Choose format & aspect ratio">
        <div className="tiles">
          {kinds.map(([id, title, hint]) => (
            <button key={id} type="button" className={`tile ${kind === id ? 'on' : ''}`} onClick={() => setKind(id)}>
              <b>{title}</b>
              <span>{hint}</span>
            </button>
          ))}
        </div>
      </Field>

      {/* Prompt / Brief */}
      <Field label="Describe your video">
        <textarea
          className="input"
          style={{ minHeight: 120 }}
          placeholder="What is your video about? Mention your product name, key takeaway, and call to action…"
          value={brief}
          onChange={e => setBrief(e.target.value)}
        />
      </Field>

      <div style={{ margin: '-10px 0 20px' }}>
        <span style={{ fontSize: 12, color: 'var(--faint)', display: 'block', marginBottom: 6 }}>Need inspiration? Try an example:</span>
        <div className="chips">
          {examples.map(example => (
            <button key={example} type="button" className="chip" title={example} onClick={() => setBrief(example)}>
              {example.length > 56 ? example.slice(0, 54) + '…' : example}
            </button>
          ))}
        </div>
      </div>

      {/* Media Assets */}
      <Field label="Brand assets, footage or audio (optional)">
        <div
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
        >
          <FilmIcon size={24} style={{ margin: '0 auto 8px', color: 'var(--muted)', display: 'block' }} />
          <span>Drag and drop assets here, or <a onClick={() => picker.current?.click()}>browse files</a></span>
          <input
            ref={picker}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            hidden
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
        {files.length ? (
          <div className="files">
            {files.map((file, i) => (
              <span key={i} title="Click to remove" onClick={() => setFiles(list => list.filter((_, j) => j !== i))}>
                {file.name} ×
              </span>
            ))}
          </div>
        ) : null}
      </Field>

      {/* Creation Mode */}
      <Field label="Creation Architecture">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <div
            onClick={() => setFull(false)}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              border: !full ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: !full ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, color: !full ? 'var(--accent)' : 'inherit' }}>
              <SparklesIcon size={14} /> Smart Layout (Fast)
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
              Uses battle-tested motion templates styled with your selected visual theme.
            </div>
          </div>
          <div
            onClick={() => setFull(true)}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              border: full ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: full ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
              transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, color: full ? 'var(--accent)' : 'inherit' }}>
              <WandIcon size={14} /> Bespoke Generative (Creative)
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>
              Synthesizes custom scene layouts, kinetic type, and camera moves from scratch.
            </div>
          </div>
        </div>
      </Field>

      {/* Visual Theme & Style Palette */}
      <Field label="Visual Theme & Mood Palette" hint="Sets background, typography styling, contrast, and accent hierarchy">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {[
            { id: '', name: 'Auto (AI Decides)', desc: 'Prompt mood', colors: ['#6366f1', '#ec4899', '#06b6d4'] },
            { id: 'midnight', name: 'Midnight Slate', desc: 'Tech & B2B', colors: ['#0b0f19', '#38bdf8', '#818cf8'] },
            { id: 'neon', name: 'Neon Cyber', desc: 'Social & Viral', colors: ['#0a0710', '#ff3cac', '#c6ff3c'] },
            { id: 'espresso', name: 'Warm Espresso', desc: 'Craft & Food', colors: ['#120c08', '#f59e0b', '#fcd34d'] },
            { id: 'paper', name: 'Clean Paper', desc: 'Light Editorial', colors: ['#f8f6f0', '#2563eb', '#18181b'] },
            { id: 'signal', name: 'High Signal', desc: 'Alerts & Sport', colors: ['#0a0a0a', '#ef4444', '#ffffff'] },
          ].map(t => {
            const active = theme === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setTheme(t.id)}
                style={{
                  cursor: 'pointer',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'inherit' }}>{t.name}</span>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {t.colors.map((c, idx) => (
                    <span key={idx} style={{ width: 14, height: 14, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                  ))}
                  <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 4 }}>{t.desc}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Field>

      {/* Advanced Settings Accordion */}
      <details>
        <summary>Advanced Creative Settings</summary>
        <Field label="Project title">
          <input
            className="input"
            placeholder="Auto-generated from your brief if left blank"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </Field>

        <div className="two">
          <Field label="Duration (seconds)">
            <input
              className="input"
              type="number"
              min={3}
              placeholder="Recommended: 15-30s"
              value={duration}
              onChange={e => setDuration(e.target.value)}
            />
          </Field>
          <Field label="Custom Aspect Ratio">
            <select className="input" value={aspect} onChange={e => setAspect(e.target.value)}>
              <option value="">Optimized for selected format</option>
              <option value="9:16">Vertical (9:16) - Social Reel</option>
              <option value="1:1">Square (1:1) - Feed Post</option>
              <option value="16:9">Widescreen (16:9) - Standard Video</option>
              <option value="4:5">Portrait (4:5) - Feed Card</option>
            </select>
          </Field>
        </div>

        <label className="check">
          <input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} />
          <span>Generate AI narration with synchronized kinetic captions</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} />
          <span>Autonomous visual design quality check (verifies readability & safe-zones)</span>
        </label>
      </details>

      {error ? <Notice tone="error" title="Could not create video">{error}</Notice> : null}

      <div style={{ marginTop: 24 }}>
        <Button variant="primary" size="lg" loading={busy} icon={<WandIcon size={16} />} onClick={submit} style={{ width: '100%' }}>
          {busy ? 'Preparing Creation Pipeline…' : 'Generate Video'}
        </Button>
      </div>
    </Page>
  );
}

/* ==================== Making Screen ==================== */
export function Making({ id, job }: { id: string; job: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    let live = true;
    waitJob(job, j => {
      if (live) setMessages(j.messages);
    }).then(
      () => { if (live) go(`#/p/${encodeURIComponent(id)}`); },
      e => { if (live) setError((e as Error).message); }
    );
    return () => { live = false; };
  }, [id, job]);

  // Determine stage based on messages count & content
  const stage = messages.some(m => /retim|review|audio|render/i.test(m))
    ? 4
    : messages.some(m => /template|compose|layer|scene/i.test(m))
      ? 3
      : messages.some(m => /plan|beat|story/i.test(m))
        ? 2
        : 1;

  const currentStatusText = messages.length
    ? (() => {
        const last = messages[messages.length - 1]!;
        if (/planning/i.test(last)) return 'Structuring video scenes and timing beats…';
        if (/template/i.test(last)) return 'Composing kinetic typography and motion layers…';
        if (/retim/i.test(last)) return 'Optimizing rhythm, transitions and pacing…';
        if (/review/i.test(last)) return 'Performing automated visual quality checks…';
        return last;
      })()
    : 'Initializing autonomous motion pipeline…';

  return (
    <div className="center">
      {error ? (
        <>
          <div style={{ margin: '0 auto 20px', width: 48, height: 48, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 15%, transparent)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircleIcon size={24} />
          </div>
          <h2>Creation paused</h2>
          <Notice tone="error" title="Notice">{error}</Notice>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <Button variant="primary" onClick={() => go('#/new')}>Try Again</Button>
            <Button onClick={() => api('/api/project/delete', { id }).then(() => go('#/'))}>Back to Projects</Button>
          </div>
        </>
      ) : (
        <>
          <div style={{ margin: '0 auto 16px', display: 'flex', justifyContent: 'center' }}>
            <Spinner size={36} />
          </div>
          <h2>Creating your video</h2>
          <p className="sub" style={{ maxWidth: 440, margin: '6px auto 0' }}>
            {currentStatusText}
          </p>

          <div className="pipeline-card">
            <div className="pipeline-header">
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Autonomous Production Flow</span>
              <Badge tone="blue" dot>Stage {stage} of 4</Badge>
            </div>

            <div className={`pipeline-step ${stage === 1 ? 'active' : stage > 1 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 1 ? <CheckIcon size={14} /> : '1'}</div>
              <div className="step-content">
                <b>Concept & Brand Ingestion</b>
                <small>Analyzing creative brief and brand color systems</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 2 ? 'active' : stage > 2 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 2 ? <CheckIcon size={14} /> : '2'}</div>
              <div className="step-content">
                <b>Storyboard & Pacing Plan</b>
                <small>Structuring scene hooks, feature beats, and call-to-actions</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 3 ? 'active' : stage > 3 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 3 ? <CheckIcon size={14} /> : '3'}</div>
              <div className="step-content">
                <b>Kinetic Motion & Typography Layout</b>
                <small>Assembling camera animations, typography, and visual assets</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 4 ? 'active' : ''}`}>
              <div className="step-circle">4</div>
              <div className="step-content">
                <b>Quality Review & Timeline Polish</b>
                <small>Fine-tuning frame durations, easings, and render readiness</small>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button
              className="btn ghost sm"
              style={{ fontSize: 12, color: 'var(--faint)' }}
              onClick={() => setShowLog(v => !v)}
            >
              {showLog ? 'Hide activity details' : 'Show activity details'}
            </button>
            {showLog && messages.length ? (
              <div className="log">{messages.join('\n')}</div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
