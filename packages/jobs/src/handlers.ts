// The studio's jobs. Each handler checks its request straight away (so a bad request is refused before it is queued) and gives back the
// work to run. They know nothing about HTTP: the files they touch come through JobPaths, the AI through the provider, and the rest is injected.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative as relativePath, resolve } from 'node:path';
import { explainerSchema } from '@ove/schema';
import {
  assetIdFromPath, assetProblems, captionAudio, composeVideo, createProvider, ensureBaseline, extractJson, fieldsFromRows, generateImage, mergeNarration, narrate, planBatch, refineVideo, renderBatch,
  readBrand, resolveSpeechEngine, sanitizeCompositionJson, saveRevision, speakLine, writeCompositionProject, writeExplainer, type ComposeOptions,
} from '@ove/ai';
import { compileExplainer, loadComposition, renderMedia, reviewComposition, type Composition } from '@ove/core';
import { S3Client, loadS3ConfigFromEnv } from '@ove/storage';
import { boolOf, canvasFor, folderName, integerIn, optionalNumber, optionalText, renderSettings, textOf } from './input';
import { addBrandContact, addBrandLogo } from './brand-logo';
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

  const resolveProvider = (input: Input) => {
    const hasCustom = typeof input.provider === 'string' || typeof input.model === 'string' || typeof input.baseUrl === 'string' || typeof input.apiKey === 'string';
    if (!hasCustom) return env.provider();
    try {
      return createProvider({
        provider: typeof input.provider === 'string' && input.provider.trim() ? input.provider.trim() : undefined,
        model: typeof input.model === 'string' && input.model.trim() ? input.model.trim() : undefined,
        baseUrl: typeof input.baseUrl === 'string' && input.baseUrl.trim() ? input.baseUrl.trim() : undefined,
        apiKey: typeof input.apiKey === 'string' && input.apiKey.trim() ? input.apiKey.trim() : undefined,
      });
    } catch {
      return env.provider();
    }
  };

  const compose = (input: Input): JobSpec => {
    const brief = textOf(input.brief, 'brief');
    const canvas = canvasFor(input);
    const dir = paths.projectDir(input.folder, brief);
    return { kind: 'compose', run: async progress => {
      const ai = resolveProvider(input);
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

      // A saved brand travels as copy as well as colour: the name and contact line are what the closing scene prints.
      const brand = readBrand(input.brand);
      const brandCopy = [brand?.name && `Brand name: ${brand.name}`, brand?.contact && `Contact line for the closing scene: ${brand.contact}`].filter(Boolean);
      const effectiveBrief = [
        brief,
        directions.length ? `[Creative Direction]\n- ${directions.join('\n- ')}` : '',
        brandCopy.length ? `[Brand]\n- ${brandCopy.join('\n- ')}` : '',
      ].filter(Boolean).join('\n\n');

      // Evidence the caller already has, and an optional written script; either travels into the compose exactly as the
      // command line hands it over, so the hosted studio and the CLI produce the same content-first video.
      const sources = Array.isArray(input.sources)
        ? input.sources.filter((source: any) => source && typeof source.text === 'string' && source.text.trim()).map((source: any) => ({
          title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : undefined,
          url: typeof source.url === 'string' && source.url.trim() ? source.url.trim() : undefined,
          text: source.text as string,
        }))
        : [];

      const options: ComposeOptions = {
        ...canvas, brief: effectiveBrief, baseDir: dir, ...(pictures.length ? { assets: pictures } : {}), review: boolOf(input.review), strict: boolOf(input.strict), narration: boolOf(input.narration),
        content: input.content && typeof input.content === 'object' && !Array.isArray(input.content) ? input.content as any : undefined,
        sources: sources.length ? sources : undefined,
        research: input.research === false ? false : undefined,
        brand, includeSchema: boolOf(input.schema), plan: full, maxAttempts: integerIn(input.maxAttempts, 3, 'maxAttempts', 1, 10),
        onProgress: message => progress(cleanProgressMessage(message)),
      };
      const theme = typeof input.theme === 'string' && input.theme.trim() ? input.theme.trim() : undefined;
      // React authoring is offered only where the code runs on the user's own machine; hosted jobs stay on data routes.
      const result = await capabilities.composeSmart(ai, options, { full, theme, template }, Boolean(env.local));
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
      // A saved brand's logo and contact line sign the closing scene. The caller names an asset the project already holds, never a path.
      const logoId = typeof input.brandLogo === 'string' ? input.brandLogo.trim() : '';
      const logo = logoId ? pictures.find(picture => picture.id === logoId && picture.type === 'image') : undefined;
      if (logo) addBrandLogo(composition as any, source as any, logo.src);
      if (brand?.contact) addBrandContact(composition as any, source as any, brand.contact);
      const files = await writeCompositionProject(dir, composition, { force: true, source });
      // A template's own pictures and sounds travel with it inside composeSmart, which owns the template catalogue;
      // if they could not, it says so in `result.warnings` and that is reported below like any other note.
      await saveRevision(files.composition, { kind: 'compose', label: brief.slice(0, 160), brief: brief.slice(0, 4000), provider: ai.id, model: ai.model, template: result.template, attempts: result.attempts });
      return {
        dir, ...resultFile(files.composition), frames: composition.durationFrames, seconds: composition.durationFrames / composition.fps,
        scenes: composition.scenes.length, attempts: result.attempts, warnings: result.warnings, reviewed: Boolean(options.review),
        issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message), narration,
      };
    } };
  };

  /**
   * An explainer: scenes and spoken lines in, a video out. With `brief` the model writes the script; with `writeOnly` that is all that happens
   * and the script comes back for editing. With `script` the script is checked, each spoken line is recorded (when `voice` is on) and the
   * project gets a composition, like a composed one.
   */
  const explainer = (input: Input): JobSpec => {
    const brief = optionalText(input.brief), writeOnly = boolOf(input.writeOnly);
    if (!brief && input.script === undefined) throw new Error('Say what to explain, or send a script');
    const scenes = input.scenes === undefined || input.scenes === '' ? undefined : integerIn(input.scenes, 5, 'scenes', 2, 16);
    return { kind: 'explainer', run: async progress => {
      let script: unknown = input.script;
      if (script === undefined || script === null) {
        const written = await writeExplainer(resolveProvider(input), brief!, { scenes, language: optionalText(input.language), voice: optionalText(input.voiceName), onProgress: message => progress(message) });
        script = written.explainer;
        if (writeOnly) return { script, attempts: written.attempts };
      }
      const parsed = explainerSchema.safeParse(script);
      if (!parsed.success) throw new Error(`The script cannot be used:\n${parsed.error.issues.slice(0, 12).map(issue => `- ${issue.path.join('.') || 'script'}: ${issue.message}`).join('\n')}`);
      const spec = parsed.data, dir = paths.projectDir(input.folder, spec.topic);
      const missing = spec.scenes.flatMap((scene, i) => (scene.kind === 'media' && !existsSync(resolve(dir, scene.src)) ? [`${scene.src} (scene ${i + 1})`] : []));
      if (missing.length) throw new Error(`The video needs files that are not in the project: ${missing.join(', ')}. Add them in the Media tab first.`);
      const voiceName = optionalText(input.voiceName) ?? spec.voice, language = optionalText(input.language), assets = resolve(dir, 'assets'), audio: ({ src: string; seconds: number } | undefined)[] = [];
      if (boolOf(input.voice) && spec.scenes.some(scene => scene.say)) {
        // Edge needs no key; the native and local engines speak through the provider the rest of the job uses.
        const voiceProvider = resolveSpeechEngine() === 'edge' ? undefined : resolveProvider(input);
        await mkdir(assets, { recursive: true });
        for (const [i, scene] of spec.scenes.entries()) {
          if (!scene.say) { audio.push(undefined); continue; }
          progress(`Recording the voice for scene ${i + 1} of ${spec.scenes.length}…`);
          const file = join(assets, `voice-${i + 1}.wav`), made = await speakLine(scene.say, voiceName, file, voiceProvider, language);
          audio.push({ src: relativePath(dir, file).replace(/\\/g, '/'), seconds: made.seconds });
        }
      }
      progress('Building the scenes…');
      const { composition, notes } = compileExplainer(spec, { audio });
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, 'explainer.json'), JSON.stringify(spec, null, 2) + '\n');
      await ensureBaseline(resolve(dir, 'composition.json'));
      const files = await writeCompositionProject(dir, composition as any, { force: true });
      await saveRevision(files.composition, { kind: 'compose', label: spec.topic.slice(0, 160), brief: (brief ?? spec.topic).slice(0, 4000), attempts: 1 });
      const loaded = loadComposition(composition);
      return { dir, ...resultFile(files.composition), script: spec, frames: loaded.durationFrames, seconds: loaded.durationFrames / loaded.fps, scenes: loaded.scenes.length, attempts: 1, warnings: notes, reviewed: false, issues: [] };
    } };
  };

  const refine = (input: Input): JobSpec => {
    const file = paths.fileInside(input.file, 'composition');
    const instruction = textOf(input.instruction, 'instruction');
    const review = boolOf(input.review);
    return { kind: 'refine', run: async progress => {
      const current = await readJson(file) as Composition;
      const result = await refineVideo(resolveProvider(input), current, { instruction, review, baseDir: dirname(file), onProgress: message => progress(cleanProgressMessage(message)) });
      const saved = await writeComposition(file, result.composition, { kind: 'refine', label: instruction.slice(0, 160), attempts: result.attempts });
      return {
        ...resultFile(file), revision: saved?.n, frames: result.composition.durationFrames, seconds: result.composition.durationFrames / result.composition.fps, scenes: result.composition.scenes.length,
        attempts: result.attempts, warnings: result.warnings, reviewed: Boolean(review), issues: result.issues.filter(issue => issue.severity === 'error').map(issue => issue.message), instruction,
      };
    } };
  };

  const importJson = (input: Input): JobSpec => {
    const rawText = textOf(input.json, 'JSON content');
    return { kind: 'import', run: async progress => {
      progress('Preparing project composition…');
      const notes: string[] = [];
      const composition = loadComposition(sanitizeCompositionJson(extractJson(rawText), notes));
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
      return { id: relative(dir), dir, ...resultFile(files.composition), frames: composition.durationFrames, seconds: composition.durationFrames / composition.fps, scenes: composition.scenes.length, attempts: 1, warnings: notes, issues: [] };
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
      // Object storage is the operator's, configured by env: a job request never chooses the endpoint or the key.
      // The key is tenant-scoped so two people rendering the same project name cannot collide or overwrite each other.
      const s3Conf = loadS3ConfigFromEnv();
      if (s3Conf && (input.uploadS3 !== false)) {
        try {
          progress('Uploading rendered video to object storage (S3/R2)…');
          const s3Client = new S3Client(s3Conf);
          const videoBytes = await readFile(result.output);
          const ext = result.format;
          const contentType = ext === 'mp4' ? 'video/mp4' : ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : ext === 'gif' ? 'image/gif' : 'application/octet-stream';
          const filename = result.output.split(/[\\/]/).pop() || `out.${ext}`;
          const s3Key = `renders/${paths.tenantId}/${paths.idOf(baseDir)}/${Date.now()}-${filename}`;
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

  return { compose, explainer, refine, import: importJson, render, thumbnail, review, narrate: narrateJob, transcribe, image, batch };
}
export type Handlers = ReturnType<typeof createHandlers>;
