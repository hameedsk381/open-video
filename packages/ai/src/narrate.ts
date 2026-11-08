// Narration: an LLM script (optional) -> speech -> word timings -> captions file -> a full-length narration scene
// holding the audio and the captions. The scene is appended last so captions draw over every other scene, and the
// video's duration grows to fit the voiceover rather than the voiceover being cut off.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Composition } from '@ove/core';
import { narrationText, type VideoContent } from '@ove/schema';
import { probe } from '@ove/ffmpeg';
import type { AiProvider, Transcript } from './providers';
import { captionsStyle } from './captions';
import { compositionRelative, validateTemplate } from './project';

export type NarrateOptions = {
  text?: string;
  brief?: string;
  outDir: string;
  voice?: string;
  language?: string;
  /** Target length for a generated script, in seconds. */
  durationSeconds?: number;
  composition?: Composition;
  compositionPath?: string;
  tailSeconds?: number;
  captions?: boolean;
  /** The script the video was written from; its narration is spoken as-is instead of writing a new script. */
  content?: VideoContent;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type NarrateResult = {
  audio: string;
  captions?: string;
  durationSeconds: number;
  words: number;
  composition?: Composition;
  text: string;
};

export function cleanScript(text: string): string {
  return text
    .replace(/^\s*(narration|narrator|voiceover|vo)\s*:\s*/gim, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function writeNarrationScript(provider: AiProvider, brief: string, options: { durationSeconds?: number; language?: string; signal?: AbortSignal } = {}): Promise<string> {
  const seconds = options.durationSeconds ?? 20;
  const words = Math.max(20, Math.round(seconds * 2.4));
  const text = await provider.chat([
    { role: 'system', content: 'You write voiceover scripts for short videos. Output only the words to be spoken: no headings, scene directions, timestamps, camera notes, emojis or quotation marks. Use short sentences that sound natural read aloud.' },
    { role: 'user', content: `Write a ${seconds}-second voiceover (about ${words} words)${options.language ? ` in ${options.language}` : ''} for this video:\n\n${brief.trim()}` },
  ], { temperature: 0.7, maxTokens: 1200, signal: options.signal });
  return cleanScript(text);
}

const endOf = (transcript: Transcript) => Math.max(0, ...transcript.words.map(word => word.end), ...transcript.cues.map(cue => cue.end));

export type SceneOptions = { audioSrc?: string; captionsSrc?: string; sceneId?: string; captionStartFrame?: number; durationSeconds: number; tailSeconds?: number };

export function narrationScene(composition: Composition, options: SceneOptions): Composition {
  const next: Composition = JSON.parse(JSON.stringify(composition));
  const { fps, width, height } = next;
  const tailFrames = Math.round((options.tailSeconds ?? 0.8) * fps);
  const needed = Math.ceil(options.durationSeconds * fps) + tailFrames;
  const declared = Number(next.durationFrames);
  const sceneEnd = Math.max(0, ...next.scenes.map(scene => Number(scene.startFrame ?? 0) + Number(scene.durationFrames ?? 0)));
  const durationFrames = Math.max(Number.isFinite(declared) ? declared : 0, sceneEnd, needed);
  const sceneId = options.sceneId ?? (options.audioSrc ? 'narration' : 'captions');
  next.durationFrames = durationFrames;
  // Speech and effects mixed without mastering come out quiet; give the video a loudness target unless it has one.
  if ((next.export as any)?.loudness === undefined) next.export = { ...next.export, loudness: -16 } as any;
  next.assets = (next.assets ?? []).filter(asset => asset.id !== 'narration' && asset.id !== 'narration-captions');
  if (options.audioSrc) next.assets.push({ id: 'narration', type: 'audio', src: options.audioSrc, metadata: {} });
  if (options.captionsSrc) next.assets.push({ id: 'narration-captions', type: 'captions', src: options.captionsSrc, metadata: {} });
  next.scenes = next.scenes.filter(scene => scene.id !== sceneId);
  const layers: any[] = [];
  if (options.audioSrc) layers.push({ id: 'narration-audio', type: 'audio', src: 'narration', startFrame: 0 });
  // Captions draw downward from y (textBaseline top), so the block's top sits above the platform's bottom UI band
  // with room for a second line, and its width stays clear of the right band of action buttons (captions.ts).
  if (options.captionsSrc) layers.push({ id: 'narration-captions-layer', type: 'captions', src: 'narration-captions', startFrame: options.captionStartFrame ?? 0,
    ...captionsStyle(width, height) });
  next.scenes.push({ id: sceneId, name: sceneId === 'narration' ? 'Narration' : 'Captions', startFrame: 0, durationFrames,
    transitionIn: undefined, layers, metadata: {}, assetIds: [] } as any);
  validateTemplate(next);
  return next;
}

export async function narrate(provider: AiProvider, options: NarrateOptions): Promise<NarrateResult> {
  if (!provider.speak) throw new Error(`The ${provider.id} provider cannot make speech (or add a speak() adapter)`);
  const brief = options.brief?.trim();
  const scripted = options.content ?? options.composition?.content;
  let text = options.text?.trim() ?? (scripted ? narrationText(scripted) : '');
  if (!text && brief) {
    options.onProgress?.('Writing the narration script…');
    text = await writeNarrationScript(provider, brief, { durationSeconds: options.durationSeconds, language: options.language, signal: options.signal });
  }
  if (!text) throw new Error('Nothing to narrate: pass a script file or --brief "what the video is about"');
  await mkdir(options.outDir, { recursive: true });
  options.onProgress?.('Synthesising speech…');
  const audio = await provider.speak(text, { voice: options.voice, signal: options.signal });
  const audioFile = join(options.outDir, `narration.${audio.extension}`);
  await writeFile(audioFile, audio.data);
  options.onProgress?.('Transcribing for word timings…');
  let transcript: Transcript = { text: '', words: [], cues: [] };
  if (!provider.transcribe) {
    options.onProgress?.('This provider cannot transcribe, so captions are skipped.');
  } else {
    transcript = await provider.transcribe(audio.data, `narration.${audio.extension}`, { language: options.language, signal: options.signal });
  }
  let durationSeconds = endOf(transcript);
  if (!durationSeconds) {
    try { durationSeconds = Number(await probe(audioFile)) || 0; } catch { /* ffprobe is optional here */ }
    if (!durationSeconds) durationSeconds = Math.max(1, text.split(/\s+/).length / 2.4);
  }
  let captionsFile: string | undefined;
  const hasCaptions = options.captions !== false && (transcript.words.length > 0 || transcript.cues.length > 0);
  if (hasCaptions) {
    captionsFile = join(options.outDir, 'narration.captions.json');
    await writeFile(captionsFile, JSON.stringify(transcript.words.length ? { words: transcript.words } : { cues: transcript.cues }, null, 2) + '\n');
  }
  let composition: Composition | undefined;
  if (options.composition) {
    const baseDir = options.compositionPath ? dirname(options.compositionPath) : options.outDir;
    composition = narrationScene(options.composition, {
      audioSrc: compositionRelative(baseDir, audioFile),
      captionsSrc: captionsFile ? compositionRelative(baseDir, captionsFile) : undefined,
      durationSeconds,
      tailSeconds: options.tailSeconds,
    });
  }
  return { audio: audioFile, captions: captionsFile, durationSeconds, words: transcript.words.length, composition, text };
}

export type CaptionOptions = {
  audio: string;
  outDir?: string;
  language?: string;
  composition?: Composition;
  compositionPath?: string;
  /** Seconds into the video where the audio starts, so the captions line up. */
  startSeconds?: number;
  tailSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type CaptionResult = { captions: string; durationSeconds: number; words: number; cues: number; composition?: Composition; transcript: Transcript };

/** Captions for audio that already exists (a recorded voiceover or a video's own sound). */
export async function captionAudio(provider: AiProvider, options: CaptionOptions): Promise<CaptionResult> {
  if (!provider.transcribe) throw new Error(`The ${provider.id} provider cannot transcribe (or add a transcribe() adapter)`);
  const audioFile = resolve(options.audio);
  const data = await readFile(audioFile);
  options.onProgress?.('Transcribing…');
  const transcript = await provider.transcribe(new Uint8Array(data), basename(audioFile), { language: options.language, signal: options.signal });
  if (!transcript.words.length && !transcript.cues.length) throw new Error('No speech was recognised in that audio');
  let durationSeconds = endOf(transcript);
  if (!durationSeconds) {
    try { durationSeconds = Number(await probe(audioFile)) || 0; } catch { /* ffprobe is optional here */ }
  }
  const outDir = options.outDir ?? dirname(audioFile);
  await mkdir(outDir, { recursive: true });
  const captionsFile = join(outDir, `${basename(audioFile).replace(/\.[^.]+$/, '')}.captions.json`);
  await writeFile(captionsFile, JSON.stringify(transcript.words.length ? { words: transcript.words } : { cues: transcript.cues }, null, 2) + '\n');
  let composition: Composition | undefined;
  if (options.composition) {
    const baseDir = options.compositionPath ? dirname(options.compositionPath) : dirname(audioFile);
    const start = options.startSeconds ?? 0;
    composition = narrationScene(options.composition, {
      captionsSrc: compositionRelative(baseDir, captionsFile),
      sceneId: 'captions',
      captionStartFrame: Math.round(start * options.composition.fps),
      durationSeconds: start + durationSeconds,
      tailSeconds: options.tailSeconds,
    });
  }
  return { captions: captionsFile, durationSeconds, words: transcript.words.length, cues: transcript.cues.length, composition, transcript };
}
