// The art-direction vocabulary shared by themes, blocks, the planner and the prompts. Keeping these lists in one place means
// the model can only choose looks the renderer actually supports, and a theme can be described in the same words.

/** Families bundled with the renderer, so a chosen font renders the same on every machine. */
export const fontFamilies = [
  { id: 'Inter', description: 'neutral geometric sans; modern tech and product' },
  { id: 'Space Grotesk', description: 'quirky technical grotesk; startups, AI, engineering' },
  { id: 'Fraunces', description: 'expressive editorial serif; craft, food, culture, storytelling' },
  { id: 'Archivo', description: 'bold condensed grotesk; sports, news, launch energy' },
  { id: 'Source Sans 3', description: 'calm humanist sans; education, docs, long-form' },
] as const;
export const fontIds = fontFamilies.map(font => font.id);

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
