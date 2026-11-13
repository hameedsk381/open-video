import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLaunchReel } from '@ove/ai';

describe('One-Click Screenshot-to-Launch-Reel Engine', () => {
  it('generates a valid 15-second launch reel from local screenshot with 4 synchronized beats', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mr-launch-reel-'));
    const dummyImage = join(tempDir, 'dashboard.png');
    // 1x1 png base64
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await writeFile(dummyImage, Buffer.from(pngBase64, 'base64'));

    try {
      const result = await createLaunchReel({
        urlOrImage: dummyImage,
        name: 'NexusAI',
        brandColor: '#6366f1',
        aspect: '9:16',
        voice: false,
        tagline: 'Autonomous AI agents for software engineering.',
        ctaText: 'Start Free Trial',
        outputDir: join(tempDir, 'project'),
      });

      expect(result).toBeDefined();
      expect(result.composition).toBeDefined();

      const comp = result.composition;
      expect(comp.width).toBe(1080);
      expect(comp.height).toBe(1920);
      expect(comp.fps).toBe(30);
      expect(comp.durationFrames).toBe(450); // Exactly 15 seconds

      // Verify 4 narrative scenes
      expect(comp.scenes).toHaveLength(4);
      const [s1, s2, s3, s4] = comp.scenes;

      // Scene 1: Hook
      expect(s1.id).toBe('scene-hook');
      expect(s1.durationFrames).toBe(105);
      expect(s1.layers.some((l: any) => l.id === 'hook-headline' && l.content === 'NexusAI')).toBe(true);

      // Scene 2: Product Reveal
      expect(s2.id).toBe('scene-reveal');
      expect(s2.durationFrames).toBe(135);
      expect(s2.layers.some((l: any) => l.id === 'product-card')).toBe(true);

      // Scene 3: Feature Callouts
      expect(s3.id).toBe('scene-features');
      expect(s3.durationFrames).toBe(120);
      expect(s3.layers.some((l: any) => l.id === 'feat-1')).toBe(true);
      expect(s3.layers.some((l: any) => l.id === 'feat-2')).toBe(true);
      expect(s3.layers.some((l: any) => l.id === 'feat-3')).toBe(true);

      // Scene 4: Call to Action
      expect(s4.id).toBe('scene-cta');
      expect(s4.durationFrames).toBe(90);
      expect(s4.layers.some((l: any) => l.id === 'cta-btn')).toBe(true);

      // Verify screenshot asset was created in project assets
      const screenshotFile = join(result.projectDir, 'assets', 'screenshot.png');
      const info = await stat(screenshotFile);
      expect(info.isFile()).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('supports widescreen 16:9 and square 1:1 aspect ratios', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mr-aspect-reel-'));
    const dummyImage = join(tempDir, 'mock.png');
    await writeFile(dummyImage, Buffer.from('fake'));

    try {
      // 16:9
      const res169 = await createLaunchReel({
        urlOrImage: dummyImage,
        aspect: '16:9',
        voice: false,
        outputDir: join(tempDir, 'p169'),
      });
      expect(res169.composition.width).toBe(1920);
      expect(res169.composition.height).toBe(1080);

      // 1:1
      const res11 = await createLaunchReel({
        urlOrImage: dummyImage,
        aspect: '1:1',
        voice: false,
        outputDir: join(tempDir, 'p11'),
      });
      expect(res11.composition.width).toBe(1080);
      expect(res11.composition.height).toBe(1080);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('gracefully handles web URL capture fallback with placeholder card', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'mr-url-reel-'));

    try {
      // Offline/fake domain should gracefully fallback to SVG mockup card without throwing
      const result = await createLaunchReel({
        urlOrImage: 'https://example-saas-startup-test.io',
        name: 'StartupX',
        brandColor: '#ec4899',
        aspect: '9:16',
        voice: false,
        outputDir: join(tempDir, 'project-url'),
      });

      expect(result.composition).toBeDefined();
      expect(result.composition.name).toBe('StartupX Launch Reel');
      const screenshotFile = join(result.projectDir, 'assets', 'screenshot.png');
      const info = await stat(screenshotFile);
      expect(info.size).toBeGreaterThan(0);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }, 15000);
});
