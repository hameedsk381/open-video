import { useEffect, useRef, useState } from 'react';
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
  const [brandPrimary, setBrandPrimary] = useState('#6366f1');
  const [brandAccent, setBrandAccent] = useState('#ec4899');
  const [brandBg, setBrandBg] = useState('#0b0f19');
  const [brandText, setBrandText] = useState('#ffffff');

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

  return (
    <Page
      title="Create New Video"
      subtitle="Craft broadcast-grade motion graphics with customizable typography, pacing, color palette, and audio design."
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
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>Brand colors auto-populated into Custom Brand Palette below</span>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {scrapedBrand.colors?.primary ? (
                <span title={`Primary: ${scrapedBrand.colors.primary}`} style={{ width: 20, height: 20, borderRadius: '50%', background: scrapedBrand.colors.primary, border: '2px solid var(--border)' }} />
              ) : null}
              {scrapedBrand.colors?.accent ? (
                <span title={`Accent: ${scrapedBrand.colors.accent}`} style={{ width: 20, height: 20, borderRadius: '50%', background: scrapedBrand.colors.accent, border: '2px solid var(--border)' }} />
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

      {/* Template & Motion Archetype Picker */}
      <Field
        label={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span><FilmIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Motion Archetype & Template</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className={`btn ghost sm ${templateFilter === 'match' ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px', height: 24, fontWeight: templateFilter === 'match' ? 600 : 400 }}
                onClick={() => setTemplateFilter('match')}
              >
                Matching Format
              </button>
              <button
                type="button"
                className={`btn ghost sm ${templateFilter === 'all' ? 'active' : ''}`}
                style={{ fontSize: 11, padding: '2px 8px', height: 24, fontWeight: templateFilter === 'all' ? 600 : 400 }}
                onClick={() => setTemplateFilter('all')}
              >
                All Archetypes
              </button>
            </div>
          </div>
        }
        hint="Pick a motion style archetype, or leave on Auto for AI generative composition"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {/* Auto Card */}
          <div
            onClick={() => setSelectedTemplate('')}
            style={{
              cursor: 'pointer',
              padding: '12px 14px',
              borderRadius: 'var(--radius)',
              border: selectedTemplate === '' ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: selectedTemplate === '' ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: selectedTemplate === '' ? 'var(--accent)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <SparklesIcon size={13} /> Auto (AI Decides)
              </span>
              <Badge tone="blue">Adaptive</Badge>
            </div>
            <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35 }}>
              Synthesizes optimal scene layouts, camera moves, and kinetic type from your brief.
            </span>
          </div>

          {/* Template Cards */}
          {matchingTemplates.map(t => {
            const active = selectedTemplate === t.id;
            const aspectStr = t.width && t.height ? (t.width > t.height ? '16:9' : t.width < t.height ? '9:16' : '1:1') : '';
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTemplate(t.id)}
                style={{
                  cursor: 'pointer',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius)',
                  border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: active ? 'rgba(99, 102, 241, 0.08)' : 'var(--surface)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <b style={{ fontSize: 13, color: active ? 'var(--accent)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.name}
                  </b>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {aspectStr ? <Badge tone="blue">{aspectStr}</Badge> : null}
                    {t.durationSeconds ? <Badge tone="purple">{Math.round(t.durationSeconds)}s</Badge> : null}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.description}
                </span>
                {t.tags?.length ? (
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    {t.tags.slice(0, 2).map(tag => (
                      <span key={tag} style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface-sunken)', padding: '1px 5px', borderRadius: 3 }}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Field>

      {/* Prompt / Brief */}
      <Field label="Describe your video">
        <textarea
          className="input"
          style={{ minHeight: 110 }}
          placeholder="What is your video about? Mention your product name, core benefit, and audience…"
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

      {/* Key Takeaways & Call to Action */}
      <div className="two" style={{ marginBottom: 20 }}>
        <Field label="Key message beats (optional)" hint="Bullet points to feature across video scenes">
          <input
            className="input"
            placeholder="e.g. 10x faster rendering, zero setup, free tier"
            value={keyPoints}
            onChange={e => setKeyPoints(e.target.value)}
          />
        </Field>
        <Field label="Call-To-Action (CTA)" hint="Headline and link shown in the closing scene">
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              style={{ flex: 1.2 }}
              placeholder="e.g. Get Started Today"
              value={ctaHeadline}
              onChange={e => setCtaHeadline(e.target.value)}
            />
            <input
              className="input"
              style={{ flex: 1 }}
              placeholder="e.g. motionrender.dev"
              value={ctaSubline}
              onChange={e => setCtaSubline(e.target.value)}
            />
          </div>
        </Field>
      </div>

      {/* Visual Styling: Typography, Motion Pacing & Aesthetic */}
      <Field label={<span><TypeIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Typography & Motion Dynamics</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {/* Typography */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Font Pair</span>
            <select className="input" value={typography} onChange={e => setTypography(e.target.value)}>
              <option value="sans">Modern Sans (Inter / Geist) · SaaS & Clean</option>
              <option value="bold">Bold Kinetic (Space Grotesk / Syne) · Impact</option>
              <option value="serif">Editorial Serif (Playfair / Instrument) · Luxury</option>
              <option value="mono">Terminal Monospace (JetBrains Mono) · Dev</option>
            </select>
          </div>

          {/* Motion Pacing */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Motion Pacing</span>
            <select className="input" value={motionPacing} onChange={e => setMotionPacing(e.target.value)}>
              <option value="dynamic">Balanced Dynamic (3–4s scenes, smooth curves)</option>
              <option value="snappy">Snappy & Fast (1.5–2.5s cuts, punchy springs)</option>
              <option value="cinematic">Cinematic Flow (4.5s+ slow zooms, spatial moves)</option>
            </select>
          </div>

          {/* Visual Treatment */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Visual Treatment</span>
            <select className="input" value={visualTreatment} onChange={e => setVisualTreatment(e.target.value)}>
              <option value="clean">Modern Vector & Crisp Contrast</option>
              <option value="glass">Glassmorphic Glow & Blur Accents</option>
              <option value="paper">Editorial Halftone & Paper Cutout</option>
              <option value="cyber">Cyber Neon & Gridlines</option>
            </select>
          </div>
        </div>
      </Field>

      {/* Visual Theme & Mood Palette */}
      <Field
        label={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span><PaletteIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Color System & Theme</span>
            <label className="check" style={{ margin: 0, fontSize: 12 }}>
              <input type="checkbox" checked={customColorsEnabled} onChange={e => setCustomColorsEnabled(e.target.checked)} />
              <span>Use Custom Brand Palette</span>
            </label>
          </div>
        }
        hint={customColorsEnabled ? 'Fine-tune your brand colors directly' : 'Select a designer color palette or toggle custom brand colors'}
      >
        {customColorsEnabled ? (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Primary Brand</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={brandPrimary} onChange={e => setBrandPrimary(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                <input className="input" style={{ fontSize: 12, padding: '4px 8px', height: 32 }} value={brandPrimary} onChange={e => setBrandPrimary(e.target.value)} />
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Accent / Pop</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={brandAccent} onChange={e => setBrandAccent(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                <input className="input" style={{ fontSize: 12, padding: '4px 8px', height: 32 }} value={brandAccent} onChange={e => setBrandAccent(e.target.value)} />
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Background</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={brandBg} onChange={e => setBrandBg(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                <input className="input" style={{ fontSize: 12, padding: '4px 8px', height: 32 }} value={brandBg} onChange={e => setBrandBg(e.target.value)} />
              </div>
            </div>

            <div>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Text Contrast</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="color" value={brandText} onChange={e => setBrandText(e.target.value)} style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                <input className="input" style={{ fontSize: 12, padding: '4px 8px', height: 32 }} value={brandText} onChange={e => setBrandText(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'inherit' }}>{t.name}</span>
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
        )}
      </Field>

      {/* Creative Engine & AI Model (BYOK & Model Picker) */}
      <Field
        label={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span><SparklesIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Creative Engine & AI Model</span>
            {hostMode !== 'hosted' ? (
              <label className="check" style={{ margin: 0, textTransform: 'none', letterSpacing: 'normal' }}>
                <input
                  type="checkbox"
                  checked={modelPreset === 'custom'}
                  onChange={e => setModelPreset(e.target.checked ? 'custom' : 'auto')}
                />
                <span style={{ fontSize: 12 }}>Custom Gateway / BYOK</span>
              </label>
            ) : null}
          </div>
        }
        hint={effectivePreset === 'custom'
          ? 'Connect any custom OpenAI-compatible API gateway (OpenRouter, LiteLLM, Ollama, etc.)'
          : hostMode === 'hosted'
            ? "AI runs on the service's managed gateway — pick a model or leave it on Auto Router"
            : 'Choose a specialized model or connect your own API gateway'}
      >
        {effectivePreset === 'custom' ? (
          <div style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginRight: 4 }}>Quick Gateway:</span>
              {[
                { label: 'LiteLLM Proxy', url: 'http://localhost:4000/v1', model: 'claude-3-7-sonnet' },
                { label: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-3.7-sonnet' },
                { label: 'Ollama (Local)', url: 'http://localhost:11434/v1', model: 'llama3.3' },
                { label: 'OpenAI Direct', url: 'https://api.openai.com/v1', model: 'gpt-4o' },
              ].map(gw => (
                <button
                  key={gw.label}
                  type="button"
                  onClick={() => {
                    setCustomBaseUrl(gw.url);
                    if (!customModel) setCustomModel(gw.model);
                  }}
                  style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: customBaseUrl === gw.url ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-2)',
                    color: customBaseUrl === gw.url ? 'var(--accent)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  {gw.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Gateway Base URL</span>
                <input
                  className="input"
                  placeholder="https://openrouter.ai/api/v1 (or LiteLLM :4000)"
                  value={customBaseUrl}
                  onChange={e => setCustomBaseUrl(e.target.value)}
                />
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Model Name / ID</span>
                <input
                  className="input"
                  placeholder="anthropic/claude-3.7-sonnet (or any 400+ model)"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                />
              </div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>API Key (stored securely in browser)</span>
                <input
                  className="input"
                  type="password"
                  placeholder="sk-..."
                  value={customApiKey}
                  onChange={e => setCustomApiKey(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 }}>
            {[
              { id: 'auto', name: 'Auto Router', desc: 'Task-aware gateway routing', badge: 'Default' },
              { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', desc: 'Anthropic', badge: 'Best Quality' },
              { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Google — Fast Multimodal', badge: 'Google' },
              { id: 'deepseek-r1', name: 'DeepSeek-R1', desc: 'DeepSeek — Deep Reasoning', badge: 'Reasoning' },
              { id: 'qwen3.8-27b', name: 'Qwen 3.8 27B', desc: 'Gateway favourite — fast & stable', badge: 'Fast' },
              { id: 'gpt-4o', name: 'OpenAI GPT-4o', desc: 'OpenAI — Multimodal', badge: 'OpenAI' },
            ].map(m => {
              const active = effectivePreset === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setModelPreset(m.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    border: active ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'rgba(59, 130, 246, 0.08)' : 'var(--surface)',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: active ? 'var(--accent)' : 'inherit' }}>{m.name}</span>
                    <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: active ? 'var(--accent)' : 'var(--surface-2)', color: active ? '#fff' : 'var(--muted)' }}>{m.badge}</span>
                  </div>
                  <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.desc}</span>
                </div>
              );
            })}
          </div>
        )}
      </Field>

      {/* Audio & Sound Design Suite */}
      <Field label={<span><MusicIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Sound Design & Audio Track</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Audio Track / Mood</span>
            <select className="input" value={audioMood} onChange={e => setAudioMood(e.target.value)}>
              <option value="cyber">Kinetic Synth & Cyber Beats (Modern Tech)</option>
              <option value="lofi">Ambient Lo-Fi & Chill (Product & Explainer)</option>
              <option value="upbeat">Energetic Funk & Pop (Viral & Social)</option>
              <option value="cinematic">Cinematic Orchestral (Dramatic & Pitch)</option>
              <option value="corporate">Clean Acoustic (Professional & B2B)</option>
              <option value="none">None / Muted (Visual Graphics Only)</option>
            </select>
          </div>

          <div>
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', display: 'block', marginBottom: 4 }}>Procedural SFX</span>
            <label className="check" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={sfx} onChange={e => setSfx(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Layer whooshes, impacts, pops & shimmers</span>
            </label>
          </div>
        </div>

        {/* Voiceover Accordion */}
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <label className="check" style={{ margin: 0 }}>
            <input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} />
            <span style={{ fontWeight: 600, fontSize: 13 }}>Generate AI Voiceover & Synchronized Kinetic Captions</span>
          </label>

          {voice ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Voice Tone</span>
                <select className="input" value={voiceTone} onChange={e => setVoiceTone(e.target.value)}>
                  <option value="confident">Confident & Authoritative (B2B & Pitch)</option>
                  <option value="warm">Warm & Conversational (Creator & Friendly)</option>
                  <option value="hype">High-Energy Hype (Viral & Promo)</option>
                  <option value="calm">Calm & Thoughtful (Explainer & Story)</option>
                </select>
              </div>

              <div>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Captions Style</span>
                <select className="input" value={captionsStyle} onChange={e => setCaptionsStyle(e.target.value)}>
                  <option value="kinetic">Dynamic Pop (Word-by-word active highlight)</option>
                  <option value="pill">Clean Reading Pill (Centered sentence banner)</option>
                  <option value="lower-third">Subtle Lower-Third (Non-intrusive)</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </Field>

      {/* Media Assets Dropper */}
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

      {/* Advanced Settings Accordion */}
      <details>
        <summary><SlidersIcon size={13} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 6 }} />Advanced Timeline & Quality Settings</summary>
        <div style={{ marginTop: 12 }}>
          <Field label="Project title">
            <input
              className="input"
              placeholder="Auto-generated from your brief if left blank"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </Field>

          <div className="three" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Field label="Duration (seconds)">
              <input
                className="input"
                type="number"
                min={3}
                placeholder="Auto (Recommended)"
                value={duration}
                onChange={e => setDuration(e.target.value)}
              />
            </Field>

            <Field label="Target Scenes">
              <select className="input" value={sceneCount} onChange={e => setSceneCount(e.target.value)}>
                <option value="">Auto (AI Decides)</option>
                <option value="3">3 Scenes (Hook, Feature, CTA)</option>
                <option value="4">4 Scenes (Hook, 2 Features, CTA)</option>
                <option value="5">5 Scenes (Hook, 3 Features, CTA)</option>
                <option value="6">6 Scenes (Narrative Arc)</option>
              </select>
            </Field>

            <Field label="Custom Aspect">
              <select className="input" value={aspect} onChange={e => setAspect(e.target.value)}>
                <option value="">Format Default</option>
                <option value="9:16">Vertical 9:16</option>
                <option value="1:1">Square 1:1</option>
                <option value="16:9">Widescreen 16:9</option>
                <option value="4:5">Portrait 4:5</option>
              </select>
            </Field>
          </div>

          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} />
            <span>Autonomous visual design quality check (verifies readability & safe-zones)</span>
          </label>

          <label className="check" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} />
            <span>Bespoke generative synthesis (build every layer from scratch rather than templates)</span>
          </label>
        </div>
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
          setError(
            msg.includes('rate') || msg.includes('429')
              ? 'Our video generation engine is experiencing high demand. Please try again in a few moments.'
              : 'Video creation was interrupted. Please review your brief and try again.'
          );
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
            <Button onClick={() => go('#/')}>Back to Projects</Button>
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
            <Button variant="primary" onClick={() => go('#/new')}>Start New Video</Button>
            <Button onClick={() => api('/api/project/delete', { id }).then(() => go('#/'))}>Back to Projects</Button>
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
