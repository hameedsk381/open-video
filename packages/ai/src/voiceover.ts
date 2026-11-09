// Voiceover-driven timing: one spoken line per scene, and each scene is as long as its line. The model writes the lines from what
// each scene shows, the provider speaks them, and the scenes are cut to the audio (a short lead-in before each line, a short
// pause after it) so what is said and what is on screen change together. Word-timed captions come from transcribing the result.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Composition } from '@ove/core';
import type { AiProvider, ChatMessage, Transcript } from './providers';
import { concatWav, pcmToWav } from './providers';
import { extractJson } from './json';
import { cleanScript, narrationScene } from './narrate';
import { compositionRelative } from './project';

export type VoiceoverOptions = {
  brief: string;
  outDir: string;
  compositionPath?: string;
  voice?: string;
  language?: string;
  /** Frames of picture before a line starts, and of pause after it. */
  leadFrames?: number;
  padFrames?: number;
  tailFrames?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};
export type VoiceoverResult = { composition: Composition; audio: string; captions?: string; durationSeconds: number; words: number; lines: string[]; text: string };

const textOf = (layers: any[] = []): string[] => layers.flatMap(layer => {
  if (!layer || typeof layer !== 'object') return [];
  if (layer.type === 'text') return [typeof layer.content === 'string' && layer.content.trim() ? layer.content : (layer.spans ?? []).map((span: any) => span.text).join('')].filter(Boolean);
  return textOf(layer.children);
});

/**
 * Carries a narration (scene timings, the narration scene, its assets and the new length) from the resolved composition back into the
 * template source it came from, so the video stays editable. Undefined when the scenes do not line up (then save the resolved one).
 */
export function mergeNarration(source: Record<string, any>, resolved: Composition): Record<string, any> | undefined {
  const live = resolved.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions'), extra = resolved.scenes.filter(scene => scene.id === 'narration' || scene.id === 'captions');
  if (!Array.isArray(source.scenes) || source.scenes.length !== live.length || source.scenes.some((scene: any, i: number) => scene?.id !== live[i]!.id)) return undefined;
  const next = structuredClone(source);
  next.scenes.forEach((scene: any, i: number) => { scene.startFrame = live[i]!.startFrame; scene.durationFrames = live[i]!.durationFrames; });
  next.scenes.push(...JSON.parse(JSON.stringify(extra)));
  next.assets = JSON.parse(JSON.stringify(resolved.assets)); next.durationFrames = resolved.durationFrames; next.export = { ...(next.export ?? {}), ...JSON.parse(JSON.stringify(resolved.export)) };
  return next;
}

/** Format of a canonical PCM WAV: channels, sample rate, bits, and the length of its audio in seconds. */
export function wavInfo(data: Uint8Array): { channels: number; sampleRate: number; bits: number; seconds: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (at: number) => String.fromCharCode(...data.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('The speech is not a WAV file');
  let at = 12, channels = 1, sampleRate = 24000, bits = 16, bytes = 0;
  while (at + 8 <= data.length) {
    const size = view.getUint32(at + 4, true);
    if (tag(at) === 'fmt ') { channels = view.getUint16(at + 10, true); sampleRate = view.getUint32(at + 12, true); bits = view.getUint16(at + 22, true); }
    if (tag(at) === 'data') { bytes = Math.min(size, data.length - at - 8); break; }
    at += 8 + size + (size % 2);
  }
  return { channels, sampleRate, bits, seconds: bytes / (sampleRate * channels * (bits / 8)) };
}

const silence = (seconds: number, like: { channels: number; sampleRate: number; bits: number }) =>
  pcmToWav(new Uint8Array(Math.round(seconds * like.sampleRate) * like.channels * (like.bits / 8)), like.sampleRate, like.channels, like.bits);

/** One spoken line per scene, written from what the scene shows. */
export async function writeSceneLines(provider: AiProvider, brief: string, scenes: { texts: string[]; seconds: number }[], options: { language?: string; signal?: AbortSignal } = {}): Promise<string[]> {
  // The voice speaks about two words a second; a line may run a little over its scene's length, never far over.
  const limits = scenes.map(scene => Math.min(20, Math.max(8, Math.round(scene.seconds * 2))));
  const list = scenes.map((scene, i) => `${i + 1}. on screen: ${scene.texts.join(' | ').slice(0, 240) || '(a picture)'} — at most ${limits[i]} words`).join('\n');
  const messages: ChatMessage[] = [
    { role: 'system' as const, content: 'You write voiceover for a short video, one spoken line per scene. Reply with JSON only: {"lines": ["...", ...]} with exactly one line for each scene, in order. Lines are natural spoken sentences that go with what is on screen and flow as one script from start to end; do not read the on-screen text word for word, do not invent facts, prices or dates that are not in the brief or on screen, and do not use stage directions, emoji or markdown.' + (options.language ? ` Write in ${options.language}.` : '') },
    { role: 'user' as const, content: `Brief: ${brief}\n\nScenes:\n${list}` },
  ];
  let problem = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await provider.chat(messages, { json: true, temperature: 0.6, maxTokens: 1500, signal: options.signal });
    try {
      const lines = (extractJson(text) as any)?.lines;
      if (!Array.isArray(lines) || lines.length !== scenes.length || lines.some(line => typeof line !== 'string' || !cleanScript(line))) throw new Error(`"lines" must be a list of exactly ${scenes.length} non-empty strings`);
      const long = lines.map((line, i) => ({ i, words: cleanScript(line).split(/\s+/).length })).filter(({ i, words }) => words > limits[i]! + 3);
      if (long.length) throw new Error(long.map(({ i, words }) => `line ${i + 1} has ${words} words, at most ${limits[i]}`).join('; ') + '; make them shorter');
      return lines.map(line => cleanScript(line));
    } catch (error) {
      problem = (error as Error).message;
      messages.push({ role: 'assistant', content: text }, { role: 'user', content: `That cannot be used: ${problem}. Reply with the corrected JSON.` });
    }
  }
  throw new Error(`Could not get one voiceover line per scene: ${problem}`);
}

/**
 * Speaks one line per scene and resizes the scenes to fit, then adds the narration scene (audio and captions). The composition
 * must have its scenes laid out one after another with their transitions (as the template videos are).
 */
export async function narrateScenes(provider: AiProvider, composition: Composition, options: VoiceoverOptions): Promise<VoiceoverResult> {
  if (!provider.speak) throw new Error(`The ${provider.id} provider cannot make speech`);
  const { fps } = composition;
  const lead = options.leadFrames ?? 12, pad = options.padFrames ?? 14, tail = options.tailFrames ?? 26;
  const scenes = composition.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions');
  if (!scenes.length) throw new Error('There are no scenes to narrate');
  // A scripted video speaks its own beats: the content is the script, so there is nothing left to write.
  const script = composition.content;
  const written = scenes.map((scene, i) => {
    const beat = (scene as any).beat ? script?.beats.find(item => item.id === (scene as any).beat) : script?.beats.length === scenes.length ? script.beats[i] : undefined;
    return beat?.narration?.trim() || undefined;
  });
  options.onProgress?.(written.every(Boolean) ? 'Speaking the script…' : 'Writing one voiceover line per scene…');
  const lines = written.every(Boolean)
    ? written.map(line => cleanScript(line!))
    : (await writeSceneLines(provider, options.brief, scenes.map(scene => ({ texts: textOf(scene.layers as any[]), seconds: Number(scene.durationFrames) / fps })), { language: options.language, signal: options.signal })).map((line, i) => written[i] ?? line);

  const parts: Uint8Array[] = [], seconds: number[] = [];
  let like: { channels: number; sampleRate: number; bits: number } | undefined;
  for (const [i, line] of lines.entries()) {
    options.onProgress?.(`Speaking line ${i + 1}/${lines.length}…`);
    const spoken = await provider.speak(line, { voice: options.voice, language: options.language, signal: options.signal });
    if (spoken.extension !== 'wav') throw new Error(`Scene-by-scene voiceover needs WAV speech, not ${spoken.extension}`);
    const info = wavInfo(spoken.data);
    like ??= info;
    parts.push(spoken.data); seconds.push(info.seconds);
  }

  // Lay the scenes out around the lines. Scene i+1 starts `overlap` before scene i ends, and its line starts `lead` after that.
  const next: Composition = JSON.parse(JSON.stringify(composition));
  const live = next.scenes.filter(scene => scene.id !== 'narration' && scene.id !== 'captions');
  const overlapOf = (i: number) => Number(live[i]?.transitionIn?.durationFrames ?? 0);
  const timeline: Uint8Array[] = [silence(lead / fps, like!)];
  let start = 0;
  live.forEach((scene, i) => {
    const lineFrames = Math.ceil(seconds[i]! * fps);
    const last = i === live.length - 1;
    const duration = Math.max(60, lead + lineFrames + (last ? tail : pad + overlapOf(i + 1)));
    scene.startFrame = start; scene.durationFrames = duration;
    for (const layer of scene.layers as any[]) if (typeof layer.endFrame === 'number') layer.endFrame = Math.min(layer.endFrame, duration);
    timeline.push(parts[i]!);
    if (!last) timeline.push(silence((duration - overlapOf(i + 1) - lineFrames) / fps, like!));
    start = start + duration - (last ? 0 : overlapOf(i + 1));
  });
  next.durationFrames = Math.max(...live.map(scene => Number(scene.startFrame) + Number(scene.durationFrames)));
  const wav = concatWav(timeline);

  await mkdir(options.outDir, { recursive: true });
  const audioFile = join(options.outDir, 'narration.wav');
  await writeFile(audioFile, wav);
  let transcript: Transcript = { text: '', words: [], cues: [] };
  if (provider.transcribe) {
    options.onProgress?.('Transcribing for word timings…');
    transcript = await provider.transcribe(wav, 'narration.wav', { language: options.language, signal: options.signal });
  } else options.onProgress?.('This provider cannot transcribe, so captions are skipped.');
  let captionsFile: string | undefined;
  if (transcript.words.length || transcript.cues.length) {
    captionsFile = join(options.outDir, 'narration.captions.json');
    await writeFile(captionsFile, JSON.stringify(transcript.words.length ? { words: transcript.words } : { cues: transcript.cues }, null, 2) + '\n');
  }
  const baseDir = options.compositionPath ? dirname(options.compositionPath) : options.outDir;
  const total = wavInfo(wav).seconds;
  const result = narrationScene(next, { audioSrc: compositionRelative(baseDir, audioFile), captionsSrc: captionsFile ? compositionRelative(baseDir, captionsFile) : undefined, durationSeconds: total, tailSeconds: tail / fps });
  return { composition: result, audio: audioFile, captions: captionsFile, durationSeconds: total, words: transcript.words.length, lines, text: lines.join(' ') };
}
