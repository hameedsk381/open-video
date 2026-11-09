/**
 * The local voice engine: speech from the released Indic models, in this process, with no key and no network once
 * the model is on disk. It plugs into the same `AiProvider.speak` / `transcribe` seam the Edge engine uses, and it
 * already knows where every word sits in its own audio, so captions cost nothing extra.
 */
import { createHash } from 'node:crypto';
import type { AiProvider, SpeakOptions, Transcript } from '../providers';
import { ensureIndicModel, indicLanguage, indicLanguageFor, indicLanguages, type IndicLanguageInfo } from './models';
import { loadIndicModel, synthesizeIndic, type IndicModel } from './synthesis';

export type IndicSpeakOptions = SpeakOptions & { language?: string };

export type IndicSpeech = { data: Uint8Array; extension: 'wav'; transcript: Transcript; seconds: number; dropped: string[] };

const models = new Map<string, Promise<IndicModel>>();
// A transcript is kept only until the audio it belongs to has been transcribed, which happens right after speaking; a long-running server
// must not keep every line it ever said, so only the most recent ones stay.
const MAX_TRANSCRIPTS = 64;
const transcripts = new Map<string, Transcript>();

/** The loaded model for a language, shared by every line in a render (loading takes a moment, speaking does not). */
export function indicModel(code: string): Promise<IndicModel> {
  const language = indicLanguage(code);
  if (!language) throw new Error(`There is no local voice for ${code}; this engine speaks ${indicLanguageNames()}`);
  let loaded = models.get(language.code);
  if (!loaded) {
    loaded = ensureIndicModel(language.code).then(loadIndicModel);
    loaded.catch(() => models.delete(language.code));
    models.set(language.code, loaded);
  }
  return loaded;
}

function indicLanguageNames(): string {
  return indicLanguages().map(language => `${language.name} (${language.code})`).join(', ');
}

/** Which language a line is in: what the caller named, else the voice's own locale ("hi-IN-SwaraNeural"), else Hindi. */
export function indicLanguageForRequest(options: { language?: string; voice?: string } = {}): IndicLanguageInfo {
  const asked = options.language?.trim();
  if (asked) {
    const language = indicLanguageFor(asked);
    if (language) return language;
    throw new Error(`The local voice does not speak ${asked}; it speaks ${indicLanguageNames()}`);
  }
  const locale = options.voice?.match(/(?:^|-)([a-z]{2})-[A-Z]{2}(?:-|$)/)?.[1];
  return (locale ? indicLanguageFor(locale) : undefined) ?? indicLanguage('hi')!;
}

const audioKey = (audio: Uint8Array) => createHash('sha256').update(audio).digest('hex').slice(0, 32);

/** One line of speech as 16-bit 24 kHz mono WAV, with a transcript already aligned to it. */
export async function synthesizeIndicSpeech(text: string, options: IndicSpeakOptions = {}): Promise<IndicSpeech> {
  if (!text.trim()) throw new Error('There is nothing to speak');
  options.signal?.throwIfAborted();
  const model = await indicModel(indicLanguageForRequest(options).code);
  const speech = await synthesizeIndic(model, text, { voice: options.voice, speed: options.speed, seed: options.seed });
  options.signal?.throwIfAborted();
  const transcript: Transcript = {
    text,
    words: speech.words,
    cues: speech.words.map(word => ({ text: word.text, start: word.start, end: word.end })),
  };
  const key = audioKey(speech.wav);
  transcripts.delete(key); // re-insert last, so the oldest entries are the ones dropped below
  transcripts.set(key, transcript);
  while (transcripts.size > MAX_TRANSCRIPTS) transcripts.delete(transcripts.keys().next().value!);
  return { data: speech.wav, extension: 'wav', transcript, seconds: speech.seconds, dropped: speech.dropped };
}

/**
 * Attaches the local voice to a provider. Transcription needs no second model: the audio was made here, so the word
 * timings come from the durations that shaped it. Audio that did not come from this engine falls through to whatever
 * transcription the provider already had.
 */
export function attachIndicAudio(provider: AiProvider, defaults: { language?: string } = {}): AiProvider {
  const previous = provider.transcribe;
  provider.speechEngine = 'indic';
  provider.speak = async (text: string, options: SpeakOptions = {}) => {
    const result = await synthesizeIndicSpeech(text, { ...options, language: options.language ?? defaults.language });
    return { data: result.data, extension: result.extension };
  };
  provider.transcribe = async (audio: Uint8Array, filename: string, options: { language?: string; signal?: AbortSignal } = {}) => {
    const known = transcripts.get(audioKey(audio));
    if (known) return known;
    if (previous) return previous.call(provider, audio, filename, options);
    return { text: '', words: [], cues: [] };
  };
  return provider;
}
