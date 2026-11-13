import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { compositionSchema, type Composition } from '@ove/schema';
import { launchBrowser } from '@ove/core';
import { normalizeUrl, scrapeWebsiteBrand, type ScrapedWebsite } from './brand-scraper';
import { synthesizeEdgeSpeech } from './edge-tts';
import {
  detectArchetype,
  extractKeyFeatures,
  getStyleBackground,
  buildArchetypeScenes,
  type LaunchReelStyle,
} from './launch-reel-styles';
import { generateReactLaunchReelTsx } from './launch-reel-react';

export type LaunchReelAspect = '9:16' | '16:9' | '1:1';
export type LaunchReelEngine = 'react' | 'json';
export type { LaunchReelStyle };

export type LaunchReelOptions = {
  urlOrImage: string;
  name?: string;
  brandColor?: string;
  style?: LaunchReelStyle;
  aspect?: LaunchReelAspect;
  engine?: LaunchReelEngine;
  voice?: boolean | string;
  voiceName?: string;
  tagline?: string;
  ctaText?: string;
  outputDir?: string;
  buildHelper?: (source: string, output: string) => Promise<void>;
  onProgress?: (message: string) => void;
};

export type LaunchReelResult = {
  composition: Composition;
  projectDir: string;
  screenshotFile: string;
  metadata: ScrapedWebsite | { name: string; brandColor: string };
  style: LaunchReelStyle;
  engine: LaunchReelEngine;
  tsxFile?: string;
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

  // --- Style Archetype Selection & Dynamic Feature Extraction ---
  const activeStyle = detectArchetype(input, metadata, options.style);
  log(`Selected visual archetype: ${activeStyle.toUpperCase()}`);

  const features = extractKeyFeatures(metadata, targetName, activeStyle);
  log(`Extracted key features: "${features.join('", "')}"`);

  const engine: LaunchReelEngine = options.engine ?? 'react';
  log(`Rendering engine: ${engine.toUpperCase()}`);

  const buildHelper = options.buildHelper;

  const compFile = join(projectDir, 'composition.json');

  if (engine === 'react') {
    const tsxPath = join(projectDir, 'video.tsx');
    const tsxSource = generateReactLaunchReelTsx({
      style: activeStyle,
      targetName,
      brandColor,
      tagline: effectiveTagline,
      ctaText: cta,
      displayUrl,
      features,
      width,
      height,
      aspect,
      fps,
      hasVoice: Boolean(audioTrack),
      voiceAssetId: audioTrack,
    });

    await writeFile(tsxPath, tsxSource, 'utf8');
    log(`✓ Generated React/TSX video component at ${tsxPath}`);

    if (!buildHelper) {
      throw new Error('Building a React launch reel requires buildReact helper (available via MotionRender CLI)');
    }

    log('Compiling React component to bundle and composition…');
    await buildHelper(tsxPath, compFile);

    const builtRaw = JSON.parse(await readFile(compFile, 'utf8'));
    builtRaw.grain = 0.04;
    if (!builtRaw.export) builtRaw.export = {};
    builtRaw.export.loudness = -14;
    builtRaw.export.audio = 'sfx:ambient-pad';
    builtRaw.export.audioVolume = 0.16;
    if (audioAsset) {
      builtRaw.export.duck = {
        amount: 0.35,
        attackFrames: 6,
        releaseFrames: 15,
      };
    }

    const composition = compositionSchema.parse(builtRaw);
    await writeFile(compFile, JSON.stringify(composition, null, 2));

    log(`✓ React launch reel project created at ${projectDir}`);

    return {
      composition,
      projectDir,
      screenshotFile: screenshotPath,
      metadata,
      style: activeStyle,
      engine: 'react',
      tsxFile: tsxPath,
    };
  }

  const bg = getStyleBackground(activeStyle, width, height, brandColor);
  const scenes = buildArchetypeScenes({
    style: activeStyle,
    targetName,
    brandColor,
    tagline: effectiveTagline,
    ctaText: cta,
    displayUrl,
    features,
    width,
    height,
    aspect,
    fps,
    hasVoice: Boolean(audioTrack),
  });

  // If voiceover was synthesized, attach it into overlay so it plays seamlessly across all scenes
  const overlayLayers: any[] = [];
  if (audioAsset) {
    overlayLayers.push({
      id: 'vo-speech-layer',
      type: 'audio',
      src: audioAsset.id,
      startFrame: 0,
      volume: 1.0,
    });
  }

  const rawComp = {
    version: '1.0',
    id: `${projectSlug}-launch`,
    name: `${targetName} Launch Reel (${activeStyle})`,
    width,
    height,
    fps,
    durationFrames,
    grain: 0.04, // Film grain to eliminate banding and add cinematic texture
    background: bg,
    export: {
      format: 'mp4',
      codec: 'h264',
      loudness: -14,
      audio: 'sfx:ambient-pad',
      audioVolume: 0.16,
      duck: audioAsset ? {
        amount: 0.35,
        attackFrames: 6,
        releaseFrames: 15,
      } : undefined,
    },
    assets: [
      { id: 'app-screenshot', type: 'image', src: './assets/screenshot.png' },
      ...(audioAsset ? [audioAsset] : []),
    ],
    scenes,
    ...(overlayLayers.length > 0 ? { overlay: overlayLayers } : {}),
  };

  const composition = compositionSchema.parse(rawComp);
  await writeFile(compFile, JSON.stringify(composition, null, 2));

  log(`✓ Launch reel project created at ${projectDir}`);

  return {
    composition,
    projectDir,
    screenshotFile: screenshotPath,
    metadata,
    style: activeStyle,
    engine: 'json',
  };
}
