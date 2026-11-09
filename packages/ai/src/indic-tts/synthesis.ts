/**
 * Speech from a released indic-tiny-tts model, run in this process on the CPU. The three exported ONNX graphs do the
 * work — a text encoder (characters -> features and per-token durations), a flow-matching decoder (features -> mel),
 * and a Vocos vocoder (mel -> spectrogram) — and the pieces around them are the model's own maths ported to
 * TypeScript: duration rounding and length regulation, the four-step Euler solver, the inverse STFT, and the
 * sentence-by-sentence join with a short pause. Word timings come from the durations, so captions need no second model.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Tokenizer } from './tokenizer';
import { normalizeForChars, type NormLanguage } from './textnorm';
import { istft } from './istft';

export type IndicConfig = {
  language: string;
  sample_rate: number;
  voices: Record<string, string>;
  default_voice?: string;
  mel_stats: [number, number];
  vocab: { symbols: string[]; add_blank?: boolean; mode?: string };
  synthesis?: { n_timesteps?: number; temperature?: number; length_scale?: Record<string, number>; style?: string; sentence_pause_s?: number };
  vocoder: { head: { n_fft: number; hop_length: number; padding?: 'center' | 'same' } };
  ids: { language: number; speakers: Record<string, number>; styles: Record<string, number> };
};
export type IndicManifest = { frame_multiple: number; max_tokens: number };

type OrtTensor = { data: Float32Array | BigInt64Array | Int32Array; dims: readonly number[] };
type OrtSession = { run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>> };
type OrtModule = {
  InferenceSession: { create(path: string, options?: unknown): Promise<OrtSession> };
  Tensor: new (type: 'float32' | 'int64', data: Float32Array | BigInt64Array, dims: readonly number[]) => unknown;
};

export type IndicModel = {
  dir: string;
  language: NormLanguage;
  config: IndicConfig;
  manifest: IndicManifest;
  tokenizer: Tokenizer;
  sampleRate: number;
  sessions: Record<'text_encoder' | 'flow_decoder' | 'vocoder', OrtSession>;
  ort: OrtModule;
};

const GRAPHS = ['text_encoder', 'flow_decoder', 'vocoder'] as const;
const PAUSE_LIKE: Record<string, string> = { ':': ',', ';': ',', '…': '.', '–': ',', '—': ',' };
const SENTENCE_END = /(?<=[।?!.])\s+/;
const MAX_CHUNK = 250;
const MIN_FRAMES = 2;

export async function loadIndicModel(dir: string): Promise<IndicModel> {
  const config = JSON.parse(await readFile(join(dir, 'config.json'), 'utf8')) as IndicConfig;
  const manifest = JSON.parse(await readFile(join(dir, 'onnx', 'onnx_manifest.json'), 'utf8')) as IndicManifest;
  let ort: OrtModule;
  try {
    ort = (await import('onnxruntime-node' as string)) as OrtModule;
  } catch (error) {
    throw new Error('Speaking with a local voice needs the onnxruntime-node package, which is not installed on this machine. Install it with "npm i onnxruntime-node", or choose the online voice in Settings.', { cause: error });
  }
  const sessions = {} as IndicModel['sessions'];
  for (const graph of GRAPHS) {
    sessions[graph] = await ort.InferenceSession.create(join(dir, 'onnx', `${graph}.onnx`), { graphOptimizationLevel: 'all', interOpNumThreads: 1 });
  }
  return {
    dir, config, manifest, ort, sessions,
    language: config.language as NormLanguage,
    tokenizer: new Tokenizer(config.vocab),
    sampleRate: config.sample_rate,
  };
}

/** The characters the model can read (script, spaces, punctuation); anything else becomes a pause, as in the model's own frontend. */
export function readableText(text: string, lang: NormLanguage, tokenizer: Tokenizer): { text: string; dropped: string[] } {
  const normalized = normalizeForChars(text, lang).text;
  const dropped = new Set<string>();
  let out = '';
  for (const ch of normalized) {
    if (tokenizer.knows(ch)) out += ch;
    else if (PAUSE_LIKE[ch] && tokenizer.knows(PAUSE_LIKE[ch]!)) out += PAUSE_LIKE[ch]!;
    else { dropped.add(ch); out += ' '; }
  }
  return { text: out.replace(/\s+/g, ' ').trim(), dropped: [...dropped] };
}

/** Sentences, split at dandas and stops, then at commas or spaces above 250 characters — the model's chunking. */
export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (const sentence of text.split(SENTENCE_END)) {
    let rest = sentence;
    while (rest.length > MAX_CHUNK) {
      let cut = rest.lastIndexOf(',', MAX_CHUNK - 1);
      cut = cut > 0 ? cut + 1 : rest.lastIndexOf(' ', MAX_CHUNK - 1);
      if (cut <= 0) cut = MAX_CHUNK;
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    chunks.push(rest.trim());
  }
  return chunks.filter(chunk => /\p{L}/u.test(chunk));
}

const f32 = Math.fround;

/** torch.linspace in float32 (the two-sided formula the model's export uses). */
function linspace(start: number, end: number, steps: number): Float32Array {
  if (steps === 1) return Float32Array.of(start);
  const out = new Float32Array(steps), step = f32((end - start) / (steps - 1)), half = Math.floor(steps / 2);
  for (let i = 0; i < steps; i++) out[i] = i < half ? f32(f32(start) + f32(step * i)) : f32(f32(end) - f32(step * (steps - 1 - i)));
  return out;
}

/** Seeded standard normals (Box–Muller), so the same line and voice sound the same on every render. */
function normalSource(seed: number): (length: number) => Float32Array {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return (length: number) => {
    const out = new Float32Array(length);
    for (let i = 0; i < length; i += 2) {
      const u = Math.max(random(), 1e-12), v = random();
      const radius = Math.sqrt(-2 * Math.log(u)), angle = 2 * Math.PI * v;
      out[i] = f32(radius * Math.cos(angle));
      if (i + 1 < length) out[i + 1] = f32(radius * Math.sin(angle));
    }
    return out;
  };
}

function seedFor(text: string, voice: string): number {
  let hash = 2166136261;
  for (const ch of `${voice}\n${text}`) { hash ^= ch.codePointAt(0)!; hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

type Word = { text: string; start: number; end: number };

export type IndicSpeech = { wav: Uint8Array; seconds: number; words: Word[]; text: string; dropped: string[] };

export type SpeakOptions = { voice?: string; speed?: number; seed?: number };

/** One line of speech as 16-bit 24 kHz mono WAV, with word timings in seconds. */
export async function synthesizeIndic(model: IndicModel, text: string, options: SpeakOptions = {}): Promise<IndicSpeech> {
  const { config, manifest, tokenizer } = model;
  const voices = config.voices ?? {};
  const asked = options.voice ?? '', lower = asked.toLowerCase();
  const voice = voices[asked] ? asked
    : /female|swara|neerja/i.test(lower) ? Object.keys(voices).find(name => /female/i.test(name))
    : /male|madhur|prabhat/i.test(lower) ? Object.keys(voices).find(name => /male/i.test(name))
    : config.default_voice ?? Object.keys(voices)[0];
  if (!voice) throw new Error('The model config names no voices');
  const speaker = voices[voice]!;
  const speakerRow = config.ids.speakers[speaker];
  if (speakerRow === undefined) throw new Error(`The model config has no speaker row for ${speaker}`);
  const style = config.ids.styles[config.synthesis?.style ?? 'read'] ?? 0;
  const timesteps = Math.max(1, Math.trunc(config.synthesis?.n_timesteps ?? 4));
  const temperature = f32(config.synthesis?.temperature ?? 0.667);
  const speed = Math.max(0.25, Math.min(4, options.speed ?? 1));
  const lengthScale = f32((config.synthesis?.length_scale?.[speaker] ?? 1) / speed);
  const pauseSeconds = config.synthesis?.sentence_pause_s ?? 0.15;
  const frameMultiple = manifest.frame_multiple || 2;
  const maxTokens = manifest.max_tokens || 2048;
  const melMean = f32(config.mel_stats[0]), melStd = f32(config.mel_stats[1]);
  const nFft = config.vocoder.head.n_fft, hop = config.vocoder.head.hop_length;
  const padding = config.vocoder.head.padding ?? 'same';
  const nextNoise = normalSource(options.seed ?? seedFor(text, voice));

  const { text: readable, dropped } = readableText(text, model.language, tokenizer);
  const chunks = chunkText(readable);
  if (!chunks.length) throw new Error('Nothing in that text is in the script this voice reads, so the on-device voice has nothing to say; English or other Latin text needs the edge speech engine');
  const pause = new Float32Array(Math.round(pauseSeconds * model.sampleRate));
  const pieces: Float32Array[] = [];
  const words: Word[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    const ids = tokenizer.encode(chunk);
    if (ids.length > maxTokens) throw new Error(`${ids.length} tokens is more than the model's limit of ${maxTokens}`);
    const tokens = BigInt64Array.from(ids.map(id => BigInt(id)));
    const enc = await model.sessions.text_encoder.run({
      tokens: new model.ort.Tensor('int64', tokens, [1, ids.length]),
      token_lengths: new model.ort.Tensor('int64', BigInt64Array.of(BigInt(ids.length)), [1]),
      language: new model.ort.Tensor('int64', BigInt64Array.of(BigInt(config.ids.language)), [1]),
      speaker: new model.ort.Tensor('int64', BigInt64Array.of(BigInt(speakerRow)), [1]),
      style: new model.ort.Tensor('int64', BigInt64Array.of(BigInt(style)), [1]),
    });
    const tokenOf = (charIndex: number) => (tokenizer.addBlank ? 2 * charIndex + 1 : charIndex);
    const muX = enc.mu_x!.data as Float32Array, logw = enc.logw!.data as Float32Array, cond = enc.cond!.data as Float32Array;
    const tokenCount = ids.length;
    const wCeil = new Float32Array(tokenCount);
    let total = 0;
    for (let i = 0; i < tokenCount; i++) {
      wCeil[i] = f32(Math.ceil(Math.exp(logw[i]!)) * lengthScale);
      total += wCeil[i]!;
    }
    const yLen = Math.max(Math.trunc(total), 1);
    if (yLen < MIN_FRAMES) continue;
    const yPad = Math.ceil(yLen / frameMultiple) * frameMultiple;
    const cum = new Float64Array(tokenCount); // the cumulative sum is float64 in the model too, so token boundaries agree
    let running = 0;
    for (let i = 0; i < tokenCount; i++) { running += wCeil[i]!; cum[i] = running; }

    const muY = new Float32Array(100 * yPad), mask = new Float32Array(yPad);
    for (let j = 0; j < yPad; j++) {
      let low = 0, high = tokenCount;
      while (low < high) { const mid = (low + high) >> 1; if (cum[mid]! <= j) low = mid + 1; else high = mid; }
      const tok = low, valid = tok < tokenCount && j < yLen;
      mask[j] = valid ? 1 : 0;
      if (!valid) continue;
      const at = Math.min(tok, tokenCount - 1);
      for (let c = 0; c < 100; c++) muY[c * yPad + j] = muX[c * tokenCount + at]!;
    }

    const span = linspace(0, 1, timesteps + 1);
    const initial = nextNoise(100 * yPad);
    let x = new Float32Array(100 * yPad);
    for (let i = 0; i < x.length; i++) x[i] = f32(initial[i]! * temperature);
    let t = span[0]!, dt = f32(span[1]! - t);
    for (let stepIndex = 1; stepIndex < span.length; stepIndex++) {
      const velocity = (await model.sessions.flow_decoder.run({
        x: new model.ort.Tensor('float32', x, [1, 100, yPad]),
        mask: new model.ort.Tensor('float32', mask, [1, 1, yPad]),
        mu: new model.ort.Tensor('float32', muY, [1, 100, yPad]),
        t: new model.ort.Tensor('float32', Float32Array.of(t), [1]),
        cond: new model.ort.Tensor('float32', cond, [1, 112]),
      })).v!.data as Float32Array;
      for (let i = 0; i < x.length; i++) x[i] = f32(x[i]! + dt * velocity[i]!);
      t = f32(t + dt);
      if (stepIndex < span.length - 1) dt = f32(span[stepIndex + 1]! - t);
    }

    const mel = new Float32Array(100 * yLen);
    for (let c = 0; c < 100; c++) for (let j = 0; j < yLen; j++) mel[c * yLen + j] = f32(x[c * yPad + j]! * melStd + melMean);
    const spec = await model.sessions.vocoder.run({ mel: new model.ort.Tensor('float32', mel, [1, 100, yLen]) });
    const audio = istft(spec.real!.data as Float32Array, spec.imag!.data as Float32Array, { frames: yLen, bins: spec.real!.dims[1] ?? 513, nFft, hop, padding });
    const chunkSeconds = audio.length / model.sampleRate;
    if (pieces.length) { pieces.push(pause); offset += pause.length / model.sampleRate; }
    const frameStart: number[] = new Array(tokenCount + 1).fill(0);
    for (let i = 0; i < tokenCount; i++) frameStart[i + 1] = frameStart[i]! + Math.round(wCeil[i]!);
    for (const match of chunk.matchAll(/\S+/g)) {
      const first = [...chunk.slice(0, match.index)].length, last = first + [...match[0]].length - 1;
      const start = Math.min((frameStart[tokenOf(first)] ?? 0) * hop / model.sampleRate, chunkSeconds);
      const end = Math.min(((frameStart[Math.min(tokenOf(last) + 1, tokenCount)] ?? frameStart[tokenCount]!) * hop) / model.sampleRate, chunkSeconds);
      words.push({ text: match[0], start: f32(offset + start), end: f32(offset + Math.max(start, end)) });
    }
    pieces.push(audio);
    offset += chunkSeconds;
  }

  const totalSamples = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const wav = encodeWav(pieces, model.sampleRate);
  return { wav, seconds: totalSamples / model.sampleRate, words, text, dropped };
}

/** 16-bit PCM WAV, the container the mixer and scene-by-scene voiceover read. */
export function encodeWav(pieces: Float32Array[], sampleRate: number): Uint8Array {
  const samples = pieces.reduce((sum, piece) => sum + piece.length, 0);
  const out = new Uint8Array(44 + samples * 2), view = new DataView(out.buffer);
  const tag = (at: number, text: string) => { for (let i = 0; i < 4; i++) out[at + i] = text.charCodeAt(i); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, samples * 2, true);
  let at = 44;
  for (const piece of pieces) for (const sample of piece) {
    const pcm = Math.max(-1, Math.min(1, sample));
    view.setInt16(at, Math.round(pcm < 0 ? pcm * 32768 : pcm * 32767), true);
    at += 2;
  }
  return out;
}
