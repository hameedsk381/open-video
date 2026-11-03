// The studio's jobs. Each handler checks its request straight away (so a bad request is refused before it is queued) and gives back the
// work to run. They know nothing about HTTP: the files they touch come through JobPaths, the AI through the provider, and the rest is injected.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  assetIdFromPath, assetProblems, captionAudio, composeVideo, ensureBaseline, extractJson, fieldsFromRows, generateImage, mergeNarration, narrate, planBatch, refineVideo, renderBatch,
  sanitizeCompositionJson, saveRevision, writeCompositionProject, type ComposeOptions,
} from '@ove/ai';
import { loadComposition, renderMedia, reviewComposition, type Composition } from '@ove/core';
import { boolOf, canvasFor, folderName, integerIn, optionalNumber, optionalText, renderSettings, textOf } from './input';
import type { JobEnv } from './env';
import type { JobSpec } from './queue';

const audioTypes = ['.wav', '.mp3', '.ogg', '.m4a', '.aac', '.flac', '.webm', '.mp4', '.mov', '.mkv'];
type Input = Record<string, unknown>;

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
      const options: ComposeOptions = {
        ...canvas, brief, baseDir: dir, ...(pictures.length ? { assets: pictures } : {}), review: boolOf(input.review), narration: boolOf(input.narration),
        includeSchema: boolOf(input.schema), maxAttempts: integerIn(input.maxAttempts, 3, 'maxAttempts', 1, 10),
        onProgress: message => progress(message),
      };
      const result = await capabilities.composeSmart(ai, options, { full: boolOf(input.full) });
      let composition = result.composition;
      let narration: Record<string, unknown> | undefined;
      if (options.narration) {
        const produced = await capabilities.narrateSmart(ai, result, {
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
      const source = result.source ? (options.narration ? mergeNarration(result.source, composition) : result.source) : undefined;
      const files = await writeCompositionProject(dir, composition, { force: true, source });
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
      const result = await refineVideo(env.provider(), current, { instruction, review, baseDir: dirname(file), onProgress: message => progress(message) });
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
      progress('Extracting JSON and validating against OVE schema…');
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
      progress(`Writing composition files to ${folder}…`);
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
      const result = await renderMedia(composition, { ...settings, baseDir, output,
        onProgress: ({ rendered, total }) => { if (rendered === total || Date.now() - last > 1000) { last = Date.now(); progress(`Rendered ${rendered}/${total} frames`); } } });
      return { ...resultFile(result.output), frames: result.frames, seconds: result.durationSeconds, format: result.format };
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
      const result = await reviewComposition(composition, { baseDir,
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
        tailSeconds: optionalNumber(input.tail, 'tail', 0, 10) ?? 0.8, onProgress: message => progress(message),
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
        startSeconds: optionalNumber(input.start, 'start', 0, 86_400) ?? 0, onProgress: message => progress(message),
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
        const result = await composeVideo(env.provider(), { ...canvasFor(input), brief, fields: fieldsFromRows(rows), baseDir: dir, onProgress: message => progress(message) });
        composition = result.composition;
        const files = await writeCompositionProject(dir, composition, { force: true });
        templatePath = files.composition; templateDir = dir;
      }
      const limit = input.limit === undefined || input.limit === '' ? undefined : integerIn(input.limit, 1, 'limit', 1, 1000);
      const plan = await planBatch(composition, rows, pattern, templateDir);
      const rendered = await renderBatch(plan, templateDir, renderSettings(input), { limit, onProgress: message => progress(message) });
      return { ...resultFile(templatePath), outputs: rendered.outputs.map(output => ({ ...resultFile(output) })), count: rendered.outputs.length };
    } };
  };

  return { compose, refine, import: importJson, render, thumbnail, review, narrate: narrateJob, transcribe, image, batch };
}
export type Handlers = ReturnType<typeof createHandlers>;
