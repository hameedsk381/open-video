import { z } from 'zod';

// Shared by composition layers, font assets and production manifests: a weight may be a number or a CSS-ish name.
const fontWeightMap: Record<string, number> = {
  thin: 100, hairline: 100, extralight: 200, ultralight: 200, 'extra-light': 200, 'ultra-light': 200,
  light: 300, regular: 400, medium: 500, semibold: 600, demibold: 600, 'semi-bold': 600, 'demi-bold': 600,
  extrabold: 800, ultrabold: 800, 'extra-bold': 800, 'ultra-bold': 800, black: 900, heavy: 900
};

export const fontWeight = z.preprocess((val: unknown) => {
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (s in fontWeightMap) return fontWeightMap[s];
  }
  return val;
}, z.union([z.number().int().min(1).max(1000), z.enum(['normal', 'bold'])]));

export const fontStyle = z.enum(['normal', 'italic']);

/** A media or font file a composition (and a production manifest) can refer to by id. Font assets register a file under `family` (default: the asset id) for that weight and style; text layers then use it by name. */
export const assetSchema = z.object({ id: z.string().min(1), type: z.enum(['image','video','audio','font','svg','captions','lottie']), src: z.string().min(1), family: z.string().min(1).optional().describe('Font assets: the family name text layers use'), weight: fontWeight.optional().describe('Font assets: the weight this file provides (default 400)'), style: fontStyle.optional().describe('Font assets: normal or italic (default normal)'), metadata: z.record(z.string(), z.unknown()).default({}) });
export type Asset = z.infer<typeof assetSchema>;
