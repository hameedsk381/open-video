import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { loadComposition, renderMedia, renderStill } from '@ove/core';
import { createProvider } from '@ove/ai';
import { runVideoAgent, type VideoFormat } from '../../ai/src/agent';
import { buildReact } from './build';

const option = (argv: string[], name: string): string | undefined => {
  const at = argv.indexOf(name);
  return at < 0 ? undefined : argv[at + 1];
};

const flag = (argv: string[], name: string): boolean => argv.includes(name);

export async function runAgentCli(argv: string[]): Promise<number> {
  const args = argv.slice(2).filter(a => a !== 'agent');
  const brief = args.find(arg => !arg.startsWith('--')) ?? option(argv, '--brief');
  if (!brief) {
    console.log(`Open Video Engine AI Agent: Autonomous Motion Graphics Director

Usage:
  ove agent "<brief>" [dir] [options]

Options:
  --reel             Vertical 9:16 video for Reels/TikTok/Shorts (1080x1920, default)
  --landscape        Landscape 16:9 video for YouTube/Web (1920x1080)
  --duration <sec>   Length in seconds (default: 6)
  --fps <number>     Frames per second (default: 30)
  --no-render        Generate and compile React code only; skip MP4 rendering
  --provider <name>  AI provider: nvidia, anthropic, groq (default: auto-detected)
  --model <id>       Model ID override

Examples:
  ove agent "A viral launch reel for an open-source AI vector database"
  ove agent "Modern SaaS product demo with 10x speed metric" --landscape
  ove agent "Coffee shop flash sale promo" --duration 5 --reel
`);
    return 1;
  }

  const dirArg = args.filter(arg => !arg.startsWith('--'))[1];
  const targetDir = resolve(dirArg ?? `reel-${Date.now()}`);
  const format: VideoFormat = flag(argv, '--landscape') ? 'landscape' : 'reel';
  const duration = Number(option(argv, '--duration') ?? 6);
  const fps = Number(option(argv, '--fps') ?? 30);
  const shouldRender = !flag(argv, '--no-render');

  const providerName = option(argv, '--provider');
  const model = option(argv, '--model');
  const provider = createProvider(providerName ? { provider: providerName, model } : { model });

  console.log(`\n🤖 Starting Open Video Engine Autonomous Agent`);
  console.log(`   Provider: ${provider.id} (${provider.model})`);
  console.log(`   Format:   ${format === 'reel' ? '9:16 Vertical Reel' : '16:9 Landscape'}`);
  console.log(`   Duration: ${duration}s @ ${fps}fps`);
  console.log(`   Target:   ${targetDir}\n`);

  const result = await runVideoAgent(
    provider,
    {
      brief,
      dir: targetDir,
      format,
      durationSeconds: duration,
      fps,
      onProgress: msg => console.log(msg),
    },
    buildReact
  );

  console.log(`\n📁 React video files created:`);
  console.log(`   Component:   ${result.videoPath}`);
  console.log(`   Composition: ${result.compositionPath}`);
  console.log(`   Bundle:      ${result.bundlePath}`);

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
