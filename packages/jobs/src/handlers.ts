// The studio's jobs. Each handler checks its request straight away (so a bad request is refused before it is queued) and gives back the
// work to run. They know nothing about HTTP: the files they touch come through JobPaths, the AI through the provider, and the rest is injected.
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  assetIdFromPath, assetProblems, captionAudio, composeVideo, ensureBaseline, extractJson, fieldsFromRows, generateImage, mergeNarration, narrate, planBatch, refineVideo, renderBatch,
  sanitizeCompositionJson, saveRevision, writeCompositionProject, type ComposeOptions,
} from '@ove/ai';
import { loadComposition, renderMedia, reviewComposition, type Composition } from '@ove/core';
import { S3Client, loadS3ConfigFromEnv, type S3Config } from '@ove/storage';
import { boolOf, canvasFor, folderName, integerIn, optionalNumber, optionalText, renderSettings, textOf } from './input';
import type { JobEnv } from './env';
import type { JobSpec } from './queue';

const audioTypes = ['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.mp4', '.mov', '.mkv'];
type Input = Record<string, unknown>;

export function cleanProgressMessage(message: string): string {
  if (!message) return 'Crafting your video…';
  const clean = message.replace(/^PROGRESS:\s*/i, '').trim();
  if (/synthesiz|speak|voice|narrat/i.test(clean)) return 'Synthesizing voice narration and audio mix…';
  if (/transcrib|caption|cue|timing/i.test(clean)) return 'Synchronizing subtitles and word timings…';
  if (/retim/i.test(clean)) return 'Optimizing rhythm, transitions and scene timing…';
  if (/visual system|contract|palette|brand/i.test(clean)) return 'Establishing brand colors and typographic hierarchy…';
  if (/designing.*scene|storyboard|beat|plan/i.test(clean)) return 'Structuring scene layouts and narrative beats…';
  if (/template|compose|layer|scene/i.test(clean)) return 'Composing kinetic typography and motion layers…';
  if (/review|check|inspect/i.test(clean)) return 'Reviewing visual hierarchy and animation quality…';
  if (/heal|re-design|polish/i.test(clean)) return 'Applying fine polish to animation curves and easing…';
  if (/render/i.test(clean)) {
    const frames = clean.match(/Rendered\s+(\d+\/\d+)\s+frames/i);
    return frames ? `Rendering video frames (${frames[1]})…` : 'Rendering high-resolution video frames…';
  }
  if (/(freellm|qwen|llama|gpt|nemotron|claude|openai|mistral|attempt|\.schema|json|ast|token|px)/i.test(clean)) {
    return 'Crafting broadcast-grade motion graphics…';
  }
  return clean;
}

export function createHandlers(env: JobEnv) {
  const { paths, capabilities } = env;
  const { resultFile, urlFor, relative, readJson, loadForRender, writeComposition } = paths;
  const needLocal = (what: string) => { if (!env.local) throw new Error(`${what} is only available when the studio runs on your own machine`); return env.local; };

  const compose = (input: Input): JobSpec => {
    const brief = textOf(input.brief, 'brief');
    const canvas = canvasFor(input);
    const dir = paths.projectDir(input.folder, brief);
    return { kind: 'compose', run: async progress => {
      const ai = env.provider();
      const pictures = (await env.assets(paths.idOf(dir))).map(asset => ({ id: assetIdFromPath(asset.name), type: asset.kind, src: './' + asset.path }));
      const template = typeof input.template === 'string' && input.template.trim() ? input.template.trim() : undefined;
      const full = boolOf(input.full);

      // Enrich creative direction from user customization
      const directions: string[] = [];
      if (typeof input.typography === 'string' && input.typography.trim()) directions.push(`Typography: ${input.typography.trim()}`);
      if (typeof input.motionPacing === 'string' && input.motionPacing.trim()) directions.push(`Motion Pacing: ${input.motionPacing.trim()}`);
      if (typeof input.audioMood === 'string' && input.audioMood.trim() && input.audioMood.trim() !== 'none') directions.push(`Audio Mood: ${input.audioMood.trim()}`);
      if (typeof input.sfx === 'string' && input.sfx.trim()) directions.push(`Sound Effects: ${input.sfx.trim()}`);
      else if (input.sfx === true) directions.push(`Sound Effects: Enabled procedural transitions & reveals`);
      if (typeof input.voiceTone === 'string' && input.voiceTone.trim()) directions.push(`Voiceover Tone: ${input.voiceTone.trim()}`);
      if (typeof input.ctaHeadline === 'string' && input.ctaHeadline.trim()) {
        const sub = typeof input.ctaSubline === 'string' && input.ctaSubline.trim() ? ` (${input.ctaSubline.trim()})` : '';
        directions.push(`Call-To-Action: "${input.ctaHeadline.trim()}"${sub}`);
      }
      if (typeof input.sceneCount === 'number' && input.sceneCount > 0) directions.push(`Target Scene Count: Exactly ${input.sceneCount} scenes`);

      const effectiveBrief = directions.length ? `${brief}\n\n[Creative Direction]\n- ${directions.join('\n- ')}` : brief;

      const options: ComposeOptions = {
        ...canvas, brief: effectiveBrief, baseDir: dir, ...(pictures.length ? { assets: pictures } : {}), review: boolOf(input.review), narration: boolOf(input.narration),
        includeSchema: boolOf(input.schema), plan: full, maxAttempts: integerIn(input.maxAttempts, 3, 'maxAttempts', 1, 10),
        onProgress: message => progress(cleanProgressMessage(message)),
      };
      const theme = typeof input.theme === 'string' && input.theme.trim() ? input.theme.trim() : undefined;
      const result = await capabilities.composeSmart(ai, options, { full, theme, template });
      let composition = result.composition;

      if (input.customColors && typeof input.customColors === 'object') {
        const colors = input.customColors as Record<string, string>;
        const applyCustom = (target: any) => {
          if (!target || typeof target !== 'object') return;
          target.variables = { ...(target.variables ?? {}) };
          for (const [key, val] of Object.entries(colors)) {
            if (typeof val === 'string' && val.trim()) {
              target.variables[key] = { type: 'color', default: val.trim(), description: `Brand color: ${key}` };
            }
          }
        };
        applyCustom(composition);
        if (result.source) applyCustom(result.source);
      }
      let narration: Record<string, unknown> | undefined;
      if (options.narration) {
        const voice = typeof input.voice === 'string' && input.voice.trim() ? input.voice.trim() : undefined;
        const language = typeof input.language === 'string' && input.language.trim() ? input.language.trim() : undefined;
        const produced = await capabilities.narrateSmart(ai, result, {
          brief, outDir: resolve(dir, 'assets'), durationSeconds: canvas.durationSeconds, composition,
          compositionPath: resolve(dir, 'composition.json'), tailSeconds: 0.8, onProgress: message => progress(cleanProgressMessage(message)),
          voice, language,
        });
        composition = produced.composition ?? composition;
        narration = {
          audio: produced.audio, audioUrl: urlFor(produced.audio),
          captions: produced.captions, captionsUrl: produced.captions ? urlFor(produced.captions) : undefined,
          words: produced.words, durationSeconds: produced.durationSeconds,
        };
      }
      await ensureBaseline(resolve(dir, 'composition.json'));
      const source = result.source ? (options.narration ? mergeNarration(result.source, composition) : result.source) : undefined;
      const files = await writeCompositionProject(dir, composition, { force: true, source });
      if (result.template) {
        try {
          const candidates = [
            resolve(process.cwd(), 'packages/cli/templates', result.template),
            resolve(process.cwd(), 'templates', result.template),
          ];
          for (const tDir of candidates) {
            try {
              const entries = await readdir(tDir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.name !== 'template.json' && entry.name !== 'composition.json' && entry.name !== 'composition.schema.json') {
                  await cp(resolve(tDir, entry.name), resolve(dir, entry.name), { recursive: true, force: true });
                }
              }
              break;
            } catch {}
          }
        } catch {}
      }
      await saveRevision(files.composition, { kind: 'compose', label: brief.slice(0, 160), provider: ai.id, model: ai.model, template: result.template, attempts: result.attempts });
      return {
        dir, ...resultFile(files.composition), frames: composition.durationFrames, seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.length, attempts: result.attempts, warnings: result.warnings,
        issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message), narration,
      };
    } };
  };

  const refine = (input: Input): JobSpec => {
    const file = paths.fileInside(input.file, 'composition');
    const instruction = textOf(input.instruction, 'instruction');
    const review = boolOf(input.review);
    return { kind: 'refine', run: async progress => {
      const current = await readJson(file) as Composition;
      const result = await refineVideo(env.provider(), current, { instruction, review, baseDir: dirname(file), onProgress: message => progress(cleanProgressMessage(message)) });
      await writeComposition(file, result.composition, { kind: 'refine', label: instruction.slice(0, 160), attempts: result.attempts });
      return {
        ...resultFile(file), frames: result.composition.durationFrames, seconds: result.composition.durationFrames / result.composition.fps, scenes: result.composition.scenes.length,
        attempts: result.attempts, warnings: result.warnings, issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message), instruction,
      };
    } };
  };

  const importJson = (input: Input): JobSpec => {
    const rawText = textOf(input.json, 'JSON content');
    return { kind: 'import', run: async progress => {
      progress('Preparing project composition…');
      const composition = loadComposition(sanitizeCompositionJson(extractJson(rawText)));
      // Nothing is supplied with pasted JSON, so it may only use built-in sounds and files that stay inside its own project folder.
      const problems = assetProblems(composition, { assets: new Map(), relativeInside: true });
      if (problems.length) throw new Error(`The pasted composition refers to files outside its project:\n${problems.join('\n')}`);
      const folder = folderName(optionalText(input.folder) ?? composition.id ?? composition.name ?? 'imported-video');
      const taken = (target: string) => stat(resolve(target, 'composition.json')).then(() => true, () => false);
      let dir = paths.projectDir(folder, folder);
      if (await taken(dir)) {
        // Never replace a project that is already there: a name nobody chose gets the next free number, a chosen one is an error.
        if (optionalText(input.folder)) throw new Error(`${relative(dir)} already has a composition. Choose another folder name, or leave the folder empty to get a new one.`);
        for (let n = 2; await taken(dir); n++) dir = paths.projectDir(`${folder}-${n}`, folder);
      }
      progress('Saving composition files…');
      const files = await writeCompositionProject(dir, composition, { force: true });
      await saveRevision(files.composition, { kind: 'import', label: 'Pasted composition' });
      return { id: relative(dir), dir, ...resultFile(files.composition), frames: composition.durationFrames, seconds: composition.durationFrames / composition.fps, scenes: composition.scenes.length, attempts: 1, warnings: [], issues: [] };
    } };
  };

  const render = (input: Input): JobSpec => {
    const file = paths.fileInside(input.file, 'composition'), baseDir = dirname(file);
    const output = paths.resolve(optionalText(input.output) ?? 'out.mp4', 'output', baseDir);
    const settings = renderSettings(input);
    return { kind: 'render', run: async progress => {
      const { composition } = await loadForRender(file);
      let last = 0;
      const result = await renderMedia(composition, { ...settings, baseDir, output, allowCode: true,
        onProgress: ({ rendered, total }) => { if (rendered === total || Date.now() - last > 1000) { last = Date.now(); progress(`Rendered ${rendered}/${total} frames`); } } });
      const baseResult = { ...resultFile(result.output), frames: result.frames, seconds: result.durationSeconds, format: result.format };

      // Optional S3 / Cloudflare R2 / MinIO Direct Upload
      const s3Conf = (input.s3Config as S3Config | undefined) ?? loadS3ConfigFromEnv();
      if (s3Conf && (input.uploadS3 !== false)) {
        try {
          progress('Uploading rendered video to object storage (S3/R2)…');
          const s3Client = new S3Client(s3Conf);
          const videoBytes = await readFile(result.output);
          const ext = result.format;
          const contentType = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ext === 'gif' ? 'image/gif' : 'application/octet-stream';
          const filename = result.output.split(/[\\/]/).pop() || `out.${ext}`;
          const s3Key = optionalText(input.s3Key) ?? `renders/${paths.idOf(baseDir)}/${Date.now()}-${filename}`;
          const s3Upload = await s3Client.putObject(s3Key, videoBytes, contentType);
          const presignedUrl = s3Client.getSignedDownloadUrl(s3Key, 86400);
          return {
            ...baseResult,
            s3: {
              bucket: s3Upload.bucket,
              key: s3Upload.key,
              url: s3Upload.url,
              publicUrl: s3Upload.publicUrl ?? presignedUrl,
            },
          };
        } catch (uploadErr) {
          progress(`Warning: S3 upload failed: ${(uploadErr as Error).message}`);
        }
      }

      return baseResult;
    } };
  };

  const thumbnail = (input: Input): JobSpec => {
    const file = paths.fileInside(input.file, 'composition');
    const output = paths.resolve(optionalText(input.output) ?? 'thumbnail.png', 'output', dirname(file));
    const frame = optionalNumber(input.frame, 'frame', 0, 10_000_000), width = optionalNumber(input.width, 'width', 160, 7680);
    return { kind: 'thumbnail', run: async () => {
      const { raw, baseDir } = await loadForRender(file);
      const made = await capabilities.makeThumbnail(raw, {}, baseDir, { frame: frame === undefined ? undefined : Math.round(frame), title: optionalText(input.title), width: width === undefined ? undefined : Math.round(width) });
      await mkdir(dirname(output), { recursive: true }); await writeFile(output, made.png);
      return { ...resultFile(output), frame: made.frame, width: made.width, height: made.height };
    } };
  };

  const review = (input: Input): JobSpec => {
    const file = paths.fileInside(input.file, 'composition');
    const output = paths.resolve(optionalText(input.output) ?? 'review.png', 'output', dirname(file));
    return { kind: 'review', run: async progress => {
      const { composition, baseDir } = await loadForRender(file);
      let last = 0;
      const result = await reviewComposition(composition, { baseDir, allowCode: true,
        onProgress: (done, total) => { if (done === total || done - last >= 10) { last = done; progress(`Checked ${done}/${total} frames`); } } });
      await writeFile(output, result.sheet);
      return { ...resultFile(output), issues: result.issues, loudness: result.loudness, sampledFrames: result.sampledFrames, sheetFrames: result.sheetFrames };
    } };
  };

  const narrateJob = (input: Input): JobSpec => {
    const file = optionalText(input.file) ? paths.fileInside(input.file, 'composition') : undefined;
    const script = optionalText(input.script), brief = optionalText(input.brief);
    if (!script && !brief) throw new Error('Give a script or a brief for the narration');
    const baseDir = file ? dirname(file) : paths.resolve(optionalText(input.folder) ?? 'narration', 'folder');
    const outDir = paths.resolve(optionalText(input.out) ?? 'assets', 'out', baseDir);
    return { kind: 'narrate', run: async progress => {
      const composition = file ? await readJson(file) as Composition : undefined;
      const produced = await narrate(env.provider(), {
        text: script, brief, outDir, composition, compositionPath: file, voice: optionalText(input.voice),
        language: optionalText(input.language), durationSeconds: optionalNumber(input.duration, 'duration', 0.1, 3600) ?? 20,
        tailSeconds: optionalNumber(input.tail, 'tail', 0, 10) ?? 0.8, onProgress: message => progress(cleanProgressMessage(message)),
      });
      if (produced.composition && file) await writeComposition(file, produced.composition, { kind: 'edit', label: 'Narration added' });
      return {
        ...resultFile(produced.audio), audioUrl: urlFor(produced.audio), captions: produced.captions, captionsUrl: produced.captions ? urlFor(produced.captions) : undefined,
        words: produced.words, durationSeconds: produced.durationSeconds, text: produced.text, composition: file ? resultFile(file) : undefined,
      };
    } };
  };

  const transcribe = (input: Input): JobSpec => {
    const audio = needLocal('Transcribing a file from your disk').inputFile(input.audio, 'audio', audioTypes);
    const file = optionalText(input.file) ? paths.fileInside(input.file, 'composition') : undefined;
    const outDir = file ? paths.resolve(optionalText(input.out) ?? 'assets', 'out', dirname(file)) : paths.resolve(optionalText(input.out) ?? 'captions', 'out');
    return { kind: 'transcribe', run: async progress => {
      const composition = file ? await readJson(file) as Composition : undefined;
      const result = await captionAudio(env.provider(), {
        audio, outDir, composition, compositionPath: file, language: optionalText(input.language),
        startSeconds: optionalNumber(input.start, 'start', 0, 86_400) ?? 0, onProgress: message => progress(cleanProgressMessage(message)),
      });
      if (result.composition && file) await writeComposition(file, result.composition, { kind: 'edit', label: 'Captions added' });
      return { ...resultFile(result.captions), captionsUrl: urlFor(result.captions), words: result.words, cues: result.cues, durationSeconds: result.durationSeconds, composition: file ? resultFile(file) : undefined };
    } };
  };

  const image = (input: Input): JobSpec => {
    const prompt = textOf(input.prompt, 'prompt');
    const file = optionalText(input.file) ? paths.fileInside(input.file, 'composition') : undefined;
    const out = file ? paths.resolve(optionalText(input.out) ?? 'assets/image.png', 'out', dirname(file)) : paths.resolve(optionalText(input.out) ?? 'assets/image.png', 'out');
    return { kind: 'image', run: async () => {
      const composition = file ? await readJson(file) as Composition : undefined;
      const result = await generateImage(env.provider(), { out, prompt, size: optionalText(input.size), composition, compositionPath: file, id: optionalText(input.id) });
      if (result.composition && file) await writeComposition(file, result.composition, { kind: 'edit', label: 'Picture added' });
      return { ...resultFile(result.file), id: result.id, composition: file ? resultFile(file) : undefined };
    } };
  };

  const batch = (input: Input): JobSpec => {
    const rowsFile = needLocal('Rendering a batch from a rows file').inputFile(input.rows, 'rows', ['.json']);
    const brief = textOf(input.brief, 'brief');
    const dir = paths.projectDir(input.folder ? `${optionalText(input.folder)}-template` : undefined, brief);
    const pattern = paths.resolve(optionalText(input.output) ?? 'out/{{id}}.mp4', 'output');
    const templateInput = optionalText(input.template);
    return { kind: 'batch', run: async progress => {
      const rows = JSON.parse((await readFile(rowsFile, 'utf8')).replace(/^﻿/, ''));
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('The rows file must be a JSON array with at least one object');
      let composition: Composition, templateDir: string, templatePath: string;
      if (templateInput) {
        templatePath = paths.fileInside(templateInput, 'template'); templateDir = dirname(templatePath); composition = await readJson(templatePath) as Composition;
      } else {
        const result = await composeVideo(env.provider(), { ...canvasFor(input), brief, fields: fieldsFromRows(rows), baseDir: dir, onProgress: message => progress(cleanProgressMessage(message)) });
        composition = result.composition;
        const files = await writeCompositionProject(dir, composition, { force: true });
        templatePath = files.composition; templateDir = dir;
      }
      const limit = input.limit === undefined || input.limit === '' ? undefined : integerIn(input.limit, 1, 'limit', 1, 1000);
      const plan = await planBatch(composition, rows, pattern, templateDir);
      const rendered = await renderBatch(plan, templateDir, renderSettings(input), { limit, onProgress: message => progress(cleanProgressMessage(message)) });
      return { ...resultFile(templatePath), outputs: rendered.outputs.map(output => ({ ...resultFile(output) })), count: rendered.outputs.length };
    } };
  };

  return { compose, refine, import: importJson, render, thumbnail, review, narrate: narrateJob, transcribe, image, batch };
}
export type Handlers = ReturnType<typeof createHandlers>;
