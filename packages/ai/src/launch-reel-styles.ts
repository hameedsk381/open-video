import type { Layer } from '@ove/schema';
import type { ScrapedWebsite } from './brand-scraper';

type Scene = any;

export type LaunchReelStyle = 'keynote' | 'terminal' | 'editorial' | 'blueprint' | 'neon' | 'bento';

export interface StyleContext {
  style: LaunchReelStyle;
  targetName: string;
  brandColor: string;
  tagline: string;
  ctaText: string;
  displayUrl: string;
  features: [string, string, string];
  width: number;
  height: number;
  aspect: '9:16' | '16:9' | '1:1';
  fps: number;
  hasVoice: boolean;
}

export function detectArchetype(
  input: string,
  metadata: ScrapedWebsite | { name: string; brandColor: string },
  requestedStyle?: string
): LaunchReelStyle {
  if (requestedStyle) {
    const s = requestedStyle.toLowerCase().trim();
    if (['keynote', 'terminal', 'editorial', 'blueprint', 'neon', 'bento'].includes(s)) {
      return s as LaunchReelStyle;
    }
    if (s === 'hacker' || s === 'developer' || s === 'cli' || s === 'code') return 'terminal';
    if (s === 'paper' || s === 'swiss' || s === 'magazine' || s === 'light') return 'editorial';
    if (s === 'technical' || s === 'cad' || s === 'engineering' || s === 'schematic') return 'blueprint';
    if (s === 'cyber' || s === 'cyberpunk' || s === 'synthwave' || s === 'retro') return 'neon';
    if (s === 'apple' || s === 'linear' || s === 'dark') return 'keynote';
    if (s === 'grid' || s === 'modular' || s === 'saas') return 'bento';
  }

  const textToScan = [
    input,
    (metadata as any).title || '',
    (metadata as any).description || '',
    (metadata as any).siteName || '',
    ((metadata as any).headings || []).join(' '),
  ].join(' ').toLowerCase();

  if (/\b(terminal|cli|developer|api|sdk|git|github|infra|engine|rust|kernel|database|query|compiler|server|daemon|backend)\b/.test(textToScan)) {
    return 'terminal';
  }
  if (/\b(blueprint|cad|architecture|schematic|hardware|robotics|patent|civil|mechanical|drafting|circuit|engineering)\b/.test(textToScan)) {
    return 'blueprint';
  }
  if (/\b(editorial|magazine|journal|curated|luxury|craft|paper|book|heritage|fashion|interior|coffee|author|publishing)\b/.test(textToScan)) {
    return 'editorial';
  }
  if (/\b(neon|crypto|web3|nft|game|gaming|arcade|cyber|synth|vr|metaverse|drop|festival|music)\b/.test(textToScan)) {
    return 'neon';
  }
  if (/\b(bento|board|task|workspace|notion|collab|linear|saas|metrics|analytics|crm|pipeline|project)\b/.test(textToScan)) {
    return 'bento';
  }

  return 'keynote';
}

export function extractKeyFeatures(
  metadata: ScrapedWebsite | { name: string; brandColor: string },
  targetName: string,
  style: LaunchReelStyle
): [string, string, string] {
  const scraped = metadata as ScrapedWebsite;
  const candidates: string[] = [];

  if (scraped.headings && Array.isArray(scraped.headings)) {
    for (const h of scraped.headings) {
      const clean = h.trim().replace(/^[\d\W_]+/, '').replace(/[\r\n]+/g, ' ');
      if (
        clean.length >= 10 &&
        clean.length <= 45 &&
        !clean.toLowerCase().includes('cookie') &&
        !clean.toLowerCase().includes('sign in') &&
        !clean.toLowerCase().includes('log in') &&
        !clean.toLowerCase().includes('subscribe') &&
        !clean.toLowerCase().includes('navigation') &&
        !clean.toLowerCase().includes('menu') &&
        !candidates.includes(clean)
      ) {
        candidates.push(clean);
      }
    }
  }

  if (scraped.paragraphs && Array.isArray(scraped.paragraphs)) {
    for (const p of scraped.paragraphs) {
      const clean = p.trim().replace(/[\r\n]+/g, ' ');
      const sentence = clean.split(/[.!?]/)[0]?.trim() || '';
      if (sentence.length >= 14 && sentence.length <= 42 && !candidates.includes(sentence)) {
        candidates.push(sentence);
      }
    }
  }

  const fallbacksByStyle: Record<LaunchReelStyle, [string, string, string]> = {
    keynote: [
      'Precision-Engineered Architecture',
      'Designed for High-Velocity Teams',
      'Zero Setup, Production Ready',
    ],
    terminal: [
      'Deterministic Sub-Millisecond Core',
      'Zero-Config CLI & Autonomous Agents',
      'Local-First, Self-Hosted Infrastructure',
    ],
    editorial: [
      'Crafted with Obsessive Restraint',
      'Thoughtful Geometry at Every Scale',
      'Timeless Design Meets Modern Speed',
    ],
    blueprint: [
      'Precision Component Topology',
      'Fault-Tolerant Modular Architecture',
      'Verified Production Specifications',
    ],
    neon: [
      'Hyper-Speed Neural Execution Engine',
      'Autonomous Real-Time Motion Sync',
      'Ultra-Vibrant Visual Choreography',
    ],
    bento: [
      'Intelligent Workflow Automation',
      'Unified High-Density Dashboard',
      'Built-in Enterprise Scalability',
    ],
  };

  const defaultList = fallbacksByStyle[style] || fallbacksByStyle.keynote;
  return [
    candidates[0] || defaultList[0],
    candidates[1] || defaultList[1],
    candidates[2] || defaultList[2],
  ];
}

/**
 * Builds the composition background according to the chosen archetype.
 */
export function getStyleBackground(style: LaunchReelStyle, width: number, height: number, brandColor: string): any {
  switch (style) {
    case 'editorial':
      return {
        type: 'linear',
        from: [0, 0],
        to: [0, height],
        stops: [
          { offset: 0, color: '#faf7f2' },
          { offset: 0.5, color: '#f5f0e6' },
          { offset: 1, color: '#ede5d8' },
        ],
      };
    case 'blueprint':
      return {
        type: 'linear',
        from: [0, 0],
        to: [width, height],
        stops: [
          { offset: 0, color: '#092552' },
          { offset: 0.6, color: '#061a3b' },
          { offset: 1, color: '#030f24' },
        ],
      };
    case 'terminal':
      return {
        type: 'linear',
        from: [0, 0],
        to: [0, height],
        stops: [
          { offset: 0, color: '#040807' },
          { offset: 0.5, color: '#020403' },
          { offset: 1, color: '#010202' },
        ],
      };
    case 'neon':
      return {
        type: 'linear',
        from: [0, 0],
        to: [width, height],
        stops: [
          { offset: 0, color: '#0c051a' },
          { offset: 0.5, color: '#070210' },
          { offset: 1, color: '#020005' },
        ],
      };
    case 'bento':
      return {
        type: 'linear',
        from: [0, 0],
        to: [width, height],
        stops: [
          { offset: 0, color: '#0d131f' },
          { offset: 0.5, color: '#080c14' },
          { offset: 1, color: '#030508' },
        ],
      };
    case 'keynote':
    default:
      return {
        type: 'linear',
        from: [0, 0],
        to: [width, height],
        stops: [
          { offset: 0, color: '#0c0e14' },
          { offset: 0.5, color: '#06070a' },
          { offset: 1, color: '#020304' },
        ],
      };
  }
}

/**
 * Creates an interactive simulated cursor with movement, hover, and click ripple.
 */
function createSimulatedCursor(width: number, height: number, brandColor: string): Layer {
  const isVertical = height > width;
  const startX = width * 0.28;
  const targetX = width * 0.50;
  const startY = isVertical ? height * 0.62 : height * 0.68;
  const targetY = isVertical ? height * 0.46 : height * 0.48;

  return {
    type: 'group',
    id: 'simulated-cursor',
    x: startX,
    y: startY,
    width: 36,
    height: 36,
    animations: [
      {
        property: 'x',
        keyframes: [
          { frame: 10, value: startX },
          { frame: 45, value: targetX, easing: 'glide' },
          { frame: 75, value: targetX },
          { frame: 110, value: width * 0.72, easing: 'glide' },
        ],
      },
      {
        property: 'y',
        keyframes: [
          { frame: 10, value: startY },
          { frame: 45, value: targetY, easing: 'glide' },
          { frame: 75, value: targetY },
          { frame: 110, value: height * 0.58, easing: 'glide' },
        ],
      },
      {
        property: 'scale',
        keyframes: [
          { frame: 46, value: 1 },
          { frame: 50, value: 0.82, easing: 'pop' },
          { frame: 56, value: 1, easing: 'pop' },
        ],
      },
      {
        property: 'opacity',
        keyframes: [
          { frame: 5, value: 0 },
          { frame: 15, value: 1, easing: 'pop' },
          { frame: 115, value: 1 },
          { frame: 130, value: 0, easing: 'linear' },
        ],
      },
    ],
    children: [
      {
        type: 'path',
        id: 'cur-arrow',
        d: 'M0 0 L0 22 L6 16 L11 26 L14 24 L9 15 L16 15 Z',
        fill: '#ffffff',
        stroke: '#000000',
        strokeWidth: 2,
      },
      {
        type: 'circle',
        id: 'cur-ripple',
        x: -16,
        y: -16,
        width: 32,
        height: 32,
        fill: 'transparent',
        stroke: brandColor,
        strokeWidth: 2.5,
        animations: [
          { property: 'opacity', keyframes: [{ frame: 48, value: 0 }, { frame: 50, value: 0.9 }, { frame: 68, value: 0 }] },
          { property: 'scale', keyframes: [{ frame: 48, value: 0.3 }, { frame: 68, value: 2.4, easing: 'land' }] },
        ],
      },
    ],
  };
}

/**
 * Creates a specular light sheen sweep across a glass product card.
 */
function createLightSheen(cardW: number, cardH: number): Layer {
  return {
    type: 'rect',
    id: 'specular-sheen',
    x: -cardW * 0.6,
    y: 0,
    width: cardW * 0.45,
    height: cardH,
    radius: 24,
    fill: {
      type: 'linear',
      from: [0, 0],
      to: [cardW * 0.45, 0],
      stops: [
        { offset: 0, color: 'rgba(255, 255, 255, 0)' },
        { offset: 0.5, color: 'rgba(255, 255, 255, 0.16)' },
        { offset: 1, color: 'rgba(255, 255, 255, 0)' },
      ],
    },
    animations: [
      { property: 'x', keyframes: [{ frame: 15, value: -cardW * 0.5 }, { frame: 60, value: cardW * 1.4, easing: 'land' }] },
      { property: 'opacity', keyframes: [{ frame: 15, value: 0 }, { frame: 25, value: 1 }, { frame: 60, value: 0 }] },
    ],
  };
}

/**
 * Builds archetype-specific scenes with custom layouts, typography, and motion grammar.
 */
export function buildArchetypeScenes(ctx: StyleContext): Scene[] {
  switch (ctx.style) {
    case 'terminal':
      return buildTerminalScenes(ctx);
    case 'editorial':
      return buildEditorialScenes(ctx);
    case 'blueprint':
      return buildBlueprintScenes(ctx);
    case 'neon':
      return buildNeonScenes(ctx);
    case 'bento':
      return buildBentoScenes(ctx);
    case 'keynote':
    default:
      return buildKeynoteScenes(ctx);
  }
}

/* ========================================================================= */
/* 1. KEYNOTE (Apple / Linear Precision Style)                                */
/* ========================================================================= */
function buildKeynoteScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, brandColor, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const cardW = isVertical ? width * 0.88 : width * 0.70;
  const cardH = isVertical ? height * 0.46 : height * 0.64;

  return [
    // BEAT 1: HOOK (0 - 105 frames / 3.5s)
    {
      id: 'scene-hook',
      name: 'Keynote Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 0.96 }, { frame: 105, value: 1.04, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-h-whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 2, volume: 0.35 },
        // Precision ambient glow
        {
          type: 'circle',
          id: 'k-glow',
          x: width / 2 - (width * 0.35),
          y: height * 0.4 - (width * 0.35),
          width: width * 0.7,
          height: width * 0.7,
          fill: brandColor,
          opacity: 0.20,
          blur: 90,
        },
        // Minimal badge pill
        {
          type: 'group',
          id: 'k-badge',
          x: width / 2 - (isVertical ? 175 : 220),
          y: isVertical ? height * 0.25 : height * 0.18,
          width: isVertical ? 350 : 440,
          height: isVertical ? 48 : 54,
          animations: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 15, value: 1, easing: 'pop' }] },
          ],
          children: [
            {
              type: 'rect',
              id: 'k-badge-bg',
              x: 0,
              y: 0,
              width: isVertical ? 350 : 440,
              height: isVertical ? 48 : 54,
              radius: 27,
              fill: 'rgba(255, 255, 255, 0.05)',
              stroke: 'rgba(255, 255, 255, 0.14)',
              strokeWidth: 1.5,
            },
            {
              type: 'text',
              id: 'k-badge-txt',
              content: `✦ INTRODUCING ${targetName.toUpperCase()}`,
              x: isVertical ? 24 : 36,
              y: isVertical ? 14 : 16,
              fontSize: isVertical ? 20 : 22,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: brandColor,
              letterSpacing: 1.5,
            },
          ],
        },
        // Kinetic Split Headline
        {
          type: 'text',
          id: 'k-headline',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.35 : height * 0.32,
          width: isVertical ? 900 : 1400,
          maxWidth: isVertical ? 900 : 1400,
          fontSize: isVertical ? 76 : 96,
          fontWeight: 800,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#f8fafc',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'rise',
            stagger: 2,
            duration: 16,
          },
        },
        // Kinetic Split Subtitle
        {
          type: 'text',
          id: 'k-sub',
          content: tagline.length > 55 ? tagline.slice(0, 55).replace(/\s+\S*$/, '…') : tagline,
          x: width / 2,
          y: isVertical ? height * 0.49 : height * 0.50,
          width: isVertical ? 840 : 1200,
          maxWidth: isVertical ? 840 : 1200,
          fontSize: isVertical ? 28 : 34,
          fontWeight: 500,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#94a3b8',
          textAlign: 'center',
          lineHeight: 1.35,
          split: {
            by: 'words',
            preset: 'blur',
            stagger: 2,
            duration: 14,
          },
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames / 4.5s)
    {
      id: 'scene-reveal',
      name: 'Keynote Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-r-impact', type: 'audio', src: 'sfx:impact', startFrame: 5, volume: 0.3 },
        { id: 'sfx-cursor-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.28 },
        {
          type: 'circle',
          id: 'k-rev-glow',
          x: width / 2 - (width * 0.45),
          y: height / 2 - (width * 0.45),
          width: width * 0.9,
          height: width * 0.9,
          fill: brandColor,
          opacity: 0.16,
          blur: 110,
        },
        // Screenshot Card with Specular Sheen
        {
          type: 'group',
          id: 'k-product-card',
          x: (width - cardW) / 2,
          y: (height - cardH) / 2,
          width: cardW,
          height: cardH,
          animations: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 1, easing: 'pop' }] },
            { property: 'scale', keyframes: [{ frame: 0, value: 0.92 }, { frame: 25, value: 1, easing: 'land' }] },
          ],
          children: [
            {
              type: 'rect',
              id: 'k-product-bg',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              radius: 24,
              fill: '#0f172a',
              stroke: 'rgba(255, 255, 255, 0.16)',
              strokeWidth: 2,
            },
            {
              type: 'image',
              id: 'k-product-img',
              src: 'app-screenshot',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              objectFit: 'cover',
              radius: 24,
            },
            createLightSheen(cardW, cardH),
          ],
        },
        createSimulatedCursor(width, height, brandColor),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames / 4.0s)
    {
      id: 'scene-features',
      name: 'Keynote Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-f-pop', type: 'audio', src: 'sfx:pop', startFrame: 5, volume: 0.3 },
        ...features.map((feat, idx) => {
          const itemY = isVertical ? height * (0.28 + idx * 0.16) : height * (0.24 + idx * 0.18);
          const fWidth = isVertical ? 760 : 920;
          return {
            type: 'group',
            id: `k-feat-${idx + 1}`,
            x: width / 2 - fWidth / 2,
            y: itemY,
            width: fWidth,
            height: 104,
            animations: [
              { property: 'opacity', keyframes: [{ frame: idx * 12, value: 0 }, { frame: idx * 12 + 15, value: 1, easing: 'pop' }] },
              { property: 'x', keyframes: [{ frame: idx * 12, value: width / 2 - fWidth / 2 - 30 }, { frame: idx * 12 + 15, value: width / 2 - fWidth / 2, easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: `k-f${idx + 1}-bg`,
                x: 0,
                y: 0,
                width: fWidth,
                height: 104,
                radius: 20,
                fill: 'rgba(15, 23, 42, 0.88)',
                stroke: 'rgba(255, 255, 255, 0.12)',
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: `k-f${idx + 1}-num`,
                content: `0${idx + 1}`,
                x: 28,
                y: 36,
                fontSize: 24,
                fontWeight: 800,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: brandColor,
              },
              {
                type: 'text',
                id: `k-f${idx + 1}-txt`,
                content: feat,
                x: 88,
                y: 38,
                fontSize: 24,
                fontWeight: 600,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#f8fafc',
                maxWidth: fWidth - 140,
                split: {
                  by: 'words',
                  preset: 'rise',
                  stagger: 1,
                  duration: 14,
                },
              },
            ],
          } as Layer;
        }),
      ],
    },

    // BEAT 4: CTA (360 - 450 frames / 3.0s)
    {
      id: 'scene-cta',
      name: 'Keynote CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 0.96 }, { frame: 90, value: 1.02, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-c-shimmer', type: 'audio', src: 'sfx:shimmer', startFrame: 5, volume: 0.3 },
        {
          type: 'circle',
          id: 'k-cta-glow',
          x: width / 2 - (width * 0.4),
          y: height * 0.48 - (width * 0.4),
          width: width * 0.8,
          height: width * 0.8,
          fill: brandColor,
          opacity: 0.22,
          blur: 90,
        },
        {
          type: 'text',
          id: 'k-cta-title',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.34 : height * 0.30,
          width: isVertical ? 900 : 1200,
          maxWidth: isVertical ? 900 : 1200,
          fontSize: isVertical ? 64 : 84,
          fontWeight: 800,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#f8fafc',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'pop',
            stagger: 2,
            duration: 18,
          },
        },
        {
          type: 'group',
          id: 'k-cta-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.54 : height * 0.55,
          width: isVertical ? 380 : 440,
          height: isVertical ? 72 : 80,
          animations: [
            { property: 'opacity', keyframes: [{ frame: 20, value: 0 }, { frame: 35, value: 1, easing: 'pop' }] },
            { property: 'scale', keyframes: [{ frame: 20, value: 0.85 }, { frame: 35, value: 1, easing: 'land' }] },
          ],
          children: [
            {
              type: 'rect',
              id: 'k-cta-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: isVertical ? 72 : 80,
              radius: 36,
              fill: brandColor,
            },
            {
              type: 'text',
              id: 'k-cta-btn-txt',
              content: `${ctaText}  →`,
              x: isVertical ? 75 : 100,
              y: isVertical ? 24 : 26,
              fontSize: isVertical ? 22 : 26,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#020617',
            },
          ],
        },
        {
          type: 'text',
          id: 'k-cta-url',
          content: displayUrl,
          x: width / 2,
          y: isVertical ? height * 0.65 : height * 0.70,
          width: isVertical ? 800 : 1000,
          maxWidth: isVertical ? 800 : 1000,
          fontSize: 22,
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#64748b',
          textAlign: 'center',
        },
      ],
    },
  ];
}

/* ========================================================================= */
/* 2. TERMINAL (Hacker / Developer / Infra Style)                            */
/* ========================================================================= */
function buildTerminalScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const termW = isVertical ? width * 0.90 : width * 0.76;
  const termH = isVertical ? height * 0.48 : height * 0.66;
  const phosphorGreen = '#10b981';
  const phosphorCyan = '#06b6d4';

  return [
    // BEAT 1: HOOK (0 - 105 frames)
    {
      id: 'scene-hook',
      name: 'Terminal Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 0.97 }, { frame: 105, value: 1.03, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-t-click', type: 'audio', src: 'sfx:click', startFrame: 2, volume: 0.4 },
        // Terminal Window Chrome Frame
        {
          type: 'group',
          id: 't-window-frame',
          x: width / 2 - termW / 2,
          y: isVertical ? height * 0.20 : height * 0.16,
          width: termW,
          height: isVertical ? 420 : 360,
          animations: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 15, value: 1, easing: 'pop' }] },
          ],
          children: [
            {
              type: 'rect',
              id: 't-win-bg',
              x: 0,
              y: 0,
              width: termW,
              height: isVertical ? 420 : 360,
              radius: 14,
              fill: 'rgba(6, 12, 10, 0.95)',
              stroke: 'rgba(16, 185, 129, 0.35)',
              strokeWidth: 1.5,
            },
            // Title bar
            {
              type: 'rect',
              id: 't-win-bar',
              x: 0,
              y: 0,
              width: termW,
              height: 44,
              radius: 14,
              fill: 'rgba(16, 185, 129, 0.08)',
            },
            // Window buttons
            { type: 'circle', id: 't-btn-r', x: 20, y: 16, width: 12, height: 12, fill: '#ef4444' },
            { type: 'circle', id: 't-btn-y', x: 40, y: 16, width: 12, height: 12, fill: '#f59e0b' },
            { type: 'circle', id: 't-btn-g', x: 60, y: 16, width: 12, height: 12, fill: '#10b981' },
            {
              type: 'text',
              id: 't-win-title',
              content: `bash — 80x24 — ./deploy.sh`,
              x: 90,
              y: 12,
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'Consolas, monospace',
              color: 'rgba(255, 255, 255, 0.4)',
            },
            // Terminal Prompt Content
            {
              type: 'text',
              id: 't-prompt-1',
              content: `$ sys.init --target ${targetName.toLowerCase()}`,
              x: 28,
              y: 72,
              fontSize: isVertical ? 22 : 26,
              fontWeight: 700,
              fontFamily: 'Consolas, monospace',
              color: phosphorCyan,
            },
            {
              type: 'text',
              id: 't-prompt-status',
              content: `[ 200 OK ] CORE_SUBSYSTEM_MOUNTED`,
              x: 28,
              y: isVertical ? 120 : 124,
              fontSize: 20,
              fontWeight: 600,
              fontFamily: 'Consolas, monospace',
              color: phosphorGreen,
              animations: [
                { property: 'opacity', keyframes: [{ frame: 15, value: 0 }, { frame: 25, value: 1, easing: 'pop' }] },
              ],
            },
            {
              type: 'text',
              id: 't-prompt-headline',
              content: `> ${targetName.toUpperCase()}`,
              x: 28,
              y: isVertical ? 175 : 180,
              fontSize: isVertical ? 48 : 58,
              fontWeight: 800,
              fontFamily: 'Consolas, monospace',
              color: '#ffffff',
              split: {
                by: 'letters',
                preset: 'typewriter',
                stagger: 1,
              },
            },
            {
              type: 'text',
              id: 't-prompt-sub',
              content: `// ${tagline.slice(0, 48)}`,
              x: 28,
              y: isVertical ? 260 : 265,
              fontSize: isVertical ? 20 : 22,
              fontWeight: 500,
              fontFamily: 'Consolas, monospace',
              color: '#94a3b8',
              maxWidth: termW - 56,
              split: {
                by: 'words',
                preset: 'rise',
                stagger: 2,
                duration: 12,
              },
            },
            // Blinking cursor
            {
              type: 'rect',
              id: 't-cursor',
              x: isVertical ? 320 : 380,
              y: isVertical ? 180 : 185,
              width: 16,
              height: isVertical ? 42 : 50,
              fill: phosphorGreen,
              animations: [
                { property: 'opacity', keyframes: [{ frame: 0, value: 1 }, { frame: 20, value: 0 }, { frame: 40, value: 1 }, { frame: 60, value: 0 }, { frame: 80, value: 1 }] },
              ],
            },
          ],
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames)
    {
      id: 'scene-reveal',
      name: 'Terminal Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-t-whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 2, volume: 0.35 },
        { id: 'sfx-t-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.3 },
        // Developer IDE Frame
        {
          type: 'group',
          id: 't-product-frame',
          x: (width - termW) / 2,
          y: (height - termH) / 2,
          width: termW,
          height: termH,
          animations: [
            { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 1, easing: 'pop' }] },
            { property: 'scale', keyframes: [{ frame: 0, value: 0.93 }, { frame: 25, value: 1, easing: 'land' }] },
          ],
          children: [
            {
              type: 'rect',
              id: 't-ide-bg',
              x: 0,
              y: 0,
              width: termW,
              height: termH,
              radius: 14,
              fill: '#050a08',
              stroke: phosphorGreen,
              strokeWidth: 1.5,
            },
            {
              type: 'image',
              id: 't-ide-img',
              src: 'app-screenshot',
              x: 0,
              y: 42,
              width: termW,
              height: termH - 42,
              objectFit: 'cover',
              radius: 12,
            },
            // Chrome bar
            {
              type: 'rect',
              id: 't-ide-header',
              x: 0,
              y: 0,
              width: termW,
              height: 42,
              radius: 12,
              fill: 'rgba(16, 185, 129, 0.12)',
            },
            {
              type: 'text',
              id: 't-ide-tab',
              content: `[VIEWPORT] ${targetName.toLowerCase()}.local`,
              x: 24,
              y: 10,
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'Consolas, monospace',
              color: phosphorGreen,
            },
            createLightSheen(termW, termH),
          ],
        },
        createSimulatedCursor(width, height, phosphorGreen),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames)
    {
      id: 'scene-features',
      name: 'Terminal Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-t-pop', type: 'audio', src: 'sfx:pop', startFrame: 5, volume: 0.35 },
        ...features.map((feat, idx) => {
          const itemY = isVertical ? height * (0.28 + idx * 0.16) : height * (0.24 + idx * 0.18);
          const fWidth = isVertical ? 780 : 940;
          return {
            type: 'group',
            id: `t-feat-${idx + 1}`,
            x: width / 2 - fWidth / 2,
            y: itemY,
            width: fWidth,
            height: 96,
            animations: [
              { property: 'opacity', keyframes: [{ frame: idx * 12, value: 0 }, { frame: idx * 12 + 15, value: 1, easing: 'pop' }] },
              { property: 'x', keyframes: [{ frame: idx * 12, value: width / 2 - fWidth / 2 - 25 }, { frame: idx * 12 + 15, value: width / 2 - fWidth / 2, easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: `t-f${idx + 1}-bg`,
                x: 0,
                y: 0,
                width: fWidth,
                height: 96,
                radius: 10,
                fill: 'rgba(6, 14, 11, 0.95)',
                stroke: 'rgba(16, 185, 129, 0.3)',
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: `t-f${idx + 1}-tag`,
                content: `[STATUS: 200]`,
                x: 24,
                y: 35,
                fontSize: 20,
                fontWeight: 700,
                fontFamily: 'Consolas, monospace',
                color: phosphorGreen,
              },
              {
                type: 'text',
                id: `t-f${idx + 1}-txt`,
                content: feat,
                x: 180,
                y: 34,
                fontSize: 22,
                fontWeight: 600,
                fontFamily: 'Consolas, monospace',
                color: '#ffffff',
                maxWidth: fWidth - 210,
                split: {
                  by: 'words',
                  preset: 'rise',
                  stagger: 1,
                  duration: 12,
                },
              },
            ],
          } as Layer;
        }),
      ],
    },

    // BEAT 4: CTA (360 - 450 frames)
    {
      id: 'scene-cta',
      name: 'Terminal CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-t-ding', type: 'audio', src: 'sfx:ding', startFrame: 5, volume: 0.35 },
        // Command snippet box
        {
          type: 'group',
          id: 't-cta-box',
          x: width / 2 - (isVertical ? 420 : 500),
          y: isVertical ? height * 0.32 : height * 0.30,
          width: isVertical ? 840 : 1000,
          height: 120,
          children: [
            {
              type: 'rect',
              id: 't-cta-bg',
              x: 0,
              y: 0,
              width: isVertical ? 840 : 1000,
              height: 120,
              radius: 12,
              fill: 'rgba(6, 14, 11, 0.95)',
              stroke: phosphorCyan,
              strokeWidth: 2,
            },
            {
              type: 'text',
              id: 't-cta-cmd',
              content: `$ npx ${targetName.toLowerCase()}@latest`,
              x: 36,
              y: 44,
              fontSize: isVertical ? 28 : 34,
              fontWeight: 700,
              fontFamily: 'Consolas, monospace',
              color: phosphorCyan,
              split: {
                by: 'letters',
                preset: 'typewriter',
                stagger: 1,
              },
            },
          ],
        },
        // Action Button
        {
          type: 'group',
          id: 't-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.52 : height * 0.52,
          width: isVertical ? 380 : 440,
          height: isVertical ? 70 : 76,
          children: [
            {
              type: 'rect',
              id: 't-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: isVertical ? 70 : 76,
              radius: 8,
              fill: phosphorGreen,
            },
            {
              type: 'text',
              id: 't-btn-txt',
              content: `[ ${ctaText.toUpperCase()} ]`,
              x: isVertical ? 65 : 90,
              y: isVertical ? 22 : 24,
              fontSize: isVertical ? 22 : 24,
              fontWeight: 800,
              fontFamily: 'Consolas, monospace',
              color: '#020617',
            },
          ],
        },
        {
          type: 'text',
          id: 't-url',
          content: `// ${displayUrl}`,
          x: width / 2,
          y: isVertical ? height * 0.65 : height * 0.68,
          width: 800,
          maxWidth: 800,
          fontSize: 20,
          fontWeight: 600,
          fontFamily: 'Consolas, monospace',
          color: '#64748b',
          textAlign: 'center',
        },
      ],
    },
  ];
}

/* ========================================================================= */
/* 3. EDITORIAL (Swiss / Magazine / Warm Paper Style)                        */
/* ========================================================================= */
function buildEditorialScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const cardW = isVertical ? width * 0.88 : width * 0.70;
  const cardH = isVertical ? height * 0.46 : height * 0.64;
  const inkDark = '#18181b';
  const terracotta = '#c2410c';

  return [
    // BEAT 1: HOOK (0 - 105 frames)
    {
      id: 'scene-hook',
      name: 'Editorial Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 0.98 }, { frame: 105, value: 1.03, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-e-whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 2, volume: 0.3 },
        // Editorial Masthead Label
        {
          type: 'text',
          id: 'e-volume',
          content: `ISSUE N° 01 — ARCHIVE EDITION`,
          x: width / 2,
          y: isVertical ? height * 0.22 : height * 0.18,
          width: 800,
          maxWidth: 800,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
          color: terracotta,
          letterSpacing: 3,
          textAlign: 'center',
        },
        // Hairline rule
        {
          type: 'rect',
          id: 'e-rule',
          x: width / 2 - (isVertical ? 200 : 300),
          y: isVertical ? height * 0.26 : height * 0.22,
          width: isVertical ? 400 : 600,
          height: 1,
          fill: '#d6cfc4',
        },
        // Serif Title with Blur Split
        {
          type: 'text',
          id: 'e-title',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.33 : height * 0.30,
          width: isVertical ? 900 : 1400,
          maxWidth: isVertical ? 900 : 1400,
          fontSize: isVertical ? 80 : 100,
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          color: inkDark,
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'blur',
            stagger: 3,
            duration: 18,
          },
        },
        // Italicized Subtitle
        {
          type: 'text',
          id: 'e-sub',
          content: `"${tagline.slice(0, 52)}"`,
          x: width / 2,
          y: isVertical ? height * 0.49 : height * 0.49,
          width: isVertical ? 840 : 1100,
          maxWidth: isVertical ? 840 : 1100,
          fontSize: isVertical ? 28 : 34,
          fontWeight: 400,
          fontStyle: 'italic',
          fontFamily: 'Georgia, serif',
          color: '#57534e',
          textAlign: 'center',
          lineHeight: 1.35,
          split: {
            by: 'words',
            preset: 'rise',
            stagger: 2,
            duration: 14,
          },
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames)
    {
      id: 'scene-reveal',
      name: 'Editorial Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-e-impact', type: 'audio', src: 'sfx:impact', startFrame: 5, volume: 0.25 },
        { id: 'sfx-e-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.25 },
        // Art-directed plate frame
        {
          type: 'group',
          id: 'e-plate',
          x: (width - cardW) / 2,
          y: (height - cardH) / 2,
          width: cardW,
          height: cardH,
          children: [
            {
              type: 'rect',
              id: 'e-plate-shadow',
              x: 12,
              y: 12,
              width: cardW,
              height: cardH,
              radius: 8,
              fill: 'rgba(0,0,0,0.08)',
            },
            {
              type: 'rect',
              id: 'e-plate-bg',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              radius: 8,
              fill: '#ffffff',
              stroke: '#e7e2d8',
              strokeWidth: 2,
            },
            {
              type: 'image',
              id: 'e-plate-img',
              src: 'app-screenshot',
              x: 8,
              y: 8,
              width: cardW - 16,
              height: cardH - 16,
              objectFit: 'cover',
              radius: 6,
            },
            createLightSheen(cardW, cardH),
          ],
        },
        // Plate caption
        {
          type: 'text',
          id: 'e-plate-cap',
          content: `PLATE 01 — ${targetName.toUpperCase()} ARCHITECTURE`,
          x: (width - cardW) / 2,
          y: (height + cardH) / 2 + 20,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'system-ui, sans-serif',
          color: '#78716c',
          letterSpacing: 2,
        },
        createSimulatedCursor(width, height, terracotta),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames)
    {
      id: 'scene-features',
      name: 'Editorial Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-e-pop', type: 'audio', src: 'sfx:pop', startFrame: 5, volume: 0.25 },
        ...features.map((feat, idx) => {
          const itemY = isVertical ? height * (0.28 + idx * 0.16) : height * (0.24 + idx * 0.18);
          const fWidth = isVertical ? 760 : 920;
          const roman = ['I', 'II', 'III'][idx];
          return {
            type: 'group',
            id: `e-feat-${idx + 1}`,
            x: width / 2 - fWidth / 2,
            y: itemY,
            width: fWidth,
            height: 100,
            children: [
              {
                type: 'rect',
                id: `e-f${idx + 1}-bg`,
                x: 0,
                y: 0,
                width: fWidth,
                height: 100,
                radius: 6,
                fill: '#ffffff',
                stroke: '#ded7cb',
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: `e-f${idx + 1}-num`,
                content: `${roman}.`,
                x: 32,
                y: 34,
                fontSize: 26,
                fontWeight: 700,
                fontFamily: 'Georgia, serif',
                color: terracotta,
              },
              {
                type: 'text',
                id: `e-f${idx + 1}-txt`,
                content: feat,
                x: 96,
                y: 36,
                fontSize: 24,
                fontWeight: 600,
                fontFamily: 'Georgia, serif',
                color: inkDark,
                maxWidth: fWidth - 130,
                split: {
                  by: 'words',
                  preset: 'rise',
                  stagger: 1,
                  duration: 14,
                },
              },
            ],
          } as Layer;
        }),
      ],
    },

    // BEAT 4: CTA (360 - 450 frames)
    {
      id: 'scene-cta',
      name: 'Editorial CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-e-shimmer', type: 'audio', src: 'sfx:shimmer', startFrame: 5, volume: 0.25 },
        {
          type: 'text',
          id: 'e-cta-title',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.34 : height * 0.30,
          width: isVertical ? 900 : 1200,
          maxWidth: isVertical ? 900 : 1200,
          fontSize: isVertical ? 72 : 92,
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          color: inkDark,
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'pop',
            stagger: 2,
            duration: 18,
          },
        },
        // Monogram button
        {
          type: 'group',
          id: 'e-cta-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.54 : height * 0.55,
          width: isVertical ? 380 : 440,
          height: isVertical ? 72 : 78,
          children: [
            {
              type: 'rect',
              id: 'e-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: isVertical ? 72 : 78,
              radius: 4,
              fill: inkDark,
            },
            {
              type: 'text',
              id: 'e-btn-txt',
              content: `${ctaText.toUpperCase()}  →`,
              x: isVertical ? 65 : 85,
              y: isVertical ? 25 : 27,
              fontSize: 22,
              fontWeight: 700,
              fontFamily: 'system-ui, sans-serif',
              letterSpacing: 2,
              color: '#faf7f2',
            },
          ],
        },
        {
          type: 'text',
          id: 'e-url',
          content: displayUrl,
          x: width / 2,
          y: isVertical ? height * 0.66 : height * 0.70,
          width: 800,
          maxWidth: 800,
          fontSize: 20,
          fontWeight: 500,
          fontFamily: 'Georgia, serif',
          fontStyle: 'italic',
          color: '#78716c',
          textAlign: 'center',
        },
      ],
    },
  ];
}

/* ========================================================================= */
/* 4. BLUEPRINT (Engineering / Technical Drawing Style)                      */
/* ========================================================================= */
function buildBlueprintScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const bpW = isVertical ? width * 0.88 : width * 0.72;
  const bpH = isVertical ? height * 0.46 : height * 0.64;
  const cyanBlueprint = '#38bdf8';
  const draftingAmber = '#facc15';

  return [
    // BEAT 1: HOOK (0 - 105 frames)
    {
      id: 'scene-hook',
      name: 'Blueprint Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-b-whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 2, volume: 0.35 },
        // Technical Header Bar
        {
          type: 'rect',
          id: 'bp-grid-h',
          x: 40,
          y: isVertical ? height * 0.20 : height * 0.16,
          width: width - 80,
          height: 2,
          fill: 'rgba(56, 189, 248, 0.4)',
        },
        {
          type: 'text',
          id: 'bp-spec-tag',
          content: `// DWG NO. 001-REV_B • SCALE: 1:1 • ARCHITECTURE SPEC`,
          x: 48,
          y: isVertical ? height * 0.22 : height * 0.18,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'Consolas, monospace',
          color: cyanBlueprint,
        },
        // Blueprint Title
        {
          type: 'text',
          id: 'bp-title',
          content: targetName.toUpperCase(),
          x: width / 2,
          y: isVertical ? height * 0.34 : height * 0.32,
          width: isVertical ? 900 : 1300,
          maxWidth: isVertical ? 900 : 1300,
          fontSize: isVertical ? 72 : 92,
          fontWeight: 800,
          fontFamily: 'Consolas, monospace',
          color: '#ffffff',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'fade',
            stagger: 2,
            duration: 14,
          },
        },
        // Subtitle
        {
          type: 'text',
          id: 'bp-sub',
          content: `[ SPEC: ${tagline.slice(0, 50)} ]`,
          x: width / 2,
          y: isVertical ? height * 0.48 : height * 0.48,
          width: isVertical ? 800 : 1100,
          maxWidth: isVertical ? 800 : 1100,
          fontSize: isVertical ? 24 : 30,
          fontWeight: 600,
          fontFamily: 'Consolas, monospace',
          color: cyanBlueprint,
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'rise',
            stagger: 2,
            duration: 14,
          },
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames)
    {
      id: 'scene-reveal',
      name: 'Blueprint Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-b-impact', type: 'audio', src: 'sfx:impact', startFrame: 5, volume: 0.3 },
        { id: 'sfx-bp-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.28 },
        {
          type: 'group',
          id: 'bp-frame',
          x: (width - bpW) / 2,
          y: (height - bpH) / 2,
          width: bpW,
          height: bpH,
          children: [
            {
              type: 'rect',
              id: 'bp-box',
              x: 0,
              y: 0,
              width: bpW,
              height: bpH,
              radius: 4,
              fill: 'rgba(9, 37, 82, 0.8)',
              stroke: cyanBlueprint,
              strokeWidth: 2,
              strokeDash: [12, 6],
            },
            {
              type: 'image',
              id: 'bp-img',
              src: 'app-screenshot',
              x: 12,
              y: 12,
              width: bpW - 24,
              height: bpH - 24,
              objectFit: 'cover',
            },
            createLightSheen(bpW, bpH),
          ],
        },
        {
          type: 'text',
          id: 'bp-dim',
          content: `<--- 1920 PX DIMENSION --->`,
          x: width / 2,
          y: (height + bpH) / 2 + 16,
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'Consolas, monospace',
          color: cyanBlueprint,
          textAlign: 'center',
        },
        createSimulatedCursor(width, height, cyanBlueprint),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames)
    {
      id: 'scene-features',
      name: 'Blueprint Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-b-tick', type: 'audio', src: 'sfx:tick', startFrame: 5, volume: 0.35 },
        ...features.map((feat, idx) => {
          const itemY = isVertical ? height * (0.28 + idx * 0.16) : height * (0.24 + idx * 0.18);
          const fWidth = isVertical ? 760 : 920;
          return {
            type: 'group',
            id: `bp-feat-${idx + 1}`,
            x: width / 2 - fWidth / 2,
            y: itemY,
            width: fWidth,
            height: 96,
            children: [
              {
                type: 'rect',
                id: `bp-f${idx + 1}-bg`,
                x: 0,
                y: 0,
                width: fWidth,
                height: 96,
                radius: 4,
                fill: 'rgba(6, 26, 59, 0.95)',
                stroke: cyanBlueprint,
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: `bp-f${idx + 1}-tag`,
                content: `SPEC_${idx + 1}`,
                x: 24,
                y: 35,
                fontSize: 20,
                fontWeight: 700,
                fontFamily: 'Consolas, monospace',
                color: draftingAmber,
              },
              {
                type: 'text',
                id: `bp-f${idx + 1}-txt`,
                content: feat,
                x: 130,
                y: 35,
                fontSize: 22,
                fontWeight: 600,
                fontFamily: 'Consolas, monospace',
                color: '#ffffff',
                maxWidth: fWidth - 160,
                split: {
                  by: 'words',
                  preset: 'rise',
                  stagger: 1,
                  duration: 14,
                },
              },
            ],
          } as Layer;
        }),
      ],
    },

    // BEAT 4: CTA (360 - 450 frames)
    {
      id: 'scene-cta',
      name: 'Blueprint CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-b-ding', type: 'audio', src: 'sfx:ding', startFrame: 5, volume: 0.35 },
        // Technical Stamp
        {
          type: 'group',
          id: 'bp-stamp',
          x: width / 2 - 190,
          y: isVertical ? height * 0.30 : height * 0.26,
          width: 380,
          height: 60,
          children: [
            {
              type: 'rect',
              id: 'bp-stamp-bg',
              x: 0,
              y: 0,
              width: 380,
              height: 60,
              radius: 4,
              fill: 'transparent',
              stroke: draftingAmber,
              strokeWidth: 2,
            },
            {
              type: 'text',
              id: 'bp-stamp-txt',
              content: 'APPROVED FOR PRODUCTION ✓',
              x: 20,
              y: 18,
              fontSize: 20,
              fontWeight: 800,
              fontFamily: 'Consolas, monospace',
              color: draftingAmber,
              split: {
                by: 'letters',
                preset: 'typewriter',
                stagger: 1,
              },
            },
          ],
        },
        // Action Button
        {
          type: 'group',
          id: 'bp-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.50 : height * 0.50,
          width: isVertical ? 380 : 440,
          height: isVertical ? 72 : 78,
          children: [
            {
              type: 'rect',
              id: 'bp-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: isVertical ? 72 : 78,
              radius: 4,
              fill: cyanBlueprint,
            },
            {
              type: 'text',
              id: 'bp-btn-txt',
              content: `<< ${ctaText.toUpperCase()} >>`,
              x: isVertical ? 60 : 80,
              y: isVertical ? 24 : 26,
              fontSize: 22,
              fontWeight: 800,
              fontFamily: 'Consolas, monospace',
              color: '#020617',
            },
          ],
        },
        {
          type: 'text',
          id: 'bp-url',
          content: `TARGET // ${displayUrl}`,
          x: width / 2,
          y: isVertical ? height * 0.65 : height * 0.68,
          width: 800,
          maxWidth: 800,
          fontSize: 20,
          fontWeight: 600,
          fontFamily: 'Consolas, monospace',
          color: cyanBlueprint,
          textAlign: 'center',
        },
      ],
    },
  ];
}

/* ========================================================================= */
/* 5. NEON (Cyberpunk / Synthwave / High-Energy Style)                       */
/* ========================================================================= */
function buildNeonScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const cardW = isVertical ? width * 0.88 : width * 0.70;
  const cardH = isVertical ? height * 0.46 : height * 0.64;
  const neonMagenta = '#ec4899';
  const neonCyan = '#06b6d4';

  return [
    // BEAT 1: HOOK (0 - 105 frames)
    {
      id: 'scene-hook',
      name: 'Neon Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-n-riser', type: 'audio', src: 'sfx:riser', startFrame: 2, volume: 0.35 },
        // Double radial neon glows
        {
          type: 'circle',
          id: 'n-glow-1',
          x: width * 0.25 - 200,
          y: height * 0.35 - 200,
          width: 400,
          height: 400,
          fill: neonMagenta,
          opacity: 0.28,
          blur: 100,
        },
        {
          type: 'circle',
          id: 'n-glow-2',
          x: width * 0.75 - 200,
          y: height * 0.45 - 200,
          width: 400,
          height: 400,
          fill: neonCyan,
          opacity: 0.28,
          blur: 100,
        },
        // Neon Pill
        {
          type: 'group',
          id: 'n-pill',
          x: width / 2 - (isVertical ? 175 : 220),
          y: isVertical ? height * 0.24 : height * 0.18,
          width: isVertical ? 350 : 440,
          height: isVertical ? 48 : 52,
          children: [
            {
              type: 'rect',
              id: 'n-pill-bg',
              x: 0,
              y: 0,
              width: isVertical ? 350 : 440,
              height: isVertical ? 48 : 52,
              radius: 26,
              fill: 'rgba(236, 72, 153, 0.15)',
              stroke: neonMagenta,
              strokeWidth: 2,
            },
            {
              type: 'text',
              id: 'n-pill-txt',
              content: `⚡ NEXT-GEN RELEASE // 2026`,
              x: isVertical ? 28 : 42,
              y: isVertical ? 14 : 16,
              fontSize: isVertical ? 18 : 20,
              fontWeight: 800,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#ffffff',
              letterSpacing: 2,
            },
          ],
        },
        // Vibrant Title with Pop Split
        {
          type: 'text',
          id: 'n-title',
          content: targetName.toUpperCase(),
          x: width / 2,
          y: isVertical ? height * 0.35 : height * 0.32,
          width: isVertical ? 900 : 1400,
          maxWidth: isVertical ? 900 : 1400,
          fontSize: isVertical ? 80 : 100,
          fontWeight: 900,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#ffffff',
          textAlign: 'center',
          letterSpacing: 2,
          split: {
            by: 'words',
            preset: 'pop',
            stagger: 2,
            duration: 16,
          },
        },
        // Subtitle
        {
          type: 'text',
          id: 'n-sub',
          content: tagline.slice(0, 52),
          x: width / 2,
          y: isVertical ? height * 0.49 : height * 0.50,
          width: isVertical ? 840 : 1100,
          maxWidth: isVertical ? 840 : 1100,
          fontSize: isVertical ? 28 : 32,
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: neonCyan,
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'rise',
            stagger: 2,
            duration: 14,
          },
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames)
    {
      id: 'scene-reveal',
      name: 'Neon Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-n-impact', type: 'audio', src: 'sfx:impact', startFrame: 5, volume: 0.35 },
        { id: 'sfx-n-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.3 },
        {
          type: 'group',
          id: 'n-card',
          x: (width - cardW) / 2,
          y: (height - cardH) / 2,
          width: cardW,
          height: cardH,
          children: [
            {
              type: 'rect',
              id: 'n-card-bg',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              radius: 20,
              fill: 'rgba(12, 5, 26, 0.95)',
              stroke: neonMagenta,
              strokeWidth: 2,
            },
            {
              type: 'image',
              id: 'n-card-img',
              src: 'app-screenshot',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              objectFit: 'cover',
              radius: 20,
            },
            createLightSheen(cardW, cardH),
          ],
        },
        createSimulatedCursor(width, height, neonMagenta),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames)
    {
      id: 'scene-features',
      name: 'Neon Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-n-pop', type: 'audio', src: 'sfx:pop', startFrame: 5, volume: 0.35 },
        ...features.map((feat, idx) => {
          const itemY = isVertical ? height * (0.28 + idx * 0.16) : height * (0.24 + idx * 0.18);
          const fWidth = isVertical ? 760 : 920;
          return {
            type: 'group',
            id: `n-feat-${idx + 1}`,
            x: width / 2 - fWidth / 2,
            y: itemY,
            width: fWidth,
            height: 100,
            children: [
              {
                type: 'rect',
                id: `n-f${idx + 1}-bg`,
                x: 0,
                y: 0,
                width: fWidth,
                height: 100,
                radius: 16,
                fill: 'rgba(14, 6, 28, 0.95)',
                stroke: idx === 1 ? neonCyan : neonMagenta,
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: `n-f${idx + 1}-num`,
                content: `// 0${idx + 1}`,
                x: 28,
                y: 36,
                fontSize: 22,
                fontWeight: 800,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: idx === 1 ? neonCyan : neonMagenta,
              },
              {
                type: 'text',
                id: `n-f${idx + 1}-txt`,
                content: feat,
                x: 120,
                y: 36,
                fontSize: 24,
                fontWeight: 700,
                fontFamily: 'Inter, system-ui, sans-serif',
                color: '#ffffff',
                maxWidth: fWidth - 160,
                split: {
                  by: 'words',
                  preset: 'pop',
                  stagger: 1,
                  duration: 14,
                },
              },
            ],
          } as Layer;
        }),
      ],
    },

    // BEAT 4: CTA (360 - 450 frames)
    {
      id: 'scene-cta',
      name: 'Neon CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-n-sparkle', type: 'audio', src: 'sfx:sparkle', startFrame: 5, volume: 0.35 },
        {
          type: 'text',
          id: 'n-cta-title',
          content: targetName.toUpperCase(),
          x: width / 2,
          y: isVertical ? height * 0.34 : height * 0.30,
          width: isVertical ? 900 : 1200,
          maxWidth: isVertical ? 900 : 1200,
          fontSize: isVertical ? 72 : 92,
          fontWeight: 900,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#ffffff',
          textAlign: 'center',
          letterSpacing: 2,
          split: {
            by: 'words',
            preset: 'pop',
            stagger: 2,
            duration: 18,
          },
        },
        {
          type: 'group',
          id: 'n-cta-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.52 : height * 0.52,
          width: isVertical ? 380 : 440,
          height: isVertical ? 74 : 80,
          children: [
            {
              type: 'rect',
              id: 'n-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: 74,
              radius: 37,
              fill: neonMagenta,
            },
            {
              type: 'text',
              id: 'n-btn-txt',
              content: `${ctaText.toUpperCase()}  →`,
              x: isVertical ? 65 : 85,
              y: isVertical ? 24 : 26,
              fontSize: isVertical ? 22 : 24,
              fontWeight: 800,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#ffffff',
              letterSpacing: 1.5,
            },
          ],
        },
        {
          type: 'text',
          id: 'n-url',
          content: displayUrl,
          x: width / 2,
          y: isVertical ? height * 0.65 : height * 0.68,
          width: 800,
          maxWidth: 800,
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: neonCyan,
          textAlign: 'center',
        },
      ],
    },
  ];
}

/* ========================================================================= */
/* 6. BENTO (Modern SaaS / Frosted Grid Style)                              */
/* ========================================================================= */
function buildBentoScenes(ctx: StyleContext): Scene[] {
  const { width, height, aspect, targetName, brandColor, tagline, ctaText, displayUrl, features } = ctx;
  const isVertical = aspect === '9:16';
  const cardW = isVertical ? width * 0.88 : width * 0.70;
  const cardH = isVertical ? height * 0.46 : height * 0.64;

  return [
    // BEAT 1: HOOK (0 - 105 frames)
    {
      id: 'scene-hook',
      name: 'Bento Hook',
      startFrame: 0,
      durationFrames: 105,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-bn-whoosh', type: 'audio', src: 'sfx:whoosh', startFrame: 2, volume: 0.3 },
        // Bento Pill
        {
          type: 'group',
          id: 'bn-pill',
          x: width / 2 - (isVertical ? 175 : 220),
          y: isVertical ? height * 0.24 : height * 0.18,
          width: isVertical ? 350 : 440,
          height: isVertical ? 48 : 52,
          children: [
            {
              type: 'rect',
              id: 'bn-pill-bg',
              x: 0,
              y: 0,
              width: isVertical ? 350 : 440,
              height: isVertical ? 48 : 52,
              radius: 26,
              fill: 'rgba(255, 255, 255, 0.06)',
              stroke: 'rgba(255, 255, 255, 0.18)',
              strokeWidth: 1.5,
            },
            {
              type: 'text',
              id: 'bn-pill-txt',
              content: `✦ THE MODERN STANDARD`,
              x: isVertical ? 32 : 46,
              y: isVertical ? 14 : 16,
              fontSize: isVertical ? 18 : 20,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: brandColor,
            },
          ],
        },
        {
          type: 'text',
          id: 'bn-title',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.35 : height * 0.32,
          width: isVertical ? 900 : 1400,
          maxWidth: isVertical ? 900 : 1400,
          fontSize: isVertical ? 76 : 96,
          fontWeight: 800,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#ffffff',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'rise',
            stagger: 2,
            duration: 16,
          },
        },
        {
          type: 'text',
          id: 'bn-sub',
          content: tagline.slice(0, 52),
          x: width / 2,
          y: isVertical ? height * 0.49 : height * 0.50,
          width: isVertical ? 840 : 1100,
          maxWidth: isVertical ? 840 : 1100,
          fontSize: isVertical ? 28 : 34,
          fontWeight: 500,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#94a3b8',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'blur',
            stagger: 2,
            duration: 14,
          },
        },
      ],
    },

    // BEAT 2: REVEAL (105 - 240 frames)
    {
      id: 'scene-reveal',
      name: 'Bento Reveal',
      startFrame: 105,
      durationFrames: 135,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
        animations: [
          { property: 'zoom', keyframes: [{ frame: 0, value: 1.08 }, { frame: 135, value: 0.98, easing: 'drift' }] },
        ],
      },
      layers: [
        { id: 'sfx-bn-impact', type: 'audio', src: 'sfx:impact', startFrame: 5, volume: 0.3 },
        { id: 'sfx-bn-click', type: 'audio', src: 'sfx:click', startFrame: 50, volume: 0.28 },
        {
          type: 'group',
          id: 'bn-card',
          x: (width - cardW) / 2,
          y: (height - cardH) / 2,
          width: cardW,
          height: cardH,
          children: [
            {
              type: 'rect',
              id: 'bn-card-bg',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              radius: 28,
              fill: 'rgba(255, 255, 255, 0.03)',
              stroke: 'rgba(255, 255, 255, 0.16)',
              strokeWidth: 2,
            },
            {
              type: 'image',
              id: 'bn-card-img',
              src: 'app-screenshot',
              x: 0,
              y: 0,
              width: cardW,
              height: cardH,
              objectFit: 'cover',
              radius: 28,
            },
            createLightSheen(cardW, cardH),
          ],
        },
        createSimulatedCursor(width, height, brandColor),
      ],
    },

    // BEAT 3: FEATURES (240 - 360 frames) - Bento Asymmetric Grid
    {
      id: 'scene-features',
      name: 'Bento Grid Features',
      startFrame: 240,
      durationFrames: 120,
      layers: [
        { id: 'sfx-bn-pop', type: 'audio', src: 'sfx:pop', startFrame: 5, volume: 0.3 },
        // Hero top card
        {
          type: 'group',
          id: 'bn-box-1',
          x: width / 2 - (isVertical ? 380 : 460),
          y: isVertical ? height * 0.24 : height * 0.22,
          width: isVertical ? 760 : 920,
          height: isVertical ? 150 : 140,
          children: [
            {
              type: 'rect',
              id: 'bn-b1-bg',
              x: 0,
              y: 0,
              width: isVertical ? 760 : 920,
              height: isVertical ? 150 : 140,
              radius: 24,
              fill: 'rgba(255, 255, 255, 0.05)',
              stroke: 'rgba(255, 255, 255, 0.15)',
              strokeWidth: 1.5,
            },
            {
              type: 'text',
              id: 'bn-b1-tag',
              content: '✦ PRIMARY ARCHITECTURE',
              x: 32,
              y: 28,
              fontSize: 20,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: brandColor,
            },
            {
              type: 'text',
              id: 'bn-b1-txt',
              content: features[0],
              x: 32,
              y: 65,
              fontSize: isVertical ? 26 : 30,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#ffffff',
              maxWidth: (isVertical ? 760 : 920) - 64,
              split: {
                by: 'words',
                preset: 'rise',
                stagger: 1,
                duration: 14,
              },
            },
          ],
        },
        // Bottom left box
        {
          type: 'group',
          id: 'bn-box-2',
          x: width / 2 - (isVertical ? 380 : 460),
          y: isVertical ? height * 0.24 + (isVertical ? 170 : 160) : height * 0.22 + 160,
          width: isVertical ? 760 : 445,
          height: isVertical ? 130 : 180,
          children: [
            {
              type: 'rect',
              id: 'bn-b2-bg',
              x: 0,
              y: 0,
              width: isVertical ? 760 : 445,
              height: isVertical ? 130 : 180,
              radius: 24,
              fill: 'rgba(255, 255, 255, 0.04)',
              stroke: 'rgba(255, 255, 255, 0.12)',
              strokeWidth: 1.5,
            },
            {
              type: 'text',
              id: 'bn-b2-txt',
              content: features[1],
              x: 28,
              y: 35,
              fontSize: 22,
              fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#f8fafc',
              maxWidth: (isVertical ? 760 : 445) - 56,
              split: {
                by: 'words',
                preset: 'rise',
                stagger: 1,
                duration: 14,
              },
            },
          ],
        },
        // Bottom right box
        {
          type: 'group',
          id: 'bn-box-3',
          x: isVertical ? width / 2 - 380 : width / 2 + 15,
          y: isVertical ? height * 0.24 + 320 : height * 0.22 + 160,
          width: isVertical ? 760 : 445,
          height: isVertical ? 130 : 180,
          children: [
            {
              type: 'rect',
              id: 'bn-b3-bg',
              x: 0,
              y: 0,
              width: isVertical ? 760 : 445,
              height: isVertical ? 130 : 180,
              radius: 24,
              fill: 'rgba(255, 255, 255, 0.04)',
              stroke: 'rgba(255, 255, 255, 0.12)',
              strokeWidth: 1.5,
            },
            {
              type: 'text',
              id: 'bn-b3-txt',
              content: features[2],
              x: 28,
              y: 35,
              fontSize: 22,
              fontWeight: 600,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#f8fafc',
              maxWidth: (isVertical ? 760 : 445) - 56,
              split: {
                by: 'words',
                preset: 'rise',
                stagger: 1,
                duration: 14,
              },
            },
          ],
        },
      ],
    },

    // BEAT 4: CTA (360 - 450 frames)
    {
      id: 'scene-cta',
      name: 'Bento CTA',
      startFrame: 360,
      durationFrames: 90,
      camera: {
        x: width / 2,
        y: height / 2,
        zoom: 1,
      },
      layers: [
        { id: 'sfx-bn-ding', type: 'audio', src: 'sfx:ding', startFrame: 5, volume: 0.3 },
        {
          type: 'text',
          id: 'bn-cta-title',
          content: targetName,
          x: width / 2,
          y: isVertical ? height * 0.34 : height * 0.30,
          width: isVertical ? 900 : 1200,
          maxWidth: isVertical ? 900 : 1200,
          fontSize: isVertical ? 72 : 92,
          fontWeight: 800,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#ffffff',
          textAlign: 'center',
          split: {
            by: 'words',
            preset: 'pop',
            stagger: 2,
            duration: 18,
          },
        },
        {
          type: 'group',
          id: 'bn-cta-btn',
          x: width / 2 - (isVertical ? 190 : 220),
          y: isVertical ? height * 0.54 : height * 0.54,
          width: isVertical ? 380 : 440,
          height: isVertical ? 72 : 80,
          children: [
            {
              type: 'rect',
              id: 'bn-btn-bg',
              x: 0,
              y: 0,
              width: isVertical ? 380 : 440,
              height: isVertical ? 72 : 80,
              radius: 20,
              fill: brandColor,
            },
            {
              type: 'text',
              id: 'bn-btn-txt',
              content: `${ctaText}  →`,
              x: isVertical ? 75 : 100,
              y: isVertical ? 24 : 26,
              fontSize: isVertical ? 22 : 26,
              fontWeight: 700,
              fontFamily: 'Inter, system-ui, sans-serif',
              color: '#020617',
            },
          ],
        },
        {
          type: 'text',
          id: 'bn-url',
          content: displayUrl,
          x: width / 2,
          y: isVertical ? height * 0.66 : height * 0.70,
          width: 800,
          maxWidth: 800,
          fontSize: 22,
          fontWeight: 600,
          fontFamily: 'Inter, system-ui, sans-serif',
          color: '#64748b',
          textAlign: 'center',
        },
      ],
    },
  ];
}
