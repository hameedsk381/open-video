// The art-direction vocabulary shared by themes, blocks, the planner and the prompts. Keeping these lists in one place means
// the model can only choose looks the renderer actually supports, and a theme can be described in the same words.

/** Families bundled with the renderer, so a chosen font renders the same on every machine. */
export const fontFamilies = [
  { id: 'Inter', description: 'neutral geometric sans; modern tech and product' },
  { id: 'Space Grotesk', description: 'quirky technical grotesk; startups, AI, engineering' },
  { id: 'Fraunces', description: 'expressive editorial serif; craft, food, culture, storytelling' },
  { id: 'Archivo', description: 'bold condensed grotesk; sports, news, launch energy' },
  { id: 'Source Sans 3', description: 'calm humanist sans; education, docs, long-form' },
  { id: 'Playfair Display', description: 'high-contrast display serif; luxury, fashion, editorial headlines' },
  { id: 'DM Sans', description: 'friendly low-contrast geometric sans; consumer apps, wellness, warm body text' },
  { id: 'Manrope', description: 'modern semi-rounded sans; fintech, SaaS, clean interfaces' },
  { id: 'Syne', description: 'wide avant-garde display; art, music, fashion, creative studios' },
  { id: 'JetBrains Mono', description: 'monospace; developer tools, terminals, data labels' },
  { id: 'Bebas Neue', description: 'tall condensed capitals, one weight; posters, sports, sales, loud headlines' },
  { id: 'Instrument Serif', description: 'elegant condensed serif with italics, one weight; film, luxury, quiet statements' },
] as const;
export const fontIds = fontFamilies.map(font => font.id);
/** The families as one line each, for prompts: the list a model chooses from is the list the renderer ships. */
export const fontGuide = fontFamilies.map(font => `${font.id} (${font.description})`).join('; ');

/**
 * Starting points from very different visual worlds. A model asked to design "with no house style" still drifts to the same
 * dark gradient; naming concrete worlds, each with real tokens, gives it somewhere else to go. They are suggestions to pick
 * from by subject or to depart from, never a requirement, and the order they are listed in rotates with the brief so no
 * family is always first.
 */
export const styleFamilies = [
  { id: 'editorial-print', fits: 'culture, essays, books, craft, long-form stories',
    look: { fonts: { display: 'Fraunces', body: 'Source Sans 3' }, palette: { bg: '#f4efe6', surface: '#e9e1d2', text: '#1d1a16', muted: '#7a6f60', accent: '#b4432b', accent2: '#1f5c4d' }, texture: { type: 'paper' }, motion: 'rise', transition: 'fade', layout: 'editorial' },
    cues: 'oversized serif headlines, hairline rules, small captions, generous margins, restrained motion' },
  { id: 'swiss-grid', fits: 'design, architecture, institutions, B2B clarity, tools',
    look: { fonts: { display: 'Archivo', body: 'Inter' }, palette: { bg: '#f5f5f2', surface: '#ffffff', text: '#111111', muted: '#6b6b6b', accent: '#e63312', accent2: '#111111' }, texture: { type: 'grid' }, motion: 'slide', transition: 'push', layout: 'split' },
    cues: 'hard alignment on a visible grid, one accent used sparingly, no gradients or shadows, numbers set very large' },
  { id: 'brutalist-poster', fits: 'launches, events, sales, streetwear, music',
    look: { fonts: { display: 'Bebas Neue', body: 'Archivo' }, palette: { bg: '#ffe14d', surface: '#111111', text: '#0a0a0a', muted: '#3b3b3b', accent: '#ff3b1d', accent2: '#1a1aff' }, texture: { type: 'none' }, motion: 'pop', transition: 'wipe', layout: 'left' },
    cues: 'enormous condensed type cropped by the frame, flat blocks of colour, hard offset shadows, tilted labels' },
  { id: 'cinematic-night', fits: 'luxury, documentary, film, travel, automotive, watches',
    look: { fonts: { display: 'Instrument Serif', body: 'Inter' }, palette: { bg: '#07080a', surface: '#12141a', text: '#f1ede4', muted: '#8a857a', accent: '#c9a45c', accent2: '#7c8a99' }, texture: { type: 'none' }, motion: 'blur', transition: 'dip', layout: 'center' },
    cues: 'slow pace, large negative space, thin type, one hero element per scene, soft light rather than boxes' },
  { id: 'warm-craft', fits: 'food, handmade goods, local business, wellness, home',
    look: { fonts: { display: 'Fraunces', body: 'DM Sans' }, palette: { bg: '#f3e4cf', surface: '#e8d0b0', text: '#3a2616', muted: '#8b6b4e', accent: '#c4552d', accent2: '#5f7a4f' }, texture: { type: 'paper' }, motion: 'fade', transition: 'fade', layout: 'left' },
    cues: 'earthy colour, rounded organic shapes, a hand-made feel, room for photographs' },
  { id: 'playful-pastel', fits: 'kids, learning apps, community, friendly consumer products',
    look: { fonts: { display: 'DM Sans', body: 'Manrope' }, palette: { bg: '#fff4e6', surface: '#ffffff', text: '#2b2350', muted: '#7a6f9b', accent: '#ff6b9d', accent2: '#6c5ce7' }, texture: { type: 'dots' }, motion: 'pop', transition: 'zoom', layout: 'center' },
    cues: 'rounded cards with large radii, bouncy overshoot, sticker-like shapes, bright flat colour' },
  { id: 'tech-console', fits: 'developer tools, security, infrastructure, hacking, data engineering',
    look: { fonts: { display: 'JetBrains Mono', body: 'Space Grotesk' }, palette: { bg: '#0a0f0d', surface: '#111a16', text: '#d7ffe9', muted: '#6f9a86', accent: '#3dff9a', accent2: '#ffb02e' }, texture: { type: 'scanlines' }, motion: 'slide', transition: 'push', layout: 'left' },
    cues: 'monospace labels, terminal blocks, a blinking caret, status lines, tight tracking' },
  { id: 'data-clarity', fits: 'reports, finance, research, explainers built on numbers',
    look: { fonts: { display: 'Manrope', body: 'Source Sans 3' }, palette: { bg: '#ffffff', surface: '#f1f5f9', text: '#0f172a', muted: '#64748b', accent: '#2563eb', accent2: '#f59e0b' }, texture: { type: 'none' }, motion: 'rise', transition: 'wipe', layout: 'split' },
    cues: 'one large figure per scene, charts drawn from shapes, units and sources shown, plenty of white space' },
  { id: 'avant-gallery', fits: 'fashion, art, music, creative studios, portfolios',
    look: { fonts: { display: 'Syne', body: 'Instrument Serif' }, palette: { bg: '#efeae2', surface: '#ffffff', text: '#101010', muted: '#77716a', accent: '#ff4d00', accent2: '#3a2fff' }, texture: { type: 'none' }, motion: 'slide', transition: 'wipe', layout: 'editorial' },
    cues: 'asymmetric placement, overlapping type, one rotated element, sudden jumps in scale' },
  { id: 'gradient-product', fits: 'software products only: SaaS, apps, fintech, cloud',
    look: { fonts: { display: 'Space Grotesk', body: 'Inter' }, palette: { bg: '#0b1020', surface: '#151b33', text: '#f5f7fb', muted: '#98a2b8', accent: '#5b8cff', accent2: '#22d3ee' }, texture: { type: 'grid' }, motion: 'rise', transition: 'fade', layout: 'left' },
    cues: 'soft gradient field, glass cards, glowing accents. This is the common default, so use it only when the subject really is a software product' },
] as const;

/** A small stable number from text, so the same brief always sees the same order. */
const hashOf = (text: string) => { let hash = 2166136261; for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); } return hash >>> 0; };

/** The style families as prompt text, rotated by the brief so none is always first. */
export function describeStyleFamilies(seed: string): string {
  const start = hashOf(seed) % styleFamilies.length;
  return [...styleFamilies.slice(start), ...styleFamilies.slice(0, start)].map(family => {
    const { fonts, palette, texture, motion, transition, layout } = family.look;
    return `- ${family.id} (fits: ${family.fits}): fonts ${fonts.display} + ${fonts.body}; palette bg ${palette.bg}, text ${palette.text}, accent ${palette.accent}, accent2 ${palette.accent2}; texture ${texture.type}; motion ${motion}, transition ${transition}, layout ${layout}; ${family.cues}.`;
  }).join('\n');
}

/** Background treatments drawn under the content. Grain stays a separate composition effect. */
export const textureTypes = ['none', 'grid', 'dots', 'scanlines', 'paper'] as const;
export type TextureType = (typeof textureTypes)[number];

/** Entrance vocabulary; these are also the names of the text split presets. */
export const motionPresets = ['rise', 'blur', 'slide', 'pop', 'fade'] as const;
/** Scene transition vocabulary. */
export const transitionStyles = ['push', 'fade', 'slide', 'wipe', 'zoom', 'dip'] as const;
/** How content is arranged; the model picks one per video and the blocks follow it where they can. */
export const layoutStyles = ['left', 'center', 'split', 'editorial'] as const;

export const themeTokenNames = ['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'radius', 'headWeight', 'fontDisplay', 'fontBody', 'texture', 'textureColor', 'textureOpacity', 'motion', 'transition', 'layout', 'density'] as const;

const numberTokens = new Set(['radius', 'headWeight', 'textureOpacity', 'density']);
const colorTokens = new Set(['bg', 'surface', 'text', 'muted', 'accent', 'accent2', 'textureColor']);
export const themeTokenType = (name: string): 'color' | 'number' | 'string' => numberTokens.has(name) ? 'number' : colorTokens.has(name) ? 'color' : 'string';

/** What the planner decides about the look before the composition is written. */
export type DesignLook = {
  fonts?: { display?: string; body?: string };
  palette?: { bg?: string; surface?: string; text?: string; muted?: string; accent?: string; accent2?: string };
  texture?: { type?: TextureType; color?: string; opacity?: number; scale?: number };
  motion?: string;
  transition?: string;
  layout?: string;
  density?: number;
};
