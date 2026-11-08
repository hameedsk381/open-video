import { useMemo, useState } from 'react';
import { modKeyLabel } from '../platform';
import { go } from '../router';
import {
  Badge,
  Button,
  CheckIcon,
  CopyIcon,
  FilmIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
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

export function Showcase() {
  const { toast } = useUi();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [activeModalItem, setActiveModalItem] = useState<ShowcaseItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Category counts
  const counts = useMemo(() => {
    const map: Record<string, number> = { All: SHOWCASE_ITEMS.length };
    for (const item of SHOWCASE_ITEMS) {
      map[item.category] = (map[item.category] || 0) + 1;
    }
    return map;
  }, []);

  // Filtered items
  const filtered = useMemo(() => {
    return SHOWCASE_ITEMS.filter(item => {
      const matchCat = selectedCategory === 'All' || item.category === selectedCategory;
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [selectedCategory, search]);

  const copyPrompt = (item: ShowcaseItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(item.prompt).then(() => {
      setCopiedId(item.id);
      toast('Prompt copied', 'success');
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const useThisBrief = (item: ShowcaseItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const params = new URLSearchParams();
    if (item.templateId) params.set('template', item.templateId);
    params.set('prompt', item.prompt);
    go(`#/new?${params.toString()}`);
  };

  return (
    <div className="showcase-page">
      {/* Hero Section */}
      <section className="showcase-hero">
        <div className="showcase-hero-inner">

          <h1 className="showcase-title">
            Starting prompts
          </h1>
          <p className="showcase-subtitle">
            Briefs for the kinds of video people ask for most. Copy one, or open it in the creator with a matching template.
          </p>

          {/* Search bar */}
          <div className="showcase-search-wrapper">
            <div className="showcase-search-bar">
              <SearchIcon size={16} />
              <input
                type="text"
                className="showcase-search-input"
                placeholder={`Search prompts or styles (${modKeyLabel('K')})`}
                aria-label="Search Discover"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search ? (
                <button className="clear-btn" onClick={() => setSearch('')}>
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* Category Pill Filters (Signature Prompt Motion Element) */}
      <nav className="category-pills-bar" aria-label="Filter by category">
        <div className="category-pills-scroll">
          {CATEGORIES.map(cat => {
            const count = counts[cat] || 0;
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                className={`category-pill ${active ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                <span className="cat-label">{cat}</span>
                <span className="cat-count">{count}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Bento Grid of Video Showcase Cards */}
      <section className="bento-showcase-container">
        {filtered.length === 0 ? (
          <div className="empty-showcase">
            <FilmIcon size={32} />
            <h3>No motion prompts found</h3>
            <p>Try searching for different keywords or select a different category filter.</p>
            <Button variant="secondary" onClick={() => { setSelectedCategory('All'); setSearch(''); }}>
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="bento-grid">
            {filtered.map(item => {
              const isCopied = copiedId === item.id;
              return (
                <article
                  key={item.id}
                  className="bento-card"
                  onClick={() => setActiveModalItem(item)}
                >

                  {/* Card Body & Metadata */}
                  <div className="bento-body">
                    <div className="bento-tags"><span className="tag-pill category-tag">{item.category}</span><span className="tag-pill aspect-tag">{item.aspect}</span><span className="tag-pill">{item.duration}</span></div>

                    <h3 className="bento-item-title">{item.title}</h3>
                    <p className="bento-item-summary">{item.summary}</p>

                    {/* Prompt Box Preview */}
                    <div className="prompt-preview-snippet">
                      <p>"{item.prompt.slice(0, 115)}..."</p>
                    </div>

                    {/* Action Row */}
                    <div className="bento-actions-row">
                      <button
                        className={`prompt-copy-btn ${isCopied ? 'copied' : ''}`}
                        title="Copy prompt text"
                        onClick={e => copyPrompt(item, e)}
                      >
                        {isCopied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                        <span>{isCopied ? 'Copied' : 'Copy prompt'}</span>
                      </button>

                      <button
                        className="customize-btn"
                        title="Start a new video from this brief"
                        onClick={e => useThisBrief(item, e)}
                      >
                        <WandIcon size={13} />
                        <span>Use this brief</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Interactive Detail Modal Drawer */}
      {activeModalItem ? (
        <div className="showcase-modal-backdrop" onClick={() => setActiveModalItem(null)}>
          <div className="showcase-modal-dialog" onClick={e => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={() => setActiveModalItem(null)}
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="modal-header">
              <div className="modal-meta-row">
                <div className="grow" />
                <Badge tone="blue">{activeModalItem.category}</Badge>
                <Badge tone="green">{activeModalItem.aspect}</Badge>
              </div>
              <h2 className="modal-title">{activeModalItem.title}</h2>
            </div>

            {/* Size and length of the video this brief asks for */}
            <div
              className="modal-media-player"
              style={{ background: activeModalItem.previewGradient }}
            >
              <div className="modal-ambient-glow" style={{ background: activeModalItem.accentColor }} />
              <div className="modal-player-center">
                <span className="modal-preview-specs">
                  {activeModalItem.aspect === '9:16' ? '1080×1920' : activeModalItem.aspect === '1:1' ? '1080×1080' : '1920×1080'} · {activeModalItem.duration}
                </span>
              </div>
            </div>

            {/* Prompt Box */}
            <div className="modal-prompt-section">
              <div className="prompt-header-bar">
                <b>Prompt</b>
                <button
                  className="btn ghost sm"
                  onClick={() => copyPrompt(activeModalItem)}
                >
                  {copiedId === activeModalItem.id ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                  <span>{copiedId === activeModalItem.id ? 'Copied' : 'Copy prompt'}</span>
                </button>
              </div>

              <div className="modal-prompt-content">
                <code>{activeModalItem.prompt}</code>
              </div>
            </div>

            {/* Footer with Actions */}
            <div className="modal-footer">
              <div className="modal-specs-list">
                <span>Theme: <b>{activeModalItem.theme}</b></span>
              </div>

              <div className="modal-actions-cta">
                <Button variant="secondary" onClick={() => copyPrompt(activeModalItem)}>
                  <CopyIcon size={14} />
                  <span>Copy Prompt</span>
                </Button>
                <Button variant="primary" onClick={() => useThisBrief(activeModalItem)}>
                  <WandIcon size={14} />
                  <span>Use this brief</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
