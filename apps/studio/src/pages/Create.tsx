import { useEffect, useRef, useState } from 'react';
import { limitMessage } from '../limitMessage';
import { api, upload, waitJob, cleanUserStatus, useHostMode, type Job, type Library, type TemplateSummary } from '../api';
import { composeNotesKey, composeOutcome } from '../composeReport';
import { go } from '../router';
import {
  AlertCircleIcon,
  Badge,
  Button,
  CheckIcon,
  Field,
  FilmIcon,
  GlobeIcon,
  LayersIcon,
  MusicIcon,
  Notice,
  Page,
  PaletteIcon,
  SlidersIcon,
  SparklesIcon,
  Spinner,
  TypeIcon,
  VolumeIcon,
  WandIcon,
} from '../ui';

const kinds = [
  ['reel', 'Social Reel', 'Vertical 9:16 · TikTok, Instagram Reels & YouTube Shorts'],
  ['promo', 'Brand Promo', 'Widescreen 16:9 · Landing pages & presentations'],
  ['product', 'Product Spotlight', 'Square 1:1 · Social feeds, promo cards & ads'],
  ['project', 'Narrative Story', 'Widescreen 16:9 · Case studies, pitch & explainers'],
] as const;

const examples = [
  'Launch video for a personal finance app called Pocket with 3 key benefits and a call to download',
  'Exclusive invitation to our annual design conference in Berlin on May 14',
  'Product highlight for handcrafted ceramic mug, premium matte black finish with free shipping',
  'High-impact SaaS product update announcing realtime collaboration and AI workflows',
];

export function Create({ initialTemplate, initialKind, initialPrompt }: { initialTemplate?: string; initialKind?: string; initialPrompt?: string } = {}) {
  const hostMode = useHostMode();
  // Autopilot hides everything; Guided exposes the choices that matter; Pro is the full engine.
  const [mode, setMode] = useState<'autopilot' | 'guided' | 'pro'>(() => {
    try { const saved = localStorage.getItem('ove-create-mode'); return saved === 'guided' || saved === 'pro' ? saved : 'autopilot'; } catch { return 'autopilot'; }
  });
  const [templateOpen, setTemplateOpen] = useState(Boolean(initialTemplate));
  useEffect(() => { try { localStorage.setItem('ove-create-mode', mode); } catch {} }, [mode]);
  const [kind, setKind] = useState<string>(initialKind || 'reel');
  const [brief, setBrief] = useState(initialPrompt || '');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState('');
  const [aspect, setAspect] = useState('');
  const [voice, setVoice] = useState(false);
  const [review, setReview] = useState(true);
  const [full, setFull] = useState(false);
  const [theme, setTheme] = useState('');

  // Templates & Archetypes
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(initialTemplate || '');
  const [templateFilter, setTemplateFilter] = useState<'all' | 'match'>('match');

  // Creative Styling Customizations
  const [typography, setTypography] = useState('sans');
  const [motionPacing, setMotionPacing] = useState('dynamic');
  const [visualTreatment, setVisualTreatment] = useState('clean');

  // Sound Design & Audio
  const [audioMood, setAudioMood] = useState('cyber');
  const [sfx, setSfx] = useState(true);
  const [voiceTone, setVoiceTone] = useState('confident');
  const [captionsStyle, setCaptionsStyle] = useState('kinetic');

  // Story & Call to Action
  const [keyPoints, setKeyPoints] = useState('');
  const [ctaHeadline, setCtaHeadline] = useState('');
  const [ctaSubline, setCtaSubline] = useState('');
  const [sceneCount, setSceneCount] = useState('');

  // Custom Brand Colors
  const [customColorsEnabled, setCustomColorsEnabled] = useState(false);
  const [brandPrimary, setBrandPrimary] = useState('#4693f1');
  const [brandAccent, setBrandAccent] = useState('#70adfb');
  const [brandBg, setBrandBg] = useState('#0b0d12');
  const [brandText, setBrandText] = useState('#f5f6fa');

  // AI Creative Engine & Custom BYOK Gateway
  const [modelPreset, setModelPreset] = useState<string>(() => {
    try { return (localStorage.getItem('ove-model-preset') || 'auto').replace('qwen2.5-72b', 'qwen3.8-27b'); } catch { return 'auto'; }
  });
  const [customModel, setCustomModel] = useState<string>(() => {
    try { return localStorage.getItem('ove-custom-model') || ''; } catch { return ''; }
  });
  const [customBaseUrl, setCustomBaseUrl] = useState<string>(() => {
    try { return localStorage.getItem('ove-custom-base-url') || ''; } catch { return ''; }
  });
  const [customApiKey, setCustomApiKey] = useState<string>(() => {
    try { return localStorage.getItem('ove-custom-api-key') || ''; } catch { return ''; }
  });
  // On a hosted service the operator's gateway does the work, so a stored "custom gateway" preference
  // behaves as Auto there; bring-your-own-key stays a local-machine feature.
  const effectivePreset = hostMode === 'hosted' && modelPreset === 'custom' ? 'auto' : modelPreset;

  // Brand scraping
  const [urlInput, setUrlInput] = useState('');
  const [scraping, setScraping] = useState(false);
  const [scrapedBrand, setScrapedBrand] = useState<{ name?: string; colors?: Record<string, string>; logo?: string } | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Library>('/api/library').then(l => {
      if (l?.templates) {
        setTemplates(l.templates);
        if (initialTemplate) {
          const match = l.templates.find(t => t.id === initialTemplate);
          if (match && match.width && match.height) {
            if (match.width > match.height && kind === 'reel') setKind('promo');
            else if (match.width === match.height && kind !== 'product') setKind('product');
          }
        }
      }
    }).catch(() => {});
  }, [initialTemplate]);

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

      if (res.brand?.colors?.primary) {
        setBrandPrimary(res.brand.colors.primary);
        setCustomColorsEnabled(true);
      }
      if (res.brand?.colors?.accent) setBrandAccent(res.brand.colors.accent);
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

      // Build composite brief with key points and visual directions
      let compositeBrief = brief.trim();
      if (keyPoints.trim()) {
        compositeBrief += `\n\nKey Message Points:\n${keyPoints.trim()}`;
      }

      const body: Record<string, unknown> = {
        brief: compositeBrief,
        kind,
        folder: made.id,
        narration: voice,
        review,
        full,
        typography,
        motionPacing,
        audioMood,
        sfx,
        voiceTone,
        captionsStyle,
      };

      if (selectedTemplate) body.template = selectedTemplate;
      if (ctaHeadline.trim()) body.ctaHeadline = ctaHeadline.trim();
      if (ctaSubline.trim()) body.ctaSubline = ctaSubline.trim();
      if (sceneCount) body.sceneCount = Number(sceneCount);
      if (duration) body.duration = duration;
      if (aspect) body.aspect = aspect;

      if (customColorsEnabled) {
        body.customColors = {
          bg: brandBg,
          surface: brandBg === '#ffffff' || brandBg.startsWith('#f') ? '#f3f4f6' : '#151c33',
          text: brandText,
          muted: brandBg === '#ffffff' || brandBg.startsWith('#f') ? '#6b7280' : '#94a3b8',
          accent: brandPrimary,
          accent2: brandAccent,
        };
      } else if (theme) {
        body.theme = theme;
      }

      // Model & Custom Gateway Config. On a hosted service only a model choice is sent — the gateway
      // endpoint and key are always the operator's (the API strips anything else anyway).
      if (hostMode !== 'hosted' && modelPreset === 'custom') {
        if (customModel.trim()) body.model = customModel.trim();
        if (customBaseUrl.trim()) body.baseUrl = customBaseUrl.trim();
        if (customApiKey.trim()) body.apiKey = customApiKey.trim();
      } else if (effectivePreset !== 'auto') {
        body.model = effectivePreset;
      }

      try {
        localStorage.setItem('ove-model-preset', modelPreset);
        if (customModel) localStorage.setItem('ove-custom-model', customModel);
        if (customBaseUrl) localStorage.setItem('ove-custom-base-url', customBaseUrl);
        if (customApiKey) localStorage.setItem('ove-custom-api-key', customApiKey);
      } catch {}

      const { job } = await api<{ job: Job }>('/api/compose', body);
      try { sessionStorage.setItem(`ove-brief-${made.id}`, brief.trim()); } catch {}
      go(`#/making/${encodeURIComponent(made.id)}/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // Filter templates matching current format
  const matchingTemplates = templates.filter(t => {
    if (templateFilter === 'all') return true;
    if (!t.width || !t.height) return true;
    if (kind === 'reel') return t.height > t.width;
    if (kind === 'product') return t.height === t.width;
    return t.width > t.height;
  });

  const templateName = templates.find(template => template.id === selectedTemplate)?.name;
  const ratio = aspect || (kind === 'product' ? '1:1' : kind === 'reel' ? '9:16' : '16:9');
  const length = duration ? `${duration}s` : 'Auto length';
  const engine = effectivePreset === 'auto' ? 'Auto engine' : effectivePreset;

  return (
    <Page
      title="What are we making?"
      subtitle="Describe it once. The studio writes the script, designs the look and opens an editable timeline."
      actions={
        <div className="segmented create-modes" aria-label="How much control to show">
          {([['autopilot', 'Autopilot'], ['guided', 'Guided'], ['pro', 'Pro']] as const).map(([id, label]) => (
            <button key={id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)} title={id === 'autopilot' ? 'The engine decides everything' : id === 'guided' ? 'Set format, length, theme and voice' : 'Every model and creative control'}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div
        className={`create-composer ${over ? 'over' : ''}`}
        onDragOver={event => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={event => { event.preventDefault(); setOver(false); addFiles(event.dataTransfer.files); }}
      >
        <textarea
          autoFocus
          className="create-brief"
          aria-label="Describe your video"
          placeholder="What is the video about? Name the product, the benefit and who it is for, or paste a brief."
          value={brief}
          onChange={event => setBrief(event.target.value)}
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void submit(); }
          }}
        />

        <div className="create-examples">
          {examples.slice(0, 3).map(example => (
            <button key={example} type="button" className="chip" title={example} onClick={() => setBrief(example)}>
              {example.length > 54 ? example.slice(0, 52) + '…' : example}
            </button>
          ))}
        </div>

        {files.length ? (
          <div className="create-refs">
            {files.map((file, index) => (
              <button key={index} type="button" title="Remove" onClick={() => setFiles(list => list.filter((_, i) => i !== index))}>
                {file.name} ×
              </button>
            ))}
          </div>
        ) : null}

        <div className="create-tools">
          <div className="create-chipgroup">
            <span>Format</span>
            <div className="segmented">
              {kinds.map(([id, title]) => (
                <button key={id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)} title={title}>{title.replace('Social ', '').replace(' Spotlight', '').replace('Narrative ', '')}</button>
              ))}
            </div>
          </div>
          <div className="create-chipgroup">
            <span>Ratio</span>
            <div className="segmented">
              {(['', '9:16', '1:1', '16:9'] as const).map(value => (
                <button key={value || 'auto'} className={aspect === value ? 'on' : ''} onClick={() => setAspect(value)}>{value || 'Auto'}</button>
              ))}
            </div>
          </div>
          <div className="create-chipgroup">
            <span>Length</span>
            <div className="segmented">
              {(['', '15', '30', '45', '60'] as const).map(value => (
                <button key={value || 'auto'} className={duration === value ? 'on' : ''} onClick={() => setDuration(value)}>{value ? `${value}s` : 'Auto'}</button>
              ))}
            </div>
          </div>
          <div className="create-chipgroup">
            <span>Audio</span>
            <button className={`chip-toggle ${voice ? 'on' : ''}`} onClick={() => setVoice(!voice)}>
              <VolumeIcon size={13} /> Voiceover {voice ? 'on' : 'off'}
            </button>
          </div>
          <button type="button" className="chip-toggle" onClick={() => picker.current?.click()}>
            <FilmIcon size={13} /> References
          </button>
          <input
            ref={picker}
            type="file"
            multiple
            accept="image/*,video/*,audio/*"
            hidden
            onChange={event => { addFiles(event.target.files); event.target.value = ''; }}
          />
        </div>

        <div className="create-foot">
          <div className="create-summary">
            <span>{ratio}</span>
            <span>{length}</span>
            <span>{voice ? 'Voiceover' : 'No narration'}</span>
            <span>{review ? 'Design review' : 'No review'}</span>
            {templateName ? <span>Template · {templateName}</span> : null}
            <button type="button" onClick={() => setMode('pro')} title="Change the engine and model">{engine}</button>
          </div>
          <Button variant="primary" size="lg" loading={busy} icon={<WandIcon size={16} />} onClick={submit}>
            {busy ? 'Starting…' : 'Make it'}
          </Button>
        </div>
      </div>

      {selectedTemplate ? (
        <div className="create-selected">
          <span>Starting from <b>{templateName ?? selectedTemplate}</b></span>
          <button type="button" onClick={() => setSelectedTemplate('')}>Use auto layout</button>
        </div>
      ) : null}

      {error ? <Notice tone="error" title="Could not create video">{error}</Notice> : null}

      <div className="create-row">
        <button type="button" className="create-more" onClick={() => setTemplateOpen(open => !open)}>
          <FilmIcon size={14} /> {templateOpen ? 'Hide templates' : 'Start from a template'}
        </button>
        <span className="create-hint">
          {mode === 'autopilot' ? 'Autopilot decides layout, type, palette and pacing from the brief.'
            : mode === 'guided' ? 'Guided exposes the choices that change the result most.'
              : 'Pro exposes every engine, brand and timeline control.'}
        </span>
      </div>

      {templateOpen ? (
        <section className="create-section">
          <div className="create-section-head">
            <div>
              <h2>Template</h2>
              <p>Pick a ready-made layout, or leave Auto for a composition designed around this brief.</p>
            </div>
            <div className="segmented">
              <button className={templateFilter === 'match' ? 'on' : ''} onClick={() => setTemplateFilter('match')}>Matching format</button>
              <button className={templateFilter === 'all' ? 'on' : ''} onClick={() => setTemplateFilter('all')}>All</button>
            </div>
          </div>
          <div className="create-template-grid">
            <button type="button" className={`create-template ${selectedTemplate === '' ? 'on' : ''}`} onClick={() => setSelectedTemplate('')}>
              <span className="create-template-head"><b>Auto</b><Badge tone="blue">Adaptive</Badge></span>
              <small>Layout, type and camera moves designed from your brief.</small>
            </button>
            {matchingTemplates.map(template => {
              const templateAspect = template.width && template.height
                ? (template.width > template.height ? '16:9' : template.width < template.height ? '9:16' : '1:1')
                : '';
              return (
                <button key={template.id} type="button" className={`create-template ${selectedTemplate === template.id ? 'on' : ''}`} onClick={() => setSelectedTemplate(template.id)}>
                  <span className="create-template-head">
                    <b>{template.name}</b>
                    <span>{templateAspect ? <Badge tone="blue">{templateAspect}</Badge> : null}{template.durationSeconds ? <Badge tone="purple">{Math.round(template.durationSeconds)}s</Badge> : null}</span>
                  </span>
                  <small>{template.description}</small>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {mode !== 'autopilot' ? (
        <section className="create-section">
          <div className="create-section-head">
            <div>
              <h2>{mode === 'guided' ? 'Guide the result' : 'Creative direction'}</h2>
              <p>{mode === 'guided' ? 'These are the choices that change the video most. Everything else is decided for you.' : 'Fine-tune the message, look and voice.'}</p>
            </div>
          </div>

          <div className="create-grid">
            <Field label="Key message beats" hint="Bullet points to feature across scenes">
              <input className="input" placeholder="e.g. 10x faster rendering, zero setup, free tier" value={keyPoints} onChange={event => setKeyPoints(event.target.value)} />
            </Field>
            <Field label="Call to action" hint="Headline and address shown in the closing scene">
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" placeholder="Get started today" value={ctaHeadline} onChange={event => setCtaHeadline(event.target.value)} />
                <input className="input" placeholder="motionrender.dev" value={ctaSubline} onChange={event => setCtaSubline(event.target.value)} />
              </div>
            </Field>
          </div>

          <Field label="Palette" hint="Choose a look, or let the engine design one from the brief">
            <div className="create-themes">
              {[
                { id: '', name: 'Auto', desc: 'Designed from the brief', colors: ['#8b7cff', '#ec4899', '#5cc8d7'] },
                { id: 'midnight', name: 'Midnight', desc: 'Tech & B2B', colors: ['#0b0f19', '#38bdf8', '#818cf8'] },
                { id: 'neon', name: 'Neon', desc: 'Social & viral', colors: ['#0a0710', '#ff3cac', '#c6ff3c'] },
                { id: 'espresso', name: 'Espresso', desc: 'Craft & food', colors: ['#120c08', '#f59e0b', '#fcd34d'] },
                { id: 'paper', name: 'Paper', desc: 'Light editorial', colors: ['#f8f6f0', '#2563eb', '#18181b'] },
                { id: 'signal', name: 'Signal', desc: 'Alerts & sport', colors: ['#0a0a0a', '#ef4444', '#ffffff'] },
              ].map(preset => (
                <button key={preset.id || 'auto'} type="button" className={`create-theme ${theme === preset.id && !customColorsEnabled ? 'on' : ''}`} onClick={() => { setTheme(preset.id); setCustomColorsEnabled(false); }}>
                  <span>{preset.colors.map(color => <i key={color} style={{ background: color }} />)}</span>
                  <b>{preset.name}</b>
                  <small>{preset.desc}</small>
                </button>
              ))}
            </div>
          </Field>

          {voice ? (
            <div className="create-grid">
              <Field label="Voice tone">
                <select className="input" value={voiceTone} onChange={event => setVoiceTone(event.target.value)}>
                  <option value="confident">Confident & authoritative (B2B & pitch)</option>
                  <option value="warm">Warm & conversational (creator & friendly)</option>
                  <option value="hype">High-energy hype (viral & promo)</option>
                  <option value="calm">Calm (explainer & story)</option>
                </select>
              </Field>
              <Field label="Captions">
                <select className="input" value={captionsStyle} onChange={event => setCaptionsStyle(event.target.value)}>
                  <option value="kinetic">Dynamic pop (word-by-word highlight)</option>
                  <option value="pill">Clean reading pill (sentence banner)</option>
                  <option value="lower-third">Subtle lower-third</option>
                </select>
              </Field>
            </div>
          ) : null}

          <label className="check">
            <input type="checkbox" checked={review} onChange={event => setReview(event.target.checked)} />
            <span>Design review: check readability, contrast and safe zones before opening the editor</span>
          </label>
        </section>
      ) : null}

      {mode === 'pro' ? (
        <>
          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Brand</h2>
                <p>Import colors, logo and messaging from a website.</p>
              </div>
            </div>
            <Field label={<span><GlobeIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Website or brand URL</span>} hint="Fills the palette and suggests a brief; nothing leaves this machine except the page request">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="e.g. acme.com, linear.app"
                  value={urlInput}
                  onChange={event => setUrlInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleScrapeUrl(); } }}
                />
                <Button variant="secondary" loading={scraping} icon={<SparklesIcon size={14} />} onClick={handleScrapeUrl}>
                  {scraping ? 'Analysing…' : 'Extract brand'}
                </Button>
              </div>
              {scrapedBrand ? (
                <div className="create-brand">
                  {scrapedBrand.logo ? <img src={scrapedBrand.logo} alt="" /> : <GlobeIcon size={20} />}
                  <div>
                    <b>{scrapedBrand.name || 'Brand identity'}</b>
                    <small>Colors added to the palette</small>
                  </div>
                  <span>
                    {[scrapedBrand.colors?.primary, scrapedBrand.colors?.accent].filter(Boolean).map(color => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                </div>
              ) : null}
            </Field>
          </section>

          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Typography & motion</h2>
                <p>Override the engine's art direction for this video.</p>
              </div>
            </div>
            <div className="create-grid create-grid-three">
              <Field label="Font pair">
                <select className="input" value={typography} onChange={event => setTypography(event.target.value)}>
                  <option value="sans">Modern sans (Inter / Geist)</option>
                  <option value="bold">Bold kinetic (Space Grotesk / Syne)</option>
                  <option value="serif">Editorial serif (Playfair / Instrument)</option>
                  <option value="mono">Terminal mono (JetBrains Mono)</option>
                </select>
              </Field>
              <Field label="Motion pacing">
                <select className="input" value={motionPacing} onChange={event => setMotionPacing(event.target.value)}>
                  <option value="dynamic">Balanced dynamic (3–4s scenes)</option>
                  <option value="snappy">Snappy & fast (1.5–2.5s cuts)</option>
                  <option value="cinematic">Cinematic flow (4.5s+ moves)</option>
                </select>
              </Field>
              <Field label="Visual treatment">
                <select className="input" value={visualTreatment} onChange={event => setVisualTreatment(event.target.value)}>
                  <option value="clean">Modern vector & crisp contrast</option>
                  <option value="glass">Glassmorphic glow & blur</option>
                  <option value="paper">Editorial halftone & paper</option>
                  <option value="cyber">Cyber neon & gridlines</option>
                </select>
              </Field>
            </div>

            <Field
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span><PaletteIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Brand palette</span>
                  <label className="check" style={{ margin: 0, fontSize: 12 }}>
                    <input type="checkbox" checked={customColorsEnabled} onChange={event => setCustomColorsEnabled(event.target.checked)} />
                    <span>Use custom colors</span>
                  </label>
                </div>
              }
            >
              {customColorsEnabled ? (
                <div className="create-colors">
                  {[
                    ['Primary', brandPrimary, setBrandPrimary],
                    ['Accent', brandAccent, setBrandAccent],
                    ['Background', brandBg, setBrandBg],
                    ['Text', brandText, setBrandText],
                  ].map(([label, value, setter]) => (
                    <label key={label as string}>
                      <span>{label as string}</span>
                      <span>
                        <input type="color" value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} />
                        <input className="input" value={value as string} onChange={event => (setter as (value: string) => void)(event.target.value)} />
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="sub" style={{ margin: 0 }}>The palette comes from the theme or the engine. Turn this on to pin exact brand colors.</p>
              )}
            </Field>
          </section>

          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Engine & audio</h2>
                <p>The model that writes the composition, and the sound under it.</p>
              </div>
              {hostMode !== 'hosted' ? (
                <label className="check" style={{ margin: 0 }}>
                  <input type="checkbox" checked={modelPreset === 'custom'} onChange={event => setModelPreset(event.target.checked ? 'custom' : 'auto')} />
                  <span>Custom gateway / BYOK</span>
                </label>
              ) : null}
            </div>

            {effectivePreset === 'custom' ? (
              <div className="create-custom">
                <div className="create-custom-quick">
                  {[
                    { label: 'LiteLLM', url: 'http://localhost:4000/v1', model: 'claude-3-7-sonnet' },
                    { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.7-sonnet' },
                    { label: 'Ollama', url: 'http://localhost:11434/v1', model: 'llama3.3' },
                    { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
                  ].map(gateway => (
                    <button key={gateway.label} type="button" className={customBaseUrl === gateway.url ? 'on' : ''} onClick={() => { setCustomBaseUrl(gateway.url); if (!customModel) setCustomModel(gateway.model); }}>
                      {gateway.label}
                    </button>
                  ))}
                </div>
                <div className="create-grid create-grid-three">
                  <Field label="Gateway base URL"><input className="input" placeholder="https://openrouter.ai/api/v1" value={customBaseUrl} onChange={event => setCustomBaseUrl(event.target.value)} /></Field>
                  <Field label="Model ID"><input className="input" placeholder="anthropic/claude-3.7-sonnet" value={customModel} onChange={event => setCustomModel(event.target.value)} /></Field>
                  <Field label="API key" hint="Stored in this browser only"><input className="input" type="password" placeholder="sk-…" value={customApiKey} onChange={event => setCustomApiKey(event.target.value)} /></Field>
                </div>
              </div>
            ) : (
              <div className="create-models">
                {[
                  { id: 'auto', name: 'Auto router', desc: 'Task-aware routing', badge: 'Default' },
                  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', desc: 'Anthropic', badge: 'Quality' },
                  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Google', badge: 'Fast' },
                  { id: 'deepseek-r1', name: 'DeepSeek R1', desc: 'Reasoning', badge: 'Reasoning' },
                  { id: 'qwen3.8-27b', name: 'Qwen 3.8 27B', desc: 'Gateway favourite', badge: 'Stable' },
                  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI', badge: 'Multimodal' },
                ].map(model => (
                  <button key={model.id} type="button" className={`create-model ${effectivePreset === model.id ? 'on' : ''}`} onClick={() => setModelPreset(model.id)}>
                    <span><b>{model.name}</b><small>{model.desc}</small></span>
                    <em>{model.badge}</em>
                  </button>
                ))}
              </div>
            )}

            <div className="create-grid">
              <Field label="Audio mood">
                <select className="input" value={audioMood} onChange={event => setAudioMood(event.target.value)}>
                  <option value="cyber">Kinetic synth & cyber beats</option>
                  <option value="lofi">Ambient lo-fi & chill</option>
                  <option value="upbeat">Energetic funk & pop</option>
                  <option value="cinematic">Cinematic orchestral</option>
                  <option value="corporate">Clean acoustic</option>
                  <option value="none">No music</option>
                </select>
              </Field>
              <Field label="Sound effects">
                <label className="check">
                  <input type="checkbox" checked={sfx} onChange={event => setSfx(event.target.checked)} />
                  <span>Layer whooshes, impacts, pops and shimmers</span>
                </label>
              </Field>
            </div>

            <details>
              <summary><SlidersIcon size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />Timeline & quality overrides</summary>
              <div className="create-grid" style={{ marginTop: 10 }}>
                <Field label="Project title"><input className="input" placeholder="Auto-named from the brief" value={name} onChange={event => setName(event.target.value)} /></Field>
                <Field label="Exact duration (seconds)"><input className="input" type="number" min={3} placeholder="Auto" value={duration} onChange={event => setDuration(event.target.value)} /></Field>
                <Field label="Scenes">
                  <select className="input" value={sceneCount} onChange={event => setSceneCount(event.target.value)}>
                    <option value="">Auto</option>
                    <option value="3">3 scenes (hook, feature, CTA)</option>
                    <option value="4">4 scenes</option>
                    <option value="5">5 scenes</option>
                    <option value="6">6 scenes (narrative arc)</option>
                  </select>
                </Field>
                <Field label="Aspect override">
                  <select className="input" value={aspect} onChange={event => setAspect(event.target.value)}>
                    <option value="">Format default</option>
                    <option value="9:16">Vertical 9:16</option>
                    <option value="1:1">Square 1:1</option>
                    <option value="16:9">Widescreen 16:9</option>
                    <option value="4:5">Portrait 4:5</option>
                  </select>
                </Field>
              </div>
              <label className="check" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={full} onChange={event => setFull(event.target.checked)} />
                <span>Build every layer from scratch instead of starting from a template</span>
              </label>
            </details>
          </section>
        </>
      ) : null}
    </Page>
  );
}


/* ==================== Making Screen ==================== */
const STAGE_SENTENCES: Record<number, string[]> = {
  1: [
    'Analyzing your creative brief and key message points…',
    'Selecting typography hierarchy and color contrast rules…',
    'Configuring responsive canvas specifications…',
    'Calibrating visual style and branding mood…',
  ],
  2: [
    'Structuring scene hooks and narrative progression…',
    'Choreographing entrance timing for key features…',
    'Calibrating scene durations for optimal retention…',
    'Drafting high-impact on-screen copy and headlines…',
  ],
  3: [
    'Composing kinetic typography with fluid entrance curves…',
    'Choreographing dynamic 3D camera sweeps and drifts…',
    'Positioning visual badges, highlights and layouts…',
    'Balancing layer depth and motion responsiveness…',
  ],
  4: [
    'Fine-tuning frame durations and transition cuts…',
    'Synchronizing audio accents and visual dynamics…',
    'Verifying visual contrast and readability across frames…',
    'Finalizing broadcast-grade motion graphics for preview…',
  ],
};

const CREATIVE_TIPS = [
  '✨ 60fps kinetic motion graphics calibrated for high viewer engagement',
  '🎨 Color harmony automatically adapts to your chosen brand palette',
  '📐 Camera motion and transitions are timed to natural eye movement',
  '🎵 Audio layers and sound effects automatically sync with visual reveals',
];

const Bulleted = ({ items }: { items: string[] }) => (
  <>
    {items.map((message, index) => (
      <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span aria-hidden>•</span>
        <span>{message}</span>
      </div>
    ))}
  </>
);

/** Repairs alone do not stop the flow: the editor shows them once as a dismissible banner. */
function stashComposeNotes(id: string, notes: string[]) {
  try { sessionStorage.setItem(composeNotesKey(id), JSON.stringify(notes)); } catch {}
}

export function Making({ id, job }: { id: string; job: string }) {
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [report, setReport] = useState<{ notes: string[]; errors: string[] } | undefined>();
  const [sentenceIndex, setSentenceIndex] = useState(0);

  useEffect(() => {
    // The page stays mounted when the route moves to another job, so what the last one reported must not describe this one.
    setMessages([]); setError(''); setReport(undefined);
    let live = true;
    waitJob(job, j => {
      if (live) setMessages(j.messages);
    }).then(
      j => {
        if (!live) return;
        // Unresolved review faults stop here and say what is wrong. Repairs alone open the editor, where the
        // notes arrive as a dismissible banner instead of an extra click.
        const outcome = composeOutcome(j.result);
        if (outcome.stop) { setReport(outcome.report); return; }
        if (outcome.notes.length) stashComposeNotes(id, outcome.notes);
        go(`#/p/${encodeURIComponent(id)}`);
      },
      e => {
        if (live) {
          const msg = (e as Error).message || '';
          setError(limitMessage(msg) ?? 'Video creation was interrupted. Please review your brief and try again.');
        }
      }
    );
    return () => { live = false; };
  }, [id, job]);

  // Rotate informative status sentences every 2.8s
  useEffect(() => {
    const timer = setInterval(() => {
      setSentenceIndex(prev => prev + 1);
    }, 2800);
    return () => clearInterval(timer);
  }, []);

  // Determine stage based on messages count & content
  const stage = messages.some(m => /retim|review|audio|render|finish/i.test(m))
    ? 4
    : messages.some(m => /template|compose|layer|scene|kinetic/i.test(m))
      ? 3
      : messages.some(m => /plan|beat|story|narrat/i.test(m))
        ? 2
        : 1;

  const currentStatusText = messages.length
    ? cleanUserStatus(messages[messages.length - 1]!)
    : (STAGE_SENTENCES[stage] || STAGE_SENTENCES[1])[sentenceIndex % (STAGE_SENTENCES[stage] || STAGE_SENTENCES[1]).length];

  const currentTip = CREATIVE_TIPS[sentenceIndex % CREATIVE_TIPS.length];

  return (
    <div className="center" style={{ maxWidth: 540, margin: '40px auto', padding: '0 20px' }}>
      {report ? (
        <>
          <div style={{ margin: '0 auto 20px', width: 56, height: 56, borderRadius: '50%', background: `color-mix(in srgb, var(--${report.errors.length ? 'red' : 'amber'}) 15%, transparent)`, color: `var(--${report.errors.length ? 'red' : 'amber'})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {report.errors.length ? <AlertCircleIcon size={28} /> : <SparklesIcon size={28} />}
          </div>
          <h2>{report.errors.length ? 'Made, but the review still faults it' : 'Made, with notes'}</h2>
          {report.errors.length ? <Notice tone="error" title="Unresolved review faults"><Bulleted items={report.errors} /></Notice> : null}
          {report.notes.length ? <Notice tone={report.errors.length ? 'neutral' : 'warn'} title="What the engine had to change"><Bulleted items={report.notes} /></Notice> : null}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <Button variant="primary" onClick={() => go(`#/p/${encodeURIComponent(id)}`)}>Open the video</Button>
            <Button onClick={() => go('#/projects')}>Back to Projects</Button>
          </div>
        </>
      ) : error ? (
        <>
          <div style={{ margin: '0 auto 20px', width: 56, height: 56, borderRadius: '50%', background: 'color-mix(in srgb, var(--red) 15%, transparent)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircleIcon size={28} />
          </div>
          <h2>Creation Paused</h2>
          <Notice tone="error" title="Notice">{error}</Notice>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24 }}>
            <Button variant="primary" onClick={() => {
              let saved = '';
              try { saved = sessionStorage.getItem(`ove-brief-${id}`) ?? ''; } catch {}
              go(saved ? `#/new?prompt=${encodeURIComponent(saved)}` : '#/new');
            }}>Try again with the same brief</Button>
            <Button onClick={() => api('/api/project/delete', { id }).then(() => go('#/projects'))}>Back to Projects</Button>
          </div>
        </>
      ) : (
        <>
          {/* Animated Product Loader */}
          <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid color-mix(in srgb, var(--indigo) 20%, transparent)',
                borderTopColor: 'var(--indigo)',
                animation: 'spin 1.2s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite',
              }}
            />
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'var(--brand-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 24px var(--brand-glow)',
                color: '#fff',
              }}
            >
              <SparklesIcon size={22} />
            </div>
          </div>

          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 8px' }}>
            Creating Your Video
          </h2>

          {/* Dynamic rotating status sentence */}
          <div
            key={currentStatusText}
            style={{
              minHeight: 28,
              fontSize: 14.5,
              fontWeight: 500,
              color: 'var(--text)',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'opacity 0.25s ease',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--indigo)', animation: 'pulse 1.5s infinite' }} />
            <span>{currentStatusText}</span>
          </div>

          {/* Visual Production Pipeline */}
          <div className="pipeline-card" style={{ textAlign: 'left', margin: '0 0 20px' }}>
            <div className="pipeline-header">
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Production Pipeline</span>
              <Badge tone="blue" dot>Stage {stage} of 4</Badge>
            </div>

            <div className={`pipeline-step ${stage === 1 ? 'active' : stage > 1 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 1 ? <CheckIcon size={14} /> : '1'}</div>
              <div className="step-content">
                <b>Concept & Creative Direction</b>
                <small>Analyzing creative brief and setting up brand color hierarchy</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 2 ? 'active' : stage > 2 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 2 ? <CheckIcon size={14} /> : '2'}</div>
              <div className="step-content">
                <b>Storyboard & Scene Pacing</b>
                <small>Structuring visual hooks, core message beats, and call-to-actions</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 3 ? 'active' : stage > 3 ? 'done' : ''}`}>
              <div className="step-circle">{stage > 3 ? <CheckIcon size={14} /> : '3'}</div>
              <div className="step-content">
                <b>Kinetic Motion & Layout</b>
                <small>Choreographing camera transitions, typography reveals, and motion layers</small>
              </div>
            </div>

            <div className={`pipeline-step ${stage === 4 ? 'active' : ''}`}>
              <div className="step-circle">{stage === 4 ? <SparklesIcon size={12} /> : '4'}</div>
              <div className="step-content">
                <b>Visual Review & Polish</b>
                <small>Fine-tuning frame durations, easings, audio sync, and render quality</small>
              </div>
            </div>
          </div>

          {/* Product feature insight footer */}
          <div
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              fontSize: 12.5,
              color: 'var(--muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{currentTip}</span>
          </div>
        </>
      )}
    </div>
  );
}
