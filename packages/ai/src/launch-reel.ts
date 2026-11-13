import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { compositionSchema, type Composition } from '@ove/schema';
import { launchBrowser } from '@ove/core';
import { normalizeUrl, scrapeWebsiteBrand, type ScrapedWebsite } from './brand-scraper';
import { synthesizeEdgeSpeech } from './edge-tts';

export type LaunchReelAspect = '9:16' | '16:9' | '1:1';

export type LaunchReelOptions = {
  urlOrImage: string;
  name?: string;
  brandColor?: string;
  aspect?: LaunchReelAspect;
  voice?: boolean | string;
  voiceName?: string;
  tagline?: string;
  ctaText?: string;
  outputDir?: string;
  onProgress?: (message: string) => void;
};

export type LaunchReelResult = {
  composition: Composition;
  projectDir: string;
  screenshotFile: string;
  metadata: ScrapedWebsite | { name: string; brandColor: string };
};

const ASPECT_DIMS: Record<LaunchReelAspect, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

/**
 * Creates a clean SVG placeholder image when a URL screenshot is unavailable or offline.
 */
function createPlaceholderMockup(title: string, color: string, width = 1280, height = 720): Buffer {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#020617"/>
      </linearGradient>
      <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${color}"/>
        <stop offset="100%" stop-color="#818cf8"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="23" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
    <!-- Mock Browser Header -->
    <rect x="0" y="0" width="${width}" height="56" rx="24" fill="rgba(255,255,255,0.03)"/>
    <circle cx="36" cy="28" r="6" fill="#ef4444"/>
    <circle cx="56" cy="28" r="6" fill="#f59e0b"/>
    <circle cx="76" cy="28" r="6" fill="#10b981"/>
    <!-- Mock Content Area -->
    <rect x="120" y="18" width="400" height="20" rx="10" fill="rgba(255,255,255,0.08)"/>
    <rect x="64" y="100" width="300" height="36" rx="8" fill="url(#accent)"/>
    <text x="64" y="180" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="38" font-weight="bold">${title.slice(0, 32)}</text>
    <rect x="64" y="220" width="600" height="16" rx="8" fill="rgba(255,255,255,0.2)"/>
    <rect x="64" y="250" width="450" height="16" rx="8" fill="rgba(255,255,255,0.15)"/>
    <!-- Mock Cards -->
    <rect x="64" y="320" width="${width - 128}" height="320" rx="16" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  </svg>`;
  return Buffer.from(svg);
}

/**
 * Captures a high-resolution screenshot of a website using Chromium.
 */
async function captureWebsiteScreenshot(url: string, destinationFile: string, log: (m: string) => void): Promise<boolean> {
  try {
    log(`Capturing high-resolution viewport for ${url}…`);
    const browser = await launchBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4000 });

    // Dismiss common cookie consent / modal dialogs if present
    try {
      const selectors = ['button:has-text("Accept")', 'button:has-text("Agree")', 'button:has-text("Allow")', '#cookie-banner', '.cookie-consent'];
      for (const sel of selectors) {
        const btn = await page.$(sel);
        if (btn) await btn.click().catch(() => {});
      }
    } catch {}

    await page.waitForTimeout(500);
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    await browser.close();

    await mkdir(dirname(destinationFile), { recursive: true });
    await writeFile(destinationFile, buffer);
    log(`✓ Captured screenshot saved to ${destinationFile}`);
    return true;
  } catch (err) {
    log(`Browser capture failed or timed out: ${(err as Error).message}. Using visual mockup card.`);
    return false;
  }
}

/**
 * Generates an end-to-end 15-second Launch Reel from a website URL or screenshot.
 */
export async function createLaunchReel(options: LaunchReelOptions): Promise<LaunchReelResult> {
  const log = options.onProgress ?? (() => {});
  const input = options.urlOrImage.trim();
  const isUrl = /^https?:\/\//i.test(input) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/i.test(input);

  const aspect = options.aspect ?? '9:16';
  const { width, height } = ASPECT_DIMS[aspect];
  const fps = 30;
  const durationFrames = 450; // 15 seconds

  const targetName = options.name || (isUrl ? input.replace(/^https?:\/\//i, '').split('/')[0].split('.')[0] : basename(input, extname(input)));
  const projectSlug = targetName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'launch-reel';
  const projectDir = resolve(options.outputDir ?? join('ai-videos', `${projectSlug}-${Date.now().toString(36)}`));
  const assetsDir = join(projectDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const screenshotPath = join(assetsDir, 'screenshot.png');
  let brandColor = options.brandColor ?? '#38bdf8';
  let tagline = options.tagline;
  let metadata: ScrapedWebsite | { name: string; brandColor: string } = { name: targetName, brandColor };

  if (isUrl) {
    const fullUrl = normalizeUrl(input);
    log(`Scraping brand metadata from ${fullUrl}…`);
    try {
      const scraped = await scrapeWebsiteBrand(fullUrl);
      metadata = scraped;
      if (!options.brandColor && scraped.colors.length > 0) {
        brandColor = scraped.colors[0]!;
      }
      if (!tagline && scraped.description) {
        tagline = scraped.description.slice(0, 90);
      }
    } catch (e) {
      log(`Scraping fallback: ${(e as Error).message}`);
    }

    const captured = await captureWebsiteScreenshot(fullUrl, screenshotPath, log);
    if (!captured) {
      // Use Chromium to rasterize the SVG mockup into a genuine PNG so all renderers can load it
      try {
        const browser = await launchBrowser();
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        const svg = createPlaceholderMockup(targetName, brandColor).toString('utf8');
        await page.setContent(svg);
        const pngBuf = await page.screenshot({ type: 'png' });
        await browser.close();
        await writeFile(screenshotPath, pngBuf);
      } catch {
        const placeholder = createPlaceholderMockup(targetName, brandColor);
        await writeFile(screenshotPath, placeholder);
      }
    }
  } else {
    // Local image input
    const localFile = resolve(input);
    await stat(localFile);
    await copyFile(localFile, screenshotPath);
    log(`Copied local screenshot to ${screenshotPath}`);
  }

  const effectiveTagline = tagline || 'The modern standard for high-velocity teams.';
  const cta = options.ctaText || 'Get Started Free';
  const displayUrl = isUrl ? input.replace(/^https?:\/\//i, '').replace(/\/+$/, '') : 'motionrender.com';

  // --- Voiceover Synthesis (Edge-TTS) ---
  let audioAsset: any = undefined;
  let audioTrack: any = undefined;

  if (options.voice !== false) {
    log('Synthesizing studio voiceover narration with Edge-TTS…');
    try {
      const voice = options.voiceName || 'en-US-AvaNeural';
      const script = `Introducing ${targetName}. ${effectiveTagline} Built from the ground up for speed, precision, and clarity. Start building today at ${displayUrl}.`;
      const speech = await synthesizeEdgeSpeech(script, { voice });
      const audioPath = join(assetsDir, 'voiceover.wav');
      await writeFile(audioPath, speech.data);
      audioAsset = { id: 'vo-launch', type: 'audio', src: './assets/voiceover.wav' };
      audioTrack = 'vo-launch';
      log('✓ Voiceover narration generated.');
    } catch (err) {
      log(`Edge-TTS note: ${(err as Error).message}. Composition will be generated silent.`);
    }
  }

  // --- 4 Synchronized Narrative Beats ---
  // Beat 1: Hook / Problem (0 - 105 frames / 3.5s)
  // Beat 2: Product Reveal (105 - 240 frames / 4.5s)
  // Beat 3: Features & Highlights (240 - 360 frames / 4.0s)
  // Beat 4: Call to Action (360 - 450 frames / 3.0s)

  const isVertical = aspect === '9:16';
  const cardWidth = isVertical ? width * 0.88 : width * 0.7;
  const cardHeight = isVertical ? height * 0.45 : height * 0.65;

  const rawComp = {
    version: '1.0',
    id: `${projectSlug}-launch`,
    name: `${targetName} Launch Reel`,
    width,
    height,
    fps,
    durationFrames,
    background: {
      type: 'linear',
      from: [0, 0],
      to: [width, height],
      stops: [
        { offset: 0, color: '#090d16' },
        { offset: 0.5, color: '#030712' },
        { offset: 1, color: '#020617' },
      ],
    },
    export: {
      format: 'mp4',
      codec: 'h264',
      ...(audioTrack ? { audio: audioTrack } : {}),
    },
    assets: [
      { id: 'app-screenshot', type: 'image', src: './assets/screenshot.png' },
      ...(audioAsset ? [audioAsset] : []),
    ],
    scenes: [
      // SCENE 1: THE HOOK (0 - 105 frames)
      {
        id: 'scene-hook',
        name: 'The Hook',
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
          // Ambient glowing orb
          {
            type: 'circle',
            id: 'hook-glow',
            x: width / 2 - (width * 0.35),
            y: height * 0.4 - (width * 0.35),
            width: width * 0.7,
            height: width * 0.7,
            fill: brandColor,
            opacity: 0.18,
            blur: 80,
          },
          // Badge
          {
            type: 'group',
            id: 'hook-badge',
            x: width / 2 - 140,
            y: isVertical ? height * 0.28 : height * 0.22,
            width: 280,
            height: 48,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 15, value: 1, easing: 'pop' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'hook-badge-bg',
                x: 0,
                y: 0,
                width: 280,
                height: 48,
                radius: 24,
                fill: 'rgba(255, 255, 255, 0.08)',
                stroke: 'rgba(255, 255, 255, 0.15)',
                strokeWidth: 1.5,
              },
              {
                type: 'text',
                id: 'hook-badge-text',
                content: `✨ INTRODUCING ${targetName.toUpperCase()}`,
                x: 24,
                y: 15,
                fontSize: 16,
                fontWeight: 700,
                color: brandColor,
                letterSpacing: 1.5,
              },
            ],
          },
          // Headline
          {
            type: 'text',
            id: 'hook-headline',
            content: targetName,
            x: width / 2 - (isVertical ? 400 : 600),
            y: isVertical ? height * 0.38 : height * 0.36,
            width: isVertical ? 800 : 1200,
            fontSize: isVertical ? 72 : 96,
            fontWeight: 800,
            color: '#f8fafc',
            textAlign: 'center',
            animations: [
              { property: 'opacity', keyframes: [{ frame: 10, value: 0 }, { frame: 30, value: 1, easing: 'land' }] },
              { property: 'y', keyframes: [{ frame: 10, value: isVertical ? height * 0.42 : height * 0.4 }, { frame: 30, value: isVertical ? height * 0.38 : height * 0.36, easing: 'land' }] },
            ],
          },
          // Subtitle
          {
            type: 'text',
            id: 'hook-sub',
            content: effectiveTagline,
            x: width / 2 - (isVertical ? 360 : 500),
            y: isVertical ? height * 0.50 : height * 0.52,
            width: isVertical ? 720 : 1000,
            fontSize: isVertical ? 28 : 34,
            fontWeight: 500,
            color: '#94a3b8',
            textAlign: 'center',
            lineHeight: 1.4,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 25, value: 0 }, { frame: 45, value: 1, easing: 'land' }] },
            ],
          },
        ],
      },

      // SCENE 2: PRODUCT REVEAL (105 - 240 frames)
      {
        id: 'scene-reveal',
        name: 'Product Reveal',
        startFrame: 105,
        durationFrames: 135,
        camera: {
          x: width / 2,
          y: height / 2,
          zoom: 1,
          animations: [
            { property: 'zoom', keyframes: [{ frame: 0, value: 0.95 }, { frame: 135, value: 1.08, easing: 'drift' }] },
          ],
        },
        layers: [
          // Background glow
          {
            type: 'circle',
            id: 'reveal-glow',
            x: width / 2 - (width * 0.45),
            y: height / 2 - (width * 0.45),
            width: width * 0.9,
            height: width * 0.9,
            fill: brandColor,
            opacity: 0.15,
            blur: 100,
          },
          // Main Product Screenshot Card
          {
            type: 'group',
            id: 'product-card',
            x: (width - cardWidth) / 2,
            y: (height - cardHeight) / 2,
            width: cardWidth,
            height: cardHeight,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 1, easing: 'pop' }] },
              { property: 'scale', keyframes: [{ frame: 0, value: 0.9 }, { frame: 25, value: 1, easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'product-bg',
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                radius: 24,
                fill: 'rgba(15, 23, 42, 0.9)',
                stroke: 'rgba(255, 255, 255, 0.15)',
                strokeWidth: 2,
              },
              {
                type: 'image',
                id: 'product-img',
                src: 'app-screenshot',
                x: 0,
                y: 0,
                width: cardWidth,
                height: cardHeight,
                objectFit: 'cover',
                radius: 24,
              },
            ],
          },
          // Floating Badge on Screenshot Card
          {
            type: 'group',
            id: 'reveal-badge',
            x: (width - cardWidth) / 2 + 24,
            y: (height - cardHeight) / 2 - 20,
            width: 220,
            height: 40,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 20, value: 0 }, { frame: 35, value: 1, easing: 'pop' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'reveal-badge-bg',
                x: 0,
                y: 0,
                width: 220,
                height: 40,
                radius: 20,
                fill: '#0f172a',
                stroke: brandColor,
                strokeWidth: 2,
              },
              {
                type: 'text',
                id: 'reveal-badge-txt',
                content: '⚡ Next-Gen Architecture',
                x: 18,
                y: 12,
                fontSize: 14,
                fontWeight: 700,
                color: '#ffffff',
              },
            ],
          },
        ],
      },

      // SCENE 3: FEATURE CALLOUTS (240 - 360 frames)
      {
        id: 'scene-features',
        name: 'Feature Highlights',
        startFrame: 240,
        durationFrames: 120,
        layers: [
          // Background Screenshot with Blur
          {
            type: 'image',
            id: 'bg-blur-img',
            src: 'app-screenshot',
            x: width * 0.1,
            y: height * 0.15,
            width: width * 0.8,
            height: height * 0.7,
            opacity: 0.25,
            blur: 16,
            objectFit: 'cover',
            radius: 24,
          },
          // Highlight Card 1
          {
            type: 'group',
            id: 'feat-1',
            x: width / 2 - (isVertical ? 380 : 450),
            y: isVertical ? height * 0.28 : height * 0.25,
            width: isVertical ? 760 : 900,
            height: 100,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 15, value: 1, easing: 'pop' }] },
              { property: 'x', keyframes: [{ frame: 0, value: width / 2 - (isVertical ? 420 : 500) }, { frame: 15, value: width / 2 - (isVertical ? 380 : 450), easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'f1-bg',
                x: 0,
                y: 0,
                width: isVertical ? 760 : 900,
                height: 100,
                radius: 20,
                fill: 'rgba(15, 23, 42, 0.85)',
                stroke: 'rgba(255, 255, 255, 0.12)',
                strokeWidth: 1.5,
              },
              { type: 'text', id: 'f1-t', content: '01  Ultra-Fast & Deterministic', x: 30, y: 35, fontSize: 26, fontWeight: 700, color: '#f8fafc' },
              { type: 'circle', id: 'f1-dot', x: isVertical ? 710 : 850, y: 40, width: 20, height: 20, fill: brandColor },
            ],
          },
          // Highlight Card 2
          {
            type: 'group',
            id: 'feat-2',
            x: width / 2 - (isVertical ? 380 : 450),
            y: isVertical ? height * 0.44 : height * 0.45,
            width: isVertical ? 760 : 900,
            height: 100,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 15, value: 0 }, { frame: 30, value: 1, easing: 'pop' }] },
              { property: 'x', keyframes: [{ frame: 15, value: width / 2 - (isVertical ? 420 : 500) }, { frame: 30, value: width / 2 - (isVertical ? 380 : 450), easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'f2-bg',
                x: 0,
                y: 0,
                width: isVertical ? 760 : 900,
                height: 100,
                radius: 20,
                fill: 'rgba(15, 23, 42, 0.85)',
                stroke: 'rgba(255, 255, 255, 0.12)',
                strokeWidth: 1.5,
              },
              { type: 'text', id: 'f2-t', content: '02  Engineered for Autonomous AI Agents', x: 30, y: 35, fontSize: 26, fontWeight: 700, color: '#f8fafc' },
              { type: 'circle', id: 'f2-dot', x: isVertical ? 710 : 850, y: 40, width: 20, height: 20, fill: '#818cf8' },
            ],
          },
          // Highlight Card 3
          {
            type: 'group',
            id: 'feat-3',
            x: width / 2 - (isVertical ? 380 : 450),
            y: isVertical ? height * 0.60 : height * 0.65,
            width: isVertical ? 760 : 900,
            height: 100,
            animations: [
              { property: 'opacity', keyframes: [{ frame: 30, value: 0 }, { frame: 45, value: 1, easing: 'pop' }] },
              { property: 'x', keyframes: [{ frame: 30, value: width / 2 - (isVertical ? 420 : 500) }, { frame: 45, value: width / 2 - (isVertical ? 380 : 450), easing: 'land' }] },
            ],
            children: [
              {
                type: 'rect',
                id: 'f3-bg',
                x: 0,
                y: 0,
                width: isVertical ? 760 : 900,
                height: 100,
                radius: 20,
                fill: 'rgba(15, 23, 42, 0.85)',
                stroke: 'rgba(255, 255, 255, 0.12)',
                strokeWidth: 1.5,
              },
              { type: 'text', id: 'f3-t', content: '03  Self-Hosted & Cloud Scale Ready', x: 30, y: 35, fontSize: 26, fontWeight: 700, color: '#f8fafc' },
              { type: 'circle', id: 'f3-dot', x: isVertical ? 710 : 850, y: 40, width: 20, height: 20, fill: '#34d399' },
            ],
          },
        ],
      },

      // SCENE 4: CALL TO ACTION (360 - 450 frames)
      {
        id: 'scene-cta',
        name: 'Call to Action',
        startFrame: 360,
        durationFrames: 90,
        camera: {
          x: width / 2,
          y: height / 2,
          zoom: 1,
          animations: [
            { property: 'zoom', keyframes: [{ frame: 0, value: 0.95 }, { frame: 90, value: 1.02, easing: 'drift' }] },
          ],
        },
        layers: [
          // Radial Accent Glow
          {
            type: 'circle',
            id: 'cta-glow',
            x: width / 2 - (width * 0.4),
            y: height * 0.48 - (width * 0.4),
            width: width * 0.8,
            height: width * 0.8,
            fill: brandColor,
            opacity: 0.22,
            blur: 90,
          },
          // Brand Title
          {
            type: 'text',
            id: 'cta-title',
            content: targetName,
            x: width / 2 - 300,
            y: isVertical ? height * 0.34 : height * 0.30,
            width: 600,
            fontSize: isVertical ? 64 : 84,
            fontWeight: 800,
            color: '#f8fafc',
            textAlign: 'center',
            animations: [
              { property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 15, value: 1, easing: 'pop' }] },
            ],
          },
          // Subline
          {
            type: 'text',
            id: 'cta-subline',
            content: 'Ready to elevate your workflow?',
            x: width / 2 - 300,
            y: isVertical ? height * 0.44 : height * 0.43,
            width: 600,
            fontSize: isVertical ? 26 : 30,
            fontWeight: 500,
            color: '#94a3b8',
            textAlign: 'center',
            animations: [
              { property: 'opacity', keyframes: [{ frame: 10, value: 0 }, { frame: 25, value: 1, easing: 'land' }] },
            ],
          },
          // Primary CTA Button
          {
            type: 'group',
            id: 'cta-btn',
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
                id: 'cta-btn-bg',
                x: 0,
                y: 0,
                width: isVertical ? 380 : 440,
                height: isVertical ? 72 : 80,
                radius: 36,
                fill: brandColor,
              },
              {
                type: 'text',
                id: 'cta-btn-txt',
                content: `${cta}  →`,
                x: isVertical ? 75 : 100,
                y: isVertical ? 24 : 26,
                fontSize: isVertical ? 22 : 26,
                fontWeight: 700,
                color: '#020617',
              },
            ],
          },
          // Domain URL
          {
            type: 'text',
            id: 'cta-url',
            content: displayUrl,
            x: width / 2 - 300,
            y: isVertical ? height * 0.65 : height * 0.70,
            width: 600,
            fontSize: 20,
            fontWeight: 600,
            color: '#64748b',
            textAlign: 'center',
            animations: [
              { property: 'opacity', keyframes: [{ frame: 30, value: 0 }, { frame: 45, value: 1, easing: 'land' }] },
            ],
          },
        ],
      },
    ],
  };

  const composition = compositionSchema.parse(rawComp);
  const compFile = join(projectDir, 'composition.json');
  await writeFile(compFile, JSON.stringify(composition, null, 2));

  log(`✓ Launch reel project created at ${projectDir}`);

  return {
    composition,
    projectDir,
    screenshotFile: screenshotPath,
    metadata,
  };
}
