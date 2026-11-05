// Model Context Protocol (MCP) server for MotionRender.
// Enables Claude (Desktop/Code), OpenAI Codex/ChatGPT, Cursor, Windsurf, and other agents
// to create, inspect, validate, review, and render video compositions via stdio JSON-RPC 2.0.
import readline from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { createProvider, refineVideo, writeCompositionProject, type ComposeOptions } from '@ove/ai';
import { loadComposition, renderMedia, renderStill, reviewComposition, measureMedia, describeError, type Composition } from '@ove/core';
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
        output: { type: 'string', description: 'Destination PNG image path (defaults to still.png)' }
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
        showSafeZones: { type: 'boolean', description: 'Whether to overlay social media (TikTok/Reels/Shorts) UI safe zones' }
      },
      required: ['file']
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
              version: '0.3.3'
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
      const composition = loadComposition(raw);
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
      const composition = loadComposition(raw);
      const frame = Number(args.frame) || 0;
      const output = resolve(args.output || resolve(baseDir, `still-${frame}.png`));

      await renderStill(composition, { frame, output, baseDir });

      return {
        content: [{
          type: 'text',
          text: `Rendered still frame ${frame} to "${output}".`
        }],
        isError: false
      };
    }

    case 'motionrender_review_video': {
      const file = resolve(String(args.file || ''));
      const raw = JSON.parse(await readFile(file, 'utf8'));
      const baseDir = dirname(file);
      const composition = loadComposition(raw);
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

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
