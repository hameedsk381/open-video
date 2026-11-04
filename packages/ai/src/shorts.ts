// The shorts factory: one long recording goes in, several vertical reels come out. The recording is transcribed
// once with word timings; candidate clips are windows over its sentences and pauses, scored by a transparent
// rubric — a clean ending, a hook in the first line, speech density, and a length near the sweet spot — and the
// best non-overlapping candidates become projects with the same edited-reel shape as `ove ai edit` (one video
// layer per kept stretch, word-timed captions). planShorts is a pure function of the transcript, so the rubric
// is unit-testable without a provider; shortsFrom() only adds file work. Nothing here renders.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { extractAudio, hasAudioStream, probe } from '@ove/ffmpeg';
import type { AiProvider, Transcript, TranscriptWord } from './providers';
import { editComposition, planCuts, type CutPlan } from './edit';
import { compositionRelative, writeCompositionProject } from './project';

export type ShortCandidate = {
  /** Seconds into the source where the short starts and ends. */
  from: number;
  to: number;
  /** The rubric total; see planShorts for the parts. */
  score: number;
  breakdown: { endsClean: number; hook: number; density: number; lengthFit: number };
  /** The words in the short, in source time. */
  words: TranscriptWord[];
  /** The words as one line — the first sentence is the hook a viewer sees first. */
  text: string;
};

export type PlanShortsOptions = {
  /** How many shorts to pick (default 3). */
  count?: number;
  /** Shortest candidate, in seconds (default 15). */
  minSeconds?: number;
  /** Longest candidate, in seconds (default 60). */
  maxSeconds?: number;
  /** A pause longer than this, in seconds, ends a sentence even without punctuation (default 0.8). */
  maxSilence?: number;
};

const hookStarters = new Set(['why', 'how', 'what', 'when', 'who', 'is', 'are', 'do', 'does', 'can', 'should', 'never', 'stop', 'don\'t', 'dont', 'here', 'this', 'nobody', 'everyone']);
const hookWords = new Set(['best', 'worst', 'never', 'always', 'most', 'least', 'nobody', 'everyone', 'secret', 'mistake', 'truth', 'biggest', 'huge', 'free']);
const endsSentence = (word: string) => /[.!?]$/.test(word.trim());
const startsHook = (word: string) => hookStarters.has(word.toLowerCase().replace(/[^\p{L}']+/gu, ''));
const hasHookWord = (words: TranscriptWord[]) => words.some(w => hookWords.has(w.text.toLowerCase().replace(/[^\p{L}']+/gu, '')) || /\d/.test(w.text));

/** Splits words into sentences: punctuation, or a pause longer than maxSilence. */
function sentencesOf(words: TranscriptWord[], maxSilence: number): TranscriptWord[][] {
  const sentences: TranscriptWord[][] = [];
  let current: TranscriptWord[] = [];
  for (const [i, word] of words.entries()) {
    current.push(word);
    const next = words[i + 1];
    if (!next || endsSentence(word.text) || next.start - word.end > maxSilence) { sentences.push(current); current = []; }
  }
  return sentences.filter(sentence => sentence.length);
}

/**
 * Scores windows of whole sentences as candidate shorts. Every candidate starts at a sentence boundary (a cut
 * there never looks accidental); the rubric rewards a clean ending (2), a hook in the first sentence (2), dense
 * speech (0–1), and a length near the 25–45 s sweet spot (0–1). The best `count` non-overlapping windows win.
 */
export function planShorts(transcript: Transcript, options: PlanShortsOptions = {}): ShortCandidate[] {
  const count = options.count ?? 3, minSeconds = options.minSeconds ?? 15, maxSeconds = options.maxSeconds ?? 60;
  const maxSilence = options.maxSilence ?? 0.8;
  const words = transcript.words.filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start).sort((a, b) => a.start - b.start);
  if (!words.length) throw new Error('No word timings to split into shorts; the transcription produced no words');
  const sentences = sentencesOf(words, maxSilence);
  const candidates: ShortCandidate[] = [];
  for (let start = 0; start < sentences.length; start++) {
    let from = sentences[start]![0]!.start, to = from;
    for (let end = start; end < sentences.length; end++) {
      to = sentences[end]!.at(-1)!.end;
      const duration = to - from;
      if (duration > maxSeconds) break;
      if (duration < minSeconds) continue;
      const window = sentences.slice(start, end + 1).flat();
      const first = sentences[start]!;
      const endsClean = endsSentence(sentences[end]!.at(-1)!.text) ? 1 : 0;
      const hook = (startsHook(first[0]!.text) || endsSentence(first.at(-1)!.text) && first.at(-1)!.text.trim().endsWith('?') ? 1 : 0) + (hasHookWord(first) ? 1 : 0);
      const density = Math.max(0, 1 - Math.abs(window.length / duration - 2.5) / 2.5);
      const lengthFit = duration >= 25 && duration <= 45 ? 1 : 1 - Math.min(1, (duration < 25 ? (25 - duration) / 25 : (duration - 45) / (maxSeconds - 45 || 1)));
      const score = endsClean * 2 + hook + density + lengthFit;
      candidates.push({ from, to, score, breakdown: { endsClean, hook, density, lengthFit }, words: window, text: window.map(w => w.text).join(' ') });
    }
  }
  // Best first; ties go to the earlier short (the opening of a video usually carries the strongest hook).
  candidates.sort((a, b) => b.score - a.score || a.from - b.from);
  const picked: ShortCandidate[] = [];
  for (const candidate of candidates) {
    if (picked.length >= count) break;
    if (picked.every(other => candidate.to <= other.from || candidate.from >= other.to)) picked.push(candidate);
  }
  return picked;
}

/** The cut plan for one candidate: tightened like `ove ai edit`, or one continuous stretch with `cut: false`. */
export function shortsCandidatePlan(candidate: ShortCandidate, cut: boolean, maxSilence: number, keepFillers: boolean): CutPlan {
  const slice: Transcript = { text: candidate.text, cues: [], words: candidate.words };
  return cut
    ? planCuts(slice, { maxSilence, keepFillers, padding: 0.2 })
    : planCuts(slice, { maxSilence: Number.MAX_SAFE_INTEGER, keepFillers: true, padding: 0.2 });
}

export type ShortsOptions = {
  /** Path to the long recording (any file FFmpeg reads). */
  clip: string;
  /** Directory to write the projects into: `<outDir>/short-01/`, `<outDir>/short-02/`, … */
  outDir: string;
  count?: number;
  minSeconds?: number;
  maxSeconds?: number;
  width?: number;
  height?: number;
  fps?: number;
  /** Tighten silences and fillers inside each short (default true); false keeps each short one continuous stretch. */
  cut?: boolean;
  maxSilence?: number;
  keepFillers?: boolean;
  captions?: boolean;
  language?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type ShortResult = { dir: string; composition: string; index: number; from: number; to: number; score: number; text: string; durationSeconds: number; words: number };
export type ShortsResult = { dir: string; sourceSeconds: number; shorts: ShortResult[] };

/** Transcribes a long recording once and writes the best `count` shorts as projects. */
export async function shortsFrom(provider: AiProvider, options: ShortsOptions): Promise<ShortsResult> {
  if (!provider.transcribe) throw new Error(`The ${provider.id} provider cannot transcribe (or add a transcribe() adapter)`);
  const clip = resolve(options.clip);
  const outDir = resolve(options.outDir);
  const width = options.width ?? 1080, height = options.height ?? 1920, fps = options.fps ?? 30;
  options.onProgress?.('Reading the recording…');
  if (await hasAudioStream(clip) === false) throw new Error(`${basename(clip)} has no audio track; there is nothing to transcribe`);
  const sourceSeconds = Number(await probe(clip)) || 0;
  await mkdir(outDir, { recursive: true });
  const audioFile = join(outDir, 'source-audio.m4a');
  options.onProgress?.('Extracting the audio…');
  await extractAudio(clip, audioFile);
  options.onProgress?.('Transcribing…');
  const transcript = await provider.transcribe(new Uint8Array(await readFile(audioFile)), basename(audioFile), { language: options.language, signal: options.signal });
  if (!transcript.words.length) throw new Error('No speech was recognised in that recording');
  options.onProgress?.('Scoring candidate shorts…');
  const candidates = planShorts(transcript, { count: options.count ?? 3, minSeconds: options.minSeconds, maxSeconds: options.maxSeconds, maxSilence: options.maxSilence });
  if (!candidates.length) throw new Error(`No run of speech between ${options.minSeconds ?? 15} and ${options.maxSeconds ?? 60} s was found; widen --min/--max`);
  const shorts: ShortResult[] = [];
  for (const [i, candidate] of candidates.entries()) {
    const name = `short-${String(i + 1).padStart(2, '0')}`;
    options.onProgress?.(`Writing ${name}…`);
    const dir = join(outDir, name);
    const plan = shortsCandidatePlan(candidate, options.cut !== false, options.maxSilence ?? 0.5, options.keepFillers ?? false);
    let captionsFile: string | undefined;
    if (options.captions !== false) {
      captionsFile = join(dir, 'assets', 'captions.json');
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFile(captionsFile, JSON.stringify({ words: plan.words }, null, 2) + '\n');
    }
    const composition = editComposition({
      fps, width, height, src: compositionRelative(dir, clip), plan,
      captionsSrc: captionsFile ? compositionRelative(dir, captionsFile) : undefined,
    });
    const written = await writeCompositionProject(dir, composition, { force: true });
    shorts.push({ dir: written.dir, composition: written.composition, index: i + 1, from: candidate.from, to: candidate.to, score: candidate.score, text: candidate.text, durationSeconds: composition.durationFrames / fps, words: plan.words.length });
  }
  return { dir: outDir, sourceSeconds, shorts };
}
