// `ove ai` commands. The engine never calls a model: these commands turn a brief into a normal composition file,
// narration assets and pictures, then hand the result to the same validate/render path as everything else.
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { mergeNarration, ensureBaseline, listRevisions, restoreRevision, saveRevision, type RevisionMeta } from '@ove/ai';
import { captionAudio, composeVideo, compositionRelative, createProvider, describeProvider, editVideo, fieldsFromRows, generateImage, narrate, planBatch, providerCapabilities,
  refineVideo, renderBatch, shortsFrom, writeCompositionProject, type BatchSettings, type ComposeOptions, type ProviderConfig } from '@ove/ai';
import { describeError, renderMedia, type Composition } from '@ove/core';
import { composeSmart, narrateSmart } from './templates';

const usage = `Usage:
  ove ai doctor                                     show the provider, model and capabilities
  ove ai capabilities [--json]     list every registered capability the AI may use
  ove ai history <composition.json>   list the kept revisions of an AI-made video
  ove ai restore <composition.json> <n>   bring revision n back (nothing is lost: the restore is a revision too)
  ove ai compose <dir> --brief "..." [--kind reel|product|promo|project] [--aspect 9:16] [--duration 20] [--fps 30] [--full]
      [--narration] [--review] [--render] [--force] [--dry-run] [--asset id=path] [--fields name[:type],...]
      [--no-plan]   skip the planner: template-first routing, then a straight composition
  ove ai refine <composition.json> --instruction "..." [--review] [--dry-run]
  ove ai narrate <script.txt> [--composition video.json] [--out dir] [--voice Puck] [--language en] [--tail 0.8]
  ove ai narrate --brief "..." [--duration 20] [--composition video.json]
  ove ai transcribe <audio> [--composition video.json] [--out dir] [--language en] [--start 0]
  ove ai edit <clip.mp4> --out reel-dir [--max-silence 0.5] [--keep-fillers] [--width 1080] [--height 1920]
      [--fps 30] [--no-captions] [--language en] [--force]
      transcribe the clip, cut silences and filler words, and write an edited reel project
  ove ai shorts <long.mp4> --out dir [--count 3] [--min 15] [--max 60] [--no-cut] [--no-captions]
      [--width 1080] [--height 1920] [--fps 30] [--language en]
      transcribe once, score candidate clips, and write the best ones as vertical reel projects
  ove ai image "<prompt>" --out assets/bg.png [--size square|portrait|landscape|WxH] [--composition video.json --id bg]
  ove ai batch <rows.json> --brief "..." --output "out/{{id}}.mp4" [--template video.json] [--out-dir dir] [--limit n]
      [--duration 18] [--fps 30] [render options]
  ove ai studio [--port 3100] [--out ai-videos]   open a local page for the AI commands in a browser

Provider options (all commands): --provider anthropic|groq|mock, --model name, --base-url URL
Environment: OVE_AI_PROVIDER, OVE_AI_MODEL, OVE_AI_API_KEY, ANTHROPIC_API_KEY, and GROQ_API_KEY.
Render options: --crf, --bitrate, --audio-bitrate, --scale, --loudness, --concurrency, --preset, --codec, --format`;

const option = (argv: string[], name: string) => { const index = argv.indexOf(name); return index < 0 ? undefined : argv[index + 1]; };
const flag = (argv: string[], name: string) => argv.includes(name);
// Windows editors and PowerShell write a UTF-8 BOM often enough that JSON files must be read tolerantly.
const readJson = async (path: string) => JSON.parse((await readFile(resolve(path), 'utf8')).replace(/^\uFEFF/, ''));

function providerFrom(argv: string[]) {
  const config: ProviderConfig = { provider: option(argv, '--provider'), model: option(argv, '--model'), baseUrl: option(argv, '--base-url') };
  return createProvider(config);
}

function numberOption(argv: string[], name: string, fallback: number): number {
  const raw = option(argv, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

const kinds: Record<string, { aspect: string; duration: number; label: string }> = {
  reel: { aspect: '9:16', duration: 20, label: 'vertical social reel' },
  product: { aspect: '1:1', duration: 18, label: 'product video' },
  promo: { aspect: '16:9', duration: 30, label: 'promo' },
  project: { aspect: '16:9', duration: 60, label: 'project or case-study video' },
};
const aspects: Record<string, [number, number]> = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350], '3:4': [1080, 1440] };

function canvas(argv: string[]) {
  const kindName = option(argv, '--kind') ?? 'promo';
  const preset = kinds[kindName];
  if (!preset) throw new Error(`--kind must be one of: ${Object.keys(kinds).join(', ')}`);
  const aspect = option(argv, '--aspect') ?? preset.aspect;
  const custom = /^(\d+)x(\d+)$/.exec(aspect);
  const [width, height] = custom ? [Number(custom[1]), Number(custom[2])] : aspects[aspect] ?? (() => { throw new Error(`--aspect must be one of ${Object.keys(aspects).join(', ')}, or WIDTHxHEIGHT`); })();
  return { width, height, kind: preset.label, durationSeconds: numberOption(argv, '--duration', preset.duration), fps: numberOption(argv, '--fps', 30) };
}

function fieldsOption(argv: string[]) {
  const raw = option(argv, '--fields');
  if (!raw) return undefined;
  return raw.split(',').map(entry => entry.trim()).filter(Boolean).map(entry => {
    const [name, type = 'string'] = entry.split(':');
    if (!name || !['string', 'number', 'boolean', 'color'].includes(type)) throw new Error('--fields takes name or name:type, with type string, number, boolean or color');
    return { name, type };
  });
}

const mediaTypes: Record<string, string> = { png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', svg: 'image', mp4: 'video', mov: 'video', webm: 'video', mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', json: 'lottie' };

function assetOptions(argv: string[], compositionDir: string) {
  return argv.flatMap((arg, index) => {
    if (arg !== '--asset') return [];
    const pair = argv[index + 1] ?? '', at = pair.indexOf('=');
    const [id, path] = at > 0 ? [pair.slice(0, at), pair.slice(at + 1)] : [basename(pair).replace(/\.[^.]+$/, ''), pair];
    const extension = path.split('.').pop()?.toLowerCase() ?? '';
    // Paths on the command line are relative to the working directory; the asset's src is relative to the composition.
    const file = /^[a-zA-Z]:[\\/]|^[\\/]/.test(path) ? path : resolve(path);
    return [{ id, type: mediaTypes[extension] ?? 'image', src: /^https?:\/\//.test(path) ? path : compositionRelative(compositionDir, file) }];
  });
}

function renderSettings(argv: string[]): BatchSettings {
  const number = (name: string) => { const raw = option(argv, name); if (raw === undefined) return undefined; const value = Number(raw); if (!Number.isFinite(value)) throw new Error(`${name} needs a number`); return value; };
  return {
    crf: number('--crf'), bitrate: option(argv, '--bitrate'), audioBitrate: option(argv, '--audio-bitrate'), scale: number('--scale'),
    loudness: number('--loudness'), concurrency: number('--concurrency'), preset: option(argv, '--preset') as any,
    format: option(argv, '--format') as any, codec: option(argv, '--codec') as any,
    transparent: flag(argv, '--transparent') ? true : undefined, motionBlur: flag(argv, '--no-motion-blur') ? false : undefined,
  };
}

async function renderOne(composition: Composition, baseDir: string, output: string, settings: BatchSettings) {
  console.log(`Rendering ${output}…`);
  return renderMedia(composition, { ...settings, baseDir, output, onProgress: ({ rendered, total }) => { if (rendered === total || rendered % 30 === 0) process.stderr.write(`  ${rendered}/${total} frames\r`); } });
}

// Writes an AI change to a composition file, keeping what was there (the first time) and the result as numbered revisions.
async function trackedWrite(file: string, composition: Composition, meta: RevisionMeta) {
  await ensureBaseline(file);
  await writeFile(file, JSON.stringify({ $schema: './composition.schema.json', ...composition }, null, 2) + '\n');
  return saveRevision(file, meta);
}
const compositionFileOf = (target: string | undefined) => { if (!target || target.startsWith('--')) throw new Error('Name the composition file or its folder'); const path = resolve(target); return /\.json$/i.test(path) ? path : resolve(path, 'composition.json'); };

async function historyCommand(argv: string[]): Promise<number> {
  const file = compositionFileOf(argv[2]), list = await listRevisions(file);
  if (flag(argv, '--json')) { console.log(JSON.stringify(list, null, 2)); return 0; }
  if (!list.length) { console.log(`No history for ${file} yet. Compose, refine, narrate or caption with ove ai and each change is kept.`); return 0; }
  for (const revision of list) console.log(`  ${String(revision.n).padStart(3)}  ${new Date(revision.at).toLocaleString()}  ${revision.kind.padEnd(8)} ${revision.scenes} scenes, ${(revision.frames / 30).toFixed(1)}s  ${revision.label.slice(0, 70)}${revision.changes.length ? `\n               ${revision.changes.join('; ')}` : ''}`);
  console.log(`\nBring one back with: ove ai restore ${argv[2]} <number>`);
  return 0;
}

async function restoreCommand(argv: string[]): Promise<number> {
  const file = compositionFileOf(argv[2]), n = Number(argv[3]);
  if (!Number.isInteger(n) || n < 1) throw new Error('Usage: ove ai restore <composition.json> <revision number>; ove ai history shows them');
  const revision = await restoreRevision(file, n);
  console.log(`Restored revision ${n} into ${file} (kept as revision ${revision.n})`);
  return 0;
}

async function composeCommand(argv: string[]): Promise<number> {
  const target = argv[2];
  if (!target) throw new Error('Usage: ove ai compose <dir> --brief "what the video is about"');
  const brief = option(argv, '--brief');
  if (!brief) throw new Error('ove ai compose needs --brief "what the video is about"');
  const dir = resolve(target);
  const provider = providerFrom(argv);
  const canvasOptions = canvas(argv);
  const narration = flag(argv, '--narration');
  const full = flag(argv, '--full');
  const options: ComposeOptions = { ...canvasOptions, brief, maxAttempts: numberOption(argv, '--max-attempts', 3),
    review: flag(argv, '--review'), plan: full, baseDir: dir, narration, fields: fieldsOption(argv), assets: assetOptions(argv, dir),
    includeSchema: flag(argv, '--schema'), signal: undefined, onProgress: message => console.log(message) };
  let result;
  try {
    result = await composeSmart(provider, options, { full, noPlan: flag(argv, '--no-plan') });
  } catch (error) {
    throw new Error(`Composition generation failed.\n${describeError(error)}`);
  }
  let composition = result.composition;
  const narrationFiles: string[] = [];
  if (narration) {
    const produced = await narrateSmart(provider, result, { brief, outDir: resolve(dir, 'assets'), durationSeconds: canvasOptions.durationSeconds,
      composition, compositionPath: resolve(dir, 'composition.json'), tailSeconds: numberOption(argv, '--tail', 0.8),
      onProgress: message => console.log(message) });
    composition = produced.composition ?? composition;
    narrationFiles.push(produced.audio, ...(produced.captions ? [produced.captions] : []));
  }
  if (flag(argv, '--dry-run')) {
    if (flag(argv, '--json')) console.log(JSON.stringify({ attempts: result.attempts, warnings: result.warnings, composition }, null, 2));
    else console.log(JSON.stringify(composition, null, 2));
    return 0;
  }
  await ensureBaseline(resolve(dir, 'composition.json'));
  // A template video is saved as the template (still editable by variable and theme), with its narration carried across.
  const source = (result as any).source ? (narration ? mergeNarration((result as any).source, composition) : (result as any).source) : undefined;
  const files = await writeCompositionProject(dir, composition, { force: flag(argv, '--force'), source });
  await saveRevision(files.composition, { kind: 'compose', label: brief.slice(0, 160), provider: provider.id, model: provider.model, template: (result as any).template, attempts: result.attempts });
  console.log(`\nChecked and wrote ${files.composition} (${composition.durationFrames} frames, ${composition.scenes.length} scenes, ${result.attempts} attempt${result.attempts === 1 ? '' : 's'})`);
  for (const warning of result.warnings) console.log(`  note: ${warning}`);
  for (const issue of result.issues.filter(issue => issue.severity === 'error')) console.log(`  review error: ${issue.message}`);
  for (const file of narrationFiles) console.log(`  ${file}`);
  if (flag(argv, '--render')) {
    const output = resolve(option(argv, '--output') ?? resolve(dir, 'out.mp4'));
    const rendered = await renderOne(composition, dir, output, renderSettings(argv));
    console.log(`Created ${rendered.output}`);
  } else {
    console.log(`\nNext:\n  ove still ${files.composition} --frame 0 --output still.png\n  ove review ${files.composition} --output review.png\n  ove render ${files.composition} --output ${resolve(dir, 'out.mp4')}\n  ove dev ${files.composition}`);
  }
  if (flag(argv, '--json')) console.log(JSON.stringify({ composition: files.composition, attempts: result.attempts, warnings: result.warnings, narration: narrationFiles }, null, 2));
  return 0;
}

async function refineCommand(argv: string[]): Promise<number> {
  const target = argv[2];
  const instruction = option(argv, '--instruction') ?? option(argv, '--prompt');
  if (!target || target.startsWith('--')) throw new Error('Usage: ove ai refine <composition.json> --instruction "what to change"');
  if (!instruction) throw new Error('ove ai refine needs --instruction "what to change"');
  const provider = providerFrom(argv);
  const file = resolve(target);
  const current = await readJson(file) as Composition;
  const dir = dirname(file);
  const result = await refineVideo(provider, current, {
    instruction,
    maxAttempts: numberOption(argv, '--max-attempts', 3),
    review: flag(argv, '--review'),
    baseDir: dir,
    onProgress: message => console.log(message),
  });
  if (flag(argv, '--dry-run')) {
    if (flag(argv, '--json')) console.log(JSON.stringify({ attempts: result.attempts, warnings: result.warnings, composition: result.composition }, null, 2));
    else console.log(JSON.stringify(result.composition, null, 2));
    return 0;
  }
  await trackedWrite(file, result.composition, { kind: 'refine', label: instruction.slice(0, 160), provider: provider.id, model: provider.model, attempts: result.attempts });
  console.log(`\nRefined and updated ${file} (${result.attempts} attempt${result.attempts === 1 ? '' : 's'})`);
  for (const warning of result.warnings) console.log(`  note: ${warning}`);
  return 0;
}

async function narrateCommand(argv: string[]): Promise<number> {
  const source = argv[2] && !argv[2].startsWith('--') ? argv[2] : undefined;
  const brief = option(argv, '--brief');
  if (!source && !brief) throw new Error('ove ai narrate needs a script file or --brief "what the video is about"');
  const provider = providerFrom(argv);
  const compositionPath = option(argv, '--composition');
  let composition: Composition | undefined;
  let baseDir = process.cwd();
  if (compositionPath) {
    // Read the file as written, not a resolved copy: variables and defaults must stay intact for later renders.
    composition = await readJson(compositionPath) as Composition;
    baseDir = dirname(resolve(compositionPath));
  }
  const text = source ? await readFile(resolve(source), 'utf8') : undefined;
  const outDir = resolve(option(argv, '--out') ?? resolve(baseDir, 'assets'));
  const produced = await narrate(provider, { text, brief, outDir, composition, compositionPath: compositionPath ? resolve(compositionPath) : undefined,
    voice: option(argv, '--voice'), language: option(argv, '--language'), durationSeconds: numberOption(argv, '--duration', 20),
    tailSeconds: numberOption(argv, '--tail', 0.8), captions: !flag(argv, '--no-captions'), onProgress: message => console.log(message) });
  if (produced.composition && compositionPath) {
    await trackedWrite(resolve(compositionPath), produced.composition, { kind: 'edit', label: 'Narration added', provider: provider.id, model: provider.model });
    console.log(`Updated ${resolve(compositionPath)} with the narration scene`);
  }
  console.log(`\nAudio: ${produced.audio} (${produced.durationSeconds.toFixed(2)} s)`);
  if (produced.captions) console.log(`Captions: ${produced.captions} (${produced.words} words)`);
  if (!compositionPath) console.log('Pass --composition video.json to add the audio and captions to a video.');
  if (flag(argv, '--json')) console.log(JSON.stringify({ audio: produced.audio, captions: produced.captions, durationSeconds: produced.durationSeconds, words: produced.words, text: produced.text }, null, 2));
  return 0;
}

async function transcribeCommand(argv: string[]): Promise<number> {
  const audio = argv[2];
  if (!audio || audio.startsWith('--')) throw new Error('Usage: ove ai transcribe <audio> [--composition video.json]');
  const provider = providerFrom(argv);
  const compositionPath = option(argv, '--composition');
  let composition: Composition | undefined;
  if (compositionPath) composition = await readJson(compositionPath) as Composition;
  const start = Number(option(argv, '--start') ?? 0);
  if (!Number.isFinite(start) || start < 0) throw new Error('--start must be a number of seconds, 0 or more');
  const result = await captionAudio(provider, { audio: resolve(audio), outDir: option(argv, '--out') ?? dirname(resolve(audio)),
    language: option(argv, '--language'), composition, compositionPath: compositionPath ? resolve(compositionPath) : undefined,
    startSeconds: start, tailSeconds: numberOption(argv, '--tail', 0.8), onProgress: message => console.log(message) });
  if (result.composition && compositionPath) {
    await trackedWrite(resolve(compositionPath), result.composition, { kind: 'edit', label: 'Captions added', provider: provider.id, model: provider.model });
    console.log(`Updated ${resolve(compositionPath)} with captions`);
  }
  console.log(`\nCaptions: ${result.captions} (${result.words} words${result.cues ? `, ${result.cues} cues` : ''}, ${result.durationSeconds.toFixed(2)} s)`);
  if (!compositionPath) console.log('Pass --composition video.json to add the captions to a video.');
  if (flag(argv, '--json')) console.log(JSON.stringify({ captions: result.captions, words: result.words, cues: result.cues, durationSeconds: result.durationSeconds }, null, 2));
  return 0;
}

async function editCommand(argv: string[]): Promise<number> {
  const clip = argv[2];
  if (!clip || clip.startsWith('--')) throw new Error('Usage: ove ai edit <clip.mp4> --out reel-dir [--max-silence 0.5] [--keep-fillers] [--no-captions]');
  const out = option(argv, '--out');
  if (!out) throw new Error('ove ai edit needs --out <dir> for the project it writes');
  const provider = providerFrom(argv);
  const width = numberOption(argv, '--width', 1080), height = numberOption(argv, '--height', 1920);
  const result = await editVideo(provider, {
    clip: resolve(clip), outDir: resolve(out), width, height, fps: numberOption(argv, '--fps', 30),
    maxSilence: numberOption(argv, '--max-silence', 0.5), keepFillers: flag(argv, '--keep-fillers'),
    captions: !flag(argv, '--no-captions'), language: option(argv, '--language'), force: flag(argv, '--force'),
    onProgress: message => console.log(message),
  });
  const saved = (result.sourceSeconds - result.durationSeconds);
  console.log(`\n${result.segments} clips, ${result.fillers} filler words cut, ${saved.toFixed(1)} s shorter (${result.sourceSeconds.toFixed(1)} s → ${result.durationSeconds.toFixed(1)} s)`);
  console.log(`Project: ${result.composition}`);
  if (result.captions) console.log(`Captions: ${result.captions} (${result.words} words)`);
  console.log(`Next: ove review ${result.composition} --output review.png, then ove render ${result.composition} --output out.mp4`);
  if (flag(argv, '--json')) console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function shortsCommand(argv: string[]): Promise<number> {
  const clip = argv[2];
  if (!clip || clip.startsWith('--')) throw new Error('Usage: ove ai shorts <long.mp4> --out shorts-dir [--count 3] [--min 15] [--max 60] [--no-cut]');
  const out = option(argv, '--out');
  if (!out) throw new Error('ove ai shorts needs --out <dir> for the projects it writes');
  const provider = providerFrom(argv);
  const min = numberOption(argv, '--min', 15), max = numberOption(argv, '--max', 60);
  if (min >= max) throw new Error('--min must be smaller than --max');
  const result = await shortsFrom(provider, {
    clip: resolve(clip), outDir: resolve(out), count: numberOption(argv, '--count', 3), minSeconds: min, maxSeconds: max,
    width: numberOption(argv, '--width', 1080), height: numberOption(argv, '--height', 1920), fps: numberOption(argv, '--fps', 30),
    cut: !flag(argv, '--no-cut'), maxSilence: numberOption(argv, '--max-silence', 0.5), keepFillers: flag(argv, '--keep-fillers'),
    captions: !flag(argv, '--no-captions'), language: option(argv, '--language'), onProgress: message => console.log(message),
  });
  console.log(`\n${result.shorts.length} shorts from a ${result.sourceSeconds.toFixed(0)} s recording:`);
  for (const short of result.shorts) {
    console.log(`  ${short.composition}  (${short.from.toFixed(0)}–${short.to.toFixed(0)} s, score ${short.score.toFixed(1)}, ${short.durationSeconds.toFixed(1)} s)`);
    console.log(`    "${short.text.slice(0, 90)}${short.text.length > 90 ? '…' : ''}"`);
  }
  console.log('Next: review each one (ove review short-01/composition.json --output review.png), then render.');
  if (flag(argv, '--json')) console.log(JSON.stringify(result, null, 2));
  return 0;
}

async function imageCommand(argv: string[]): Promise<number> {
  const prompt = argv[2];
  if (!prompt || prompt.startsWith('--')) throw new Error('Usage: ove ai image "<prompt>" --out assets/background.png');
  const out = option(argv, '--out');
  if (!out) throw new Error('ove ai image needs --out path, e.g. --out assets/hero.png');
  const provider = providerFrom(argv);
  const compositionPath = option(argv, '--composition');
  let composition: Composition | undefined;
  if (compositionPath) composition = await readJson(compositionPath);
  const generated = await generateImage(provider, { prompt, out, size: option(argv, '--size'), composition, compositionPath: compositionPath ? resolve(compositionPath) : undefined, id: option(argv, '--id'), signal: undefined });
  console.log(`Created ${generated.file}${composition ? ` and registered asset "${generated.id}"` : ''}`);
  if (generated.composition && compositionPath) {
    await trackedWrite(resolve(compositionPath), generated.composition, { kind: 'edit', label: 'Picture added', provider: provider.id, model: provider.model });
    console.log(`Updated ${resolve(compositionPath)}`);
  }
  if (flag(argv, '--json')) console.log(JSON.stringify({ file: generated.file, id: generated.id }, null, 2));
  return 0;
}

async function batchCommand(argv: string[]): Promise<number> {
  const rowsPath = argv[2];
  if (!rowsPath) throw new Error('Usage: ove ai batch <rows.json> --brief "..." --output "out/{{name}}.mp4"');
  const brief = option(argv, '--brief');
  const output = option(argv, '--output');
  if (!output) throw new Error('ove ai batch needs --output with {{variables}} in it, e.g. "out/{{name}}.mp4"');
  const rows = await readJson(rowsPath);
  if (!Array.isArray(rows) || rows.length === 0 || rows.some((row: any) => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('The batch file must be a JSON array of objects, one per video');
  const provider = providerFrom(argv);
  let baseDir = dirname(resolve(rowsPath));
  let compositionPath = option(argv, '--template');
  let composition: Composition;
  if (compositionPath) {
    // The raw template, not a resolved one: each row must apply its own variable values.
    composition = await readJson(compositionPath) as Composition;
    compositionPath = resolve(compositionPath);
    baseDir = dirname(compositionPath);
  } else {
    if (!brief) throw new Error('ove ai batch needs --brief "..." (or --template composition.json)');
    const fields = fieldsFromRows(rows);
    const canvasOptions = canvas(argv);
    const dir = resolve(option(argv, '--out-dir') ?? resolve(baseDir, 'ai-template'));
    const result = await composeVideo(provider, { ...canvasOptions, brief, fields, maxAttempts: numberOption(argv, '--max-attempts', 3),
      baseDir: dir, assets: assetOptions(argv, dir), onProgress: message => console.log(message) });
    composition = result.composition;
    const files = await writeCompositionProject(dir, composition, { force: flag(argv, '--force') });
    compositionPath = files.composition;
    baseDir = dir;
    console.log(`Template: ${files.composition} (${result.attempts} attempt${result.attempts === 1 ? '' : 's'})`);
    for (const field of fields) console.log(`  variable: ${field.name} (${field.type})`);
  }
  const plan = await planBatch(composition, rows, output, baseDir);
  if (flag(argv, '--dry-run')) {
    console.log(`Would render ${plan.jobs.length} video${plan.jobs.length === 1 ? '' : 's'}:`);
    for (const job of plan.jobs) console.log(`  ${job.output}`);
    return 0;
  }
  const limit = option(argv, '--limit');
  if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1)) throw new Error('--limit must be a positive whole number of videos');
  const rendered = await renderBatch(plan, baseDir, renderSettings(argv), { limit: limit ? Number(limit) : undefined, onProgress: message => console.log(message) });
  console.log(`\nRendered ${rendered.outputs.length} of ${plan.jobs.length} video${plan.jobs.length === 1 ? '' : 's'}.`);
  return 0;
}

function doctorCommand(argv: string[]): number {
  let provider;
  try { provider = providerFrom(argv); } catch (error) { console.log(`No provider ready: ${describeError(error)}`); return 1; }
  const capabilities = providerCapabilities(provider);
  if (flag(argv, '--json')) { console.log(JSON.stringify({ provider: provider.id, model: provider.model, baseUrl: provider.baseUrl, capabilities }, null, 2)); return 0; }
  console.log(`Provider     ${provider.id}`);
  console.log(`Model        ${provider.model}`);
  console.log(`Endpoint     ${provider.baseUrl}`);
  console.log(`Capabilities ${Object.entries(capabilities).filter(([, on]) => on).map(([name]) => name).join(', ')}`);
  console.log(`\n${describeProvider(provider)}`);
  if (!capabilities.speech) console.log('  Narration needs speech: set GROQ_API_KEY as well (Claude writes the composition; Groq speaks).');
  if (!capabilities.image) console.log('  Images need a provider with image; use --provider mock (Claude and Groq have no image model).');
  console.log('\nSet ANTHROPIC_API_KEY for Claude motion graphics, GROQ_API_KEY for Groq (or speech), or pass --provider.');
  return 0;
}

/** `ove ai capabilities`: the registry of everything the AI may use to make a video. */
async function capabilitiesCommand(argv: string[]): Promise<number> {
  const { cliRegistry } = await import('./templates');
  const registry = await cliRegistry();
  if (flag(argv, '--json')) { console.log(JSON.stringify(registry, null, 2)); return 0; }
  const counts = registry.counts();
  console.log(`Capability registry v${registry.version}: ${Object.values(counts).reduce((total, n) => total + n, 0)} capabilities (${Object.entries(counts).map(([kind, n]) => `${kind} ${n}`).join(', ')})`);
  const kindOf = (kind: string) => registry.capabilities.filter(capability => capability.kind === kind);
  for (const kind of ['template', 'theme', 'block', 'component', 'effect', 'sound'] as const) {
    console.log(`\n${kind === 'template' ? 'template (the primary path: prefer one whenever its kind and aspect fit the brief)' : kind}:`);
    for (const capability of kindOf(kind)) {
      console.log(`  ${capability.id}${capability.fit ? `  (${capability.fit})` : ''}${capability.paths.length && !capability.paths.every(path => path === 'json') ? `  [${capability.paths.join(', ')}]` : ''}`);
      if (capability.description) console.log(`    ${capability.description}`);
      if (capability.params.length) console.log(`    values: ${capability.params.map(param => `${param.name} (${param.type})`).join(', ')}`);
    }
  }
  return 0;
}

async function studioCommand(argv: string[]): Promise<number> {
  const { startAiStudio } = await import('./ai-studio');
  const rawPort = option(argv, '--port');
  const port = rawPort === undefined ? undefined : Number(rawPort);
  if (port !== undefined && !(Number.isInteger(port) && port > 0 && port < 65536)) throw new Error('--port must be a port number');
  // `--out` names the folder the page writes projects and videos into. Everything the page can serve or touch is under it.
  const outDir = option(argv, '--out') ?? option(argv, '--out-dir');
  const host = option(argv, '--host');
  const allowHosts = argv.flatMap((arg, i) => arg === '--allow-host' && argv[i + 1] ? [argv[i + 1]!] : []);
  if (host && !['127.0.0.1', 'localhost', '::1'].includes(host)) console.warn(`Warning: listening on ${host}. The studio has no login, so publish this port only to a network you trust (for example 127.0.0.1:3100 on the Docker host).`);
  const rawPublic = option(argv, '--public-port'), publicPort = rawPublic === undefined ? undefined : Number(rawPublic);
  if (publicPort !== undefined && !(Number.isInteger(publicPort) && publicPort > 0 && publicPort < 65536)) throw new Error('--public-port must be a port number');
  const studio = await startAiStudio({ host, allowHosts, publicPort, port, outDir, provider: option(argv, '--provider'), model: option(argv, '--model'), baseUrl: option(argv, '--base-url') });
  console.log(`OVE AI studio\n  ${studio.url}\nProjects and videos are written under ${resolve(outDir ?? 'ai-videos')}.\nPress Ctrl+C to stop.`);
  const stop = () => { studio.close().finally(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  return 0;
}

export async function runAi(argv: string[]): Promise<number> {
  const sub = argv[1];
  try {
    switch (sub) {
      case 'doctor': return doctorCommand(argv);
      case 'capabilities': return await capabilitiesCommand(argv);
      case 'compose': return await composeCommand(argv);
      case 'refine': return await refineCommand(argv);
      case 'narrate': return await narrateCommand(argv);
      case 'transcribe': return await transcribeCommand(argv);
      case 'edit': return await editCommand(argv);
      case 'shorts': return await shortsCommand(argv);
      case 'image': return await imageCommand(argv);
      case 'batch': return await batchCommand(argv);
      case 'studio': return await studioCommand(argv);
      case 'history': return await historyCommand(argv);
      case 'restore': return await restoreCommand(argv);
      default: console.log(usage); return sub ? 1 : 0;
    }
  } catch (error) {
    console.error(describeError(error));
    return 1;
  }
}

export { usage as aiUsage };
