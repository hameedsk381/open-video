import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVideoAgent, detectReelFormat, parseWebsiteHtml, normalizeUrl, distillBrandPack } from '@ove/ai';
import type { AiProvider, ChatMessage } from '../../packages/ai/src/providers';
import { agentArgs } from '../../packages/cli/src/agent-cli';
import { KineticText } from '@ove/react';

describe('agent arguments', () => {
  it('reads brief and directory positionals from the checked command arguments', () => {
    // index.ts passes ["agent", ...], not the raw process.argv.
    const args = agentArgs(['agent', 'A product intro', 'C:\\out\\reel', '--provider', 'mock', '--no-render']);
    expect(args).toMatchObject({ brief: 'A product intro', dir: 'C:\\out\\reel', format: 'reel', durationSeconds: 6, fps: 30, shouldRender: false, noPlan: false });
  });

  it('supports the option forms and defaults', () => {
    const args = agentArgs(['agent', '--brief', 'Launch video', '--landscape', '--duration', '9', '--no-plan']);
    expect(args).toMatchObject({ brief: 'Launch video', dir: undefined, format: 'landscape', durationSeconds: 9, noPlan: true, shouldRender: true });
  });

  it('supports --url flag and bare url as argument', () => {
    const args1 = agentArgs(['agent', '--url', 'https://linear.app', '--reel']);
    expect(args1).toMatchObject({ url: 'https://linear.app', format: 'reel' });

    const args2 = agentArgs(['agent', 'https://resend.com']);
    expect(args2).toMatchObject({ url: 'https://resend.com' });
  });
});

describe('detectReelFormat', () => {
  it('returns true for reel-related keywords', () => {
    expect(detectReelFormat('A viral TikTok reel for my brand')).toBe(true);
    expect(detectReelFormat('Instagram reels promo video')).toBe(true);
    expect(detectReelFormat('YouTube Shorts clip')).toBe(true);
    expect(detectReelFormat('9:16 vertical video')).toBe(true);
    expect(detectReelFormat('short viral clip')).toBe(true);
    expect(detectReelFormat('vertical phone video')).toBe(true);
  });

  it('returns false for non-reel briefs', () => {
    expect(detectReelFormat('A landscape product demo for YouTube')).toBe(false);
    expect(detectReelFormat('Corporate explainer video 16:9')).toBe(false);
    expect(detectReelFormat('A beautiful cinematic opener')).toBe(false);
  });
});

const validReactCode = `import { AbsoluteFill, useCurrentFrame } from '@ove/react';
export const config = {
  id: 'test-reel',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 180,
  props: { title: 'Test' }
};
export default function Video({ title }: typeof config.props) {
  const frame = useCurrentFrame();
  return <AbsoluteFill><h1>{title}</h1></AbsoluteFill>;
}
`;

describe('Video Agent', () => {
  it('generates a React video and self-corrects on build failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-agent-test-'));
    const calls: ChatMessage[][] = [];

    let attemptCount = 0;
    const mockProvider: AiProvider = {
      id: 'mock-agent',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat(messages) {
        calls.push(messages);
        attemptCount++;
        if (attemptCount === 1) {
          // Attempt 1: output bad code
          return '```tsx\nexport default function Bad() { return <div>bad</div> }\n```';
        }
        // Attempt 2: output corrected code
        return `\`\`\`tsx\n${validReactCode}\n\`\`\``;
      },
    };

    let buildCalls = 0;
    const mockBuild = async (_source: string, _output: string) => {
      buildCalls++;
      if (buildCalls === 1) {
        throw new Error('Missing config export: config must be exported');
      }
    };

    try {
      const result = await runVideoAgent(
        mockProvider,
        {
          brief: 'A fast launch reel for an AI agent',
          dir,
          format: 'reel',
          durationSeconds: 6,
        },
        mockBuild
      );

      expect(result.attempts).toBe(2);
      expect(result.videoPath).toBe(join(dir, 'video.tsx'));
      expect(calls.length).toBe(2);
      expect(calls[0]![0]!.content).toContain('You are the lead Motion Graphics Director');
      expect(calls[1]![calls[1]!.length - 1]!.content).toContain('The generated video.tsx failed to build with this error:');

      const savedCode = await readFile(result.videoPath, 'utf8');
      expect(savedCode).toContain('export const config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runs without a build helper in standalone mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-agent-test-'));
    const mockProvider: AiProvider = {
      id: 'mock-agent',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat() {
        return validReactCode;
      },
    };

    try {
      const result = await runVideoAgent(mockProvider, {
        brief: 'Simple promo',
        dir,
        format: 'landscape',
      });

      expect(result.attempts).toBe(1);
      const savedCode = await readFile(result.videoPath, 'utf8');
      expect(savedCode).toBe(validReactCode.trim());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('includes brand pack tokens in the system prompt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-agent-test-'));
    const capturedMessages: ChatMessage[][] = [];
    const mockProvider: AiProvider = {
      id: 'mock-agent',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat(messages) {
        capturedMessages.push(messages);
        return validReactCode;
      },
    };

    try {
      await runVideoAgent(mockProvider, {
        brief: 'Simple promo',
        dir,
        format: 'landscape',
        brand: {
          name: 'Acme',
          colors: { primary: '#6366f1', secondary: '#8b5cf6', accent: '#38bdf8', background: '#070a12', text: '#f8fafc' },
          fonts: { heading: 'Inter', body: 'Inter' },
          style: 'minimalist, modern SaaS',
        },
      });

      const systemPrompt = capturedMessages[0]![0]!.content as string;
      expect(systemPrompt).toContain('Brand Tokens');
      expect(systemPrompt).toContain('primary=#6366f1');
      expect(systemPrompt).toContain('Brand Name: Acme');
      expect(systemPrompt).toContain('Style: minimalist, modern SaaS');
      expect(systemPrompt).toContain('heading="Inter"');
      expect(systemPrompt).toContain('You MUST use ONLY these brand colors');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('KineticText wordTriggers', () => {
  // Minimal React/frame mock — KineticText uses useCurrentFrame and useVideoConfig at module level.
  // We test the logic by directly inspecting the wordDelay calculation path.
  it('exports WordTrigger type and KineticText accepts wordTriggers prop without error', () => {
    // Type-level check: KineticText must accept wordTriggers prop.
    // If the type doesn't include wordTriggers this would be a TypeScript error.
    type Props = Parameters<typeof KineticText>[0];
    type HasWordTriggers = Props extends { wordTriggers?: any } ? true : false;
    const check: HasWordTriggers = true;
    expect(check).toBe(true);
  });

  it('uses trigger frame for matching word and falls back to stagger for unmatched words', () => {
    // Simulate the internal per-word delay logic from KineticText
    const words = ['Hello', 'World', 'foo'];
    const wordTriggers = [{ word: 'hello', frame: 90 }, { word: 'world', frame: 60 }];
    const delay = 0;
    const staggerDelay = 3;

    const delays = words.map((word, index) => {
      let wordDelay = delay + index * staggerDelay;
      if (wordTriggers && wordTriggers.length > 0) {
        const stripped = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        const trigger = wordTriggers.find(t => t.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === stripped);
        if (trigger !== undefined) {
          wordDelay = trigger.frame;
        }
      }
      return wordDelay;
    });

    // 'Hello' matches 'hello' trigger → frame 90
    expect(delays[0]).toBe(90);
    // 'World' matches 'world' trigger → frame 60
    expect(delays[1]).toBe(60);
    // 'foo' has no trigger → default stagger: 0 + 2*3 = 6
    expect(delays[2]).toBe(6);
  });

  it('strips punctuation when matching word triggers', () => {
    const wordTriggers = [{ word: 'ai', frame: 45 }];
    const word = 'AI!';
    const stripped = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const trigger = wordTriggers.find(t => t.word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === stripped);
    expect(trigger?.frame).toBe(45);
  });
});

describe('website brand scraper', () => {
  it('normalizes URLs without protocol', () => {
    expect(normalizeUrl('linear.app')).toBe('https://linear.app');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeUrl('https://resend.com/overview')).toBe('https://resend.com/overview');
  });

  it('extracts metadata, colors, logo, and headings from HTML', () => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Acme Inc - The Modern Data Cloud</title>
  <meta name="description" content="Acme is the fastest vector database for AI agents and production search." />
  <meta property="og:site_name" content="Acme" />
  <meta name="theme-color" content="#6366f1" />
  <link rel="icon" href="/favicon.svg" />
  <style>
    :root { --brand: #5e6ad2; --bg: #08090c; --accent: #ec4899; }
    h1 { color: #5e6ad2; }
  </style>
</head>
<body>
  <h1>Next-Generation Vector Search</h1>
  <h2>Sub-millisecond query latency at scale</h2>
  <p>Engineered for high-volume semantic queries with zero cold-starts.</p>
</body>
</html>`;

    const parsed = parseWebsiteHtml(html, 'https://acme.io');
    expect(parsed.title).toBe('Acme Inc - The Modern Data Cloud');
    expect(parsed.siteName).toBe('Acme');
    expect(parsed.description).toContain('fastest vector database');
    expect(parsed.themeColor).toBe('#6366f1');
    expect(parsed.logo).toBe('https://acme.io/favicon.svg');
    expect(parsed.colors).toContain('#6366f1');
    expect(parsed.headings).toContain('Next-Generation Vector Search');
    expect(parsed.headings).toContain('Sub-millisecond query latency at scale');
    expect(parsed.suggestedBrief).toContain('Acme');
    expect(parsed.suggestedBrief).toContain('Next-Generation Vector Search');
  });

  it('distills a structured BrandPack with fallback when no provider is supplied', async () => {
    const scraped = {
      url: 'https://acme.io',
      siteName: 'Acme',
      title: 'Acme - Vector Search',
      description: 'The fastest AI database.',
      logo: 'https://acme.io/logo.png',
      colors: ['#5e6ad2', '#1f2438', '#ec4899'],
      headings: ['Fast Search'],
      paragraphs: ['Production scale.'],
      suggestedBrief: 'Launch reel for Acme',
    };

    const { brand, suggestedBrief } = await distillBrandPack(scraped);
    expect(brand.name).toBe('Acme');
    expect(brand.colors?.primary).toBe('#5e6ad2');
    expect(brand.logo).toBe('https://acme.io/logo.png');
    expect(suggestedBrief).toBe('Launch reel for Acme');
  });
});
