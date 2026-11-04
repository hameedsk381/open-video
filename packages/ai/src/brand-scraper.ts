import type { BrandPack } from './agent';
import type { AiProvider } from './providers';

export type ScrapedWebsite = {
  url: string;
  title?: string;
  description?: string;
  siteName?: string;
  logo?: string;
  themeColor?: string;
  colors: string[];
  headings: string[];
  paragraphs: string[];
  suggestedBrief?: string;
};

/**
 * Normalizes a URL so that 'linear.app' becomes 'https://linear.app'.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Fast, lightweight regex-based HTML metadata & brand asset extractor.
 * Doesn't require heavy DOM dependencies; works seamlessly in Node 20+.
 */
export function parseWebsiteHtml(html: string, baseUrl: string): ScrapedWebsite {
  const result: ScrapedWebsite = {
    url: baseUrl,
    colors: [],
    headings: [],
    paragraphs: [],
  };

  const resolveUrl = (rel?: string): string | undefined => {
    if (!rel) return undefined;
    try {
      return new URL(rel, baseUrl).href;
    } catch {
      return rel;
    }
  };

  // 1. <title>
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    result.title = titleMatch[1].trim();
  }

  // 2. <meta> tags
  for (const meta of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = meta[0];
    const nameMatch = tag.match(/(?:name|property)=["']([^"']+)["']/i);
    const contentMatch = tag.match(/content=["']([^"']+)["']/i);
    if (!nameMatch || !contentMatch) continue;

    const key = nameMatch[1]?.toLowerCase() ?? '';
    const content = contentMatch[1]?.trim() ?? '';
    if (!content) continue;

    if (key === 'description' || key === 'og:description' || key === 'twitter:description') {
      if (!result.description || content.length > result.description.length) {
        result.description = content;
      }
    } else if (key === 'og:site_name') {
      result.siteName = content;
    } else if (key === 'og:title' && !result.title) {
      result.title = content;
    } else if (key === 'og:image' && !result.logo) {
      result.logo = resolveUrl(content);
    } else if (key === 'theme-color') {
      result.themeColor = content;
      result.colors.push(content);
    }
  }

  // 3. Favicon / Apple Touch Icon / SVG Icons
  const iconRegex = /<link\b[^>]*rel=["'](?:shortcut )?(?:icon|apple-touch-icon)["'][^>]*>/gi;
  for (const match of html.matchAll(iconRegex)) {
    const hrefMatch = match[0].match(/href=["']([^"']+)["']/i);
    if (hrefMatch && hrefMatch[1]) {
      const resolved = resolveUrl(hrefMatch[1]);
      if (resolved && (!result.logo || resolved.endsWith('.svg') || resolved.includes('apple-touch-icon'))) {
        result.logo = resolved;
      }
    }
  }

  // Fallback logo to standard /favicon.ico if none found
  if (!result.logo) {
    try {
      const u = new URL(baseUrl);
      result.logo = `${u.origin}/favicon.ico`;
    } catch {}
  }

  // 4. Color extractions from CSS variables & inline hex colors (#xxxxxx)
  const hexMatches = html.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) || [];
  const colorCounts = new Map<string, number>();
  for (const hex of hexMatches) {
    const norm = hex.toLowerCase();
    // Exclude generic pure black and white from being considered the "accent/brand" color
    if (norm === '#ffffff' || norm === '#fff' || norm === '#000000' || norm === '#000') continue;
    colorCounts.set(norm, (colorCounts.get(norm) ?? 0) + 1);
  }

  // Sort hex colors by occurrence frequency
  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color);

  if (result.themeColor) {
    result.colors.push(result.themeColor);
  }
  for (const c of sortedColors.slice(0, 5)) {
    if (!result.colors.includes(c)) result.colors.push(c);
  }

  // 5. Headings (h1, h2)
  for (const h of html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)) {
    const text = h[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && text.length > 3 && text.length < 120 && !result.headings.includes(text)) {
      result.headings.push(text);
    }
  }

  // 6. Lead paragraphs (<p>)
  for (const p of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = p[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (text && text.length > 20 && text.length < 240 && !result.paragraphs.includes(text)) {
      result.paragraphs.push(text);
      if (result.paragraphs.length >= 6) break;
    }
  }

  // 7. Auto-suggest a high-impact reel brief based on the extracted value propositions
  const brandName = result.siteName || (result.title ? result.title.split(/[-|–•]/)[0]?.trim() : '') || 'the product';
  const mainBenefit = result.headings[0] || result.description || 'Modern workflow platform';
  const subBenefit = result.paragraphs[0] || result.headings[1] || '';

  result.suggestedBrief = `Create a high-energy launch reel for ${brandName}. Core message: "${mainBenefit}". ${subBenefit ? `Key value proposition: "${subBenefit}". ` : ''}Showcase key metrics, features, and call to action.`;

  return result;
}

/**
 * Fetches the website HTML and extracts brand assets, colors, and value proposition.
 */
export async function scrapeWebsiteBrand(urlInput: string, timeoutMs = 8000): Promise<ScrapedWebsite> {
  const url = normalizeUrl(urlInput);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 OpenVideoBrandScraper/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} when fetching ${url}`);
    }

    const html = await response.text();
    return parseWebsiteHtml(html, url);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Distills raw scraped website metadata into a structured BrandPack using the AI provider,
 * with a deterministic fallback if the AI request fails or provider is absent.
 */
export async function distillBrandPack(
  scraped: ScrapedWebsite,
  provider?: AiProvider
): Promise<{ brand: BrandPack; suggestedBrief: string }> {
  // Deterministic fallback BrandPack
  const fallbackBrand: BrandPack = {
    name: scraped.siteName || (scraped.title ? scraped.title.split(/[-|–•]/)[0]?.trim() : 'Brand'),
    colors: {
      primary: scraped.colors[0] || '#6366f1',
      secondary: scraped.colors[1] || '#1f2438',
      accent: scraped.colors[2] || '#ec4899',
      background: '#090d16',
      text: '#f8fafc',
    },
    fonts: {
      heading: 'Inter, system-ui, sans-serif',
      body: 'Inter, system-ui, sans-serif',
    },
    logo: scraped.logo,
    style: `${scraped.description ? `${scraped.description.slice(0, 100)}. ` : ''}Modern, crisp motion design.`,
  };

  const suggestedBrief = scraped.suggestedBrief || `Launch reel for ${fallbackBrand.name}`;

  if (!provider) {
    return { brand: fallbackBrand, suggestedBrief };
  }

  try {
    const prompt = `You are a Brand Identity & Design System Specialist.
Extract a clean BrandPack JSON from this scraped website data:
URL: ${scraped.url}
Title: ${scraped.title ?? 'N/A'}
Site Name: ${scraped.siteName ?? 'N/A'}
Description: ${scraped.description ?? 'N/A'}
Extracted Colors: ${scraped.colors.join(', ') || 'None found'}
Headings: ${scraped.headings.slice(0, 4).join(' | ') || 'N/A'}
Paragraphs: ${scraped.paragraphs.slice(0, 3).join(' | ') || 'N/A'}

Respond with ONLY valid JSON with this shape:
{
  "name": "Brand Name",
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex",
    "background": "#070a12",
    "text": "#ffffff"
  },
  "fonts": {
    "heading": "Font Name or Inter",
    "body": "Font Name or Inter"
  },
  "style": "2-4 words defining the brand visual vibe (e.g. minimalist dark tech, sleek luxury, playful gradient)",
  "suggestedBrief": "A punchy 1-2 sentence video brief for a high-converting launch reel"
}`;

    const reply = await provider.chat([
      { role: 'user', content: prompt }
    ], { temperature: 0.1 });

    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { brand: fallbackBrand, suggestedBrief };

    const parsed = JSON.parse(jsonMatch[0]);
    const brand: BrandPack = {
      name: parsed.name || fallbackBrand.name,
      colors: {
        primary: parsed.colors?.primary || fallbackBrand.colors?.primary || '#6366f1',
        secondary: parsed.colors?.secondary || fallbackBrand.colors?.secondary || '#1e293b',
        accent: parsed.colors?.accent || fallbackBrand.colors?.accent || '#38bdf8',
        background: parsed.colors?.background || '#090d16',
        text: parsed.colors?.text || '#f8fafc',
      },
      fonts: {
        heading: parsed.fonts?.heading || 'Inter, system-ui, sans-serif',
        body: parsed.fonts?.body || 'Inter, system-ui, sans-serif',
      },
      logo: scraped.logo,
      style: parsed.style || fallbackBrand.style,
    };

    return {
      brand,
      suggestedBrief: parsed.suggestedBrief || suggestedBrief,
    };
  } catch {
    return { brand: fallbackBrand, suggestedBrief };
  }
}
