// `mr explainer`: from an explainer script (what each scene is about and what is said over it) to a composition. validate checks the
// script; the default run also records each scene's spoken line with a free Edge voice, so every scene lasts as long as its line,
// and writes composition.json for the existing still / review / render commands.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { explainerExample, explainerKindDocs, explainerSchema, type Explainer } from '@ove/schema';
import { compileExplainer, type ExplainerAudio } from '@ove/core';
import { createProvider, generateExplainerImages, needsImages, researchFacts, resolveSpeechEngine, type ProviderConfig, speakLine, wavSeconds, writeExplainer } from '@ove/ai';

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };

/** Reads a script and reports every problem at once, rather than the first. */
export function readExplainer(raw: unknown): Explainer {
  const parsed = explainerSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`The explainer cannot be used:\n${parsed.error.issues.map(issue => `- ${issue.path.join('.') || 'explainer'}: ${issue.message}`).join('\n')}`);
  return parsed.data;
}

/** The picture and video files a script's media scenes name that are not there, with the scene each belongs to. */
export function missingMedia(spec: Explainer, baseDir: string): string[] {
  return spec.scenes.flatMap((scene, i) => (scene.kind === 'media' && scene.src !== undefined && !existsSync(resolve(baseDir, scene.src)) ? [`${scene.src} (scene ${i + 1})`] : []));
}

export { wavSeconds };

/** `mr explainer write "what to explain"`: the model writes the script; compile it next. */
async function writeCommand(argv: string[]): Promise<void> {
  const brief = argv[2];
  if (!brief || brief.startsWith('--')) throw new Error('Usage: mr explainer write "what the video should explain" [--scenes 5] [--language English] [--voice <name>] [--media a.mp4,b.jpg] [--images] [--research] [--output explainer.json]');
  const provider = createProvider({ provider: option(argv, '--provider'), model: option(argv, '--model'), baseUrl: option(argv, '--base-url') });
  const scenes = option(argv, '--scenes') === undefined ? undefined : Number(option(argv, '--scenes'));
  if (scenes !== undefined && !(Number.isInteger(scenes) && scenes >= 2 && scenes <= 16)) throw new Error('--scenes must be a whole number from 2 to 16');
  // --research: look up real facts first (Wikipedia, World Bank figures, exchange rates); the script may then state only those as fact.
  let facts: Awaited<ReturnType<typeof researchFacts>>['facts'] = [];
  if (argv.includes('--research')) {
    console.log('Looking up facts…');
    const found = await researchFacts(provider, brief);
    facts = found.facts;
    console.log(`  ${facts.length} fact${facts.length === 1 ? '' : 's'} found${facts.length ? ` (${[...new Set(facts.map(fact => fact.source.split(':')[0]!.split(',')[0]))].join(', ')})` : ''}`);
    for (const note of found.notes) console.log(`  ${note}`);
  }
  const { explainer, attempts } = await writeExplainer(provider, brief, { facts, scenes, language: option(argv, '--language'), voice: option(argv, '--voice'), media: option(argv, '--media')?.split(',').map(item => item.trim()).filter(Boolean), images: argv.includes('--images'), onProgress: message => console.log(message) });
  const output = resolve(option(argv, '--output') ?? 'explainer.json');
  await writeFile(output, `${JSON.stringify(explainer, null, 2)}\n`);
  console.log(`Wrote ${output} (${explainer.scenes.length} scenes${attempts > 1 ? `, after ${attempts} attempts` : ''})\nNext: mr explainer compile ${relative(process.cwd(), output)}`);
}

/** `mr explainer kinds`: every scene kind, what it shows and a valid example, so a script can be written without an AI provider. */
function kindsCommand(argv: string[]): void {
  if (argv.includes('--json')) { console.log(JSON.stringify(explainerKindDocs, null, 2)); return; }
  for (const doc of explainerKindDocs) console.log(`${doc.kind.padEnd(9)} ${doc.shows}\n          use: ${doc.use}\n          example: ${JSON.stringify(doc.example)}\n`);
  console.log('Whole scripts: mr explainer example  ·  JSON Schema: mr schema --explainer  ·  build: mr explainer compile script.json');
}

async function exampleCommand(argv: string[]): Promise<void> {
  const json = JSON.stringify(explainerExample(), null, 2) + '\n', output = option(argv, '--output');
  if (output) { await writeFile(resolve(output), json); console.log(`Wrote ${resolve(output)}\nNext: mr explainer compile ${output}`); } else process.stdout.write(json);
}

/** `mr explainer validate --json`: the problems as data, for a tool or an agent to read. */
async function validateJson(file: string): Promise<void> {
  const parsed = explainerSchema.safeParse(JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')));
  if (parsed.success) console.log(JSON.stringify({ valid: true, topic: parsed.data.topic, scenes: parsed.data.scenes.map(scene => scene.kind), spokenLines: parsed.data.scenes.filter(scene => scene.say).length }));
  else { console.log(JSON.stringify({ valid: false, errors: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) })); process.exitCode = 1; }
}

export async function runExplainer(argv: string[]): Promise<void> {
  const [, action, file] = argv;
  if (action === 'write') return writeCommand(argv);
  if (action === 'kinds') return kindsCommand(argv);
  if (action === 'example') return exampleCommand(argv);
  if (action !== 'compile' && action !== 'validate') throw new Error('Usage: mr explainer write "<what to explain>" | kinds [--json] | example [--output explainer.json] | validate <explainer.json> | compile <explainer.json> [--output composition.json] [--no-voice] [--voice <name>]');
  if (!file) throw new Error(`mr explainer ${action} needs an explainer file`);
  if (action === 'validate' && argv.includes('--json')) return validateJson(file);
  const spec = readExplainer(JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, '')));
  const spoken = spec.scenes.filter(scene => scene.say).length;
  if (action === 'validate') {
    console.log(`Valid explainer "${spec.topic}": ${spec.scenes.length} scene${spec.scenes.length === 1 ? '' : 's'} (${spec.scenes.map(scene => scene.kind).join(', ')}), ${spoken} spoken line${spoken === 1 ? '' : 's'}.`);
    return;
  }
  const built = await buildExplainer(spec, {
    output: resolve(option(argv, '--output') ?? join(dirname(resolve(file)), 'composition.json')), voice: !argv.includes('--no-voice'), voiceName: option(argv, '--voice'), language: option(argv, '--language'),
    speechEngine: option(argv, '--speech-engine') as ProviderConfig['speechEngine'], provider: { provider: option(argv, '--provider'), model: option(argv, '--model'), baseUrl: option(argv, '--base-url') }, log: message => console.log(`  ${message}`),
  });
  for (const note of built.notes) console.log(`  ${note}`);
  console.log(`Wrote ${built.output}\nNext: mr still ${relative(process.cwd(), built.output)} --frame 90 · mr render ${relative(process.cwd(), built.output)} --output out.mp4`);
}

export type BuildExplainerOptions = {
  /** Where composition.json goes; pictures and voices go to an assets folder beside it. */ output: string;
  /** Record each spoken line (default true). Without it scenes last as long as their pictures need. */ voice?: boolean;
  voiceName?: string; language?: string; speechEngine?: ProviderConfig['speechEngine'];
  /** Which AI provider draws pictures and runs a non-Edge voice; only used when the script needs one. */ provider?: { provider?: string; model?: string; baseUrl?: string };
  log?: (message: string) => void;
};

/** A checked script into composition.json: draws the pictures that were asked for, records the voice, compiles, writes. Used by the command line and the MCP server. */
export async function buildExplainer(script: Explainer, options: BuildExplainerOptions): Promise<{ output: string; notes: string[]; scenes: number; spoken: number; pictures: { made: number; reused: number } }> {
  const log = options.log ?? (() => {}), output = resolve(options.output), dir = dirname(output), assets = join(dir, 'assets');
  let spec = script, pictures = { made: 0, reused: 0 };
  if (needsImages(spec)) {
    const drawn = await generateExplainerImages(spec, createProvider(options.provider ?? {}), { dir, onProgress: log });
    spec = drawn.spec; pictures = { made: drawn.made, reused: drawn.reused };
    log(`pictures: ${drawn.made} drawn, ${drawn.reused} reused`);
  }
  const missing = missingMedia(spec, dir);
  if (missing.length) throw new Error(`The video needs files that are not next to it (${dir}):\n${missing.map(item => `- ${item}`).join('\n')}\nAdd them in the editor's Media tab or copy them there, then compile again.`);
  const spoken = spec.scenes.filter(scene => scene.say).length, withVoice = options.voice !== false && spoken > 0, voice = options.voiceName ?? spec.voice;
  // The Edge engine needs no key, so only the other engines build a provider; `createProvider` routes the speech seam the same way a render does.
  const voiceProvider = withVoice && resolveSpeechEngine({ speechEngine: options.speechEngine }) !== 'edge' ? createProvider({ ...options.provider, speechEngine: options.speechEngine }) : undefined;
  const audio: (ExplainerAudio | undefined)[] = [];
  if (withVoice) {
    await mkdir(assets, { recursive: true });
    for (const [i, scene] of spec.scenes.entries()) {
      if (!scene.say) { audio.push(undefined); continue; }
      const name = `voice-${i + 1}.wav`, made = await speakLine(scene.say, voice, join(assets, name), voiceProvider, options.language, spec.voiceRate);
      log(`scene ${i + 1}: ${made.fresh ? 'recorded' : 'reused'} ${made.seconds.toFixed(1)} s`);
      audio.push({ src: relative(dir, join(assets, name)).replace(/\\/g, '/'), seconds: made.seconds });
    }
  }
  const { composition, notes } = compileExplainer(spec, { audio });
  await mkdir(dir, { recursive: true });
  await writeFile(output, JSON.stringify(composition, null, 2) + '\n');
  return { output, notes, scenes: spec.scenes.length, spoken, pictures };
}
