import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadComposition, safeZoneBands, type Composition } from '@ove/core';
import type { VideoContent } from '@ove/schema';
import { providerVision, visionProvider, type AiProvider, type ChatMessage } from './providers';
import { distillBrandPack, scrapeWebsiteBrand } from './brand-scraper';
import { directionSection, writeDirection, type CreativeDirection, type DirectionBeat, type DirectionPlanInput } from './direction';
import { critiqueVideo, polishRequest, type Critique, type CritiqueFrame } from './critique';

export type VideoFormat = 'reel' | 'landscape';

export type BrandColor = { primary: string; secondary?: string; accent?: string; background?: string; text?: string };
export type BrandFont = { heading?: string; body?: string };
export type BrandPack = {
  colors?: BrandColor;
  fonts?: BrandFont;
  logo?: string;         // file path or URL
  name?: string;         // brand name to include in copy
  /** One line the closing scene may print: phone, email, website. */
  contact?: string;
  style?: string;        // any free-text style notes e.g. "minimalist", "playful tech"
};

export type AgentOptions = {
  brief?: string;
  url?: string;
  dir?: string;
  format?: VideoFormat;
  durationSeconds?: number;
  fps?: number;
  render?: boolean;
  outputMp4?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
  brand?: BrandPack;
  /** The written script: its beats fix the structure and its copy is what the video says. */
  content?: VideoContent;
  /** An explicit canvas (a square or 4:5 project, say) instead of the reel/landscape default. */
  width?: number;
  height?: number;
  /** A decided direction to follow, or `false` to skip the direction stage (it costs one model call). */
  direction?: boolean | CreativeDirection;
  /** The planner's first pass, when it ran: the direction stage refines it instead of inventing a second one. */
  plan?: DirectionPlanInput;
  visualCheck?: (videoPath: string, compositionPath: string) => Promise<{ passed: boolean; report: string; sheet?: Buffer }>;
  /** Renders stills of the built video for the art-director pass. Without it the pass does not run. */
  critiqueFrames?: (compositionPath: string) => Promise<CritiqueFrame[]>;
  /** The model that looks at those stills. Defaults to the build provider when it can see images, else the operator's vision gateway. */
  critiqueProvider?: AiProvider;
  /** How many rewrites the art director may ask for after a clean build (default 2). Each costs a vision call and a rewrite. */
  polishRounds?: number;
};

export type AgentResult = {
  dir: string;
  videoPath: string;
  compositionPath: string;
  bundlePath: string;
  mp4Path?: string;
  previewPath?: string;
  directionPath?: string;
  direction?: CreativeDirection;
  attempts: number;
  code: string;
  /** The composition the last successful build wrote, with the script attached when one was supplied. */
  composition?: Composition;
  /** The art director's last verdict on the finished video, when that pass ran. */
  critique?: Critique;
  /** How many rewrites the art director's findings led to. */
  polished?: number;
};

/**
 * Returns true when the brief hints at a vertical reel format.
 * Checks for social/vertical keywords case-insensitively.
 */
export function detectReelFormat(brief: string): boolean {
  return /\b(reel|short|9:16|viral|tiktok|instagram|shorts|reels|vertical)\b/i.test(brief);
}

function brandPromptSection(brand: BrandPack): string {
  const lines: string[] = ['', '## Brand Tokens (REQUIRED - use ONLY these values)'];
  if (brand.colors) {
    const c = brand.colors;
    const colorParts: string[] = [];
    if (c.primary) colorParts.push(`primary=${c.primary}`);
    if (c.secondary) colorParts.push(`secondary=${c.secondary}`);
    if (c.accent) colorParts.push(`accent=${c.accent}`);
    if (colorParts.length) lines.push(`Colors: ${colorParts.join(', ')}`);
    if (c.background) lines.push(`Background: ${c.background}`);
    if (c.text) lines.push(`Text: ${c.text}`);
  }
  if (brand.fonts) {
    const f = brand.fonts;
    const fontParts: string[] = [];
    if (f.heading) fontParts.push(`heading="${f.heading}"`);
    if (f.body) fontParts.push(`body="${f.body}"`);
    if (fontParts.length) lines.push(`Fonts: ${fontParts.join(', ')}`);
  }
  if (brand.name) lines.push(`Brand Name: ${brand.name}`);
  if (brand.contact) lines.push(`Contact Line: ${brand.contact} (print it in the closing scene)`);
  if (brand.style) lines.push(`Style: ${brand.style}`);
  lines.push('You MUST use ONLY these brand colors and fonts in every component style. Do not invent new colors.');
  return lines.join('\n');
}

/** The written script as prompt text: the beats the video must carry, with the figures each one is allowed to show. */
function scriptSection(content: VideoContent): string {
  const beats = content.beats.map(beat => {
    const figures = beat.data.length ? `; figures: ${beat.data.map(datum => `${datum.label} ${datum.value}${datum.unit ? ` ${datum.unit}` : ''}${datum.period ? ` (${datum.period})` : ''}`).join(', ')}` : '';
    return `- ${beat.name}${beat.seconds ? ` (${beat.seconds} s)` : ''}: on screen "${beat.onScreen}"${beat.narration ? `; spoken "${beat.narration}"` : ''}${figures}`;
  });
  return `\n## Script\nThis video's copy is fixed. Set these beats, in this order, with this timing and this wording: do not rewrite the on-screen lines, do not paraphrase the spoken narration, and never invent a figure, date, name or claim.\n${beats.join('\n')}\n`;
}

const agentSystemPrompt = (format: VideoFormat, width: number, height: number, durationFrames: number, fps: number, reelSafeZone?: boolean, brand?: BrandPack, direction?: CreativeDirection, content?: VideoContent) => {
  // The same insets the design review measures against, rather than percentages retyped here.
  const reelBands = reelSafeZone ? safeZoneBands(width, height) : [];
  const reelNote = reelBands.length
    ? `\n## Safe zones (the platform's own UI covers these)\n${reelBands.map(band => `- ${band.name}: ${band.hint}`).join('\n')}\nKeep titles, captions and calls to action out of them. This constrains layout, not the visual language.\n`
    : '';
  const brandNote = brand ? brandPromptSection(brand) : '';
  const directionNote = direction
    ? `\n## Creative direction\n${directionSection(direction)}\nRealize this direction. Where a specific detail cannot be built in this runtime, keep the concept and choose the closest buildable technique.\n`
    : '';
  const scriptNote = content ? scriptSection(content) : '';

  return `You are a motion designer and creative developer. You own how this video's idea becomes pixels: composition, type, colour, motion, sound and pacing.
${directionNote}${scriptNote}
Write one complete, standalone, production-ready React video component file (\`video.tsx\`) that realizes the brief.

## Technical contract
1. Runtime: \`@ove/react\` (also importable as \`motionrender/react\`). Every frame is rendered on its own and must be reproducible, so all motion is a pure function of the frame.
   - Primitives: \`AbsoluteFill\`, \`Sequence\`, \`Series\`, \`useCurrentFrame\`, \`useVideoConfig\`, \`interpolate\`, \`spring\`, \`Easing\`, \`random\`, \`delayRender\`, \`continueRender\`, \`Audio\`, \`Img\`, \`staticFile\`.
   - Never animate with CSS transitions or keyframes, \`requestAnimationFrame\`, \`setTimeout\` or \`Date.now()\`; drive every value from the frame.
   - Inside a \`<Sequence from={N}>\`, \`useCurrentFrame()\` counts from the start of that sequence (0 at its first frame), not from the start of the video. Time everything in a scene from 0; never pass the sequence's absolute start frame to a child as its own start, or the child stays invisible.
   - Place layers explicitly. An \`AbsoluteFill\` is a full-frame box: \`style={{ x, y }}\` anchors it at that point (text with no width is centred on x when \`textAlign: 'center'\`), and \`translateX\`, \`translateY\`, \`scale\` and \`rotate\` move it. \`left\`/\`top\`/\`width\`/\`height\` work too. Plain CSS layout props that a browser ignores (\`x\`, \`y\` on a \`<div>\`) will not place anything.
   - \`from\` and \`durationInFrames\` on an \`AbsoluteFill\` show it only for that stretch of absolute frames (no remap); use \`Sequence\` when children should count from 0.
   - Nothing on screen may sit still for long. Every element that remains visible must keep changing (drift, parallax, scale, a ticking figure) or leave; once a beat's elements have all arrived and nothing exits, that is a still frame and the review rejects it.
   - Do not fetch anything at render time.
2. Canvas: ${width}x${height} (${format === 'reel' ? '9:16 vertical' : '16:9 landscape'}), ${fps} fps, ${durationFrames} frames (${(durationFrames / fps).toFixed(1)} s).
3. File shape:
   - Export \`config\` with \`id\`, \`name\`, \`width\`, \`height\`, \`fps\`, \`durationInFrames\`, and the strings and numbers the video needs in \`props\`.
   - Default-export the component, reading the frame with \`useCurrentFrame()\` and the canvas with \`useVideoConfig()\`.

4. Toolkit — optional resources, not a recipe. Use a component only when it makes ${direction ? 'this direction' : 'this video'} better, and write your own components or effects whenever that is the truer build.
   - Motion helpers: \`springValue({ frame, fps, delay, preset, from, to })\` and \`stagger(index, framesPerItem, startDelay)\` (presets: 'bouncy', 'snappy', 'smooth', 'wobbly', 'gentle').
   - \`<KineticText text="..." delay={n} staggerDelay={3} preset="bouncy" />\` word-by-word entrance.
   - \`<AmbientGlow orbs={[...]} blur={100} />\` atmospheric colour fields.
   - \`<GlassCard delay={n} preset="snappy">…</GlassCard>\` frosted surface with a border highlight.
   - \`<NumberTicker value={100} decimals={0} prefix="$" suffix="/mo" delay={n} />\` animated figure.
   - \`<Badge dotColor="#38bdf8" delay={n}>…</Badge>\` status pill.
   - \`<DeviceFrame url="example.com" delay={n}>…</DeviceFrame>\` browser or device frame.
   - \`<ProgressBar value={0.85} color="#38bdf8" delay={n} />\`, \`<BentoGrid>\` / \`<BentoCard>\`, \`<Typewriter>\`, \`<Waveform>\`, \`<CodeEditor>\`.
   - Sound through \`<Audio src="sfx:whoosh" volume={0.6} />\`: sfx:whoosh, sfx:pop, sfx:ding, sfx:click, sfx:thump, sfx:tick. Sound is optional.
   - Never name a media file that is not already in the project: there is no music library, so an invented path such as \`audio/pad.mp3\` makes the video fail to render. Use the built-in sounds above, or no sound.

5. Design authorship:
   - The direction decides the number of scenes, their structure, transitions, camera and sound. There is no required three-act shape, no required hook/value/CTA sequence and no required camera move.
   - Do not reach for a house style. Glass cards, bento grids, neon glow, floating dark gradients and a slow continuous zoom are not defaults; use one only if the direction calls for it.
   - Type is designed, not defaulted: set size, weight, tracking, line length and alignment deliberately, and let the type carry meaning where it can.
   - Keep the video recognisably one piece: one palette, one type system, one motion language, even as scenes change.
   - A scene must earn its place. If it shows nothing but decoration, cut it or make it say something.
${reelNote}${brandNote}
## Output format
   - Output ONLY the clean TypeScript React source code.
   - Do NOT wrap it in conversational filler. Fenced code blocks (\`\`\`tsx ... \`\`\`) are accepted.`;
};

/**
 * The code in a reply. Models open a fence twice, leave one unclosed, or put a sentence around the block, so the code is
 * whatever lies between the fence lines: the longest such stretch, preferring one that looks like a module.
 */
export function extractCode(text: string): string {
  const stretches = text.split(/^[ \t]*```[a-z]*[ \t]*$/gim).map(part => part.trim()).filter(Boolean);
  if (stretches.length <= 1) return (stretches[0] ?? text).trim();
  const modules = stretches.filter(part => /\bexport\b|\bimport\b/.test(part));
  return (modules.length ? modules : stretches).reduce((longest, part) => (part.length > longest.length ? part : longest));
}

/**
 * Autonomous Video Agent that plans, codes, builds, and self-corrects React videos.
 */
export async function runVideoAgent(
  provider: AiProvider,
  options: AgentOptions,
  buildHelper?: (source: string, output: string) => Promise<void>
): Promise<AgentResult> {
  let activeBrief = options.brief?.trim() || '';
  let activeBrand = options.brand;

  // If a website URL is provided, autonomously scrape brand tokens and value props
  if (options.url) {
    options.onProgress?.(`🌐 Ingesting brand and value propositions from ${options.url}…`);
    try {
      const scraped = await scrapeWebsiteBrand(options.url);
      const distilled = await distillBrandPack(scraped, provider);
      
      // Merge brand tokens: explicitly provided brand overrides scraped values
      activeBrand = {
        name: options.brand?.name || distilled.brand.name,
        colors: {
          primary: options.brand?.colors?.primary || distilled.brand.colors?.primary || '#6366f1',
          ...distilled.brand.colors,
          ...options.brand?.colors,
        },
        fonts: {
          ...distilled.brand.fonts,
          ...options.brand?.fonts,
        },
        logo: options.brand?.logo || distilled.brand.logo,
        style: options.brand?.style || distilled.brand.style,
      };

      if (!activeBrief) {
        activeBrief = distilled.suggestedBrief;
        options.onProgress?.(`💡 Auto-synthesized brief from ${options.url}: "${activeBrief}"`);
      } else {
        options.onProgress?.(`🎨 Extracted brand "${activeBrand?.name || 'Brand'}" (${activeBrand?.colors?.primary || '#6366f1'}) from ${options.url}`);
      }
    } catch (err: any) {
      options.onProgress?.(`⚠️ Website brand ingestion warning: ${err?.message || err}. Continuing with default styling.`);
    }
  }

  if (!activeBrief) {
    activeBrief = 'Create a punchy modern motion graphics product launch video';
  }

  // Determine format: explicit > auto-detect from brief > default landscape
  const format: VideoFormat = options.format ?? (detectReelFormat(activeBrief) ? 'reel' : 'landscape');
  const width = options.width ?? (format === 'reel' ? 1080 : 1920);
  const height = options.height ?? (format === 'reel' ? 1920 : 1080);
  // Platform bands belong to a portrait social video, not to every portrait canvas (a 4:5 feed video has no reel UI).
  const reelSafeZone = format === 'reel' && height / width > 1.5;
  const fps = options.fps ?? 30;
  const durationSeconds = options.durationSeconds ?? 6;
  const durationFrames = Math.max(30, Math.round(durationSeconds * fps));
  const dir = resolve(options.dir ?? join(process.cwd(), `agent-video-${Date.now()}`));

  options.onProgress?.(`🎬 Video Director Agent initializing in ${dir}…`);
  await mkdir(dir, { recursive: true });

  // Decide the creative direction before any code: the brief alone leaves every visually different video looking the
  // same. A stage failure never blocks the build — the agent still writes the video, just without a fixed direction.
  let direction: CreativeDirection | undefined = typeof options.direction === 'object' ? options.direction : undefined;
  if (options.direction !== false && !direction) {
    const written = await writeDirection(provider, {
      brief: activeBrief, width, height, fps, durationSeconds,
      brand: activeBrand, plan: options.plan, signal: options.signal, onProgress: options.onProgress,
    });
    direction = written.direction;
    if (!direction) options.onProgress?.(`⚠️ No fixed direction: ${written.problems[0] ?? 'the model did not answer in direction form'}. Designing from the brief alone.`);
  }
  // A written script owns the beats: the direction styles them instead of choosing its own structure.
  if (direction && options.content) {
    const each = durationSeconds / options.content.beats.length;
    const structure: DirectionBeat[] = options.content.beats.map(beat => ({ name: beat.name, seconds: beat.seconds ?? Math.round(each * 10) / 10, idea: beat.onScreen }));
    direction = { ...direction, structure };
  }
  let directionPath: string | undefined;
  if (direction) {
    directionPath = join(dir, 'direction.json');
    await writeFile(directionPath, JSON.stringify(direction, null, 2) + '\n', 'utf8');
    options.onProgress?.(`🎨 Direction: ${direction.concept}`);
  }

  // A long folder path used to eat the whole message: show the project's files by name, and enough of the error to act on.
  const readable = (text: string, max = 360) => text.split(dir).join('.').split(dir.split('\\').join('/')).join('.').replace(/\s+/g, ' ').trim().slice(0, max);
  const messages: ChatMessage[] = [
    { role: 'system', content: agentSystemPrompt(format, width, height, durationFrames, fps, reelSafeZone, activeBrand, direction, options.content) },
    {
      role: 'user',
      content: `Brief: "${activeBrief}"\n\n${direction ? 'Build the video the direction describes.' : 'Design the video this brief calls for.'}${options.content ? ' Its copy is the script above: use it as written.' : ''} Write the complete video.tsx file now.`
    }
  ];

  let videoCode = '';
  let attempts = 0;
  let composition: Composition | undefined;
  let currentTask: import('./providers').ChatTask = 'compose';
  const maxAttempts = 3;
  const videoPath = join(dir, 'video.tsx');
  const compositionPath = join(dir, 'composition.json');
  const bundlePath = join(dir, 'video.bundle.js');

  // The composition file is the project's deliverable, so the script travels in it like it does on every other route.
  // A build helper that writes no composition is not a build failure: it just leaves the video without one here.
  const finishBuild = async (): Promise<Composition | undefined> => {
    let raw: Record<string, any> | undefined;
    try { raw = JSON.parse(await readFile(compositionPath, 'utf8')); } catch { raw = undefined; }
    if (raw && options.content) {
      raw = { ...raw, content: options.content };
      await writeFile(compositionPath, JSON.stringify(raw, null, 2) + '\n', 'utf8');
    }
    return raw ? loadComposition(raw) : undefined;
  };

  while (attempts < maxAttempts) {
    attempts++;
    options.onProgress?.(`⚡ Generating React motion code with ${provider.id} (${currentTask}, attempt ${attempts}/${maxAttempts})…`);
    
    const reply = await provider.chat(messages, {
      task: currentTask,
      temperature: attempts === 1 ? 0.4 : 0.2,
      signal: options.signal,
    });

    videoCode = extractCode(reply);
    await writeFile(videoPath, videoCode, 'utf8');

    if (!buildHelper) {
      // In standalone mode without build helper, write code and return
      break;
    }

    options.onProgress?.(`🔨 Compiling and validating React motion graphics…`);
    try {
      await buildHelper(videoPath, compositionPath);
      options.onProgress?.(`✅ Video code compiled and bundled successfully!`);
      composition = (await finishBuild()) ?? composition;

      // Visual self-healing: check the rendered output for design issues
      if (options.visualCheck) {
        options.onProgress?.(`🔍 Running visual design review…`);
        const visualResult = await options.visualCheck(videoPath, compositionPath);
        if (!visualResult.passed) {
          options.onProgress?.(`⚠️ Visual review failed: ${readable(visualResult.report)}`);

          if (attempts >= maxAttempts) {
            throw new Error(`Video Agent could not produce a passing visual review after ${maxAttempts} attempts.\nLast report:\n${visualResult.report}`);
          }

          // Only a model that can see may be sent the sheet: a text-only model refuses the whole message, which would turn
          // a fixable design fault into a failed build.
          const canSee = providerVision(provider);
          currentTask = visualResult.sheet && canSee ? 'vision' : 'heal';

          // Build a repair message for visual issues
          const repairContent = `The video compiled but the design review found these issues:\n${visualResult.report}\n\nPlease fix ONLY these design problems. Output the full corrected video.tsx.`;
          const repairMessages: ChatMessage[] = [
            { role: 'assistant', content: `\`\`\`tsx\n${videoCode}\n\`\`\`` },
            { role: 'user', content: repairContent },
          ];

          messages.splice(2);   // the brief and the latest code only, for the same reason as the build repair below
          // Attach the contact sheet image if the provider supports it (best-effort)
          if (visualResult.sheet && canSee) {
            try {
              const base64 = visualResult.sheet.toString('base64');
              const imageMessage: ChatMessage = {
                role: 'user',
                content: [
                  { type: 'text', text: 'Contact sheet from the visual review (20 frames):' },
                  { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
                ] as any,
              };
              messages.push({ role: 'assistant', content: `\`\`\`tsx\n${videoCode}\n\`\`\`` });
              messages.push(imageMessage);
              messages.push({ role: 'user', content: repairContent });
            } catch {
              messages.push(...repairMessages);
            }
          } else {
            messages.push(...repairMessages);
          }
          continue;
        }
        options.onProgress?.(`✅ Visual design review passed!`);
      }

      break;
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      options.onProgress?.(`⚠️ Build issue detected: ${readable(errorMsg)}`);
      
      if (attempts >= maxAttempts) {
        throw new Error(`Video Agent could not produce a valid build after ${maxAttempts} attempts.\nLast error:\n${errorMsg}`);
      }

      // Self-correction loop: prompt the model to fix the exact build issue. Only the latest code and error go back: the earlier
      // attempts are what failed, and carrying them made each retry bigger until a provider with a small request limit refused it.
      messages.splice(2);
      messages.push(
        { role: 'assistant', content: `\`\`\`tsx\n${videoCode}\n\`\`\`` },
        {
          role: 'user',
          content: `The generated video.tsx failed to build with this error:\n${errorMsg.slice(0, 1500)}\n\nPlease fix the error completely and output the full corrected video.tsx.`
        }
      );
    }
  }

  // The art director's pass: look at the finished build, and rewrite it while the critique finds problems that matter.
  // A rewrite that does not build or fails the review is dropped for the version that did, so this can only improve a result.
  let critique: Critique | undefined;
  let polished = 0;
  const rounds = Math.max(0, options.polishRounds ?? 2);
  if (buildHelper && options.critiqueFrames && (composition as Composition | undefined)) {
    // The art director reads pictures, so it needs a model that sees them. A text-only build model (Groq's default) still
    // builds; its frames go to the operator's vision gateway when one is configured, and the miss is reported, not hidden.
    const reviewer = options.critiqueProvider ?? visionProvider(provider);
    if (!reviewer) options.onProgress?.(`The art director needs a model that can see images; ${provider.id} (${provider.model}) cannot, and no vision gateway is configured (set FREELLMAPI_API_KEY). Continuing without that pass.`);
    else for (let round = 0; ; round++) {
      let frames: CritiqueFrame[];
      try { frames = await options.critiqueFrames(compositionPath); }
      catch (error: any) { options.onProgress?.(`⚠️ Could not render frames for the art director: ${String(error?.message ?? error).split('\n')[0]}`); break; }
      if (!frames.length) break;
      options.onProgress?.(`🎨 Art director is looking at ${frames.length} frames${round ? ` (after rewrite ${round})` : ''}…`);
      const verdict = await critiqueVideo(reviewer, {
        brief: activeBrief, width, height, direction, content: options.content, frames, signal: options.signal, onProgress: options.onProgress,
      });
      if (!verdict) break;
      critique = verdict;
      if (verdict.ready) { options.onProgress?.(`✅ Art director approved (${verdict.score}/10).`); break; }
      if (round >= rounds) { options.onProgress?.(`Art director's notes remain (${verdict.score}/10): ${verdict.problems[0]}`); break; }
      options.onProgress?.(`✍️ Polishing: ${verdict.problems.length} problem${verdict.problems.length === 1 ? '' : 's'} from the art director (${verdict.score}/10)…`);
      const previousCode = videoCode;
      const reply = await provider.chat([
        messages[0]!, messages[1]!,
        { role: 'assistant', content: `\`\`\`tsx\n${videoCode}\n\`\`\`` },
        { role: 'user', content: polishRequest(verdict) },
      ], { task: 'compose', temperature: 0.3, signal: options.signal });
      const candidate = extractCode(reply);
      attempts++;
      try {
        await writeFile(videoPath, candidate, 'utf8');
        await buildHelper(videoPath, compositionPath);
        composition = (await finishBuild()) ?? composition;
        if (options.visualCheck) {
          const check = await options.visualCheck(videoPath, compositionPath);
          if (!check.passed) throw new Error(`the design review failed: ${check.report.slice(0, 160)}`);
        }
        videoCode = candidate;
        polished++;
      } catch (error: any) {
        options.onProgress?.(`⚠️ The rewrite did not hold up (${String(error?.message ?? error).split('\n')[0]}); keeping the version that did.`);
        videoCode = previousCode;
        await writeFile(videoPath, previousCode, 'utf8');
        await buildHelper(videoPath, compositionPath);
        composition = (await finishBuild()) ?? composition;
        break;
      }
    }
  }

  return {
    dir,
    videoPath,
    compositionPath,
    bundlePath,
    directionPath,
    direction,
    attempts,
    code: videoCode,
    composition,
    ...(critique ? { critique } : {}),
    ...(polished ? { polished } : {}),
  };
}

