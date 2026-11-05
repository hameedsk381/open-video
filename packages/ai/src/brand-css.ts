// Pure CSS mining for brand extraction: the exact evidence a website's stylesheets carry about its design system —
// custom properties, font faces and stacks, and every colour with how often it is used. Regex-based like the HTML
// scraper (no DOM dependency), and fully unit-testable without a network.
export type ColorSighting = { color: string; count: number; source: 'css-variable' | 'stylesheet' | 'html' };
export type FontFace = { family: string; weight?: string };

export type CssEvidence = {
  colors: ColorSighting[];
  customProperties: { name: string; value: string }[];
  fontFamilies: { family: string; count: number }[];
  fontFaces: FontFace[];
};

const genericFamilies = new Set(['inherit', 'initial', 'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'apple-system']);

/**
 * Normalizes any CSS colour notation to #rrggbb: 3/4/6/8-digit hex, rgb()/rgba() (legacy commas and modern
 * space-slash syntax) and hsl()/hsla(). Returns undefined for anything that is not an opaque colour.
 */
export function normalizeColor(input: string): string | undefined {
  const value = input.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    const digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) {
      const [r, g, b] = digits;
      if (digits.length === 4 && digits[3] !== 'f') return undefined;
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (digits.length === 6) return `#${digits}`;
    if (digits.length === 8) return digits.endsWith('ff') ? `#${digits.slice(0, 6)}` : undefined;
    return undefined;
  }
  const fn = value.match(/^((?:rgb|hsl)a?)\(([^)]+)\)$/);
  if (!fn) return undefined;
  const parts = fn[2]!.split(/[\s,/]+/).filter(Boolean).map(part => ({ number: Number.parseFloat(part), percent: part.endsWith('%') }));
  if (parts.length < 3 || parts.slice(0, 3).some(part => !Number.isFinite(part.number))) return undefined;
  if (parts[3] && Number.isFinite(parts[3].number) && (parts[3].percent ? parts[3].number / 100 : parts[3].number) < 0.5) return undefined;
  const byte = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  if (fn[1]!.startsWith('rgb')) {
    const channel = (part: { number: number; percent: boolean }) => part.percent ? part.number / 100 * 255 : part.number > 1 ? part.number : part.number * 255;
    return `#${byte(channel(parts[0]!))}${byte(channel(parts[1]!))}${byte(channel(parts[2]!))}`;
  }
  const hue = ((parts[0]!.number % 360) + 360) % 360, sat = Math.min(1, Math.max(0, (parts[1]!.percent ? parts[1]!.number / 100 : parts[1]!.number))), light = Math.min(1, Math.max(0, (parts[2]!.percent ? parts[2]!.number / 100 : parts[2]!.number)));
  const c = (1 - Math.abs(2 * light - 1)) * sat, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = light - c / 2;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return `#${byte((r + m) * 255)}${byte((g + m) * 255)}${byte((b + m) * 255)}`;
}

/** Relative luminance (WCAG), 0 dark to 1 light, and the HSL saturation, for role classification. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function saturation(hex: string): number {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb), min = Math.min(...rgb);
  if (max === min) return 0;
  const light = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * light - 1));
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * Mines one stylesheet's text: colours ranked by use (a colour declared as a custom property counts extra — sites
 * name what matters, so `--primary: #5e6ad2` outweighs a stray border), custom properties that hold colours, and
 * font families from both stacks and @font-face rules.
 */
export function mineCss(css: string): CssEvidence {
  const text = stripComments(css);
  const colors = new Map<string, ColorSighting>();
  const bump = (value: string, source: ColorSighting['source'], weight = 1) => {
    const color = normalizeColor(value);
    if (!color) return;
    const seen = colors.get(color) ?? { color, count: 0, source };
    seen.count += weight;
    if (source === 'css-variable') seen.source = 'css-variable';
    colors.set(color, seen);
  };
  const customProperties: { name: string; value: string }[] = [];
  for (const match of text.matchAll(/--([a-zA-Z][\w-]*)\s*:\s*([^;{}]+)/g)) {
    const value = match[2]!.trim();
    customProperties.push({ name: match[1]!, value });
    bump(value, 'css-variable', 6);
  }
  for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bump(match[0], 'stylesheet');
  for (const match of text.matchAll(/\b(?:rgba?)\([^)]+\)/g)) bump(match[0], 'stylesheet');
  for (const match of text.matchAll(/\b(?:hsla?)\([^)]+\)/g)) bump(match[0], 'stylesheet');
  const families = new Map<string, number>();
  const bumpFamily = (raw: string, weight: number) => {
    const first = raw.split(',')[0]!.trim().replace(/^["']|["']$/g, '');
    // Reject generic aliases, var()/calc() indirection, and values that are really lengths or numbers
    // (`--font-letter-spacing-tight: -0.01em` is spacing, not a typeface).
    if (!first || genericFamilies.has(first.toLowerCase()) || /^(?:var|calc|min|max|clamp|env|attr)\(|^-?[\d.]/.test(first)) return;
    families.set(first, (families.get(first) ?? 0) + weight);
  };
  for (const match of text.matchAll(/font-family\s*:\s*([^;}]+)/gi)) bumpFamily(match[1]!, 1);
  // Custom properties that hold font stacks (`--font-body: "Söhne", sans-serif`) are named, deliberate choices.
  for (const { name, value } of customProperties) {
    if (/font/i.test(name) && !/^(#|rgb|hsl|oklch|color-mix|light-dark|\d)/i.test(value.trim())) bumpFamily(value, 2);
  }
  const fontFaces: FontFace[] = [];
  for (const match of text.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const family = match[1]!.match(/font-family\s*:\s*([^;}]+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (family) fontFaces.push({ family, weight: match[1]!.match(/font-weight\s*:\s*([^;}]+)/i)?.[1]?.trim() });
  }
  return {
    colors: [...colors.values()].sort((a, b) => b.count - a.count),
    customProperties,
    fontFamilies: [...families].map(([family, count]) => ({ family, count })).sort((a, b) => b.count - a.count),
    fontFaces,
  };
}

/**
 * Classifies a ranked colour list into the BrandPack roles by lightness and saturation: the dominant dark colour is
 * the background, the dominant near-white the text, and the most used saturated mid-tones the primary and accent. A
 * vivid colour never takes a background or text role, however dark or light it is — #5e6ad2 is a brand indigo, not a
 * near-black.
 */
export function classifyRoles(colors: ColorSighting[]): { primary?: string; secondary?: string; accent?: string; background?: string; text?: string } {
  const usable = colors.filter(({ color }) => color.length === 7);
  const vivid = new Set(usable.filter(({ color }) => saturation(color) > 0.2 && luminance(color) > 0.12 && luminance(color) < 0.82).map(({ color }) => color));
  const dark = usable.filter(({ color }) => luminance(color) < 0.18 && !vivid.has(color));
  const light = usable.filter(({ color }) => luminance(color) > 0.85 && !vivid.has(color));
  const brand = usable.filter(({ color }) => vivid.has(color));
  const roles: { primary?: string; secondary?: string; accent?: string; background?: string; text?: string } = {};
  if (dark.length) roles.background = dark[0]!.color;
  if (light.length) roles.text = light[0]!.color;
  if (brand.length) roles.primary = brand[0]!.color;
  if (brand.length > 1) roles.accent = brand[1]!.color;
  if (brand.length > 2) roles.secondary = brand[2]!.color;
  return roles;
}
