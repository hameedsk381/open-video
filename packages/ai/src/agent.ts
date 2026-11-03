import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { AiProvider, ChatMessage } from './providers';

export type VideoFormat = 'reel' | 'landscape';

export type AgentOptions = {
  brief: string;
  dir?: string;
  format?: VideoFormat;
  durationSeconds?: number;
  fps?: number;
  render?: boolean;
  outputMp4?: string;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
};

export type AgentResult = {
  dir: string;
  videoPath: string;
  compositionPath: string;
  bundlePath: string;
  mp4Path?: string;
  previewPath?: string;
  attempts: number;
  code: string;
};

const agentSystemPrompt = (format: VideoFormat, width: number, height: number, durationFrames: number, fps: number) => `You are the lead Motion Graphics Director and React Animation Engineer for Open Video Engine.
Your task is to write a complete, standalone, production-ready React video component file (\`video.tsx\`) based on the user's brief.

You MUST follow these strict technical and design rules:
1. Framework: Use \`@ove/react\` (also importable as \`open-video-engine/react\`).
   Available exports:
   - Primitives: \`AbsoluteFill\`, \`Sequence\`, \`Series\`, \`useCurrentFrame\`, \`useVideoConfig\`, \`interpolate\`, \`spring\`
   - Motion Helpers: \`springValue({ frame, fps, delay, preset, from, to })\`, \`stagger(index, framesPerItem, startDelay)\`
     (Presets: 'bouncy', 'snappy', 'smooth', 'wobbly', 'gentle')
   - High-End Visual Components:
     - \`<AmbientGlow orbs={[...]} blur={100} />\` (always include for dynamic atmospheric background lighting)
     - \`<GlassCard delay={n} preset="snappy" style={{...}}>{children}</GlassCard>\` (frosted glass surface with blur and border highlight)
     - \`<KineticText text="..." delay={n} staggerDelay={3} preset="bouncy" />\` (staggered word-by-word spring entrance)
     - \`<NumberTicker value={100} decimals={0} prefix="$" suffix="/mo" delay={n} />\` (animated metric counter)
     - \`<Badge dotColor="#38bdf8" delay={n}>{children}</Badge>\` (SaaS status pill)
     - \`<DeviceFrame url="example.com" delay={n} style={{...}}>{children}</DeviceFrame>\` (macOS browser window frame)
     - \`<ProgressBar value={0.85} color="#38bdf8" delay={n} />\` (glowing progress bar)
     - \`<Audio src="sfx:whoosh" volume={0.6} />\` (supported sound effects: sfx:whoosh, sfx:pop, sfx:ding, sfx:click, sfx:thump, sfx:tick)

2. Composition Specification:
   - Width: ${width}
   - Height: ${height} (${format === 'reel' ? '9:16 Vertical Reel' : '16:9 Landscape'})
   - FPS: ${fps}
   - Total Duration in Frames: ${durationFrames} (${Math.round(durationFrames / fps)} seconds)

3. File Architecture:
   - MUST export \`config\`:
     \`\`\`tsx
     export const config = {
       id: 'my-video',
       name: 'Video Title',
       width: ${width},
       height: ${height},
       fps: ${fps},
       durationInFrames: ${durationFrames},
       background: '#070a12',
       props: {
         // all custom strings, numbers, and labels
       }
     };
     \`\`\`
   - MUST default export the React component:
     \`\`\`tsx
     export default function Video(props: typeof config.props) {
       const frame = useCurrentFrame();
       const { fps, width, height } = useVideoConfig();
       // return JSX
     }
     \`\`\`

4. Design & Motion Quality (The Viral Claude Standard):
   - Multi-scene structure: split the ${durationFrames} frames into 3 distinct scenes using \`<Sequence from={start} durationInFrames={len}>\`.
   - Scene 1 (Hook): Eye-catching \`<Badge>\`, massive \`<KineticText>\` headline, and \`<Audio src="sfx:whoosh" />\`.
   - Scene 2 (Value / Bento): Bento layout with \`<GlassCard>\`, animated metric \`<NumberTicker>\`, and \`<Audio src="sfx:pop" />\`.
   - Scene 3 (CTA / Showcase): \`<DeviceFrame>\` with product showcase, call-to-action button, and \`<Audio src="sfx:ding" />\`.
   - Continuous Camera Movement: Wrap the entire contents in subtle drift:
     \`transform: \\\`scale(\${(1.0 + (frame / ${durationFrames}) * 0.04).toFixed(4)})\\\`\`
   - Layout: Use Flexbox/Grid with \`AbsoluteFill\` (e.g. \`display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'\`). Never use fragile absolute pixel offsets.

5. Output Format:
   - Output ONLY the clean TypeScript React source code.
   - Do NOT wrap in conversational filler. Fenced code blocks (\`\`\`tsx ... \`\`\`) are accepted.`;

function extractCode(text: string): string {
  const match = text.match(/```(?:tsx|typescript|jsx|javascript)?\s*([\s\S]*?)```/i);
  if (match && match[1]?.trim()) return match[1].trim();
  return text.trim();
}

/**
 * Autonomous Video Agent that plans, codes, builds, and self-corrects React videos.
 */
export async function runVideoAgent(
  provider: AiProvider,
  options: AgentOptions,
  buildHelper?: (source: string, output: string) => Promise<void>
): Promise<AgentResult> {
  const format = options.format ?? 'reel';
  const width = format === 'reel' ? 1080 : 1920;
  const height = format === 'reel' ? 1920 : 1080;
  const fps = options.fps ?? 30;
  const durationSeconds = options.durationSeconds ?? 6;
  const durationFrames = Math.max(30, Math.round(durationSeconds * fps));
  const dir = resolve(options.dir ?? join(process.cwd(), `agent-video-${Date.now()}`));

  options.onProgress?.(`🎬 Video Director Agent initializing in ${dir}…`);
  await mkdir(dir, { recursive: true });

  const messages: ChatMessage[] = [
    { role: 'system', content: agentSystemPrompt(format, width, height, durationFrames, fps) },
    {
      role: 'user',
      content: `Create a broadcast-quality ${format === 'reel' ? '9:16 vertical reel' : '16:9 landscape'} video for this brief:
"${options.brief}"

Make it visually stunning, cinematic, and punchy. Write the complete video.tsx file now.`
    }
  ];

  let videoCode = '';
  let attempts = 0;
  const maxAttempts = 3;
  const videoPath = join(dir, 'video.tsx');
  const compositionPath = join(dir, 'composition.json');
  const bundlePath = join(dir, 'video.bundle.js');

  while (attempts < maxAttempts) {
    attempts++;
    options.onProgress?.(`⚡ Generating React motion code with ${provider.id} (attempt ${attempts}/${maxAttempts})…`);
    
    const reply = await provider.chat(messages, {
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
      break;
    } catch (error: any) {
      const errorMsg = error?.message ?? String(error);
      options.onProgress?.(`⚠️ Build issue detected: ${errorMsg.slice(0, 140)}…`);
      
      if (attempts >= maxAttempts) {
        throw new Error(`Video Agent could not produce a valid build after ${maxAttempts} attempts.\nLast error:\n${errorMsg}`);
      }

      // Self-correction loop: prompt the model to fix the exact build issue
      messages.push(
        { role: 'assistant', content: `\`\`\`tsx\n${videoCode}\n\`\`\`` },
        {
          role: 'user',
          content: `The generated video.tsx failed to build with this error:
${errorMsg}

Please fix the error completely and output the full corrected video.tsx.`
        }
      );
    }
  }

  return {
    dir,
    videoPath,
    compositionPath,
    bundlePath,
    attempts,
    code: videoCode,
  };
}

