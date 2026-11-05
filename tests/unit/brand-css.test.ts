import { describe, expect, it } from 'vitest';
import { classifyRoles, luminance, mineCss, normalizeColor, saturation } from '@ove/ai';
import { mergeColorCounts, mergeFonts, parseWebsiteHtml, pickBrandRoutes } from '@ove/ai';

// Deep brand extraction: the pure evidence miners. A website's stylesheets and custom properties are the exact
// tokens the design system is written in — far stronger evidence than guessing from markup hex.
describe('normalizeColor', () => {
  it('normalizes every CSS colour notation to #rrggbb', () => {
    expect(normalizeColor('#5E6AD2')).toBe('#5e6ad2');
    expect(normalizeColor('#5e6ad2ff')).toBe('#5e6ad2');
    expect(normalizeColor('#5e6ad280')).toBeUndefined();       // translucent: not a brand token
    expect(normalizeColor('#F52')).toBe('#ff5522');
    expect(normalizeColor('rgb(94, 106, 210)')).toBe('#5e6ad2');
    expect(normalizeColor('rgb(94 106 210 / 0.9)')).toBe('#5e6ad2');
    expect(normalizeColor('rgba(94, 106, 210, 0.2)')).toBeUndefined();
    expect(normalizeColor('rgb(50% 0% 0%)')).toBe('#800000');
    expect(normalizeColor('hsl(240, 100%, 50%)')).toBe('#0000ff');
    expect(normalizeColor('hsl(120deg 100% 25%)')).toBe('#008000');
    expect(normalizeColor('transparent')).toBeUndefined();
    expect(normalizeColor('var(--mystery)')).toBeUndefined();
  });

  it('measures lightness and saturation for role classification', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1);
    expect(saturation('#ff0000')).toBe(1);
    expect(saturation('#808080')).toBe(0);
  });
});

describe('mineCss', () => {
  const css = `
    :root {
      --primary: #5e6ad2;
      --accent: rgb(236 72 153);
      --bg: #0b0e14;
      --ink: #f8fafc;
      --spacing: 24px;
    }
    body { background: var(--bg); color: var(--ink); font-family: "Inter", system-ui, sans-serif; }
    .hero h1 { color: #5e6ad2; border-color: rgba(94,106,210,0.4); font-family: "Space Grotesk", Inter; }
    .cta { background: hsl(330, 82%, 60%); border: 1px solid #1f2438; }
    .muted { color: #64748b; color: #64748b; }
    @font-face { font-family: "Space Grotesk"; font-weight: 700; src: url("/fonts/sg.woff2"); }
    /* a comment hiding #123456 should not count */`;

  it('ranks colours by use, with custom properties counted above stray uses', () => {
    const evidence = mineCss(css);
    const top = evidence.colors.slice(0, 4).map(sighting => sighting.color);
    expect(top).toContain('#5e6ad2');
    expect(top).toContain('#0b0e14');
    expect(top).toContain('#f8fafc');
    expect(evidence.colors.find(sighting => sighting.color === '#5e6ad2')!.source).toBe('css-variable');
    // The commented hex is stripped before mining.
    expect(evidence.colors.map(sighting => sighting.color)).not.toContain('#123456');
    // Non-colour custom properties are listed but never counted as colours.
    expect(evidence.customProperties).toContainEqual({ name: 'spacing', value: '24px' });
  });

  it('collects font families from stacks and @font-face, skipping generics', () => {
    const evidence = mineCss(css);
    // A family the site ships via @font-face is the strongest evidence of a brand face, so it outranks a single
    // stack mention.
    expect(evidence.fontFamilies[0]!.family).toBe('Space Grotesk');
    expect(evidence.fontFamilies.map(({ family }) => family)).toContain('Inter');
    expect(evidence.fontFaces).toEqual([{ family: 'Space Grotesk', weight: '700' }]);
    expect(evidence.fontFamilies.map(({ family }) => family)).not.toContain('sans-serif');
  });
});

describe('parseWebsiteHtml deep evidence', () => {
  const html = `
  <html><head>
    <title>Acme Inc - The Modern Data Cloud</title>
    <meta name="description" content="The fastest vector database.">
    <meta property="og:site_name" content="Acme">
    <meta name="theme-color" content="#5e6ad2">
    <link rel="icon" href="/favicon.svg">
    <link rel="stylesheet" href="/assets/app.css">
    <link rel="stylesheet" href="https://cdn.example.com/shared.css">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter&display=swap" rel="stylesheet">
    <style>
      :root { --brand: #5e6ad2; --surface: #0b0e14; }
      h1 { font-family: "Space Grotesk", sans-serif; color: var(--brand); }
      .cta { background: var(--brand); }
    </style>
  </head><body>
    <h1>Next-Generation Vector Search</h1>
    <h2>Sub-millisecond query latency at scale</h2>
    <p>Engineered for high-volume semantic queries with zero cold-starts.</p>
    <a href="/pricing">Pricing</a><a href="/blog/why-vectors">Blog</a><a href="https://other.site/x">Other</a>
  </body></html>`;

  it('mines style blocks for tokens, fonts and stylesheet links', () => {
    const parsed = parseWebsiteHtml(html, 'https://acme.io');
    expect(parsed.fonts).toContain('Space Grotesk');
    expect(parsed.fonts).toContain('Inter');
    expect(parsed.stylesheets).toContain('https://acme.io/assets/app.css');
    expect(parsed.stylesheets).toContain('https://cdn.example.com/shared.css');
    expect(parsed.colorCounts!.find(sighting => sighting.color === '#5e6ad2')!.source).toBe('css-variable');
    expect(parsed.roles!.background).toBe('#0b0e14');
    expect(parsed.roles!.primary).toBe('#5e6ad2');
    // The old shape still holds: colours stay plain hex strings, theme colour first.
    expect(parsed.colors[0]).toBe('#5e6ad2');
    expect(parsed.themeColor).toBe('#5e6ad2');
  });

  it('collects same-origin links for route discovery', () => {
    const parsed = parseWebsiteHtml(html, 'https://acme.io');
    expect(parsed.links).toContain('https://acme.io/pricing');
    expect(parsed.links).toContain('https://acme.io/blog/why-vectors');
    expect(parsed.links).not.toContain('https://other.site/x');
  });
});

describe('pickBrandRoutes', () => {
  it('picks the high-signal pages first, same origin only, deduplicated and capped', () => {
    const links = [
      'https://acme.io/', 'https://acme.io/pricing', 'https://acme.io/about',
      'https://acme.io/pricing',                                     // duplicate path
      'https://acme.io/blog/page/2',                                 // content page: second tier
      'https://cdn.acme.io/pricing',                                 // other origin
      'https://acme.io/product/vectors', 'https://acme.io/customers',
    ];
    expect(pickBrandRoutes(links, 'https://acme.io', 2)).toEqual(['https://acme.io/pricing', 'https://acme.io/about']);
    // First-tier routes (pricing, product, about) come before content pages, whatever the order on the page.
    expect(pickBrandRoutes(links, 'https://acme.io', 4)).toEqual(['https://acme.io/pricing', 'https://acme.io/about', 'https://acme.io/product/vectors', 'https://acme.io/blog/page/2']);
    expect(pickBrandRoutes(['https://acme.io/'], 'https://acme.io')).toEqual([]);
  });
});

describe('merge helpers', () => {
  it('sums colour counts and keeps the strongest source', () => {
    const merged = mergeColorCounts(
      [{ color: '#5e6ad2', count: 6, source: 'css-variable' }],
      [{ color: '#5e6ad2', count: 4, source: 'html' }, { color: '#ff5522', count: 3, source: 'stylesheet' }],
    );
    expect(merged).toEqual([
      { color: '#5e6ad2', count: 10, source: 'css-variable' },
      { color: '#ff5522', count: 3, source: 'stylesheet' },
    ]);
  });

  it('unions fonts in first-seen order', () => {
    expect(mergeFonts(['Inter', 'Space Grotesk'], ['Space Grotesk', 'Söhne'])).toEqual(['Inter', 'Space Grotesk', 'Söhne']);
  });
});

describe('classifyRoles', () => {
  it('assigns the roles the evidence suggests', () => {
    const roles = classifyRoles([
      { color: '#0b0e14', count: 30, source: 'stylesheet' },
      { color: '#f8fafc', count: 20, source: 'stylesheet' },
      { color: '#5e6ad2', count: 12, source: 'css-variable' },
      { color: '#ec4899', count: 8, source: 'stylesheet' },
      { color: '#64748b', count: 6, source: 'stylesheet' },
    ]);
    expect(roles.background).toBe('#0b0e14');
    expect(roles.text).toBe('#f8fafc');
    expect(roles.primary).toBe('#5e6ad2');
    expect(roles.accent).toBe('#ec4899');
    // A grey is not a brand colour, so secondary goes to the next vivid tone or stays empty.
    expect(roles.secondary).toBeUndefined();
  });
});
