// The brand a studio reuses: the name, colours, fonts, contact line and logo one customer has, saved once in this browser
// and sent with every new video. Everything here is checked on the way in and out: a colour must be hex, a logo must be a
// small image data URL, and text is cut to a length a video can print, because these values reach prompts and the picture.
export type BrandColors = { primary?: string; secondary?: string; accent?: string; background?: string; text?: string };
export type BrandFonts = { heading?: string; body?: string };
export type BrandKit = {
  name: string;
  colors: BrandColors;
  fonts: BrandFonts;
  /** One line for the closing scene: phone, email, website, in the customer's own words. */
  contact: string;
  /** What the brand looks and sounds like, from a website scrape; the model may use it as a note. */
  style: string;
  /** A small image as a data URL, shown in Settings and uploaded with each new video. */
  logo: string;
  /** Whether the logo signs the last scene. Colours, fonts and the contact line apply either way. */
  logoOnEndCard: boolean;
  /** Off means a saved kit is kept but not sent with new videos. */
  enabled: boolean;
};

export const BRAND_KIT_KEY = 'ove-brand-kit';
export const BRAND_KIT_EVENT = 'ove-brand-kit-changed';

const roles = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
const hex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const logoData = /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;
/** About 2 MB of image, as base64. A logo is a small mark; anything larger is a photo. */
const logoLimit = 2_800_000;

const text = (value: unknown, max: number): string => {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
  return clean.slice(0, max);
};
const colour = (value: unknown): string | undefined => {
  const found = typeof value === 'string' ? value.trim() : '';
  return hex.test(found) ? found.toLowerCase() : undefined;
};
const logo = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const found = value.trim();
  return found.length <= logoLimit && logoData.test(found) ? found : '';
};

export function emptyBrandKit(): BrandKit {
  return { name: '', colors: {}, fonts: {}, contact: '', style: '', logo: '', logoOnEndCard: true, enabled: true };
}

/** A kit from stored JSON (or a form), with every unusable value dropped rather than guessed. */
export function readBrandKit(raw: unknown): BrandKit | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, any>;
  const kit = emptyBrandKit();
  kit.name = text(input.name, 60);
  for (const role of roles) {
    const value = colour(input.colors?.[role]);
    if (value) kit.colors[role] = value;
  }
  const heading = text(input.fonts?.heading, 80), body = text(input.fonts?.body, 80);
  kit.fonts = { ...(heading ? { heading } : {}), ...(body ? { body } : {}) };
  kit.contact = text(input.contact, 200);
  kit.style = text(input.style, 120);
  kit.logo = logo(input.logo);
  kit.logoOnEndCard = input.logoOnEndCard !== false;
  kit.enabled = input.enabled !== false;
  return kitIsSet(kit) ? kit : null;
}

/** Whether a kit has anything worth sending: a name, a colour, a font, a contact line or a logo. */
export function kitIsSet(kit: BrandKit | null | undefined): kit is BrandKit {
  return Boolean(kit && (kit.name || kit.contact || kit.logo || Object.keys(kit.colors).length || Object.keys(kit.fonts).length));
}

export function loadBrandKit(): BrandKit | null {
  try {
    const stored = localStorage.getItem(BRAND_KIT_KEY);
    return stored ? readBrandKit(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function saveBrandKit(kit: BrandKit): BrandKit | null {
  const clean = readBrandKit(kit);
  try {
    if (clean) localStorage.setItem(BRAND_KIT_KEY, JSON.stringify(clean));
    else localStorage.removeItem(BRAND_KIT_KEY);
  } catch {
    return clean;
  }
  window.dispatchEvent(new Event(BRAND_KIT_EVENT));
  return clean;
}

export function clearBrandKit(): void {
  try { localStorage.removeItem(BRAND_KIT_KEY); } catch { /* private window */ }
  window.dispatchEvent(new Event(BRAND_KIT_EVENT));
}

/** The brand the compose jobs read: fixed colours and fonts, and the copy the video may print. */
export function brandForCompose(kit: BrandKit | null | undefined): Record<string, unknown> | undefined {
  if (!kitIsSet(kit)) return undefined;
  return {
    ...(kit.name ? { name: kit.name } : {}),
    ...(Object.keys(kit.colors).length ? { colors: { ...kit.colors } } : {}),
    ...(Object.keys(kit.fonts).length ? { fonts: { ...kit.fonts } } : {}),
    ...(kit.contact ? { contact: kit.contact } : {}),
    ...(kit.style ? { style: kit.style } : {}),
  };
}

/** The first family of a CSS stack the renderer ships, so a scraped website font only lands in the kit when it can be drawn. */
export function bundledFont(stack: string | undefined, available: string[]): string {
  for (const part of (stack ?? '').split(',')) {
    const wanted = part.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/[-_]+/g, ' ');
    const found = available.find(font => font.toLowerCase().replace(/[-_]+/g, ' ') === wanted);
    if (found) return found;
  }
  return '';
}

/** The logo as a file the project can hold, named so its asset id is `brand-logo`. */
export function logoFile(kit: BrandKit | null | undefined): File | null {
  if (!kit?.logo) return null;
  const match = kit.logo.match(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,(.*)$/);
  if (!match) return null;
  const ext = ({ png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif', 'svg+xml': 'svg' } as Record<string, string>)[match[1]!] ?? 'png';
  try {
    const bytes = atob(match[2]!.replace(/\s+/g, ''));
    const buffer = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
    return new File([buffer], `brand-logo.${ext}`, { type: `image/${match[1]}` });
  } catch {
    return null;
  }
}
