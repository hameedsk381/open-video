import { useEffect, useMemo, useState } from 'react';
import { modKeyLabel } from '../platform';
import { go } from '../router';
import {
  Badge,
  Button,
  CheckIcon,
  CopyIcon,
  FilmIcon,
  SearchIcon,
  WandIcon,
  useUi,
} from '../ui';

export type ShowcaseItem = {
  id: string;
  title: string;
  category: 'Product UI' | 'Kinetic Type' | '3D & WebGL' | 'Social Reels' | 'Charts & Data' | 'Brand Promos';
  aspect: '9:16' | '16:9' | '1:1';
  duration: string;
  theme: string;
  templateId?: string;
  prompt: string;
  summary: string;
  previewGradient: string;
  accentColor: string;
};

export const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: 'ui-morph-states',
    title: 'Shape Morphing Through UI States',
    category: 'Product UI',
    aspect: '16:9',
    duration: '12s',
    theme: 'midnight',
    templateId: 'product-spotlight',
    prompt: 'Make an ultra-clean 12-second SaaS UI animation demonstrating shape morphing across three states: idle state with glowing status indicator, active state where cards expand fluidly with spring physics, and success celebration with kinetic particle pop. Use sleek dark glassmorphism, crisp Inter typography, and subframe motion blur.',
    summary: 'Fluid state transitions with spring physics, glass cards, and status pill transitions.',
    previewGradient: 'linear-gradient(135deg, #090d16 0%, #1e1b4b 50%, #0f172a 100%)',
    accentColor: '#818cf8',
  },
  {
    id: 'kinetic-showreel-opus',
    title: 'Bold Kinetic Typography Showreel',
    category: 'Kinetic Type',
    aspect: '9:16',
    duration: '15s',
    theme: 'neon',
    templateId: 'kinetic-type',
    prompt: 'A bold, high-energy 15-second kinetic typography reel. Start with rapid rhythmic cuts on single impactful words, transition into an elastic word cascade, dynamic highlighter swipe on the punchline, and finish with an extruded neon title reveal. Strict 9:16 vertical safe-zones with Edge Neural TTS speech timing.',
    summary: 'Rhythmic typography cascade with word-level kinetic emphasis and social safe-zone alignment.',
    previewGradient: 'linear-gradient(135deg, #18181b 0%, #09090b 50%, #27272a 100%)',
    accentColor: '#2dd4bf',
  },
  {
    id: 'glass-bento-3d',
    title: '3D Floating Glass Bento Grid',
    category: '3D & WebGL',
    aspect: '16:9',
    duration: '10s',
    theme: 'midnight',
    templateId: 'starter',
    prompt: 'Create a cinematic 10-second product film featuring an isometric bento grid floating in 3D space with subtle camera push and depth of field. Each glass tile reveals a core feature with frosted glass refraction, glowing border outline, and soft ambient drop shadows.',
    summary: 'Isometric bento layout with depth-of-field camera push and frosted glass reflections.',
    previewGradient: 'linear-gradient(135deg, #030712 0%, #111827 50%, #1f2937 100%)',
    accentColor: '#38bdf8',
  },
  {
    id: 'social-reel-hook',
    title: 'Viral Social Reel Hook & Captions',
    category: 'Social Reels',
    aspect: '9:16',
    duration: '15s',
    theme: 'neon',
    templateId: 'hook-reel',
    prompt: 'Generate an irresistible 15-second vertical video designed for TikTok and Instagram Reels. Top third features an attention-grabbing hook badge with animated siren glow, middle has dynamic animated cards, and bottom displays synchronized word-by-word highlighted captions timed exactly to the voiceover.',
    summary: 'High-retention vertical layout with animated headline hook and synced word captions.',
    previewGradient: 'linear-gradient(135deg, #09090b 0%, #1c1917 50%, #292524 100%)',
    accentColor: '#f97316',
  },
  {
    id: 'analytics-dashboard',
    title: 'SaaS Analytics Counter Reveal',
    category: 'Product UI',
    aspect: '16:9',
    duration: '10s',
    theme: 'neon',
    templateId: 'stats-showcase',
    prompt: 'Create a polished product feature video showcasing real-time analytics. Numbers rapidly count up with spring easing from 0 to 4.2M users, accompanied by an animated glowing SVG sparkline that draws across the canvas, followed by badge status pills turning green.',
    summary: 'Spring-eased number counter animations with live animated trendline graph.',
    previewGradient: 'linear-gradient(135deg, #052e16 0%, #064e3b 50%, #022c22 100%)',
    accentColor: '#10b981',
  },
  {
    id: 'phone-landing-scroll',
    title: '3D Phone Mockup Scroll Showcase',
    category: '3D & WebGL',
    aspect: '9:16',
    duration: '12s',
    theme: 'midnight',
    templateId: 'hook-reel',
    prompt: 'A sleek 3D smartphone mockup that tilts toward the camera. The screen displays an interactive mobile app onboarding sequence that scrolls smoothly through 3 cards with subtle parallax, ending with a dynamic download call-to-action card.',
    summary: 'Parallax device mockup with smooth screen interaction and CTA card entrance.',
    previewGradient: 'linear-gradient(135deg, #0a0a0a 0%, #171717 50%, #262626 100%)',
    accentColor: '#a855f7',
  },
  {
    id: 'metric-stats-split',
    title: 'Dual Metric Growth Split-Screen',
    category: 'Charts & Data',
    aspect: '16:9',
    duration: '8s',
    theme: 'signal',
    templateId: 'stats-showcase',
    prompt: 'A bold data comparison video split down the center. Left column reveals "10x Faster Deployment" with an animated circular progress ring; right column shows "+320% Revenue" with rising bar charts and celebration particles. Crisp monospace data labels.',
    summary: 'Split-screen data comparison with synchronized progress rings and bar meters.',
    previewGradient: 'linear-gradient(135deg, #1e1b4b 0%, #31104b 50%, #0f172a 100%)',
    accentColor: '#f43f5e',
  },
  {
    id: 'cinematic-logo-sweep',
    title: 'Cinematic Dark Mode Logo Reveal',
    category: 'Brand Promos',
    aspect: '16:9',
    duration: '6s',
    theme: 'midnight',
    templateId: 'logo-sting',
    prompt: 'A 6-second broadcast-grade logo intro on deep obsidian black. An ethereal spotlight sweeps across an embossed metallic logo with light leaks and chromatic aberration, followed by a crisp brand tagline fading in with letter-spacing drift and an impact bass hit.',
    summary: 'Spotlight sweep, chromatic aberration, light leak reflections, and typography fade.',
    previewGradient: 'linear-gradient(135deg, #020617 0%, #0f172a 50%, #1e293b 100%)',
    accentColor: '#60a5fa',
  },
  {
    id: 'distilbook-quote-reveal',
    title: 'Distilbook Kinetic Quote Reveal',
    category: 'Kinetic Type',
    aspect: '1:1',
    duration: '8s',
    theme: 'paper',
    templateId: 'quote-card',
    prompt: 'Create an editorial 1:1 square animated quote video. Large serif typography renders with typewriter reveal, followed by a warm yellow marker highlighter stroke wiping across the primary concept, ending with an elegant author signature card.',
    summary: 'Editorial typography styling with marker highlighter wipe and author attribution.',
    previewGradient: 'linear-gradient(135deg, #1c1917 0%, #292524 50%, #0c0a09 100%)',
    accentColor: '#eab308',
  },
  {
    id: 'product-spotlight-card',
    title: 'Minimalist Hardware Product Card',
    category: 'Product UI',
    aspect: '1:1',
    duration: '10s',
    theme: 'slate',
    templateId: 'product-spotlight',
    prompt: 'A clean 10-second square product video for a modern hardware device. Smooth slow-motion scale-in of the product photograph with drop shadow, animated badge chips showing technical specs (e.g. "Titanium Build", "48h Battery"), and animated price tag.',
    summary: 'Subtle product zoom, specs pills entry, and dynamic CTA price banner.',
    previewGradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
    accentColor: '#38bdf8',
  },
  {
    id: 'roadmap-journey',
    title: 'Interactive Product Roadmap Timeline',
    category: 'Charts & Data',
    aspect: '16:9',
    duration: '12s',
    theme: 'midnight',
    templateId: 'tutorial-steps',
    prompt: 'A timeline progression animation tracking quarterly product milestones. A glowing neon cursor travels across an SVG path, activating step cards one by one with subtle scale pulse and checkmark reveals. Clean date tags and dark mode palette.',
    summary: 'Quarterly releases as milestones along an animated path.',
    previewGradient: 'linear-gradient(135deg, #030712 0%, #0f172a 50%, #111827 100%)',
    accentColor: '#34d399',
  },
  {
    id: 'agency-keynote-opener',
    title: 'Agency Launch Keynote Opener',
    category: 'Brand Promos',
    aspect: '16:9',
    duration: '14s',
    theme: 'espresso',
    templateId: 'starter',
    prompt: 'A high-impact 14-second conference keynote opening video. Cinematic Ken Burns zoom across architectural backdrop imagery, overlaid with huge condensed headline typography, dual-color gradients, and rhythmic camera shake impacts on beat drops.',
    summary: 'Cinematic keynote sequence with Ken Burns camera moves and high-contrast typography.',
    previewGradient: 'linear-gradient(135deg, #1c1917 0%, #451a03 50%, #0c0a09 100%)',
    accentColor: '#fb923c',
  },
];

const CATEGORIES = [
  'All',
  'Product UI',
  'Kinetic Type',
  '3D & WebGL',
  'Social Reels',
  'Charts & Data',
  'Brand Promos',
] as const;

const sizeOf = (aspect: ShowcaseItem['aspect']) => (aspect === '9:16' ? '1080×1920' : aspect === '1:1' ? '1080×1080' : '1920×1080');

/** A small picture of the video a brief asks for: a frame in its own shape, on the brief's colours. */
function Poster({ item, large = false }: { item: ShowcaseItem; large?: boolean }) {
  return (
    <div className={`disc-media${large ? ' large' : ''}`} style={{ background: item.previewGradient }} aria-hidden="true">
      <span className="disc-glow" style={{ background: item.accentColor }} />
      <div className={`disc-frame a-${item.aspect.replace(':', 'x')}`} style={{ borderColor: `${item.accentColor}66` }}>
        <i style={{ background: item.accentColor }} />
        <b />
        <b className="short" />
      </div>
    </div>
  );
}

export function Showcase() {
  const { toast } = useUi();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ShowcaseItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const map: Record<string, number> = { All: SHOWCASE_ITEMS.length };
    for (const item of SHOWCASE_ITEMS) map[item.category] = (map[item.category] || 0) + 1;
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return SHOWCASE_ITEMS.filter(item =>
      (selectedCategory === 'All' || item.category === selectedCategory) &&
      (!q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q) || item.prompt.toLowerCase().includes(q) || item.category.toLowerCase().includes(q)));
  }, [selectedCategory, search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const copyPrompt = (item: ShowcaseItem, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(item.prompt).then(() => {
      setCopiedId(item.id);
      toast('Prompt copied', 'success');
      setTimeout(() => setCopiedId(null), 2500);
    }, () => toast('Could not copy. Select the text and copy it instead.', 'error'));
  };

  const useThisBrief = (item: ShowcaseItem, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const params = new URLSearchParams();
    if (item.templateId) params.set('template', item.templateId);
    params.set('prompt', item.prompt);
    go(`#/new?${params.toString()}`);
  };

  return (
    <div className="disc-page">
      <header className="disc-head">
        <div>
          <h1>Discover</h1>
          <p>Ready-made briefs for the videos people ask for most. Open one in the creator, or copy the prompt.</p>
        </div>
        <label className="disc-search">
          <SearchIcon size={15} />
          <input type="search" placeholder={`Search briefs (${modKeyLabel('K')})`} aria-label="Search briefs" value={search} onChange={e => setSearch(e.target.value)} />
        </label>
      </header>

      <nav className="disc-filters" aria-label="Filter by category">
        {CATEGORIES.map(cat => (
          <button key={cat} className={selectedCategory === cat ? 'on' : ''} aria-pressed={selectedCategory === cat} onClick={() => setSelectedCategory(cat)}>
            {cat}<span>{counts[cat] || 0}</span>
          </button>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <div className="disc-empty">
          <FilmIcon size={30} />
          <h3>Nothing matches</h3>
          <p>Try other words, or clear the filters.</p>
          <Button variant="secondary" onClick={() => { setSelectedCategory('All'); setSearch(''); }}>Clear filters</Button>
        </div>
      ) : (
        <div className="disc-grid">
          {filtered.map(item => (
            <article
              key={item.id}
              className="disc-card"
              tabIndex={0}
              role="button"
              aria-label={`${item.title}. Open details`}
              onClick={() => setOpen(item)}
              onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(item); }}
            >
              <Poster item={item} />
              <div className="disc-chip"><i style={{ background: item.accentColor }} />{item.category}</div>
              <div className="disc-body">
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <div className="disc-meta">{item.aspect} · {item.duration} · {item.theme}</div>
                <div className="disc-actions">
                  <Button variant="primary" size="sm" icon={<WandIcon size={13} />} onClick={e => useThisBrief(item, e)}>Use this brief</Button>
                  <button className="disc-icon-btn" title="Copy the prompt" aria-label={`Copy the prompt for ${item.title}`} onClick={e => copyPrompt(item, e)}>
                    {copiedId === item.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {open ? (
        <div className="disc-backdrop" onClick={() => setOpen(null)}>
          <div className="disc-modal" role="dialog" aria-modal="true" aria-label={open.title} onClick={e => e.stopPropagation()}>
            <button className="disc-close" onClick={() => setOpen(null)} aria-label="Close">✕</button>
            <Poster item={open} large />
            <div className="disc-modal-body">
              <div className="disc-tags">
                <Badge tone="blue">{open.category}</Badge>
                <Badge tone="green">{open.aspect}</Badge>
                <span>{sizeOf(open.aspect)} · {open.duration} · {open.theme} theme</span>
              </div>
              <h2>{open.title}</h2>
              <p className="disc-modal-summary">{open.summary}</p>
              <div className="disc-prompt">
                <div className="disc-prompt-head">
                  <b>Prompt</b>
                  <button className="btn ghost sm" onClick={() => copyPrompt(open)}>
                    {copiedId === open.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                    <span>{copiedId === open.id ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
                <p>{open.prompt}</p>
              </div>
              <div className="disc-modal-actions">
                <Button variant="secondary" onClick={() => setOpen(null)}>Close</Button>
                <Button variant="primary" icon={<WandIcon size={14} />} onClick={() => useThisBrief(open)}>Use this brief</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
