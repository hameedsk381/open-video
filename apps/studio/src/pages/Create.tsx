import { useEffect, useRef, useState } from 'react';
import { useAiConnection } from './AiConnection';
import { api, upload, useHostMode, type Job, type Library, type Revision, type TemplateSummary } from '../api';
import { BRAND_KIT_EVENT, brandForCompose, kitIsSet, loadBrandKit, logoFile, type BrandKit } from '../brandKit';
import { designBrief, designById, designForTemplate, designName, designs, missingFields } from '../designs';
import { go } from '../router';
import { ArrowLeftIcon, Badge, Button, Field, FilmIcon, GlobeIcon, Notice, Page, PaletteIcon, SparklesIcon, VolumeIcon, WandIcon } from '../ui';

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

export function Create({ initialTemplate, initialKind, initialPrompt, initialFrom }: { initialTemplate?: string; initialKind?: string; initialPrompt?: string; initialFrom?: string } = {}) {
  const hostMode = useHostMode();
  // On the hosted service the AI is the person's own: with none connected, sending a brief would only fail later.
  const connection = useAiConnection(hostMode === 'hosted');
  const needsConnection = hostMode === 'hosted' && connection.state !== null && connection.state.settings === null;
  // Autopilot hides everything; Guided exposes the choices that matter; Pro is the full engine.
  const [mode, setMode] = useState<'autopilot' | 'guided' | 'pro'>(() => {
    try { const saved = localStorage.getItem('ove-create-mode'); return saved === 'guided' || saved === 'pro' ? saved : 'autopilot'; } catch { return 'autopilot'; }
  });
  const [templateOpen, setTemplateOpen] = useState(Boolean(initialTemplate));
  useEffect(() => { try { localStorage.setItem('ove-create-mode', mode); } catch {} }, [mode]);

  // Progressive 2-Step Creation Stepper (Step 1: Brief & Canvas, Step 2: Style, Voice & Brand)
  const [step, setStep] = useState<1 | 2>(1);

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

  // Designs: the gallery of outcomes. Choosing one fills its template and asks only for the details only the customer knows.
  const [designId, setDesignId] = useState<string>(() => designForTemplate(initialTemplate)?.id || '');
  const [designValues, setDesignValues] = useState<Record<string, string>>({});
  const [designExtra, setDesignExtra] = useState('');
  const [designError, setDesignError] = useState('');
  const [showComposer, setShowComposer] = useState(() => Boolean(initialPrompt) || (Boolean(initialTemplate) && !designForTemplate(initialTemplate)));

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
  const [customModel] = useState<string>(() => {
    try { return localStorage.getItem('ove-custom-model') || ''; } catch { return ''; }
  });
  const [customBaseUrl] = useState<string>(() => {
    try { return localStorage.getItem('ove-custom-base-url') || ''; } catch { return ''; }
  });
  const [customApiKey] = useState<string>(() => {
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

  // The saved brand kit, applied to every video unless switched off for this one.
  const [kit, setKit] = useState<BrandKit | null>(() => loadBrandKit());
  const [useKit, setUseKit] = useState(() => loadBrandKit()?.enabled !== false);
  const activeKit = useKit && kitIsSet(kit) ? kit : null;
  // "Make another like this" arrives with a project id; its name says what the composer is carrying.
  const [fromName, setFromName] = useState('');

  useEffect(() => {
    const refresh = () => {
      const saved = loadBrandKit();
      setKit(saved);
      setUseKit(saved?.enabled !== false);
    };
    window.addEventListener(BRAND_KIT_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(BRAND_KIT_EVENT, refresh); window.removeEventListener('storage', refresh); };
  }, []);

  // The page stays mounted while the hash changes. A link into Create (a prompt, a template from Discover) must reset
  // what is on screen, and a plain "#/new" must open the gallery again.
  useEffect(() => {
    const linked = designForTemplate(initialTemplate);
    setDesignId(linked?.id || '');
    setDesignValues({});
    setDesignExtra('');
    setDesignError('');
    setShowComposer(Boolean(initialPrompt) || Boolean(initialFrom) || (Boolean(initialTemplate) && !linked));
    setStep(1);
    if (initialPrompt) setBrief(initialPrompt);
    if (linked) {
      setKind(linked.kind);
      setAspect(linked.aspect);
      setSelectedTemplate(linked.template);
      setFull(false);
    } else if (initialTemplate) {
      setSelectedTemplate(initialTemplate);
      setFull(false);
    }
  }, [initialTemplate, initialPrompt, initialFrom]);

  // A finished project can be asked for "another like this": the brief and template that made it open in the composer,
  // ready to change before making a new one. A project without a composed revision opens the gallery instead.
  useEffect(() => {
    if (!initialFrom) { setFromName(''); return; }
    let live = true;
    setDesignId('');
    setDesignValues({});
    setDesignError('');
    setShowComposer(true);
    setStep(1);
    Promise.all([
      api<{ revisions: Revision[] }>(`/api/history?file=${encodeURIComponent(initialFrom)}/composition.json`).catch(() => ({ revisions: [] as Revision[] })),
      api<{ name: string; width: number; height: number; durationFrames: number; fps: number }>(`/api/project?id=${encodeURIComponent(initialFrom)}`),
    ]).then(([history, project]) => {
      if (!live) return;
      setFromName(project.name);
      setKind(project.width > project.height ? 'promo' : project.width === project.height ? 'product' : 'reel');
      const made = [...history.revisions].reverse().find(revision => revision.kind === 'compose');
      if (made) {
        setBrief(made.brief || made.label);
        setSelectedTemplate(made.template ?? '');
      }
      setTemplateOpen(false);
      setFull(false);
    }, () => { if (live) setFromName(''); });
    return () => { live = false; };
  }, [initialFrom]);

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

  // A design fills in what the composer would have been typed: its brief, template, format and a name from its details.
  const submit = async (starter?: { brief: string; kind: string; template?: string; aspect?: string; name?: string; duration?: string }) => {
    setError('');
    if (needsConnection) {
      setError('Connect your AI model in Settings first.');
      return;
    }
    const text = (starter?.brief ?? brief).trim();
    if (!text) {
      setError('Please provide a brief description of what you want to create.');
      return;
    }
    const chosenKind = starter?.kind ?? kind;
    const chosenTemplate = starter?.template ?? selectedTemplate;
    const chosenAspect = starter?.aspect ?? aspect;
    const chosenDuration = starter?.duration ?? duration;
    setBusy(true);
    try {
      const made = await api<{ id: string }>('/api/project/new', {
        name: (starter?.name ?? name).trim() || text.split(/\s+/).slice(0, 6).join(' '),
        kind: chosenKind,
      });
      for (const file of files) await upload(made.id, file);
      // The logo travels as the project's own asset, never as a path: the compose job resolves it by id.
      const logo = activeKit?.logo && activeKit.logoOnEndCard ? logoFile(activeKit) : null;
      if (logo) await upload(made.id, logo);

      // Build composite brief with key points and visual directions
      let compositeBrief = text;
      if (keyPoints.trim()) {
        compositeBrief += `\n\nKey Message Points:\n${keyPoints.trim()}`;
      }

      const body: Record<string, unknown> = {
        brief: compositeBrief,
        kind: chosenKind,
        folder: made.id,
        narration: voice,
        review,
        full,
        // A design keeps its own art direction; these overrides belong to someone who opened Guided or Pro.
        ...(starter && mode === 'autopilot' ? {} : { typography, motionPacing, audioMood, sfx, voiceTone, captionsStyle }),
      };

      if (chosenTemplate) body.template = chosenTemplate;
      if (activeKit) {
        body.brand = brandForCompose(activeKit);
        if (logo) body.brandLogo = 'brand-logo';
      }
      if (ctaHeadline.trim()) body.ctaHeadline = ctaHeadline.trim();
      if (ctaSubline.trim()) body.ctaSubline = ctaSubline.trim();
      if (chosenDuration) body.duration = chosenDuration;
      if (chosenAspect) body.aspect = chosenAspect;

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
      try { sessionStorage.setItem(`ove-brief-${made.id}`, text); } catch {}
      go(`#/making/${encodeURIComponent(made.id)}/${job.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const chooseDesign = (id: string) => {
    const chosen = designById(id);
    if (!chosen) return;
    setDesignId(chosen.id);
    setDesignValues({});
    setDesignExtra('');
    setDesignError('');
    setError('');
    setKind(chosen.kind);
    setAspect(chosen.aspect);
    setSelectedTemplate(chosen.template);
    setFull(false);
    setBrief('');
    setShowComposer(false);
    setStep(1);
  };

  const startFromScratch = () => {
    setDesignId('');
    setDesignError('');
    setSelectedTemplate('');
    setTemplateOpen(false);
    setShowComposer(true);
    setStep(1);
  };

  const submitDesign = async () => {
    const chosen = designId ? designById(designId) : undefined;
    if (!chosen) return;
    const missing = missingFields(chosen, designValues);
    if (missing.length) {
      setDesignError(`Add ${missing.map(label => label.toLowerCase()).join(', ')} to continue.`);
      return;
    }
    setDesignError('');
    // The design's own length, not the format's default: without this the template would be stretched to the kind's length.
    const native = templates.find(template => template.id === chosen.template)?.durationSeconds;
    const duration = native ? String(Math.round(native * 10) / 10) : chosen.length.replace(/[^\d.]/g, '');
    await submit({ brief: designBrief(chosen, designValues, designExtra), kind: chosen.kind, template: chosen.template, aspect: chosen.aspect, name: designName(chosen, designValues), duration });
  };

  // Filter templates matching current format
  const matchingTemplates = templates.filter(t => {
    if (templateFilter === 'all') return true;
    if (!t.width || !t.height) return true;
    if (kind === 'reel') return t.height > t.width;
    if (kind === 'product') return t.height === t.width;
    return t.width > t.height;
  });

  const design = designId ? designById(designId) : undefined;
  const templateName = templates.find(template => template.id === selectedTemplate)?.name;
  const ratio = aspect || (kind === 'product' ? '1:1' : kind === 'reel' ? '9:16' : '16:9');
  const length = design ? design.length : duration ? `${duration}s` : 'Auto length';

  const currentBriefText = design ? designBrief(design, designValues, designExtra) : brief;

  const handleNextToStep2 = () => {
    if (design) {
      const missing = missingFields(design, designValues);
      if (missing.length) {
        setDesignError(`Add ${missing.map(label => label.toLowerCase()).join(', ')} to continue.`);
        return;
      }
      setDesignError('');
    } else {
      if (!brief.trim()) {
        setError('Please describe your video in the brief before moving to Step 2.');
        return;
      }
      setError('');
    }
    setStep(2);
  };

  return (
    <Page
      title={design ? design.title : 'What are we making?'}
      subtitle={design
        ? 'Fill in a few details. The studio writes the script, fills the design and opens an editable timeline.'
        : showComposer
          ? 'Describe it once. The studio writes the script, designs the look and opens an editable timeline.'
          : 'Pick what you are making, or describe it yourself. The studio writes the script, designs the look and opens an editable timeline.'}
      actions={
        <div className="segmented create-modes" aria-label="How much control to show">
          {([['autopilot', 'Autopilot'], ['guided', 'Guided'], ['pro', 'Pro']] as const).map(([id, label]) => (
            <button key={id} className={mode === id ? 'on' : ''} onClick={() => setMode(id)} title={id === 'autopilot' ? 'The studio decides everything' : id === 'guided' ? 'Set format, length, theme and voice' : 'Every creative and advanced control'}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      {/* 2-Step Creation Progressive Stepper */}
      {(design || showComposer) ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '6px 0 20px' }}>
          <button
            type="button"
            className={`btn sm ${step === 1 ? 'primary' : 'secondary'}`}
            onClick={() => setStep(1)}
            style={{ borderRadius: 20, padding: '5px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: step === 1 ? '#fff' : 'var(--muted)', color: step === 1 ? 'var(--accent)' : 'var(--surface)', display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
              1
            </span>
            <span>1. Brief & Canvas</span>
          </button>
          <span style={{ width: 32, height: 2, background: step === 2 ? 'var(--accent)' : 'var(--border)' }} />
          <button
            type="button"
            className={`btn sm ${step === 2 ? 'primary' : 'secondary'}`}
            onClick={handleNextToStep2}
            style={{ borderRadius: 20, padding: '5px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 18, height: 18, borderRadius: '50%', background: step === 2 ? '#fff' : 'var(--muted)', color: step === 2 ? 'var(--accent)' : 'var(--surface)', display: 'inline-grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>
              2
            </span>
            <span>2. Style, Voice & Brand</span>
          </button>
        </div>
      ) : null}

      {needsConnection ? (
        <Notice tone="warn" title="Connect your AI model first">
          The studio has no AI of its own. <a href="#/settings">Add your provider, model and API key in Settings</a>, then come back to make your video.
        </Notice>
      ) : null}
      {error ? <Notice tone="error" title="Could not create video">{error}</Notice> : null}

      {/* Brand Kit Card */}
      {kit || (!design && !showComposer) ? (
        <div className={`create-brandkit ${activeKit ? '' : 'create-brandkit-off'}`}>
          <span className="create-brandkit-mark">
            {kit?.logo ? <img src={kit.logo} alt="" /> : <PaletteIcon size={16} />}
          </span>
          {kit ? (
            <>
              <span className="create-brandkit-copy">
                <b>{kit.name || 'Your brand'}</b>
                <small>{activeKit ? 'Your logo, colours, fonts and contact line go into this video.' : 'Switched off for this video. Your saved brand is untouched.'}</small>
              </span>
              <span className="create-brandkit-swatches">
                {[kit.colors.background, kit.colors.primary, kit.colors.secondary, kit.colors.accent, kit.colors.text].filter(Boolean).map(color => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
              <label className="check">
                <input type="checkbox" checked={useKit} onChange={event => setUseKit(event.target.checked)} />
                <span>Use my brand</span>
              </label>
              <button type="button" className="create-back" onClick={() => go('#/settings')}>Edit brand</button>
            </>
          ) : (
            <>
              <span className="create-brandkit-copy">
                <b>Make every video yours</b>
                <small>Save your logo, colours, fonts and contact line once, and each new video carries them.</small>
              </span>
              <button type="button" className="create-back" onClick={() => go('#/settings')}>Set up your brand</button>
            </>
          )}
        </div>
      ) : null}

      {/* Design Gallery (Home / Selection view) */}
      {!design && !showComposer ? (
        <section className="create-section create-gallery">
          <div className="create-section-head">
            <div>
              <h2>Start with a design</h2>
              <p>Pick what you are making and fill in the details only you know. The studio decides the type, colour, motion and pacing.</p>
            </div>
            <span className="create-hint">{designs.length} designs</span>
          </div>
          <div className="create-designs">
            {designs.map(item => (
              <button key={item.id} type="button" className="create-design" onClick={() => chooseDesign(item.id)}>
                <span className="create-design-art">
                  <span className="create-design-frame" style={{ aspectRatio: item.aspect.replace(':', ' / '), background: `linear-gradient(145deg, ${item.art[0]}, ${item.art[1]})` }}>
                    <i /><i /><i />
                  </span>
                </span>
                <span className="create-design-info">
                  <b>{item.title}</b>
                  <small>{item.summary}</small>
                  <em>{item.aspect} · {item.length}</em>
                </span>
              </button>
            ))}
            <button type="button" className="create-design create-design-free" onClick={startFromScratch}>
              <span className="create-design-art"><SparklesIcon size={22} /></span>
              <span className="create-design-info">
                <b>Describe it yourself</b>
                <small>Type a brief and the studio decides the layout, type and pacing.</small>
                <em>Any format</em>
              </span>
            </button>
          </div>
        </section>
      ) : null}

      {/* ========================================================================= */}
      {/* STEP 1: Brief, Format, Canvas & Archetype                                  */}
      {/* ========================================================================= */}
      {step === 1 && design ? (
        <section className="create-section create-design-form">
          <button type="button" className="create-back" onClick={() => { setDesignId(''); setDesignError(''); setError(''); }}>
            <ArrowLeftIcon size={14} /> All designs
          </button>
          <div className="create-form-fields">
            {design.fields.map(field => (
              <Field key={field.key} label={field.required ? `${field.label} *` : field.label} hint={field.hint}>
                {field.multiline ? (
                  <textarea
                    className="input create-area"
                    rows={3}
                    placeholder={field.placeholder}
                    value={designValues[field.key] ?? ''}
                    onChange={event => setDesignValues(values => ({ ...values, [field.key]: event.target.value }))}
                  />
                ) : (
                  <input
                    className="input"
                    placeholder={field.placeholder}
                    value={designValues[field.key] ?? ''}
                    onChange={event => setDesignValues(values => ({ ...values, [field.key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
          <Field label="Anything else? (optional)" hint="Extra details or wording the studio should work in.">
            <textarea className="input create-area" rows={2} placeholder="Anything that does not fit above." value={designExtra} onChange={event => setDesignExtra(event.target.value)} />
          </Field>
          {designError ? <Notice tone="error" title="A few details are missing">{designError}</Notice> : null}
          <div className="create-form-foot">
            <span className="create-hint">{ratio} · {length} · {voice ? 'voiceover on' : 'no voiceover'}{activeKit ? ` · brand ${activeKit.name || 'applied'}` : ''}</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Button variant="secondary" size="md" onClick={() => void submitDesign()} loading={busy} title="Create directly with smart defaults">
                Make it now
              </Button>
              <Button variant="primary" size="lg" icon={<SparklesIcon size={14} />} onClick={handleNextToStep2}>
                Next: Style & Voice →
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 1 && !design && showComposer ? (
        <>
          <button type="button" className="create-back" onClick={() => setShowComposer(false)}>
            <ArrowLeftIcon size={14} /> All designs
          </button>
          {fromName ? (
            <div className="create-from">
              <SparklesIcon size={14} />
              <span>Starting from <b>{fromName}</b> — the same brief and layout. Change anything before making a new video.</span>
            </div>
          ) : null}

          {/* Step 1 Composer Box */}
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
                    <button key={id} className={kind === id ? 'on' : ''} onClick={() => setKind(id)} title={title}>
                      {title.replace('Social ', '').replace(' Spotlight', '').replace('Narrative ', '')}
                    </button>
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
                {activeKit ? <span>Brand · {activeKit.name || 'your kit'}</span> : null}
                {templateName ? <span>Template · {templateName}</span> : null}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button variant="secondary" size="md" loading={busy} onClick={() => void submit()} title="Compile immediately with default style">
                  Make it now
                </Button>
                <Button variant="primary" size="lg" icon={<SparklesIcon size={14} />} onClick={handleNextToStep2}>
                  Next: Style & Voice →
                </Button>
              </div>
            </div>
          </div>

          {selectedTemplate ? (
            <div className="create-selected">
              <span>Starting from <b>{templateName ?? selectedTemplate}</b></span>
              <button type="button" onClick={() => setSelectedTemplate('')}>Use auto layout</button>
            </div>
          ) : null}

          {/* Collapsible Template Archetype Explorer */}
          <div className="create-row">
            <button type="button" className="create-more" onClick={() => setTemplateOpen(open => !open)}>
              <FilmIcon size={14} /> {templateOpen ? 'Hide templates' : 'Start from a template'}
            </button>
            <span className="create-hint">
              Step 1 sets the narrative & canvas. Step 2 customizes voiceover, brand tokens & music.
            </span>
          </div>

          {templateOpen ? (
            <section className="create-section">
              <div className="create-section-head">
                <div>
                  <h2>Template</h2>
                  <p>Pick a ready-made layout, or leave Auto for a design built around your description.</p>
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
        </>
      ) : null}

      {/* ========================================================================= */}
      {/* STEP 2: Style, Voiceover, Brand Tokens & Sound Design                      */}
      {/* ========================================================================= */}
      {step === 2 ? (
        <div className="create-step-two" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <button type="button" className="create-back" onClick={() => setStep(1)}>
            <ArrowLeftIcon size={14} /> Back to Step 1: Brief & Canvas
          </button>

          {/* Live Concept Summary Banner */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '12px 16px',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 240, flex: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
                Target Concept & Canvas
              </span>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {currentBriefText ? (currentBriefText.length > 90 ? currentBriefText.slice(0, 90) + '…' : currentBriefText) : 'Auto Narrative'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="blue">{ratio} Format</Badge>
              <Badge tone="purple">{length}</Badge>
              {templateName ? <Badge tone="neutral">{templateName}</Badge> : <Badge tone="neutral">Auto Layout</Badge>}
            </div>
          </div>

          {/* Voiceover & Narration Card */}
          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Voiceover & Speech Direction</h2>
                <p>Spoken audio synchronized to scene cuts and kinetic typography captions.</p>
              </div>
              <label className="check" style={{ margin: 0 }}>
                <input type="checkbox" checked={voice} onChange={event => setVoice(event.target.checked)} />
                <span style={{ fontWeight: 600 }}>Enable Voiceover</span>
              </label>
            </div>

            {voice ? (
              <div className="create-grid" style={{ marginTop: 12 }}>
                <Field label="Voice tone">
                  <select className="input" value={voiceTone} onChange={event => setVoiceTone(event.target.value)}>
                    <option value="confident">Confident & authoritative (B2B, SaaS & pitch)</option>
                    <option value="warm">Warm & conversational (creator, friendly & lifestyle)</option>
                    <option value="hype">High-energy hype (viral reels, product drops)</option>
                    <option value="calm">Calm & measured (documentary, explainer)</option>
                  </select>
                </Field>
                <Field label="Kinetic captions style">
                  <select className="input" value={captionsStyle} onChange={event => setCaptionsStyle(event.target.value)}>
                    <option value="kinetic">Dynamic pop (word-by-word highlight on canvas)</option>
                    <option value="pill">Clean reading pill (smooth subtitle banner)</option>
                    <option value="lower-third">Subtle lower-third (broadcast style)</option>
                  </select>
                </Field>
              </div>
            ) : (
              <p className="sub" style={{ margin: '6px 0 0' }}>
                Voiceover is turned off. The video will focus on visual titles, B-roll, and background sound.
              </p>
            )}
          </section>

          {/* Brand Identity & Color Palette */}
          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Brand Identity & Palette</h2>
                <p>Choose an instant art-directed color theme or pin exact brand swatches.</p>
              </div>
            </div>

            <Field label="Art-directed themes">
              <div className="create-themes">
                {[
                  { id: '', name: 'Auto', desc: 'Designed from brief', colors: ['#8b7cff', '#ec4899', '#5cc8d7'] },
                  { id: 'midnight', name: 'Midnight', desc: 'Tech & Modern B2B', colors: ['#0b0f19', '#38bdf8', '#818cf8'] },
                  { id: 'neon', name: 'Neon', desc: 'Social & Viral', colors: ['#0a0710', '#ff3cac', '#c6ff3c'] },
                  { id: 'espresso', name: 'Espresso', desc: 'Craft & Food', colors: ['#120c08', '#f59e0b', '#fcd34d'] },
                  { id: 'paper', name: 'Paper', desc: 'Editorial Minimal', colors: ['#f8f6f0', '#2563eb', '#18181b'] },
                  { id: 'signal', name: 'Signal', desc: 'High Impact Alert', colors: ['#0a0a0a', '#ef4444', '#ffffff'] },
                ].map(preset => (
                  <button
                    key={preset.id || 'auto'}
                    type="button"
                    className={`create-theme ${theme === preset.id && !customColorsEnabled ? 'on' : ''}`}
                    onClick={() => { setTheme(preset.id); setCustomColorsEnabled(false); }}
                  >
                    <span>{preset.colors.map(color => <i key={color} style={{ background: color }} />)}</span>
                    <b>{preset.name}</b>
                    <small>{preset.desc}</small>
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span><PaletteIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Custom brand colors</span>
                  <label className="check" style={{ margin: 0, fontSize: 12 }}>
                    <input type="checkbox" checked={customColorsEnabled} onChange={event => setCustomColorsEnabled(event.target.checked)} />
                    <span>Override with custom colors</span>
                  </label>
                </div>
              }
            >
              {customColorsEnabled ? (
                <div className="create-colors" style={{ marginTop: 8 }}>
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
                <p className="sub" style={{ margin: 0 }}>Color accents will be automatically balanced using the selected palette theme.</p>
              )}
            </Field>

            {/* Quick URL Brand Scraper */}
            <Field label={<span><GlobeIcon size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Extract from website URL</span>} hint="Pulls color palette and brand name directly from your site">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  placeholder="e.g. acme.com, linear.app"
                  value={urlInput}
                  onChange={event => setUrlInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void handleScrapeUrl(); } }}
                />
                <Button variant="secondary" loading={scraping} icon={<SparklesIcon size={14} />} onClick={handleScrapeUrl}>
                  {scraping ? 'Extracting…' : 'Extract'}
                </Button>
              </div>
              {scrapedBrand ? (
                <div className="create-brand" style={{ marginTop: 10 }}>
                  {scrapedBrand.logo ? <img src={scrapedBrand.logo} alt="" /> : <GlobeIcon size={20} />}
                  <div>
                    <b>{scrapedBrand.name || 'Brand identity'}</b>
                    <small>Palette populated from domain</small>
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

          {/* Sound Design & Music */}
          <section className="create-section">
            <div className="create-section-head">
              <div>
                <h2>Sound Design & Music</h2>
                <p>Background music mood and cinematic sound effects.</p>
              </div>
            </div>

            <div className="create-grid">
              <Field label="Music track mood">
                <select className="input" value={audioMood} onChange={event => setAudioMood(event.target.value)}>
                  <option value="cyber">Kinetic synth & cyber beats (Tech & fast paced)</option>
                  <option value="lofi">Ambient lo-fi & chill (Minimal & thoughtful)</option>
                  <option value="upbeat">Energetic funk & pop (Commercial & dynamic)</option>
                  <option value="cinematic">Cinematic orchestral (Dramatic & expansive)</option>
                  <option value="corporate">Clean acoustic (Warm & trustworthy)</option>
                  <option value="none">No background music</option>
                </select>
              </Field>
              <Field label="Motion SFX">
                <label className="check" style={{ marginTop: 8 }}>
                  <input type="checkbox" checked={sfx} onChange={event => setSfx(event.target.checked)} />
                  <span>Layer whooshes, impacts, pops and transition shimmers</span>
                </label>
              </Field>
            </div>
          </section>

          {/* Creative Details & Pacing (if guided or pro) */}
          {mode !== 'autopilot' ? (
            <section className="create-section">
              <div className="create-section-head">
                <div>
                  <h2>Creative Details & Pacing</h2>
                  <p>Message structure, typography and motion speed.</p>
                </div>
              </div>

              <div className="create-grid">
                <Field label="Key message points" hint="Key benefits or points to highlight across scenes">
                  <input className="input" placeholder="e.g. 10x faster, zero setup, free tier" value={keyPoints} onChange={event => setKeyPoints(event.target.value)} />
                </Field>
                <Field label="Call to action" hint="Closing card text and URL">
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="input" placeholder="Get started today" value={ctaHeadline} onChange={event => setCtaHeadline(event.target.value)} />
                    <input className="input" placeholder="motionrender.dev" value={ctaSubline} onChange={event => setCtaSubline(event.target.value)} />
                  </div>
                </Field>
              </div>

              <div className="create-grid create-grid-three" style={{ marginTop: 12 }}>
                <Field label="Font pairing">
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

              <label className="check" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={review} onChange={event => setReview(event.target.checked)} />
                <span>Run automated design review (check readability, safe zones and contrast)</span>
              </label>
            </section>
          ) : null}

          {/* Advanced / Pro overrides */}
          {mode === 'pro' ? (
            <section className="create-section">
              <div className="create-section-head">
                <div>
                  <h2>AI Service & Overrides</h2>
                  <p>Choose the model provider and exact frame overrides.</p>
                </div>
              </div>
              <div className="create-models">
                {[
                  { id: 'auto', name: 'Automatic', desc: 'Chooses for you', badge: 'Recommended' },
                  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', desc: 'Anthropic', badge: 'Quality' },
                  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Google', badge: 'Fast' },
                  { id: 'deepseek-r1', name: 'DeepSeek R1', desc: 'Reasoning', badge: 'Reasoning' },
                  { id: 'qwen3.8-27b', name: 'Qwen 3.8 27B', desc: 'Reliable all-rounder', badge: 'Stable' },
                  { id: 'gpt-4o', name: 'GPT-4o', desc: 'OpenAI', badge: 'Multimodal' },
                ].map(model => (
                  <button key={model.id} type="button" className={`create-model ${effectivePreset === model.id ? 'on' : ''}`} onClick={() => setModelPreset(model.id)}>
                    <span><b>{model.name}</b><small>{model.desc}</small></span>
                    <em>{model.badge}</em>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {/* Step 2 Final Action Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: '14px 18px',
              gap: 14,
              flexWrap: 'wrap',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap' }}>
              <span><b>{ratio}</b></span>
              <span>·</span>
              <span>{length}</span>
              <span>·</span>
              <span>{voice ? 'Voiceover ON' : 'No voiceover'}</span>
              <span>·</span>
              <span>Theme: <b>{theme || 'Auto'}</b></span>
              {activeKit ? <span>· Brand: {activeKit.name || 'Set'}</span> : null}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button size="md" variant="ghost" onClick={() => setStep(1)}>
                ← Back to Brief
              </Button>
              <Button
                size="lg"
                variant="primary"
                loading={busy}
                icon={<WandIcon size={16} />}
                onClick={() => void (design ? submitDesign() : submit())}
              >
                {busy ? 'Starting generation…' : '✨ Make My Video'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
