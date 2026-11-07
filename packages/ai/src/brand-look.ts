// A brand in a brief: the colours and fonts a company already uses, turned into the look a video is built in. The scraper
// (brand-scraper.ts) finds them on a website; this module is what lets that result reach the planner, the templates and the
// React route, with every value checked first because it arrives from a person and is written into prompts.
import { fontIds, type DesignLook } from '@ove/schema';
import type { BrandPack } from './agent';

const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const clean = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
};
const colour = (value: unknown): string | undefined => { const text = clean(value, 9); return text && hex.test(text) ? text : undefined; };

/**
 * Reads a brand from request input. Only colours that are hex values and short text survive; a logo path or URL is never
 * kept, because nothing downstream may read a file or fetch an address a person typed into a brand.
 */
export function readBrand(value: unknown): BrandPack | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, any>;
  const colors: Record<string, string> = {};
  for (const role of ['primary', 'secondary', 'accent', 'background', 'text'] as const) { const found = colour(input.colors?.[role]); if (found) colors[role] = found; }
  const fonts: Record<string, string> = {};
  for (const role of ['heading', 'body'] as const) { const found = clean(input.fonts?.[role], 80); if (found) fonts[role] = found; }
  const name = clean(input.name, 80), style = clean(input.style, 200);
  if (!Object.keys(colors).length && !Object.keys(fonts).length && !name && !style) return undefined;
  return { ...(name ? { name } : {}), ...(style ? { style } : {}), ...(Object.keys(colors).length ? { colors: colors as BrandPack['colors'] } : {}), ...(Object.keys(fonts).length ? { fonts } : {}) };
}

/** The first family of a CSS stack that the renderer ships ("Inter, system-ui" is Inter; "Söhne" is nothing we have). */
export function bundledFamily(stack: string | undefined): string | undefined {
  for (const part of (stack ?? '').split(',')) {
    const wanted = part.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[-_]+/g, ' ');
    const found = fontIds.find(id => id.toLowerCase().replace(/[-_]+/g, ' ') === wanted);
    if (found) return found;
  }
  return undefined;
}

/**
 * The brand as a design look. Colours map to the look's roles; a font is used only when the renderer ships it, because
 * renders run offline and an unbundled family would silently draw as a fallback.
 */
export function brandLook(brand: BrandPack | undefined): DesignLook | undefined {
  if (!brand) return undefined;
  const palette: NonNullable<DesignLook['palette']> = {};
  const colors = brand.colors;
  if (colors?.background) palette.bg = colors.background;
  if (colors?.text) palette.text = colors.text;
  if (colors?.primary) palette.accent = colors.primary;
  const second = colors?.accent ?? colors?.secondary;
  if (second) palette.accent2 = second;
  const display = bundledFamily(brand.fonts?.heading), body = bundledFamily(brand.fonts?.body) ?? display;
  const look: DesignLook = {};
  if (Object.keys(palette).length) look.palette = palette;
  if (display || body) look.fonts = { ...(display ? { display } : {}), ...(body ? { body } : {}) };
  return Object.keys(look).length ? look : undefined;
}

/** `over` wins field by field, so a brand's colours and fonts replace the model's while its texture and motion stay. */
export function mergeLook(base: DesignLook | undefined, over: DesignLook | undefined): DesignLook | undefined {
  if (!over) return base;
  if (!base) return over;
  return { ...base, ...over, palette: { ...base.palette, ...over.palette }, fonts: { ...base.fonts, ...over.fonts } };
}

/** The brand with its fonts cut down to the ones that can be drawn, for a prompt that says "use only these". */
export function drawableBrand(brand: BrandPack | undefined): BrandPack | undefined {
  if (!brand) return undefined;
  const heading = bundledFamily(brand.fonts?.heading), body = bundledFamily(brand.fonts?.body) ?? heading;
  const { fonts: _unused, ...rest } = brand;
  return { ...rest, ...(heading || body ? { fonts: { ...(heading ? { heading } : {}), ...(body ? { body } : {}) } } : {}) };
}

/** One sentence for the planner: the brand is fixed, and the look is how it is expressed. */
export function brandLine(brand: BrandPack | undefined): string {
  if (!brand) return '';
  const colours = brand.colors ? Object.entries(brand.colors).map(([role, value]) => `${role} ${value}`).join(', ') : '';
  const fonts = [bundledFamily(brand.fonts?.heading) && `headings ${bundledFamily(brand.fonts?.heading)}`, bundledFamily(brand.fonts?.body) && `body ${bundledFamily(brand.fonts?.body)}`].filter(Boolean).join(', ');
  const parts = [brand.name && `name ${brand.name}`, colours && `colours ${colours}`, fonts && `fonts ${fonts}`, brand.style && `style notes: ${brand.style}`].filter(Boolean);
  return parts.length ? `The brand is fixed (${parts.join('; ')}). The look you give must use these colours and fonts as they are; you decide everything else (texture, motion, transition, layout, density, composition) so the video is this brand's and no other's.` : '';
}
