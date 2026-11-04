---
name: ove-agent
description: Autonomous AI motion graphics director that generates, compiles, and self-corrects broadcast-quality React video components from a plain-text brief. Supports vertical reel auto-detection, brand pack tokens, visual self-healing review, and multi-provider LLM backends.
---

# `ove agent` — Autonomous Video Agent

The `ove agent` command runs an autonomous AI loop that:

1. **Generates** a complete `video.tsx` React component from your brief using an LLM provider.
2. **Compiles** it with esbuild via the `buildReact` helper.
3. **Self-corrects** on compiler errors (up to 3 total attempts), feeding the error back to the LLM.
4. **Visual self-healing**: after a successful compile, runs `ove review` on 3 still frames (20%, 50%, 80% of duration) and loops back to the LLM if design errors (text cut, off-frame, overlapping text) are found.
5. **Renders** the final MP4 with headless Chromium (unless `--no-render` is passed).

Auto-detects vertical reel format when the brief contains keywords: `reel`, `short`, `9:16`, `viral`, `tiktok`, `instagram`, `shorts`, `reels`, `vertical`.

## Usage

```sh
ove agent "<brief>" [dir] [options]
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--url <website>` | Ingest brand colors, logo and value propositions from a website URL | None |
| `--landscape` | Landscape 16:9 video for YouTube/Web (1920×1080) | Off (default: 9:16 reel) |
| `--duration <sec>` | Length in seconds | `6` |
| `--fps <number>` | Frames per second | `30` |
| `--no-render` | Generate and compile React code only; skip MP4 rendering | Off |
| `--no-plan` | Skip the route planner and always run the React agent loop | Off |
| `--provider <name>` | AI provider: `nvidia`, `anthropic`, `groq` | Auto-detected |
| `--model <id>` | Model ID override (passed to the selected provider) | Provider default |

## Brand Pack API

Pass brand tokens programmatically via the `brand` field in `AgentOptions` to lock the LLM to your design system:

```ts
import type { BrandPack } from '@ove/ai';

export type BrandColor = {
  primary: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
};

export type BrandFont = {
  heading?: string;
  body?: string;
};

export type BrandPack = {
  colors?: BrandColor;
  fonts?: BrandFont;
  logo?: string;    // file path or URL
  name?: string;    // brand name to include in copy
  style?: string;   // free-text style notes e.g. "minimalist", "playful tech"
};
```

When a brand pack is supplied, the agent appends a **Brand Tokens** section to its system prompt instructing the LLM to use *only* those colors and fonts.

## Examples

### 1. Reel Auto-Detection (keyword in brief)

The brief contains "TikTok", so the agent auto-selects 9:16 vertical reel format with safe-zone rules:

```sh
ove agent "A viral TikTok promo for our new AI coding assistant — punchy, neon, fast cuts" ./my-reel
```

The agent will use 1080×1920, enforce safe zones (top 8%, bottom 18%, right 11%), and require `BentoGrid`, `KineticText`, `GlassCard`, and `AmbientGlow`.

### 2. Brand Pack (programmatic API)

Wire up brand tokens when calling `runVideoAgent` directly:

```ts
import { runVideoAgent } from '@ove/ai';
import { createProvider } from '@ove/ai';
import { buildReact } from '@ove/cli/build';

const provider = createProvider({ provider: 'anthropic' });

await runVideoAgent(provider, {
  brief: 'Product launch video for Acme SaaS — showcase the dashboard speed',
  dir: './acme-launch',
  format: 'landscape',
  durationSeconds: 10,
  brand: {
    name: 'Acme',
    colors: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#38bdf8',
      background: '#070a12',
      text: '#f8fafc',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
    style: 'minimalist, modern SaaS, dark mode',
  },
  onProgress: msg => console.log(msg),
}, buildReact);
```

### 3. Landscape Video (explicit flag)

Force landscape 16:9 format regardless of brief content:

```sh
ove agent "Modern SaaS product demo showing 10x speed improvements" ./saas-demo --landscape --duration 12 --fps 30
```

After generation, preview and render manually:

```sh
ove still ./saas-demo/composition.json --allow-code --frame 30 --output preview.png
ove review ./saas-demo/composition.json --output review.png
ove render ./saas-demo/composition.json --allow-code --output out.mp4
ove build ./saas-demo/video.tsx --output ./saas-demo/video.bundle.js
```

## Valid `ove` Commands Reference

The following commands are available in the Open Video Engine CLI:

- `ove agent` — Autonomous AI video agent (this skill)
- `ove render` — Render a composition to MP4/WebM/GIF
- `ove review` — Sample frames and check for design issues; produces a contact sheet
- `ove build` — Compile a React video component with esbuild
- `ove still` — Render a single frame as PNG

## Notes

- The agent uses up to 3 total attempts across both compile errors and visual review failures.
- Visual self-healing only runs when `buildHelper` is provided (CLI mode); in standalone API mode it is skipped.
- The `--no-plan` flag bypasses the route planner and always uses the React code loop.
- Safe-zone auto-enforcement applies only when the reel format is auto-detected (not when `--landscape` is set explicitly).
