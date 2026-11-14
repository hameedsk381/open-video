import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadComposition, renderMedia, renderStill } from '@ove/core';
import { createProvider, planBuild, runVideoAgent, type VideoFormat } from '@ove/ai';
import { buildReact } from './build';
import { reactCritiqueFrames, reactVisualCheck } from './react-video';
import { cliRegistry } from './compose-source';

const option = (argv: string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};

const flag = (argv: string[], name: string): boolean => argv.includes(name);

/** The agent's settings parsed from the checked arguments index.ts passes ([command, ...args]). */
export function agentArgs(argv: string[]) {
  const args = argv.slice(1);
  const values = ['--brief', '--duration', '--fps', '--provider', '--model', '--format', '--url'];
  let brief: string | undefined, dir: string | undefined, url: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) { if (values.includes(arg)) i++; continue; }
    // A bare argument is the brief or url, or the output directory after it; option values are skipped above.
    if (brief === undefined) {
      if (/^https?:\/\//i.test(arg)) url = arg;
      else brief = arg;
    } else if (dir === undefined) {
      dir = arg;
    }
  }
  brief = brief ?? option(argv, '--brief');
  url = url ?? option(argv, '--url');
  return {
    brief, dir, url,
    format: (flag(argv, '--landscape') ? 'landscape' : 'reel') as VideoFormat,
    durationSeconds: Number(option(argv, '--duration') ?? 6),
    fps: Number(option(argv, '--fps') ?? 30),
    shouldRender: !flag(argv, '--no-render'),
    noPlan: flag(argv, '--no-plan'),
    noDirection: flag(argv, '--no-direction'),
    providerName: option(argv, '--provider'),
    model: option(argv, '--model'),
  };
}

export async function runAgentCli(argv: string[]): Promise<number> {
  // index.ts passes the checked argument list: [command, ...args].
  const args = agentArgs(argv);
  if (!args.brief && !args.url) {
    console.log(`MotionRender AI Agent: Autonomous Motion Graphics Director

Usage:
  ove agent "<brief>" [dir] [options]
  ove agent --url <website> [options]

Options:
  --url <website>    Ingest brand colors, logo & value propositions from a website URL
  --reel             Vertical 9:16 video for Reels/TikTok/Shorts (1080x1920, default)
  --landscape        Landscape 16:9 video for YouTube/Web (1920x1080)
  --duration <sec>   Length in seconds (default: 6)
  --fps <number>     Frames per second (default: 30)
  --no-render        Generate and compile React code only; skip MP4 rendering
  --no-plan          skip the planner and always run the React agent loop
  --no-direction     skip the creative-direction stage (one fewer model call)
  --provider <name>  AI provider: groq, freellmapi, openai, anthropic, google, mock (default: groq)
  --model <id>       Model ID override

Examples:
  ove agent --url https://linear.app
  ove agent "A viral launch reel for an open-source AI vector database"
  ove agent "Modern SaaS product demo with 10x speed metric" --landscape
  ove agent "Coffee shop flash sale promo" --duration 5 --reel
`);
    return 1;
  }

  const targetDir = resolve(args.dir ?? `reel-${Date.now()}`);
  const format = args.format;
  const duration = args.durationSeconds;
  const fps = args.fps;
  const shouldRender = args.shouldRender;

  const provider = createProvider(args.providerName ? { provider: args.providerName, model: args.model } : { model: args.model });

  console.log(`\n🤖 Starting MotionRender Autonomous Agent`);
  console.log(`   Provider: ${provider.id} (${provider.model})`);
  if (args.url) console.log(`   Source:   ${args.url}`);
  console.log(`   Format:   ${format === 'reel' ? '9:16 Vertical Reel' : '16:9 Landscape'}`);
  console.log(`   Duration: ${duration}s @ ${fps}fps`);
  console.log(`   Target:   ${targetDir}\n`);

  // The shared planner decides the route first: a brief that suits a plain composition is produced there, and only a
  // bespoke motion-graphics brief goes to the React loop. `--no-plan` keeps the React loop as before.
  // Note: If --url is provided, always route to the React agent to leverage bespoke brand tokens & components.
  let plan: Awaited<ReturnType<typeof planBuild>>;
  if (!args.noPlan && !args.url && args.brief) {
    try {
      const canvas = { width: format === 'reel' ? 1080 : 1920, height: format === 'reel' ? 1920 : 1080 };
      plan = await planBuild(provider, {
        brief: args.brief, ...canvas, fps, durationSeconds: duration,
        kind: format === 'reel' ? 'social reel' : 'landscape motion-graphics video', registry: await cliRegistry(), paths: ['react'], allowReact: true, maxAttempts: 2,
        onProgress: message => console.log(message),
      });
      console.log('   Route: React motion code\n');
    } catch { /* planning is optional; fall through to the React agent */ }
  }

  const result = await runVideoAgent(
    provider,
    {
      brief: args.brief,
      url: args.url,
      dir: targetDir,
      format,
      durationSeconds: duration,
      fps,
      plan,
      direction: args.noDirection ? false : undefined,
      onProgress: msg => console.log(msg),
      visualCheck: reactVisualCheck(targetDir),
      critiqueFrames: reactCritiqueFrames(targetDir),
    },
    buildReact
  );

  console.log(`\n📁 React video files created:`);
  console.log(`   Component:   ${result.videoPath}`);
  console.log(`   Composition: ${result.compositionPath}`);
  console.log(`   Bundle:      ${result.bundlePath}`);
  if (result.directionPath) console.log(`   Direction:   ${result.directionPath}`);

  if (shouldRender) {
    console.log(`\n🎥 Rendering video with headless Chromium engine…`);
    const raw = JSON.parse(await readFile(result.compositionPath, 'utf8'));
    const composition = loadComposition(raw);
    const mp4Path = resolve(targetDir, 'output.mp4');
    const stillPath = resolve(targetDir, 'preview.png');

    // 1. Still Preview Frame (Middle frame)
    const midFrame = Math.round(composition.durationFrames / 2);
    await renderStill(composition, {
      frame: midFrame,
      output: stillPath,
      baseDir: targetDir,
      allowCode: true,
    });
    console.log(`📸 Preview captured: ${stillPath} (frame ${midFrame})`);

    // 2. Full MP4 Render
    const started = Date.now();
    let lastReport = 0;
    await renderMedia(composition, {
      baseDir: targetDir,
      output: mp4Path,
      allowCode: true,
      concurrency: 1,
      onProgress: ({ rendered, total }: { rendered: number; total: number }) => {
        if (rendered === total || Date.now() - lastReport > 1000) {
          lastReport = Date.now();
          process.stdout.write(`   Rendered ${rendered}/${total} frames\r`);
        }
      },
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n✨ Render complete in ${elapsed}s!`);
    console.log(`🎬 Video exported: ${mp4Path}`);
  } else {
    console.log(`\nNext:`);
    console.log(`  ove still ${result.compositionPath} --allow-code --frame 30 --output preview.png`);
    console.log(`  ove render ${result.compositionPath} --allow-code --output out.mp4`);
  }

  return 0;
}
