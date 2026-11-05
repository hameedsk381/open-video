// Model Context Protocol (MCP) server for MotionRender.
// Enables Claude (Desktop/Code), OpenAI Codex/ChatGPT, Cursor, Windsurf, and other agents
// to create, inspect, validate, review, and render video compositions via stdio JSON-RPC 2.0.
import readline from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createProvider, refineVideo, writeCompositionProject, planBatch, renderBatch, captionAudio, type ComposeOptions } from '@ove/ai';
import { loadComposition, renderMedia, renderStill, reviewComposition, measureMedia, describeError, adaptCompositionAspect, importFigmaTokens, importFigmaFrame, fetchFigmaFile, type Composition } from '@ove/core';
import { composeSmart, templateChoices } from './templates';
import { listThemes, listBlocks } from './blocks';

const TOOLS = [
  {
    name: 'motionrender_create_video',
    description: 'Create a new motion graphics video composition from a prompt or creative brief. Generates a valid composition.json with typography, animations, camera moves, and themes.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Creative brief or description of the video to create (e.g. "6-second social reel announcing a fitness app launch")' },
        outputDir: { type: 'string', description: 'Folder where composition.json and project files will be created' },
        kind: { type: 'string', enum: ['reel', 'promo', 'product', 'project'], description: 'Video archetype: reel (9:16 vertical), promo (16:9 widescreen), product (1:1 square), or project (16:9 story)' },
        duration: { type: 'number', description: 'Target duration in seconds (e.g. 6, 10, 15)' },
        theme: { type: 'string', description: 'Visual color theme: neon, midnight, slate, warm, editorial, terminal, sunset' },
        template: { type: 'string', description: 'Optional template ID to base video on (e.g. social-reel, product-card, announcement)' },
        full: { type: 'boolean', description: 'Set true to design completely from scratch rather than matching a template' },
      },
      required: ['prompt']
    }
  },
  {
    name: 'motionrender_render_video',
    description: 'Render a MotionRender composition.json into an MP4, WebM, or PNG sequence using the headless renderer.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json file' },
        output: { type: 'string', description: 'Path to write output video (defaults to out.mp4 in the same directory)' },
        format: { type: 'string', enum: ['mp4', 'webm', 'mov', 'gif', 'png'], description: 'Output container format (defaults to mp4)' },
        scale: { type: 'number', description: 'Render scale: 0.5 for fast draft, 1 for full 1080p resolution' },
        aspect: { type: 'string', description: 'Optional aspect ratio to dynamically adapt video to (e.g. "9:16", "16:9", "1:1", "4:5")' },
      },
      required: ['file']
    }
  },
  {
    name: 'motionrender_render_still',
    description: 'Export a single frame from composition.json as a PNG image for visual inspection.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json' },
        frame: { type: 'number', description: 'Frame number to capture (defaults to 0)' },
        output: { type: 'string', description: 'Destination PNG image path (defaults to still.png)' },
        aspect: { type: 'string', description: 'Optional aspect ratio to dynamically adapt frame to (e.g. "9:16", "16:9", "1:1")' }
      },
      required: ['file']
    }
  },
  {
    name: 'motionrender_review_video',
    description: 'Run automated design, type scale, safe-zone, and audio loudness checks on a composition, generating a visual contact sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json' },
        output: { type: 'string', description: 'Destination contact sheet path (defaults to review.png)' },
        showSafeZones: { type: 'boolean', description: 'Whether to overlay social media (TikTok/Reels/Shorts) UI safe zones' },
        aspect: { type: 'string', description: 'Optional aspect ratio to adapt review checks to (e.g. "9:16", "16:9")' }
      },
      required: ['file']
    }
  },
  {
    name: 'motionrender_adapt_aspect',
    description: 'Dynamically adapt an existing composition from one aspect ratio (e.g. 16:9 widescreen) to another (e.g. 9:16 vertical reel or 1:1 square) and write the adapted composition.json.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to source composition.json' },
        aspect: { type: 'string', description: 'Target aspect ratio: "9:16", "16:9", "1:1", "4:5", "3:4", or "WIDTHxHEIGHT"' },
        output: { type: 'string', description: 'Destination path for adapted composition.json (defaults to overwriting input)' }
      },
      required: ['file', 'aspect']
    }
  },
  {
    name: 'motionrender_batch_render',
    description: 'Render an entire dataset of personalized videos from a template and a JSON array of variable values.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to template composition.json' },
        data: { description: 'JSON array of rows or path to rows.json file' },
        outputPattern: { type: 'string', description: 'Output filename pattern with {{variables}}, e.g. "out/{{name}}.mp4"' },
        limit: { type: 'number', description: 'Maximum number of rows to render' },
        scale: { type: 'number', description: 'Render scale: 0.5 for fast draft, 1 for full 1080p' }
      },
      required: ['file', 'data', 'outputPattern']
    }
  },
  {
    name: 'motionrender_transcribe_audio',
    description: 'Transcribe an audio file to extract word-level timestamps and subtitle cues for kinetic captions.',
    inputSchema: {
      type: 'object',
      properties: {
        audio: { type: 'string', description: 'Path to audio file (.mp3, .wav, .m4a)' },
        output: { type: 'string', description: 'Path to write captions.json' },
        language: { type: 'string', description: 'Language code (e.g. "en")' }
      },
      required: ['audio']
    }
  },
  {
    name: 'motionrender_import_figma',
    description: 'Import design tokens (colors, typography, radii) and scene layers from Figma files or exported design tokens JSON.',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Path to Figma tokens/file JSON or Figma fileKey' },
        token: { type: 'string', description: 'Figma personal access token (optional if input is a local file)' },
        outputTheme: { type: 'string', description: 'Path to write theme.json (defaults to theme.json)' },
        outputComp: { type: 'string', description: 'Optional path to write imported composition.json' }
      },
      required: ['input']
    }
  },
  {
    name: 'motionrender_validate',
    description: 'Validate a composition.json file against the MotionRender schema and report any structural or property errors.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json to validate' }
      },
      required: ['file']
    }
  },
  {
    name: 'motionrender_inspect',
    description: 'Inspect a composition.json to retrieve its duration, scenes, layers, dimensions, and assets as structured data.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json' }
      },
      required: ['file']
    }
  },
  {
    name: 'motionrender_list_templates',
    description: 'List all available video templates, themes, blocks, and archetypes built into MotionRender.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'motionrender_refine_video',
    description: 'Apply natural language edits to an existing composition.json (e.g. "make the title larger and change accent color to gold").',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'Path to composition.json' },
        instruction: { type: 'string', description: 'Edit instruction (e.g. "increase font size of headline", "change background to black")' }
      },
      required: ['file', 'instruction']
    }
  }
];

export async function runMcp(_argv: string[]) {
  // During stdio MCP communication, standard stdout is reserved exclusively for JSON-RPC messages.
  // Redirect console.log and console.info to stderr so diagnostics don't corrupt the client stream.
  console.log = (...args: unknown[]) => console.error(...args);
  console.info = (...args: unknown[]) => console.error(...args);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  const send = (msg: unknown) => {
    process.stdout.write(JSON.stringify(msg) + '\n');
  };

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let request: any;
    try {
      request = JSON.parse(trimmed);
    } catch {
      return;
    }

    const { id, method, params } = request;

    // Handle notifications (no response needed)
    if (id === undefined) {
      return;
    }

    try {
      if (method === 'initialize') {
        send({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'motionrender',
              version: '0.3.9'
            }
          }
        });
      } else if (method === 'ping') {
        send({ jsonrpc: '2.0', id, result: {} });
      } else if (method === 'tools/list') {
        send({
          jsonrpc: '2.0',
          id,
          result: { tools: TOOLS }
        });
      } else if (method === 'tools/call') {
        const toolName = params?.name;
        const args = params?.arguments ?? {};
        const result = await handleToolCall(toolName, args);
        send({
          jsonrpc: '2.0',
          id,
          result
        });
      } else {
        send({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` }
        });
      }
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error executing ${method}: ${(err as Error).message}` }],
          isError: true
        }
      });
    }
  });
}

async function handleToolCall(name: string, args: Record<string, any>) {
  switch (name) {
    case 'motionrender_create_video': {
      const prompt = String(args.prompt || '').trim();
      if (!prompt) throw new Error('prompt is required');
      const kind = args.kind || 'reel';
      const durationSeconds = Number(args.duration) || 6;
      const width = kind === 'reel' ? 1080 : kind === 'product' ? 1080 : 1920;
      const height = kind === 'reel' ? 1920 : kind === 'product' ? 1080 : 1080;
      const fps = 30;

      const folderName = args.outputDir
        ? resolve(args.outputDir)
        : resolve(prompt.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32).replace(/^-|-$/g, '') || 'my-video');
      await mkdir(folderName, { recursive: true });

      const provider = createProvider({});
      const options: ComposeOptions = {
        brief: prompt,
        width,
        height,
        fps,
        durationSeconds,
        baseDir: folderName,
        maxAttempts: 3,
        review: false,
      };

      const result = await composeSmart(provider, options, {
        full: Boolean(args.full),
        theme: args.theme,
        template: args.template
      });

      const compPath = resolve(folderName, 'composition.json');
      const files = await writeCompositionProject(folderName, result.composition, { force: true });

      return {
        content: [{
          type: 'text',
          text: `Successfully created video composition in "${folderName}"!
- File: ${compPath}
- Duration: ${(result.composition.durationFrames / result.composition.fps).toFixed(1)}s (${result.composition.durationFrames} frames)
- Resolution: ${result.composition.width}x${result.composition.height} (${kind})
- Scenes: ${result.composition.scenes.length} scenes
${result.template ? `- Template archetype: ${result.template}` : '- Custom generated composition'}

Next actions you can take:
- To inspect visuals: call motionrender_render_still with file="${compPath}"
- To run design review: call motionrender_review_video with file="${compPath}"
- To render video: call motionrender_render_video with file="${compPath}"`
        }],
        isError: false
      };
    }

    case 'motionrender_render_video': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      let composition = loadComposition(raw);
      if (args.aspect) composition = adaptCompositionAspect(composition, args.aspect);
      const output = resolve(args.output || resolve(baseDir, 'out.mp4'));
      const format = args.format || 'mp4';
      const scale = Number(args.scale) || 1;

      const started = Date.now();
      const res = await renderMedia(composition, {
        baseDir,
        output,
        format,
        scale,
      });

      return {
        content: [{
          type: 'text',
          text: `Render complete in ${((Date.now() - started) / 1000).toFixed(1)}s!
- Output: ${res.output}
- Format: ${res.format}
- Resolution: ${composition.width}x${composition.height}${args.aspect ? ` (${args.aspect})` : ''}
- Frames rendered: ${res.frames}
- Duration: ${res.durationSeconds.toFixed(1)}s`
        }],
        isError: false
      };
    }

    case 'motionrender_render_still': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      let composition = loadComposition(raw);
      if (args.aspect) composition = adaptCompositionAspect(composition, args.aspect);
      const frame = Number(args.frame) || 0;
      const output = resolve(args.output || resolve(baseDir, `still-${frame}.png`));

      await renderStill(composition, { frame, output, baseDir });

      return {
        content: [{
          type: 'text',
          text: `Rendered still frame ${frame} (${composition.width}x${composition.height}) to "${output}".`
        }],
        isError: false
      };
    }

    case 'motionrender_review_video': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      let composition = loadComposition(raw);
      if (args.aspect) composition = adaptCompositionAspect(composition, args.aspect);
      const output = resolve(args.output || resolve(baseDir, 'review.png'));

      const result = await reviewComposition(composition, {
        baseDir,
        showSafeZones: Boolean(args.showSafeZones),
      });
      await writeFile(output, result.sheet);

      const errors = result.issues.filter(i => i.severity === 'error');
      const warnings = result.issues.filter(i => i.severity === 'warning');

      return {
        content: [{
          type: 'text',
          text: `Design review finished:
- Contact sheet: ${output} (${result.sheetFrames.length} sampled frames)
- Results: ${errors.length} errors, ${warnings.length} warnings
${result.issues.length ? '\nIssues found:\n' + result.issues.map(i => `[${i.severity.toUpperCase()}] ${i.frame !== undefined ? `frame ${i.frame}: ` : ''}${i.message}`).join('\n') : 'All automated design & contrast checks passed cleanly!'}`
        }],
        isError: false
      };
    }

    case 'motionrender_validate': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const composition = loadComposition(raw);
      return {
        content: [{
          type: 'text',
          text: `Valid MotionRender composition: "${composition.name}" (${composition.id})
- Duration: ${(composition.durationFrames / composition.fps).toFixed(1)}s (${composition.durationFrames} frames @ ${composition.fps}fps)
- Dimensions: ${composition.width}x${composition.height}
- Scenes: ${composition.scenes.length}`
        }],
        isError: false
      };
    }

    case 'motionrender_inspect': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      const composition = loadComposition(raw);
      const measured = await measureMedia(raw, baseDir);

      const summary = {
        id: composition.id,
        name: composition.name,
        width: composition.width,
        height: composition.height,
        fps: composition.fps,
        durationSeconds: composition.durationFrames / composition.fps,
        durationFrames: composition.durationFrames,
        scenes: composition.scenes.map((s, idx) => ({
          id: s.id,
          name: s.name ?? `Scene ${idx + 1}`,
          startFrame: s.startFrame,
          durationFrames: s.durationFrames,
          layers: (s.layers || []).map((l: any) => ({
            id: l.id,
            type: l.type,
            text: l.text || l.content,
            x: l.x,
            y: l.y
          }))
        })),
        variables: composition.variables,
        assets: composition.assets,
        media: measured
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(summary, null, 2)
        }],
        isError: false
      };
    }

    case 'motionrender_list_templates': {
      const templates = await templateChoices();
      const themes = await listThemes();
      const blocks = await listBlocks();

      const summary = {
        templates: templates.map(t => ({ id: t.id, name: t.name, description: t.description, width: t.width, height: t.height })),
        themes: themes.map(th => ({ id: th.id, name: th.name, variables: (th as any).variables })),
        sceneBlocksCount: blocks.length
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(summary, null, 2)
        }],
        isError: false
      };
    }

    case 'motionrender_refine_video': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      const instruction = String(args.instruction || '').trim();
      if (!instruction) throw new Error('instruction is required');

      const provider = createProvider({});
      const current = loadComposition(raw);
      const result = await refineVideo(provider, current, {
        instruction,
        baseDir,
        review: false,
      });

      await writeFile(file, JSON.stringify(result.composition, null, 2) + '\n');

      return {
        content: [{
          type: 'text',
          text: `Successfully refined composition with instruction: "${instruction}"
- Updated file: ${file}
- Attempts: ${result.attempts}
${result.warnings?.length ? `Warnings: ${result.warnings.join(', ')}` : ''}`
        }],
        isError: false
      };
    }

    case 'motionrender_adapt_aspect': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const current = loadComposition(raw);
      const aspect = String(args.aspect || '').trim();
      if (!aspect) throw new Error('aspect is required');
      const adapted = adaptCompositionAspect(current, aspect);
      const output = resolve(String(args.output || file));
      await writeFile(output, JSON.stringify(adapted, null, 2) + '\n');
      return {
        content: [{
          type: 'text',
          text: `Adapted composition from ${current.width}x${current.height} to ${adapted.width}x${adapted.height} (${aspect})!
- Output written to: ${output}
- Scenes: ${adapted.scenes.length}`
        }],
        isError: false
      };
    }

    case 'motionrender_batch_render': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      const composition = loadComposition(raw);
      let rows: any[] = [];
      if (Array.isArray(args.data)) {
        rows = args.data;
      } else if (typeof args.data === 'string') {
        rows = JSON.parse(await readFile(resolve(args.data), 'utf8'));
      }
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('data must be an array of variable objects');
      const pattern = String(args.outputPattern || '').trim();
      if (!pattern) throw new Error('outputPattern is required, e.g. "out/{{name}}.mp4"');
      const plan = await planBatch(composition, rows, pattern, baseDir);
      const res = await renderBatch(plan, baseDir, { scale: Number(args.scale) || 1 }, { limit: Number(args.limit) || undefined });
      return {
        content: [{
          type: 'text',
          text: `Batch render completed for ${res.outputs.length} videos!
${res.outputs.map((out, idx) => `[${idx + 1}] ${out}`).join('\n')}`
        }],
        isError: false
      };
    }

    case 'motionrender_transcribe_audio': {
      const audio = resolve(String(args.audio || ''));
      const provider = createProvider({});
      const outDir = dirname(audio);
      const res = await captionAudio(provider, {
        audio,
        outDir,
        language: args.language,
      });
      const output = resolve(String(args.output || res.captions));
      if (output !== res.captions) {
        await writeFile(output, await readFile(res.captions, 'utf8'));
      }
      return {
        content: [{
          type: 'text',
          text: `Transcribed audio (${res.durationSeconds.toFixed(1)}s):
- Captions file: ${output}
- Words recognized: ${res.words}
- Cues generated: ${res.cues}`
        }],
        isError: false
      };
    }

    case 'motionrender_import_figma': {
      const input = String(args.input || '').trim();
      let data: any;
      const token = String(args.token || process.env.FIGMA_ACCESS_TOKEN || process.env.FIGMA_TOKEN || '').trim();
      if (token && !input.endsWith('.json') && !input.includes('{')) {
        data = await fetchFigmaFile(input, token);
      } else if (input.startsWith('{')) {
        data = JSON.parse(input);
      } else {
        data = JSON.parse(await readFile(resolve(input), 'utf8'));
      }
      const theme = importFigmaTokens(data, 'Figma Brand');
      const outTheme = resolve(String(args.outputTheme || 'theme.json'));
      await writeFile(outTheme, JSON.stringify(theme, null, 2) + '\n');

      let outComp: string | undefined;
      if (args.outputComp) {
        const firstFrame = data?.document?.children?.[0]?.children?.find((c: any) => c.type === 'FRAME') ?? data?.document?.children?.[0] ?? data;
        const comp = importFigmaFrame(firstFrame);
        outComp = resolve(String(args.outputComp));
        await writeFile(outComp, JSON.stringify(comp, null, 2) + '\n');
      }

      return {
        content: [{
          type: 'text',
          text: `Successfully imported Figma design tokens!
- Theme saved: ${outTheme} (${Object.keys(theme.variables).length} tokens: ${Object.keys(theme.variables).join(', ')})
${outComp ? `- Composition saved: ${outComp}` : ''}`
        }],
        isError: false
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
