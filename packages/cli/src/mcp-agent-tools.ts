// MCP tools and resources for agents that write videos themselves (Claude Code, Codex, Cursor and any other): the agent is the model, so none of
// these needs an AI provider key. It reads the schema and the scene kinds, writes the script, and these tools check it, look up real facts,
// build it and report what is wrong. The AI-writer tools in mcp.ts remain for clients that want the engine to do the writing.
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import { compositionJsonSchema, explainerJsonSchema, explainerKindDocs, explainerSchema, type Explainer } from '@ove/schema';
import { checkFfmpeg, describeBrowser } from '@ove/core';
import { gatherFacts, lookupSchema } from '@ove/ai';
import { buildExplainer } from './explainer';
import { makeReport, makeVideo, type MakeRender } from './make';
import { initProject, skillsRoot } from './init';

type ToolResult = { content: ({ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string })[]; isError: boolean };
const reply = (text: string, isError = false): ToolResult => ({ content: [{ type: 'text', text }], isError });
const json = (value: unknown) => JSON.stringify(value, null, 2);

const scriptInput = {
  file: { type: 'string', description: 'Path to an explainer script (explainer.json)' },
  script: { type: 'object', description: 'The explainer script itself, instead of a file (see motionrender_explainer_kinds for the scenes)' },
};

export const AGENT_TOOLS = [
  {
    name: 'motionrender_make_video',
    description: 'THE QUICK PATH: check, build and review a video in ONE call, and optionally render it. Give an explainer script or a composition (a file, or the script inline with outputDir). It validates, builds composition.json, runs the design review and returns every problem at once with its path, plus ONE contact-sheet image of the whole video, so no separate validate, compile, still or review calls are needed. Fix what it lists and call it again. render: "draft" makes a quick half-size MP4 to check the motion, "final" the full-quality video; leave it out while you are still fixing problems. Nothing is rendered over review errors.',
    inputSchema: { type: 'object', properties: { ...scriptInput, outputDir: { type: 'string', description: 'Where explainer.json and the results go (required with an inline script)' }, render: { type: 'string', enum: ['none', 'draft', 'final'], description: 'Render after the checks (default none)' }, voice: { type: 'boolean', description: 'Record the explainer lines with the free Edge voice (default true; false is faster and silent)' }, voiceName: { type: 'string' }, output: { type: 'string', description: 'The MP4 path (default draft.mp4 or out.mp4 beside the file)' }, allowCode: { type: 'boolean', description: 'Run react, code and p5 layers (only for files you trust)' } } },
  },
  {
    name: 'motionrender_schema',
    description: 'The JSON Schema for a MotionRender composition or an explainer script. Read it before writing either by hand; it lists every field, default and limit.',
    inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['composition', 'explainer'], description: 'Which schema (default composition)' } } },
  },
  {
    name: 'motionrender_explainer_kinds',
    description: 'Every explainer scene kind (title, flow, grid, steps, compare, stat, chart, timeline, pile, media, phone, hex, closing): what it shows, when to use it and a valid example. An explainer is the quickest way to a finished vertical video: you write scenes and spoken lines, the engine draws and times them. No AI key needed.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'motionrender_explainer_validate',
    description: 'Check an explainer script and list every problem at once, with the path to each (such as scenes.2.events). Give a file or the script itself.',
    inputSchema: { type: 'object', properties: scriptInput },
  },
  {
    name: 'motionrender_explainer_compile',
    description: 'Build an explainer script into composition.json (then use motionrender_render_still to look at it and motionrender_render_video to make the MP4). Each scene lasts as long as its spoken line. voice: true records the lines with a free Edge voice (needs internet, no key); the default is silent. Media scenes may give a prompt instead of a file, which needs an image model.',
    inputSchema: { type: 'object', properties: { ...scriptInput, outputDir: { type: 'string', description: 'Where composition.json goes (default: beside the file; required with an inline script)' }, voice: { type: 'boolean', description: 'Record the spoken lines (default false)' }, voiceName: { type: 'string', description: 'Edge voice, such as en-IN-NeerjaNeural, en-US-AriaNeural or te-IN-ShrutiNeural' } } },
  },
  {
    name: 'motionrender_facts',
    description: 'Look up real facts to ground a script, from public APIs that need no key: Wikipedia (what a thing is), the World Bank (latest figures for countries: population, gdp, gdp_per_capita, life_expectancy, internet_users, inflation, unemployment, urban_population) and Frankfurter (exchange rates). Each fact comes with its source and date: put them in the scene and in the script\'s "sources". Prefer this to remembering numbers.',
    inputSchema: { type: 'object', properties: { lookups: { type: 'array', description: 'Up to 8 lookups: {"type":"wikipedia","topic":"Load balancing"}, {"type":"country","countries":["India","Brazil"],"indicator":"population"} or {"type":"exchange","base":"USD","quotes":["INR","EUR"]}', items: { type: 'object' } } }, required: ['lookups'] },
  },
  {
    name: 'motionrender_environment',
    description: 'Check that this machine can render: Node, FFmpeg and the browser. Run it first if a render fails; it says what is missing and how to fix it.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'motionrender_init',
    description: 'Start a project folder: a starter composition.json, its JSON Schema, and the agent instructions and skills for Claude Code, Codex and Cursor. Fails if the folder is not empty unless force is true.',
    inputSchema: { type: 'object', properties: { dir: { type: 'string', description: 'Folder to create' }, force: { type: 'boolean' } }, required: ['dir'] },
  },
];

async function readScript(args: Record<string, any>): Promise<{ spec: unknown; dir?: string }> {
  if (args.script !== undefined) return { spec: args.script };
  if (!args.file) throw new Error('Give a file or a script');
  const file = resolve(String(args.file));
  return { spec: JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')), dir: dirname(file) };
}

const problems = (error: z.ZodError) => error.issues.map(issue => `${issue.path.join('.') || 'script'}: ${issue.message}`);

export async function handleAgentTool(name: string, args: Record<string, any>): Promise<ToolResult | undefined> {
  switch (name) {
    case 'motionrender_schema':
      return reply(json(args.kind === 'explainer' ? explainerJsonSchema : compositionJsonSchema));

    case 'motionrender_make_video': {
      let file = args.file ? resolve(String(args.file)) : undefined;
      if (!file) {
        if (args.script === undefined) throw new Error('Give a file, or a script with outputDir');
        if (!args.outputDir) throw new Error('outputDir is required when the script is given inline');
        const dir = resolve(String(args.outputDir));
        await mkdir(dir, { recursive: true });
        file = join(dir, 'explainer.json');
        await writeFile(file, `${JSON.stringify(args.script, null, 2)}
`);
      }
      const render: MakeRender | undefined = args.render === 'draft' || args.render === 'final' ? args.render : undefined;
      const result = await makeVideo({ file, render, output: args.output, voice: args.voice !== false, voiceName: args.voiceName, allowCode: args.allowCode === true });
      const content: ToolResult['content'] = [{ type: 'text', text: makeReport(result) }];
      if (result.review) { const sheet = await readFile(result.review.sheet); if (sheet.length <= 1_500_000) content.push({ type: 'image', data: sheet.toString('base64'), mimeType: 'image/png' }); }
      return { content, isError: !result.ok };
    }

    case 'motionrender_explainer_kinds':
      return reply(json(explainerKindDocs));

    case 'motionrender_explainer_validate': {
      const { spec } = await readScript(args), parsed = explainerSchema.safeParse(spec);
      if (!parsed.success) return reply(`The script cannot be used:\n${problems(parsed.error).map(line => `- ${line}`).join('\n')}`, true);
      const spoken = parsed.data.scenes.filter(scene => scene.say).length;
      return reply(`Valid explainer "${parsed.data.topic}": ${parsed.data.scenes.length} scenes (${parsed.data.scenes.map(scene => scene.kind).join(', ')}), ${spoken} spoken line${spoken === 1 ? '' : 's'}.`);
    }

    case 'motionrender_explainer_compile': {
      const { spec, dir } = await readScript(args), parsed = explainerSchema.safeParse(spec);
      if (!parsed.success) return reply(`The script cannot be used:\n${problems(parsed.error).map(line => `- ${line}`).join('\n')}`, true);
      const target = args.outputDir ? resolve(String(args.outputDir)) : dir;
      if (!target) throw new Error('outputDir is required when the script is given inline');
      const logs: string[] = [];
      const built = await buildExplainer(parsed.data as Explainer, { output: join(target, 'composition.json'), voice: args.voice === true, voiceName: args.voiceName, log: message => logs.push(message) });
      return reply([`Built ${built.output}`, `- ${built.scenes} scenes, ${built.spoken} spoken line${built.spoken === 1 ? '' : 's'}${args.voice === true ? ' recorded' : ' (silent: pass voice: true to record them)'}`,
        ...(built.pictures.made + built.pictures.reused ? [`- pictures: ${built.pictures.made} drawn, ${built.pictures.reused} reused`] : []), ...logs.filter(line => !/^pictures:/.test(line)).map(line => `- ${line}`), ...built.notes.map(note => `- ${note}`),
        'Next: motionrender_render_still (frame 90) to look at it, motionrender_review_video to check it, then motionrender_render_video.'].join('\n'));
    }

    case 'motionrender_facts': {
      const list = Array.isArray(args.lookups) ? args.lookups.slice(0, 8) : [];
      if (!list.length) throw new Error('lookups is required: a list of wikipedia, country or exchange lookups');
      const lookups = [], skipped: string[] = [];
      for (const item of list) { const parsed = lookupSchema.safeParse(item); if (parsed.success) lookups.push(parsed.data); else skipped.push(`${JSON.stringify(item).slice(0, 100)}: ${problems(parsed.error).join('; ')}`); }
      const { facts, notes } = await gatherFacts(lookups);
      return reply(json({ facts, notes: [...skipped.map(line => `Skipped ${line}`), ...notes] }), !facts.length);
    }

    case 'motionrender_environment': {
      const lines: string[] = [], major = Number(process.versions.node.split('.')[0]);
      lines.push(`${major >= 22 ? 'ok     ' : 'MISSING'} Node ${process.versions.node}${major >= 22 ? '' : ' (22 or later is required)'}`);
      try { const { version, missing } = await checkFfmpeg(); lines.push(`ok      FFmpeg ${version}`); for (const [use, names] of Object.entries(missing)) lines.push(`MISSING FFmpeg encoders for ${use} output: ${names.join(', ')}`); } catch (error) { lines.push(`MISSING FFmpeg: ${(error as Error).message}`); }
      try { lines.push(`ok      Browser ${await describeBrowser()}`); } catch (error) { lines.push(`MISSING Browser: ${(error as Error).message} (install it with: npx motionrender browser install)`); }
      return reply(lines.join('\n'), lines.some(line => line.startsWith('MISSING')));
    }

    case 'motionrender_init': {
      const dir = resolve(String(args.dir || ''));
      if (!args.dir) throw new Error('dir is required');
      const files = await initProject(dir, { force: args.force === true });
      return reply(`Created ${dir} (${files.length} files). Start with composition.json, or write explainer.json (motionrender_explainer_kinds). Instructions for agents are in AGENTS.md and the skills are in .claude/skills and .agent/skills.`);
    }

    default:
      return undefined;
  }
}

/** Skills and schemas as MCP resources, for clients that read them: motionrender://skill/<name>, motionrender://schema/composition|explainer. */
export async function listResources(): Promise<{ uri: string; name: string; description: string; mimeType: string }[]> {
  const resources = [
    { uri: 'motionrender://schema/composition', name: 'Composition JSON Schema', description: 'Every field of a composition.json', mimeType: 'application/json' },
    { uri: 'motionrender://schema/explainer', name: 'Explainer JSON Schema', description: 'Every field of an explainer script', mimeType: 'application/json' },
  ];
  if (!existsSync(skillsRoot)) return resources;
  for (const entry of await readdir(skillsRoot)) {
    const file = join(skillsRoot, entry, 'SKILL.md');
    if (!(await stat(file).catch(() => undefined))) continue;
    const head = (await readFile(file, 'utf8')).match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? `The ${entry} skill`;
    resources.push({ uri: `motionrender://skill/${entry}`, name: `Skill: ${entry}`, description: head.slice(0, 300), mimeType: 'text/markdown' });
  }
  return resources;
}

export async function readResource(uri: string): Promise<{ uri: string; mimeType: string; text: string }> {
  if (uri === 'motionrender://schema/composition') return { uri, mimeType: 'application/json', text: json(compositionJsonSchema) };
  if (uri === 'motionrender://schema/explainer') return { uri, mimeType: 'application/json', text: json(explainerJsonSchema) };
  const skill = uri.match(/^motionrender:\/\/skill\/([a-z0-9-]+)$/)?.[1];
  if (!skill) throw new Error(`Unknown resource ${uri}`);
  const file = join(skillsRoot, skill, 'SKILL.md');
  if (!existsSync(file)) throw new Error(`Unknown resource ${uri}`);
  return { uri, mimeType: 'text/markdown', text: await readFile(file, 'utf8') };
}
