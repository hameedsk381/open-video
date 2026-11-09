// The looks an explainer can wear. A look is a whole design, not a palette: the board's colours, a type pairing, how headlines arrive, how scenes
// change, the texture behind them, how round the cards are and how heavy the headlines are. A script picks one (`look`) and can change any
// part of it (`design`, `colors`), so two videos about different things need not look alike.
export const explainerLooks = ['navy', 'ink', 'paper', 'forest', 'sunset', 'ocean', 'terminal', 'blueprint', 'candy', 'sage', 'newsprint', 'neon', 'slate'] as const;
export type ExplainerLook = typeof explainerLooks[number];

/** Fonts the engine carries, so they always render: headline fonts, and the readable subset for body text. */
export const explainerDisplayFonts = ['Archivo', 'Inter', 'Space Grotesk', 'Fraunces', 'Playfair Display', 'Syne', 'Manrope', 'DM Sans', 'Source Sans 3', 'JetBrains Mono', 'Bebas Neue', 'Instrument Serif'] as const;
export const explainerBodyFonts = ['Inter', 'DM Sans', 'Source Sans 3', 'Manrope', 'Space Grotesk', 'JetBrains Mono'] as const;
/** The heaviest weight each font has; a heavier request is lowered to it, so no face is ever faked. */
export const explainerFontMaxWeight: Record<string, number> = { 'Space Grotesk': 700, Syne: 800, Manrope: 800, 'Bebas Neue': 400, 'Instrument Serif': 400, 'JetBrains Mono': 800 };

export const explainerMotions = ['rise', 'drop', 'blur', 'fade'] as const;
export const explainerTransitions = ['fade', 'zoom', 'wipe', 'push'] as const;
export const explainerTextures = ['none', 'grid', 'dots', 'scanlines', 'paper'] as const;
export const explainerCorners = ['sharp', 'soft', 'round'] as const;
export const explainerWeights = ['medium', 'bold', 'black'] as const;
/** card: centred, in boxed cards. editorial: flush left, no boxes, hairline rules and large numerals. */
export const explainerLayouts = ['card', 'editorial'] as const;
/** How much each corner style scales the corner radii of the cards, and what weight each headline weight means. */
export const explainerCornerScale: Record<typeof explainerCorners[number], number> = { sharp: 0.2, soft: 1, round: 1.7 };
export const explainerWeightValue: Record<typeof explainerWeights[number], number> = { medium: 600, bold: 800, black: 900 };

export type ExplainerDesign = {
  fontDisplay: typeof explainerDisplayFonts[number]; fontBody: typeof explainerBodyFonts[number];
  motion: typeof explainerMotions[number]; transition: typeof explainerTransitions[number]; texture: typeof explainerTextures[number];
  corners: typeof explainerCorners[number]; weight: typeof explainerWeights[number]; layout: typeof explainerLayouts[number];
};
export type ExplainerLookDef = {
  /** What it suits, in a line: shown to the model that chooses and in the docs. */
  note: string;
  colors: { bg: string; surface: string; text: string; muted: string; accent: string; accent2: string; textureColor: string; textureOpacity: number };
  design: ExplainerDesign;
};

const base: ExplainerDesign = { fontDisplay: 'Archivo', fontBody: 'Inter', motion: 'rise', transition: 'fade', texture: 'grid', corners: 'soft', weight: 'black', layout: 'card' };

export const explainerLookDefs: Record<ExplainerLook, ExplainerLookDef> = {
  navy: { note: 'deep blue board with a gold signal: finance, technology, the safe default', colors: { bg: '#0b1c3f', surface: '#10295a', text: '#f1efe8', muted: '#8ea3c9', accent: '#f4c542', accent2: '#37d3a3', textureColor: '#8fb0ff', textureOpacity: 0.05 }, design: base },
  ink: { note: 'black with an orange signal: bold, cinematic, product and launch', colors: { bg: '#0a0a0b', surface: '#17171c', text: '#f4f1ea', muted: '#9a968c', accent: '#ff4a1c', accent2: '#ffb199', textureColor: '#ffffff', textureOpacity: 0.05 }, design: base },
  paper: { note: 'warm cream with rust and teal: editorial, calm, human topics', colors: { bg: '#f4efe6', surface: '#fffaf0', text: '#1a1a1a', muted: '#6b655a', accent: '#c2410c', accent2: '#0f766e', textureColor: '#000000', textureOpacity: 0.05 }, design: base },
  forest: { note: 'dark green with gold: nature, sustainability, wellbeing', colors: { bg: '#0c2a22', surface: '#12392f', text: '#eef5ef', muted: '#8fb3a4', accent: '#f2c14e', accent2: '#7bdcb5', textureColor: '#9fe8c8', textureOpacity: 0.05 }, design: base },
  sunset: { note: 'plum with orange and coral: culture, lifestyle, music, stories', colors: { bg: '#2a1033', surface: '#3a1a47', text: '#fff3ec', muted: '#c9a5c9', accent: '#ff9f43', accent2: '#ff6b81', textureColor: '#ffc2d4', textureOpacity: 0.05 }, design: base },
  ocean: { note: 'dark teal with aqua and amber, rounded and calm: health, water, gentle technology', colors: { bg: '#06222b', surface: '#0c3340', text: '#e9f8f6', muted: '#86b6b8', accent: '#2ee6c5', accent2: '#ffd166', textureColor: '#7ee8d8', textureOpacity: 0.06 }, design: { ...base, fontDisplay: 'Manrope', motion: 'drop', transition: 'zoom', texture: 'dots', corners: 'round', weight: 'bold' } },
  terminal: { note: 'black with phosphor green and monospace type, sharp corners: developers, security, systems', colors: { bg: '#050806', surface: '#0e1a11', text: '#d9ffe0', muted: '#74a57e', accent: '#39ff6a', accent2: '#f5d90a', textureColor: '#39ff6a', textureOpacity: 0.06 }, design: { fontDisplay: 'JetBrains Mono', fontBody: 'JetBrains Mono', motion: 'fade', transition: 'wipe', texture: 'scanlines', corners: 'sharp', weight: 'bold', layout: 'editorial' } },
  blueprint: { note: 'engineering blue with yellow, on a grid, sharp: how things are built, architecture, maths', colors: { bg: '#0b3a8c', surface: '#124ba6', text: '#f3f7ff', muted: '#a8c3f4', accent: '#ffd23f', accent2: '#7de3ff', textureColor: '#ffffff', textureOpacity: 0.08 }, design: { fontDisplay: 'Space Grotesk', fontBody: 'Space Grotesk', motion: 'rise', transition: 'wipe', texture: 'grid', corners: 'sharp', weight: 'bold', layout: 'card' } },
  candy: { note: 'pink and violet on white, rounded and playful: friendly, consumer, young audiences', colors: { bg: '#fff1f6', surface: '#ffffff', text: '#2a1030', muted: '#8c5f88', accent: '#d6005f', accent2: '#5b3df5', textureColor: '#d6005f', textureOpacity: 0.06 }, design: { fontDisplay: 'Syne', fontBody: 'DM Sans', motion: 'blur', transition: 'push', texture: 'dots', corners: 'round', weight: 'black', layout: 'card' } },
  sage: { note: 'soft green paper with a serif: books, slow topics, wellbeing, craft', colors: { bg: '#eef2e4', surface: '#fbfcf6', text: '#1d2a1b', muted: '#66775d', accent: '#2f6f3a', accent2: '#964f14', textureColor: '#4a6b3a', textureOpacity: 0.05 }, design: { fontDisplay: 'Fraunces', fontBody: 'DM Sans', motion: 'rise', transition: 'fade', texture: 'paper', corners: 'round', weight: 'bold', layout: 'editorial' } },
  newsprint: { note: 'newspaper cream with red and a serif headline, sharp: news, history, politics, long reads', colors: { bg: '#f2ede2', surface: '#fbf8f1', text: '#111111', muted: '#5f5b52', accent: '#b3121f', accent2: '#1d3557', textureColor: '#000000', textureOpacity: 0.07 }, design: { fontDisplay: 'Playfair Display', fontBody: 'Source Sans 3', motion: 'drop', transition: 'fade', texture: 'paper', corners: 'sharp', weight: 'black', layout: 'editorial' } },
  neon: { note: 'night violet with magenta and cyan: games, nightlife, the future, energy', colors: { bg: '#0a0a16', surface: '#15152a', text: '#f2f0ff', muted: '#9b97c7', accent: '#ff2bd6', accent2: '#00e5ff', textureColor: '#7b5cff', textureOpacity: 0.08 }, design: { fontDisplay: 'Space Grotesk', fontBody: 'Inter', motion: 'blur', transition: 'push', texture: 'grid', corners: 'soft', weight: 'bold', layout: 'card' } },
  slate: { note: 'cool grey with cyan and pink, clean and flat: modern software, neutral business', colors: { bg: '#12161d', surface: '#1c232d', text: '#e9edf2', muted: '#8a95a5', accent: '#4cc9f0', accent2: '#ff4f9b', textureColor: '#ffffff', textureOpacity: 0.03 }, design: { fontDisplay: 'DM Sans', fontBody: 'DM Sans', motion: 'fade', transition: 'zoom', texture: 'none', corners: 'soft', weight: 'bold', layout: 'editorial' } },
};

/** A look for a topic when the writer did not choose one: the same topic always gets the same look, and different topics are spread across all of them. */
export function lookForTopic(topic: string): ExplainerLook {
  let hash = 2166136261;
  for (const ch of topic.trim().toLowerCase()) { hash ^= ch.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return explainerLooks[(hash >>> 0) % explainerLooks.length]!;
}
