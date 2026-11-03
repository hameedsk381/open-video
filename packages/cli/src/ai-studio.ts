// `ove ai studio`: a local page for the AI authoring layer. It uses the same @ove/ai functions as the CLI, holds no
// model state of its own, and writes ordinary projects that `ove dev`, `ove render` and `ove review` already know.
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, relative as relativePath, resolve, sep } from 'node:path';
import {
  assetProblems, mergeNarration, ensureBaseline, listRevisions, restoreRevision, saveRevision, type RevisionMeta, captionAudio, composeVideo, createProvider, extractJson, fieldsFromRows, generateImage, narrate, planBatch,
  providerCapabilities, refineVideo, renderBatch, sanitizeCompositionJson, systemPrompt, userPrompt, writeCompositionProject, type AiProvider, type BatchSettings, type ComposeOptions,
} from '@ove/ai';
import {
  attachCaptions, defaultConcurrency, defaultPreset, describeError, loadComposition, renderMedia, renderStill,
  reviewComposition, x264Presets, type Composition,
} from '@ove/core';
import { measureMedia, sfxFile } from '@ove/core';
import { builtinFontFaces } from '@ove/graphics';
import { builtinFontDir } from '@ove/graphics/fonts';
import { resolveVariables, sfxNames, variablesSchema } from '@ove/schema';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aiStudioPage } from './ai-studio-page';
import { addBlock, applyTheme, emptyComposition, listBlocks, listThemes, readBlock, readTheme, themeTokens } from './blocks';
import { playerScript } from './dev';
import { assetKinds, copyProject, listAssets, listProjects, projectMode, projectVariables, setVariableValues, slugify, textLayers, trashProject, uniqueFolder } from './ai-studio-projects';
import { listTemplates } from './templates';
import { composeSmart, narrateSmart } from './templates';
import { assetIdFromPath } from '@ove/ai';
import { makeThumbnail } from './thumbnail';

export type AiStudioOptions = {
  port?: number;
  outDir?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  allowHosts?: string[];
};

export type AiStudioServer = { url: string; close(): Promise<void> };

const kinds: Record<string, { aspect: string; duration: number; label: string }> = {
  reel: { aspect: '9:16', duration: 20, label: 'vertical social reel' },
  product: { aspect: '1:1', duration: 18, label: 'product video' },
  promo: { aspect: '16:9', duration: 30, label: 'promo' },
  project: { aspect: '16:9', duration: 60, label: 'project or case-study video' },
};
const aspects: Record<string, [number, number]> = { '9:16': [1080, 1920], '1:1': [1080, 1080], '16:9': [1920, 1080], '4:5': [1080, 1350], '3:4': [1080, 1440] };

const textOf = (value: unknown, label: string) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`${label} is required`);
  return text;
};
const optionalText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
const boolOf = (value: unknown) => value === true || value === 'true' || value === 'on';

function numberIn(value: unknown, fallback: number, label: string, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error(`${label} must be a number from ${min} to ${max}`);
  return number;
}

function optionalNumber(value: unknown, label: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return numberIn(value, 0, label, min, max);
}

function integerIn(value: unknown, fallback: number, label: string, min: number, max: number): number {
  const number = numberIn(value, fallback, label, min, max);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number`);
  return number;
}

/** The canvas from the same presets the CLI uses, so a page and a command produce the same shape. */
export function canvasFor(input: Record<string, unknown> = {}) {
  const kindName = optionalText(input.kind) ?? 'promo';
  const preset = kinds[kindName];
  if (!preset) throw new Error(`kind must be one of: ${Object.keys(kinds).join(', ')}`);
  const aspect = optionalText(input.aspect) ?? preset.aspect;
  const custom = /^(\d+)x(\d+)$/.exec(aspect);
  const dimensions = custom ? [Number(custom[1]), Number(custom[2])] as [number, number] : aspects[aspect];
  if (!dimensions) throw new Error(`aspect must be one of ${Object.keys(aspects).join(', ')}, or WIDTHxHEIGHT`);
  return {
    kind: preset.label,
    width: dimensions[0],
    height: dimensions[1],
    durationSeconds: numberIn(input.duration, preset.duration, 'duration', 0.1, 3600),
    fps: integerIn(input.fps, 30, 'fps', 1, 120),
  };
}

/** A folder name that is safe on Windows and POSIX, used when the page leaves the folder blank. */
export function folderName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'video';
}

/** True when target is a file or folder strictly below root (root itself is not allowed). */
export function within(root: string, target: string): boolean {
  const rel = relativePath(resolve(root), resolve(target));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

type JobStatus = 'queued' | 'running' | 'done' | 'error';
type JobKind = 'thumbnail' | 'compose' | 'render' | 'review' | 'narrate' | 'transcribe' | 'image' | 'batch' | 'refine' | 'import';
type Job = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  messages: string[];
  result?: unknown;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  run: (progress: (message: string) => void) => Promise<unknown>;
};

const mediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8',
};

// The web app (apps/studio, built by `pnpm build:studio`) sits next to blocks/ and themes/, in the workspace and in the published package.
// Without a build the studio falls back to the plain page in ai-studio-page.ts.
const studioDir = fileURLToPath(new URL('../studio', import.meta.url));
const studioFile = async (pathname: string): Promise<string | undefined> => {
  const target = resolve(studioDir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
  if (!within(studioDir, target)) return undefined;
  try { return (await stat(target)).isFile() ? target : undefined; } catch { return undefined; }
};

export async function startAiStudio(options: AiStudioOptions = {}): Promise<AiStudioServer> {
  const root = resolve(options.outDir ?? 'ai-videos');
  await mkdir(root, { recursive: true });
  let provider: AiProvider | undefined, providerError: string | undefined;
  try { provider = createProvider({ provider: options.provider, model: options.model, baseUrl: options.baseUrl }); }
  catch (error) { providerError = describeError(error); }

  const clients = new Set<ServerResponse>();
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  let running = false, nextId = 0, port = 0;

  const publicJob = (job: Job) => { const { run, ...rest } = job; return rest; };
  const recentJobs = () => [...jobs.values()].slice(-20).map(publicJob);
  const providerState = () => provider
    ? { provider: { id: provider.id, model: provider.model, baseUrl: provider.baseUrl, capabilities: providerCapabilities(provider) }, error: null }
    : { provider: null, error: providerError ?? 'No AI provider is configured' };
  const requireProvider = () => { if (!provider) throw new Error(providerError ?? 'No AI provider is configured'); return provider; };

  const sendEvent = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of [...clients]) { try { client.write(message); } catch { clients.delete(client); } }
  };
  const broadcast = (job: Job) => sendEvent('job', publicJob(job));
  const pump = async () => {
    if (running) return;
    const job = queue.shift();
    if (!job) return;
    running = true; job.status = 'running'; job.startedAt = Date.now(); broadcast(job);
    try {
      job.result = await job.run(message => {
        job.messages.push(String(message));
        if (job.messages.length > 200) job.messages.shift();
        broadcast(job);
      });
      job.status = 'done';
    } catch (error) {
      job.error = describeError(error);
      job.status = 'error';
    } finally {
      job.endedAt = Date.now(); running = false; broadcast(job); void pump();
    }
  };
  const enqueue = (kind: JobKind, run: Job['run']) => {
    const job: Job = { id: String(++nextId), kind, status: 'queued', messages: [], run };
    jobs.set(job.id, job); queue.push(job);
    if (jobs.size > 40) for (const [id, old] of jobs) { if (jobs.size <= 20) break; if (old.status === 'done' || old.status === 'error') jobs.delete(id); }
    broadcast(job); void pump();
    return publicJob(job);
  };

  const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  const relative = (file: string) => relativePath(root, file).split(sep).join('/');
  const urlFor = (file: string) => '/files/' + relative(file).split('/').map(encodeURIComponent).join('/');
  const inside = (value: string, label: string, base = root) => {
    const target = isAbsolute(value) ? resolve(value) : resolve(base, value);
    if (!within(root, target)) throw new Error(`${label} must be inside ${root}`);
    return target;
  };
  const projectDir = (value: unknown, brief: string) => inside(optionalText(value) ?? folderName(brief), 'folder');
  const fileInside = (value: unknown, label: string) => inside(textOf(value, label), label);
  // Files you already have may be anywhere on disk, but only the kinds the job uses: audio is sent to the provider, rows are read as data.
  const audioTypes = ['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.mp4', '.mov', '.mkv'];
  const inputFile = (value: unknown, label: string, extensions: string[]) => {
    const text = textOf(value, label);
    const file = isAbsolute(text) ? resolve(text) : resolve(process.cwd(), text);
    if (!extensions.includes(extname(file).toLowerCase())) throw new Error(`${label} must be a ${extensions.join(', ')} file`);
    return file;
  };
  const loadForRender = async (file: string) => {
    const raw = await readJson(file);
    const baseDir = dirname(file);
    const composition = await attachCaptions(loadComposition(raw), baseDir);
    return { raw, composition: composition as Composition, baseDir };
  };
  // With `meta`, the change is kept as a numbered revision (and what was there before, the first time).
  const writeComposition = async (file: string, composition: Composition, meta?: RevisionMeta) => {
    if (meta) await ensureBaseline(file);
    await writeFile(file, JSON.stringify({ $schema: './composition.schema.json', ...composition }, null, 2) + '\n');
    if (meta) await saveRevision(file, { provider: provider?.id, model: provider?.model, ...meta });
  };
  const renderSettings = (input: Record<string, unknown>): BatchSettings => {
    const preset = optionalText(input.preset) ?? defaultPreset;
    if (!x264Presets.includes(preset as never)) throw new Error(`preset must be one of: ${x264Presets.join(', ')}`);
    return {
      scale: optionalNumber(input.scale, 'scale', 0.05, 1),
      loudness: optionalNumber(input.loudness, 'loudness', -60, 0),
      crf: optionalNumber(input.crf, 'crf', 0, 51),
      preset: preset as BatchSettings['preset'],
      concurrency: defaultConcurrency(),
    };
  };
  // A project edit writes the file's own JSON (variables, components and all), kept as a revision.
  const writeRaw = async (file: string, raw: unknown, meta: RevisionMeta) => {
    loadComposition(raw);
    await ensureBaseline(file);
    await writeFile(file, JSON.stringify(raw, null, 2) + '\n');
    await saveRevision(file, { provider: provider?.id, model: provider?.model, ...meta });
  };
  const projectFile = (id: unknown) => { const dir = inside(textOf(id, 'project'), 'project'); return { dir, file: resolve(dir, 'composition.json') }; };
  const readBytes = (req: IncomingMessage, limit: number) => new Promise<Buffer>((ok, fail) => {
    const parts: Buffer[] = []; let size = 0;
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) { fail(new Error('That file is too large')); req.destroy(); } else parts.push(chunk); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail);
  });
  const setAtPath = (rootValue: any, path: string, apply: (layer: any) => void) => {
    let node = rootValue;
    for (const [, name, index] of path.matchAll(/([A-Za-z_]+)|\[(\d+)\]/g)) node = node?.[index === undefined ? name! : Number(index)];
    if (!node || typeof node !== 'object') throw new Error('That text is no longer in the video');
    apply(node);
  };
  const projectDetail = async (id: string) => {
    const { dir, file } = projectFile(id), raw = await readJson(file), composition = loadComposition(raw), mode = projectMode(raw);
    const declared = variablesSchema.parse(raw.variables ?? {}), values = resolveVariables(declared, {});
    return {
      id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, mode,
      scenes: composition.scenes.map(scene => ({ id: scene.id, name: scene.name, startFrame: scene.startFrame, durationFrames: scene.durationFrames })),
      variables: mode === 'template' ? projectVariables(raw) : [], theme: Object.fromEntries(themeTokens.filter(token => token in declared).map(token => [token, values[token]])),
      texts: mode === 'finished' ? textLayers(composition) : [], assets: await listAssets(dir), revisions: (await listRevisions(file)).length,
      source: { raw, media: await measureMedia(raw, dir), base: `/files/${id}/` },
    };
  };
  const thumbFor = async (id: string) => {
    const { dir, file } = projectFile(id), cache = resolve(dir, '.studio', 'thumb.png');
    const [source, cached] = await Promise.all([stat(file), stat(cache).catch(() => undefined)]);
    if (cached && cached.mtimeMs >= source.mtimeMs) return readFile(cache);
    const { raw, baseDir } = await loadForRender(file);
    const made = await makeThumbnail(raw, {}, baseDir, { width: 480 });
    await mkdir(dirname(cache), { recursive: true }); await writeFile(cache, made.png);
    return made.png;
  };
  const resultFile = (file: string) => ({ file, relative: relative(file), url: urlFor(file) });

  const composeJob = (input: Record<string, unknown>) => {
    const brief = textOf(input.brief, 'brief');
    const canvas = canvasFor(input);
    const dir = projectDir(input.folder, brief);
    return enqueue('compose', async progress => {
      const ai = requireProvider();
      const pictures = (await listAssets(dir)).map(asset => ({ id: assetIdFromPath(asset.name), type: asset.kind, src: './' + asset.path }));
      const options: ComposeOptions = {
        ...canvas, brief, baseDir: dir, ...(pictures.length ? { assets: pictures } : {}), review: boolOf(input.review), narration: boolOf(input.narration),
        includeSchema: boolOf(input.schema), maxAttempts: integerIn(input.maxAttempts, 3, 'maxAttempts', 1, 10),
        onProgress: message => progress(message),
      };
      const result = await composeSmart(ai, options, { full: boolOf(input.full) });
      let composition = result.composition;
      let narration: Record<string, unknown> | undefined;
      if (options.narration) {
        const produced = await narrateSmart(ai, result, {
          brief, outDir: resolve(dir, 'assets'), durationSeconds: canvas.durationSeconds, composition,
          compositionPath: resolve(dir, 'composition.json'), tailSeconds: 0.8, onProgress: message => progress(message),
        });
        composition = produced.composition ?? composition;
        narration = {
          audio: produced.audio, audioUrl: urlFor(produced.audio),
          captions: produced.captions, captionsUrl: produced.captions ? urlFor(produced.captions) : undefined,
          words: produced.words, durationSeconds: produced.durationSeconds,
        };
      }
      await ensureBaseline(resolve(dir, 'composition.json'));
      const source = (result as any).source ? (options.narration ? mergeNarration((result as any).source, composition) : (result as any).source) : undefined;
      const files = await writeCompositionProject(dir, composition, { force: true, source });
      await saveRevision(files.composition, { kind: 'compose', label: brief.slice(0, 160), provider: ai.id, model: ai.model, template: (result as any).template, attempts: result.attempts });
      return {
        dir, ...resultFile(files.composition), frames: composition.durationFrames, seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.length, attempts: result.attempts, warnings: result.warnings,
        issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message), narration,
      };
    });
  };

  const refineJob = (input: Record<string, unknown>) => {
    const file = fileInside(input.file, 'composition');
    const instruction = textOf(input.instruction, 'instruction');
    const review = boolOf(input.review);
    return enqueue('refine', async progress => {
      const current = await readJson(file) as Composition;
      const baseDir = dirname(file);
      const result = await refineVideo(requireProvider(), current, {
        instruction,
        review,
        baseDir,
        onProgress: message => progress(message),
      });
      await writeComposition(file, result.composition, { kind: 'refine', label: instruction.slice(0, 160), attempts: result.attempts });
      return {
        ...resultFile(file),
        frames: result.composition.durationFrames,
        seconds: result.composition.durationFrames / result.composition.fps,
        scenes: result.composition.scenes.length,
        attempts: result.attempts,
        warnings: result.warnings,
        issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message),
        instruction,
      };
    });
  };

  const importJob = (input: Record<string, unknown>) => {
    const rawText = textOf(input.json, 'JSON content');
    return enqueue('import', async progress => {
      progress('Extracting JSON and validating against OVE schema…');
      const parsed = extractJson(rawText);
      const sanitized = sanitizeCompositionJson(parsed);
      const composition = loadComposition(sanitized);
      // Nothing is supplied with pasted JSON, so it may only use built-in sounds and files that stay inside its own project folder.
      const problems = assetProblems(composition, { assets: new Map(), relativeInside: true });
      if (problems.length) throw new Error(`The pasted composition refers to files outside its project:\n${problems.join('\n')}`);
      const folder = folderName(optionalText(input.folder) ?? composition.id ?? composition.name ?? 'imported-video');
      const taken = (target: string) => stat(resolve(target, 'composition.json')).then(() => true, () => false);
      let dir = projectDir(folder, folder);
      if (await taken(dir)) {
        // Never replace a project that is already there: a name nobody chose gets the next free number, a chosen one is an error.
        if (optionalText(input.folder)) throw new Error(`${relative(dir)} already has a composition. Choose another folder name, or leave the folder empty to get a new one.`);
        for (let n = 2; await taken(dir); n++) dir = projectDir(`${folder}-${n}`, folder);
      }
      progress(`Writing composition files to ${folder}…`);
      const files = await writeCompositionProject(dir, composition, { force: true });
      await saveRevision(files.composition, { kind: 'import', label: 'Pasted composition' });
      return {
        id: relative(dir),
        dir,
        ...resultFile(files.composition),
        frames: composition.durationFrames,
        seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.length,
        attempts: 1,
        warnings: [],
        issues: [],
      };
    });
  };

  const renderJob = (input: Record<string, unknown>) => {
    const file = fileInside(input.file, 'composition');
    const baseDir = dirname(file);
    const output = inside(optionalText(input.output) ?? 'out.mp4', 'output', baseDir);
    const settings = renderSettings(input);
    return enqueue('render', async progress => {
      const { composition } = await loadForRender(file);
      let last = 0;
      const result = await renderMedia(composition, { ...settings, baseDir, output,
        onProgress: ({ rendered, total }) => { if (rendered === total || Date.now() - last > 1000) { last = Date.now(); progress(`Rendered ${rendered}/${total} frames`); } } });
      return { ...resultFile(result.output), frames: result.frames, seconds: result.durationSeconds, format: result.format };
    });
  };

  const thumbnailJob = (input: Record<string, unknown>) => {
    const file = fileInside(input.file, 'composition');
    const output = inside(optionalText(input.output) ?? 'thumbnail.png', 'output', dirname(file));
    const frame = optionalNumber(input.frame, 'frame', 0, 10_000_000), width = optionalNumber(input.width, 'width', 160, 7680);
    return enqueue('thumbnail', async () => {
      const { raw, baseDir } = await loadForRender(file);
      const made = await makeThumbnail(raw, {}, baseDir, { frame: frame === undefined ? undefined : Math.round(frame), title: optionalText(input.title), width: width === undefined ? undefined : Math.round(width) });
      await writeFile(output, made.png);
      return { ...resultFile(output), frame: made.frame, width: made.width, height: made.height };
    });
  };

  const reviewJob = (input: Record<string, unknown>) => {
    const file = fileInside(input.file, 'composition');
    const output = inside(optionalText(input.output) ?? 'review.png', 'output', dirname(file));
    return enqueue('review', async progress => {
      const { composition, baseDir } = await loadForRender(file);
      let last = 0;
      const result = await reviewComposition(composition, { baseDir,
        onProgress: (done, total) => { if (done === total || done - last >= 10) { last = done; progress(`Checked ${done}/${total} frames`); } } });
      await writeFile(output, result.sheet);
      return { ...resultFile(output), issues: result.issues, loudness: result.loudness, sampledFrames: result.sampledFrames, sheetFrames: result.sheetFrames };
    });
  };

  const narrateJob = (input: Record<string, unknown>) => {
    const file = optionalText(input.file) ? fileInside(input.file, 'composition') : undefined;
    const script = optionalText(input.script), brief = optionalText(input.brief);
    if (!script && !brief) throw new Error('Give a script or a brief for the narration');
    const baseDir = file ? dirname(file) : inside(optionalText(input.folder) ?? 'narration', 'folder');
    const outDir = inside(optionalText(input.out) ?? 'assets', 'out', baseDir);
    return enqueue('narrate', async progress => {
      const ai = requireProvider();
      const composition = file ? await readJson(file) as Composition : undefined;
      const produced = await narrate(ai, {
        text: script, brief, outDir, composition, compositionPath: file, voice: optionalText(input.voice),
        language: optionalText(input.language), durationSeconds: optionalNumber(input.duration, 'duration', 0.1, 3600) ?? 20,
        tailSeconds: optionalNumber(input.tail, 'tail', 0, 10) ?? 0.8, onProgress: message => progress(message),
      });
      if (produced.composition && file) await writeComposition(file, produced.composition, { kind: 'edit', label: 'Narration added' });
      return {
        ...resultFile(produced.audio), audioUrl: urlFor(produced.audio),
        captions: produced.captions, captionsUrl: produced.captions ? urlFor(produced.captions) : undefined,
        words: produced.words, durationSeconds: produced.durationSeconds, text: produced.text,
        composition: file ? resultFile(file) : undefined,
      };
    });
  };

  const transcribeJob = (input: Record<string, unknown>) => {
    const audio = inputFile(input.audio, 'audio', audioTypes);
    const file = optionalText(input.file) ? fileInside(input.file, 'composition') : undefined;
    const baseDir = file ? dirname(file) : root;
    const outDir = inside(optionalText(input.out) ?? (file ? 'assets' : 'captions'), 'out', baseDir);
    return enqueue('transcribe', async progress => {
      const composition = file ? await readJson(file) as Composition : undefined;
      const result = await captionAudio(requireProvider(), {
        audio, outDir, composition, compositionPath: file, language: optionalText(input.language),
        startSeconds: optionalNumber(input.start, 'start', 0, 86_400) ?? 0, onProgress: message => progress(message),
      });
      if (result.composition && file) await writeComposition(file, result.composition, { kind: 'edit', label: 'Captions added' });
      return {
        ...resultFile(result.captions), captionsUrl: urlFor(result.captions), words: result.words, cues: result.cues,
        durationSeconds: result.durationSeconds, composition: file ? resultFile(file) : undefined,
      };
    });
  };

  const imageJob = (input: Record<string, unknown>) => {
    const prompt = textOf(input.prompt, 'prompt');
    const file = optionalText(input.file) ? fileInside(input.file, 'composition') : undefined;
    const out = inside(optionalText(input.out) ?? 'assets/image.png', 'out', file ? dirname(file) : root);
    return enqueue('image', async () => {
      const composition = file ? await readJson(file) as Composition : undefined;
      const result = await generateImage(requireProvider(), { out, prompt, size: optionalText(input.size), composition, compositionPath: file, id: optionalText(input.id) });
      if (result.composition && file) await writeComposition(file, result.composition, { kind: 'edit', label: 'Picture added' });
      return { ...resultFile(result.file), id: result.id, composition: file ? resultFile(file) : undefined };
    });
  };

  const batchJob = (input: Record<string, unknown>) => {
    const rowsFile = inputFile(input.rows, 'rows', ['.json']);
    const brief = textOf(input.brief, 'brief');
    const dir = projectDir(input.folder ? `${optionalText(input.folder)}-template` : undefined, brief);
    const pattern = inside(optionalText(input.output) ?? 'out/{{id}}.mp4', 'output');
    const templateInput = optionalText(input.template);
    return enqueue('batch', async progress => {
      const rows = JSON.parse((await readFile(rowsFile, 'utf8')).replace(/^\uFEFF/, ''));
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('The rows file must be a JSON array with at least one object');
      let composition: Composition, templateDir: string, templatePath: string;
      if (templateInput) {
        templatePath = fileInside(templateInput, 'template');
        templateDir = dirname(templatePath);
        composition = await readJson(templatePath) as Composition;
      } else {
        const canvas = canvasFor(input);
        const result = await composeVideo(requireProvider(), { ...canvas, brief, fields: fieldsFromRows(rows), baseDir: dir, onProgress: message => progress(message) });
        composition = result.composition;
        const files = await writeCompositionProject(dir, composition, { force: true });
        templatePath = files.composition; templateDir = dir;
      }
      const limit = input.limit === undefined || input.limit === '' ? undefined : integerIn(input.limit, 1, 'limit', 1, 1000);
      const plan = await planBatch(composition, rows, pattern, templateDir);
      const rendered = await renderBatch(plan, templateDir, renderSettings(input), { limit, onProgress: message => progress(message) });
      return { ...resultFile(templatePath), outputs: rendered.outputs.map(output => ({ ...resultFile(output) })), count: rendered.outputs.length };
    });
  };

  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) => send(res, status, 'application/json', JSON.stringify(body));
  const sendError = (res: ServerResponse, error: unknown) => sendJson(res, 400, { error: describeError(error) });

  const readBody = (req: IncomingMessage) => new Promise<string>((ok, fail) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) fail(new Error('Request body is too large')); });
    req.on('end', () => ok(body)); req.on('error', fail);
  });

  const hostAllowed = (host: string) => {
    const name = host.toLowerCase().replace(/:\d+$/, ''), hostPort = Number(/:(\d+)$/.exec(host)?.[1]);
    return hostPort === port && (name === '127.0.0.1' || name === 'localhost' || name === '[::1]' ||
      (options.allowHosts ?? []).some(allowed => allowed.toLowerCase() === name));
  };
  const refusal = (req: IncomingMessage): string | undefined => {
    const host = req.headers.host ?? '';
    if (!hostAllowed(host)) return `Host "${host}" is not allowed; open the studio at http://127.0.0.1:${port}/`;
    if (req.method === 'GET' || req.method === 'HEAD') return undefined;
    if (req.headers.origin !== `http://${host}`) return 'Changes are only accepted from the studio page itself';
    if (req.url?.startsWith('/api/upload?') && /^application\/octet-stream\b/i.test(req.headers['content-type'] ?? '')) return undefined;
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'Changes must be sent as application/json';
    return undefined;
  };

  // Files from the out folder are shown by the page but never run as pages: an SVG or HTML file opened directly would otherwise run
  // as the Studio's own origin and could call its API.
  const fileHeaders = { 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' };
  const serveFile = async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    const target = resolve(root, decodeURIComponent(pathname.slice('/files/'.length)));
    if (!within(root, target)) return send(res, 403, 'text/plain', `Files must be inside ${root}`);
    let info;
    try { info = await stat(target); } catch { return send(res, 404, 'text/plain', 'Not found'); }
    if (!info.isFile()) return send(res, 404, 'text/plain', 'Not found');
    const type = mediaTypes[extname(target).toLowerCase()] ?? 'application/octet-stream';
    const range = req.headers.range, match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    res.setHeader('accept-ranges', 'bytes');
    if (match) {
      let start = match[1] ? Number(match[1]) : 0, end = match[2] ? Number(match[2]) : info.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
        res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return;
      }
      end = Math.min(end, info.size - 1);
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${info.size}`, 'cache-control': 'no-store', ...fileHeaders });
      createReadStream(target, { start, end }).on('error', () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': 'no-store', ...fileHeaders });
    createReadStream(target).on('error', () => res.destroy()).pipe(res);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const refused = refusal(req);
    if (refused) return send(res, 403, 'text/plain', refused);
    try {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/files/')) {
        const app = await studioFile(url.pathname);
        if (app) return send(res, 200, mediaTypes[extname(app).toLowerCase()] ?? 'application/octet-stream', await readFile(app));
        if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', aiStudioPage);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, { outDir: root, ...providerState(), jobs: recentJobs() });
      if (req.method === 'GET' && url.pathname === '/api/jobs') return sendJson(res, 200, { jobs: recentJobs() });
      if (req.method === 'GET' && url.pathname === '/api/job') {
        const job = jobs.get(url.searchParams.get('id') ?? '');
        return job ? sendJson(res, 200, { job: publicJob(job) }) : sendJson(res, 404, { error: 'No such job' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        res.write(`event: snapshot\ndata: ${JSON.stringify({ jobs: recentJobs() })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/history') {
        const file = fileInside(url.searchParams.get('file'), 'file');
        return sendJson(res, 200, { revisions: await listRevisions(file) });
      }
      if (req.method === 'GET' && url.pathname === '/api/still') {
        const file = fileInside(url.searchParams.get('file'), 'file');
        const { composition, baseDir } = await loadForRender(file);
        const requested = url.searchParams.get('frame');
        const frame = requested === null ? Math.floor(composition.durationFrames / 2) : integerIn(requested, 0, 'frame', 0, Math.max(0, composition.durationFrames - 1));
        return send(res, 200, 'image/png', await renderStill(composition, { frame, baseDir }));
      }
      if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, { projects: await listProjects(root) });
      if (req.method === 'GET' && url.pathname === '/api/project') return sendJson(res, 200, await projectDetail(textOf(url.searchParams.get('id'), 'project')));
      if (req.method === 'GET' && url.pathname === '/api/thumb') return send(res, 200, 'image/png', await thumbFor(textOf(url.searchParams.get('id'), 'project')));
      if (req.method === 'GET' && url.pathname === '/api/library') return sendJson(res, 200, {
        blocks: (await listBlocks()).map(({ layers, ...block }) => block), themes: await listThemes(),
        templates: (await listTemplates()).map(template => ({ id: template.id, name: template.name, description: template.description })) });
      // The Player the editor previews with, and what it loads beside itself (the same files `ove dev` serves).
      if (req.method === 'GET' && url.pathname === '/player.js') return send(res, 200, 'text/javascript; charset=utf-8', await playerScript());
      if (req.method === 'GET' && url.pathname.startsWith('/sfx/')) {
        const name = url.pathname.slice(5).replace(/\.wav$/, ''); if (!(sfxNames as readonly string[]).includes(name)) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'audio/wav', await readFile(await sfxFile(name)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
        const face = builtinFontFaces.find(f => `/fonts/${f.file}` === url.pathname); if (!face) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'font/woff2', await readFile(join(builtinFontDir(), face.file)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) return await serveFile(req, res, url.pathname);
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        const { dir } = projectFile(url.searchParams.get('project')), name = textOf(url.searchParams.get('name'), 'name').split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._-]+/g, '-');
        if (!assetKinds[extname(name).toLowerCase()]) throw new Error(`Pictures, video and audio only (${Object.keys(assetKinds).join(' ')})`);
        const taken = new Set(await readdir(resolve(dir, 'assets')).catch(() => [])); let final = name;
        for (let n = 2; taken.has(final); n++) final = name.replace(/(\.[^.]*)?$/, `-${n}$1`);
        await mkdir(resolve(dir, 'assets'), { recursive: true });
        await writeFile(resolve(dir, 'assets', final), await readBytes(req, 150_000_000));
        return sendJson(res, 200, { assets: await listAssets(dir) });
      }
      if (req.method === 'POST' && url.pathname !== '/api/upload') {
        const body = JSON.parse(await readBody(req) || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, new Error('Expected a JSON object'));
        if (url.pathname === '/api/project/new') {
          const name = textOf(body.name, 'name'), canvas = canvasFor(body), id = await uniqueFolder(root, slugify(name));
          await mkdir(resolve(root, id, 'assets'), { recursive: true });
          return sendJson(res, 200, { id });
        }
        if (url.pathname === '/api/project/blank') {
          const name = textOf(body.name, 'name'), canvas = canvasFor(body), id = await uniqueFolder(root, slugify(name)), dir = resolve(root, id);
          await mkdir(resolve(dir, 'assets'), { recursive: true });
          await writeFile(resolve(dir, 'composition.json'), JSON.stringify(emptyComposition(name, canvas.width, canvas.height, canvas.fps), null, 2) + '\n');
          return sendJson(res, 200, { id });
        }
        if (url.pathname === '/api/project/rename') {
          const { file } = projectFile(body.id), raw = await readJson(file); raw.name = textOf(body.name, 'name').slice(0, 120);
          await writeRaw(file, raw, { kind: 'edit', label: 'Renamed' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/project/duplicate') {
          const { file } = projectFile(body.id), raw = await readJson(file), id = await uniqueFolder(root, `${String(body.id).replace(/-\d+$/, '')}-copy`);
          await copyProject(root, String(body.id), id);
          const copy = resolve(root, id, 'composition.json'); raw.name = `${raw.name ?? id} copy`.slice(0, 120); await writeFile(copy, JSON.stringify(raw, null, 2) + '\n');
          return sendJson(res, 200, { id });
        }
        if (url.pathname === '/api/project/delete') { projectFile(body.id); await trashProject(root, String(body.id)); return sendJson(res, 200, { ok: true }); }
        if (url.pathname === '/api/variables') {
          const { file } = projectFile(body.id), values = body.values;
          if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('values must be an object');
          await writeRaw(file, setVariableValues(await readJson(file), values), { kind: 'edit', label: 'Edited the text' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/theme') {
          const { file } = projectFile(body.id), theme = await readTheme(textOf(body.theme, 'theme'));
          await writeRaw(file, applyTheme(await readJson(file), theme), { kind: 'edit', label: `Look: ${theme.name}` }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/text') {
          const { file } = projectFile(body.id), content = textOf(body.content, 'text'), composition = loadComposition(await readJson(file)) as any;
          setAtPath(composition, textOf(body.path, 'path'), layer => { if (layer.type !== 'text') throw new Error('That layer is not text'); if (typeof layer.content === 'string' && layer.content) layer.content = content; else if (Array.isArray(layer.spans) && layer.spans.length) layer.spans = [{ ...layer.spans[0], text: content }]; else layer.content = content; });
          await writeRaw(file, { $schema: './composition.schema.json', ...composition }, { kind: 'edit', label: 'Edited the text' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/add-block') {
          const { file } = projectFile(body.id), block = await readBlock(textOf(body.block, 'block')), set = body.set && typeof body.set === 'object' ? body.set : {};
          const added = addBlock(await readJson(file), block, { at: optionalNumber(body.at, 'at', 0, 1e7), frames: optionalNumber(body.frames, 'frames', 1, 1e7), scene: optionalText(body.scene), set });
          await writeRaw(file, added.composition, { kind: 'edit', label: `Added ${block.name}` }); return sendJson(res, 200, { placed: added.placed, where: added.where });
        }
        if (url.pathname === '/api/compose') return sendJson(res, 202, { job: composeJob(body) });
        if (url.pathname === '/api/thumbnail') return sendJson(res, 202, { job: thumbnailJob(body) });
        if (url.pathname === '/api/restore') {
          const file = fileInside((body as any).file, 'file'), n = (body as any).n;
          if (!Number.isInteger(n) || n < 1) throw new Error('n must be a revision number');
          return sendJson(res, 200, { revision: await restoreRevision(file, n) });
        }
        if (url.pathname === '/api/refine') return sendJson(res, 202, { job: refineJob(body) });
        if (url.pathname === '/api/import') return sendJson(res, 202, { job: importJob(body) });
        if (url.pathname === '/api/prompt') {
          const brief = optionalText(body.brief) ?? 'A clean promotional video with animated text and shapes';
          const canvas = canvasFor(body);
          const system = systemPrompt({ ...canvas, includeSchema: boolOf(body.schema) });
          const user = userPrompt(brief, { ...canvas, narration: boolOf(body.narration) });
          return sendJson(res, 200, { prompt: `${system}\n\n---\n\n# User Request\n${user}` });
        }
        if (url.pathname === '/api/render') return sendJson(res, 202, { job: renderJob(body) });
        if (url.pathname === '/api/review') return sendJson(res, 202, { job: reviewJob(body) });
        if (url.pathname === '/api/narrate') return sendJson(res, 202, { job: narrateJob(body) });
        if (url.pathname === '/api/transcribe') return sendJson(res, 202, { job: transcribeJob(body) });
        if (url.pathname === '/api/image') return sendJson(res, 202, { job: imageJob(body) });
        if (url.pathname === '/api/batch') return sendJson(res, 202, { job: batchJob(body) });
        return send(res, 404, 'text/plain', 'Not found');
      }
      send(res, 404, 'text/plain', 'Not found');
    } catch (error) { if (!res.headersSent) sendError(res, error); else res.destroy(); }
  });

  port = await new Promise<number>((ok, fail) => {
    let attempt = options.port ?? 3100;
    const tryListen = () => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && attempt < (options.port ?? 3100) + 20) { attempt++; tryListen(); }
        else fail(error);
      });
      server.listen(attempt, '127.0.0.1', () => ok(attempt));
    };
    tryListen();
  });

  return {
    url: `http://127.0.0.1:${port}/`,
    async close() {
      for (const client of clients) client.end();
      await new Promise<void>(ok => server.close(() => ok()));
    },
  };
}
