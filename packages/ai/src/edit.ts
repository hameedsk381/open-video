// The talking-head editor: a raw clip goes in, a cleaned reel comes out. The clip is transcribed with word
// timings, filler words and long silences become a cut list, and the cut list becomes a composition: one video
// layer per kept stretch (trimStart skips the removed source, the clip's own sound carried through), plus a
// word-timed captions layer over the whole edited timeline. planCuts and editComposition are pure functions of
// the transcript, so they are unit-testable without a provider; editVideo() only adds file work (extract the
// audio, transcribe it, write the project). Like every AI path, nothing here renders: the output is ordinary
// composition JSON checked and rendered by the same engine as a hand-written video.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { Composition } from '@ove/core';
import { extractAudio, hasAudioStream, probe } from '@ove/ffmpeg';
import { fillers } from '@ove/schema';
import type { AiProvider, Transcript, TranscriptWord } from './providers';
import { captionsStyle } from './captions';
import { compositionRelative, validateTemplate, writeCompositionProject } from './project';

export type CutSegment = { from: number; to: number };

export type CutPlan = {
  /** The kept stretches of the source, in seconds, in order. */
  segments: CutSegment[];
  /** The kept words with their times remapped onto the edited timeline (what the captions show). */
  words: TranscriptWord[];
  /** Seconds removed between the first and last kept word. */
  cut: number;
  /** Filler and repeated words cut (um, uh, "the the"). */
  fillers: number;
};

export type PlanCutsOptions = {
  /** A pause longer than this, in seconds, is cut (default 0.5). */
  maxSilence?: number;
  /** Keep filler words in the video instead of cutting them. */
  keepFillers?: boolean;
  /** Breathing room kept before the first and after the last word, in seconds (default 0.3). */
  padding?: number;
};

const normalize = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}']+/gu, '');

/** Turns word timings into a cut list: speech runs join across pauses up to maxSilence, longer pauses become cuts. */
export function planCuts(transcript: Transcript, options: PlanCutsOptions = {}): CutPlan {
  const maxSilence = options.maxSilence ?? 0.5, padding = options.padding ?? 0.3;
  const words = transcript.words.filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start).sort((a, b) => a.start - b.start);
  if (!words.length) throw new Error('No word timings to cut with; the transcription produced no words');
  const kept: TranscriptWord[] = [];
  let fillersCut = 0;
  for (const word of words) {
    const key = normalize(word.text), previous = kept.at(-1);
    const filler = fillers.has(key) || key === '';
    const repeated = previous !== undefined && key !== '' && normalize(previous.text) === key && !/[.,!?;:]$/.test(previous.text.trim()) && previous.end >= word.start - maxSilence;
    if ((!options.keepFillers && filler) || repeated) { if (filler && !options.keepFillers) fillersCut++; continue; }
    kept.push(word);
  }
  if (!kept.length) throw new Error('Every word was cut as a filler; pass keepFillers to keep the speech');
  const segments: CutSegment[] = [];
  for (const word of kept) {
    const last = segments.at(-1);
    if (last && word.start - last.to <= maxSilence) last.to = Math.max(last.to, word.end);
    else segments.push({ from: word.start, to: word.end });
  }
  segments[0]!.from = Math.max(0, segments[0]!.from - padding);
  segments[segments.length - 1]!.to += padding;
  // Remap the kept words onto the edited timeline: everything before their segment was cut.
  let offset = 0; const remapped: TranscriptWord[] = [];
  for (const [i, segment] of segments.entries()) {
    if (i > 0) offset += segment.from - segments[i - 1]!.to;
    for (const word of kept) if (word.start >= segment.from && word.start <= segment.to) remapped.push({ text: word.text, start: word.start - offset, end: word.end - offset });
  }
  return { segments, words: remapped, cut: offset, fillers: fillersCut };
}

export type EditCompositionOptions = {
  fps: number;
  width: number;
  height: number;
  /** The clip, as an asset id or a path relative to the composition. */
  src: string;
  plan: CutPlan;
  /** Composition-relative path to a captions file (word timings); left out, the reel has no captions. */
  captionsSrc?: string;
};

/** Builds the edited composition: one video layer per kept stretch (hard jump cuts between them), captions over all of it. */
export function editComposition(options: EditCompositionOptions): Composition {
  const { fps, width, height, src, plan } = options;
  const scenes: any[] = plan.segments.map((segment, i) => {
    const startFrame = plan.segments.slice(0, i).reduce((n, s) => n + Math.max(1, Math.round((s.to - s.from) * fps)), 0);
    return {
      id: `clip-${i + 1}`, name: `Clip ${i + 1}`, startFrame, durationFrames: Math.max(1, Math.round((segment.to - segment.from) * fps)),
      layers: [{ id: `clip-${i + 1}-video`, type: 'video', src, trimStart: Math.round(segment.from * fps), x: 0, y: 0, width, height, objectFit: 'cover' as const }],
    };
  });
  const total = scenes.reduce((n, scene) => n + scene.durationFrames, 0);
  if (options.captionsSrc) scenes.push({ id: 'captions', name: 'Captions', startFrame: 0, durationFrames: total,
    layers: [{ id: 'edit-captions-layer', type: 'captions', src: 'edit-captions', startFrame: 0, ...captionsStyle(width, height) }] });
  const composition = {
    version: '1.0', id: 'edit', name: 'Edited reel', fps, width, height, durationFrames: total,
    assets: [
      { id: 'source-clip', type: 'video', src, metadata: {} },
      ...(options.captionsSrc ? [{ id: 'edit-captions', type: 'captions', src: options.captionsSrc, metadata: {} }] : []),
    ],
    scenes,
    export: { loudness: -16 },
  };
  return composition as unknown as Composition;
}

export type EditOptions = {
  /** Path to the raw clip (any file FFmpeg reads). */
  clip: string;
  /** Project directory to write: composition.json, composition.schema.json, assets/. */
  outDir: string;
  width?: number;
  height?: number;
  fps?: number;
  maxSilence?: number;
  keepFillers?: boolean;
  padding?: number;
  captions?: boolean;
  language?: string;
  /** Write into a directory that already has files. */
  force?: boolean;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type EditResult = {
  dir: string;
  composition: string;
  captions?: string;
  durationSeconds: number;
  sourceSeconds: number;
  segments: number;
  cut: number;
  fillers: number;
  words: number;
};

/** Transcribes a raw clip, cuts its fillers and silences, and writes the edited reel as a project. */
export async function editVideo(provider: AiProvider, options: EditOptions): Promise<EditResult> {
  if (!provider.transcribe) throw new Error(`The ${provider.id} provider cannot transcribe; use --provider groq (or add a transcribe() adapter)`);
  const clip = resolve(options.clip);
  const outDir = resolve(options.outDir);
  const width = options.width ?? 1080, height = options.height ?? 1920, fps = options.fps ?? 30;
  options.onProgress?.('Reading the clip…');
  if (await hasAudioStream(clip) === false) throw new Error(`${basename(clip)} has no audio track; there is nothing to transcribe`);
  const sourceSeconds = Number(await probe(clip)) || 0;
  await mkdir(join(outDir, 'assets'), { recursive: true });
  const audioFile = join(outDir, 'assets', 'source-audio.m4a');
  options.onProgress?.('Extracting the audio…');
  await extractAudio(clip, audioFile);
  options.onProgress?.('Transcribing…');
  const transcript = await provider.transcribe(new Uint8Array(await readFile(audioFile)), basename(audioFile), { language: options.language, signal: options.signal });
  if (!transcript.words.length) throw new Error('No speech was recognised in that clip');
  options.onProgress?.('Cutting silences and fillers…');
  const plan = planCuts(transcript, { maxSilence: options.maxSilence, keepFillers: options.keepFillers, padding: options.padding });
  let captionsFile: string | undefined;
  if (options.captions !== false) {
    captionsFile = join(outDir, 'assets', 'edit-captions.json');
    await writeFile(captionsFile, JSON.stringify({ words: plan.words }, null, 2) + '\n');
  }
  const composition = editComposition({
    fps, width, height, src: compositionRelative(outDir, clip), plan,
    captionsSrc: captionsFile ? compositionRelative(outDir, captionsFile) : undefined,
  });
  validateTemplate(composition as any);
  const written = await writeCompositionProject(outDir, composition, { force: options.force });
  return {
    dir: written.dir, composition: written.composition, captions: captionsFile,
    durationSeconds: composition.durationFrames / fps, sourceSeconds,
    segments: plan.segments.length, cut: plan.cut, fillers: plan.fillers, words: plan.words.length,
  };
}
