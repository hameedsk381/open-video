// The provider surface the AI commands are written against.
// Groq is the provider for chat, speech synthesis and transcription (it has no image model). An offline MockProvider is included for tests and development.
// An offline MockProvider is included for offline tests and development.
import { extractJson } from './json';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };
export type ChatOptions = { json?: boolean; temperature?: number; maxTokens?: number; signal?: AbortSignal };
export type ImageOptions = { size?: string; signal?: AbortSignal };
export type ImageResult = { data: Uint8Array; extension: string };
export type SpeakOptions = { voice?: string; signal?: AbortSignal };
export type AudioResult = { data: Uint8Array; extension: string };
export type TranscriptWord = { text: string; start: number; end: number };
export type TranscriptCue = { text: string; start: number; end: number };
export type Transcript = { text: string; words: TranscriptWord[]; cues: TranscriptCue[] };

/** A video model: chat is required; image, speech and transcription are optional capabilities. */
export type AiProvider = {
  id: string;
  model: string;
  baseUrl: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  image?(prompt: string, options?: ImageOptions): Promise<ImageResult>;
  speak?(text: string, options?: SpeakOptions): Promise<AudioResult>;
  transcribe?(audio: Uint8Array, filename: string, options?: { language?: string; signal?: AbortSignal }): Promise<Transcript>;
};

export type ProviderId = 'anthropic' | 'claude' | 'groq' | 'nvidia' | 'nim' | 'mock';

export type ProviderConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  /** The model used for images, speech and transcription; chat uses `model`. */
  imageModel?: string;
  speechModel?: string;
  transcriptionModel?: string;
};

export const providerCapabilities = (provider: AiProvider) => ({
  chat: true,
  image: typeof provider.image === 'function',
  speech: typeof provider.speak === 'function',
  transcription: typeof provider.transcribe === 'function',
});

const trimSlash = (url: string) => url.replace(/\/+$/, '');
const numberFromPrompt = (prompt: string, name: string, fallback: number) => { const found = new RegExp(`${name}=(\\d+)`).exec(prompt); return found ? Number(found[1]) : fallback; };
export const requestTimeoutMs = 180_000;
/** Aborts when the caller's signal does or when the timeout passes, whichever comes first (a caller's signal does not remove the timeout). */
export const timeoutSignal = (signal?: AbortSignal | null, ms = requestTimeoutMs): AbortSignal => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);

/** The longest wait before a retry, whatever Retry-After or the error text asks for. */
export const maxRetryDelayMs = 30_000;
const sleep = (ms: number, signal?: AbortSignal | null) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason ?? new Error('aborted')); return; }
  const onAbort = () => { clearTimeout(timer); reject(signal!.reason ?? new Error('aborted')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function request(url: string, init: RequestInit, what: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`${what} failed: ${reason}`);
    }
    if (response.ok) return response;
    const body = await response.text().catch(() => '');
    // Rate limits and transient server errors are worth another go; keys, models and formats are not.
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 3) {
      const header = response.headers.get('retry-after');
      const fromHeader = header !== null && Number.isFinite(Number(header)) ? Number(header) * 1000 : undefined;
      const fromBody = Number(/try again in ([\d.]+)s/i.exec(body)?.[1]);
      const delay = fromHeader ?? (Number.isFinite(fromBody) ? fromBody * 1000 : 1000 * 2 ** (attempt - 1));
      await sleep(Math.min(maxRetryDelayMs, Math.max(0, delay)), init.signal).catch(error => { throw new Error(`${what} failed: ${error instanceof Error ? error.message : String(error)}`); });
      continue;
    }
    throw new Error(`${what} failed with HTTP ${response.status}: ${body.slice(0, 500).trim() || response.statusText}`);
  }
}

const jsonHeaders = (headers: Record<string, string>): Record<string, string> => ({ 'content-type': 'application/json', ...headers });

// Reads words and cues from verbose JSON. Word timings are the useful part; segments are the fallback.
export function transcriptFrom(data: any): Transcript {
  const words: TranscriptWord[] = (Array.isArray(data?.words) ? data.words : [])
    .map((word: any) => ({ text: String(word.word ?? word.text ?? '').trim(), start: Number(word.start), end: Number(word.end) }))
    .filter((word: TranscriptWord) => word.text && Number.isFinite(word.start) && Number.isFinite(word.end));
  const cues: TranscriptCue[] = (Array.isArray(data?.segments ?? data?.cues) ? (data.segments ?? data.cues) : [])
    .map((cue: any) => ({ text: String(cue.text ?? '').trim(), start: Number(cue.start), end: Number(cue.end) }))
    .filter((cue: TranscriptCue) => cue.text && Number.isFinite(cue.start) && Number.isFinite(cue.end));
  return { text: String(data?.text ?? '').trim(), words, cues };
}

/** Converts raw 16-bit mono/stereo PCM to a standard WAV container. */
export function pcmToWav(pcmData: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Uint8Array {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.byteLength;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);

  out[0] = 0x52; out[1] = 0x49; out[2] = 0x46; out[3] = 0x46; // RIFF
  view.setUint32(4, 36 + dataSize, true);
  out[8] = 0x57; out[9] = 0x41; out[10] = 0x56; out[11] = 0x45; // WAVE

  out[12] = 0x66; out[13] = 0x6d; out[14] = 0x74; out[15] = 0x20; // fmt 
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  out[36] = 0x64; out[37] = 0x61; out[38] = 0x74; out[39] = 0x61; // data
  view.setUint32(40, dataSize, true);
  out.set(pcmData, 44);

  return out;
}

export function splitSpeech(text: string, limit = 200): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const sentences = clean.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  const add = (piece: string) => {
    if (!current) { current = piece; return; }
    if (current.length + 1 + piece.length <= limit) current += ' ' + piece;
    else { flush(); current = piece; }
  };
  for (const sentence of sentences) {
    if (sentence.length <= limit) { add(sentence); continue; }
    flush();
    let rest = sentence;
    while (rest.length > limit) {
      const window = rest.slice(0, limit);
      let cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '));
      if (cut >= limit * 0.4) cut += 1;
      else cut = window.lastIndexOf(' ');
      if (cut <= 0) cut = limit;
      const piece = rest.slice(0, cut).trim();
      if (piece) chunks.push(piece);
      rest = rest.slice(cut).trim();
    }
    if (rest) add(rest);
  }
  flush();
  return chunks;
}

function wavPart(data: Uint8Array): { fmt: Uint8Array; audio: Uint8Array } {
  const tag = (at: number) => String.fromCharCode(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0, data[at + 3] ?? 0);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Speech audio was not a WAV file');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let fmt: Uint8Array | undefined, audio: Uint8Array | undefined, offset = 12;
  while (offset + 8 <= data.byteLength) {
    const declared = view.getUint32(offset + 4, true), start = offset + 8;
    const end = declared > data.byteLength - start ? data.byteLength : start + declared;
    if (tag(offset) === 'fmt ') fmt = data.slice(start, end);
    if (tag(offset) === 'data') { audio = data.slice(start, end); break; }
    if (start + declared > data.byteLength) break;
    offset = end + (declared % 2);
  }
  if (!fmt || !audio) throw new Error('Speech WAV is missing its fmt or data chunk');
  return { fmt, audio };
}

/** Joins WAV files that share one format (sample rate, channels, bit depth). */
export function concatWav(parts: Uint8Array[]): Uint8Array {
  if (!parts.length) throw new Error('There is no speech audio to join');
  const chunks = parts.map(wavPart);
  const fmt = chunks[0]!.fmt;
  for (const chunk of chunks) {
    if (chunk.fmt.byteLength !== fmt.byteLength || !chunk.fmt.every((byte, index) => byte === fmt[index]))
      throw new Error('Speech came back in different audio formats, so it cannot be joined into one file');
  }
  const audioLength = chunks.reduce((total, chunk) => total + chunk.audio.byteLength, 0);
  const fmtPad = fmt.byteLength % 2, audioPad = audioLength % 2;
  const size = 4 + 8 + fmt.byteLength + fmtPad + 8 + audioLength + audioPad;
  const out = new Uint8Array(8 + size);
  const view = new DataView(out.buffer);
  const write = (at: number, text: string) => { for (let index = 0; index < 4; index++) out[at + index] = text.charCodeAt(index); };
  write(0, 'RIFF'); view.setUint32(4, size, true); write(8, 'WAVE');
  let offset = 12;
  write(offset, 'fmt '); view.setUint32(offset + 4, fmt.byteLength, true); out.set(fmt, offset + 8);
  offset += 8 + fmt.byteLength + fmtPad;
  write(offset, 'data'); view.setUint32(offset + 4, audioLength, true); offset += 8;
  for (const chunk of chunks) { out.set(chunk.audio, offset); offset += chunk.audio.byteLength; }
  return out;
}

// Groq counts the input plus the requested completion length against the per-minute token limit (8000 on the free tier), so the
// completion is capped at what is left after the messages, within 1500..4096 tokens (about 3 characters of JSON per token).
const completionBudget = (messages: ChatMessage[]) => Math.max(1500, Math.min(4096, 7600 - Math.ceil(JSON.stringify(messages).length / 3)));

export class GroqProvider implements AiProvider {
  id = 'groq';
  model: string;
  baseUrl: string;
  apiKey: string;
  speechModel: string;
  transcriptionModel: string;

  constructor(config: ProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OVE_AI_API_KEY ?? process.env.GROQ_API_KEY ?? '';
    if (!this.apiKey) throw new Error('The groq provider needs an API key: set GROQ_API_KEY (or OVE_AI_API_KEY)');
    this.model = config.model ?? process.env.OVE_AI_MODEL ?? 'openai/gpt-oss-120b';
    this.baseUrl = trimSlash(config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1');
    this.speechModel = config.speechModel ?? process.env.OVE_AI_SPEECH_MODEL ?? 'canopylabs/orpheus-v1-english';
    this.transcriptionModel = config.transcriptionModel ?? process.env.OVE_AI_TRANSCRIPTION_MODEL ?? 'whisper-large-v3-turbo';
  }

  private headers() { return { authorization: `Bearer ${this.apiKey}` }; }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const body = (json: boolean) => JSON.stringify({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_completion_tokens: options.maxTokens ?? completionBudget(messages),
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });

    let response: Response;
    try {
      response = await request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: timeoutSignal(options.signal),
        headers: jsonHeaders(this.headers()),
        body: body(!!options.json),
      }, 'Groq chat');
    } catch (error) {
      if (!options.json || !/json_validate_failed/.test(String(error))) throw error;
      response = await request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: timeoutSignal(options.signal),
        headers: jsonHeaders(this.headers()),
        body: body(false),
      }, 'Groq chat');
    }
    const data: any = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Groq chat returned no text');
    return text;
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<AudioResult> {
    const chunks = splitSpeech(text, 200);
    if (!chunks.length) throw new Error('There is no text to speak');
    const voice = options.voice ?? process.env.OVE_AI_VOICE ?? (this.speechModel.includes('arabic') ? 'lulwa' : 'hannah');
    const parts: Uint8Array[] = [];
    for (const input of chunks) {
      const response = await request(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        signal: timeoutSignal(options.signal),
        headers: jsonHeaders(this.headers()),
        body: JSON.stringify({ model: this.speechModel, input, voice, response_format: 'wav' }),
      }, 'Groq speech');
      parts.push(new Uint8Array(await response.arrayBuffer()));
    }
    return { data: concatWav(parts), extension: 'wav' };
  }

  async transcribe(audio: Uint8Array, filename: string, options: { language?: string; signal?: AbortSignal } = {}): Promise<Transcript> {
    const form = new FormData();
    const bytes = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;
    form.append('file', new Blob([bytes], { type: 'application/octet-stream' }), filename);
    form.append('model', this.transcriptionModel);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    if (options.language) form.append('language', options.language);
    const response = await request(`${this.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      signal: timeoutSignal(options.signal),
      headers: this.headers(),
      body: form,
    }, 'Groq transcription');
    return transcriptFrom(await response.json());
  }
}

export class AnthropicProvider implements AiProvider {
  id = 'anthropic';
  model: string;
  baseUrl: string;
  apiKey: string;

  constructor(config: ProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OVE_AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (!this.apiKey) throw new Error('The anthropic provider needs an API key: set ANTHROPIC_API_KEY (or OVE_AI_API_KEY)');
    this.model = config.model ?? process.env.OVE_AI_MODEL ?? 'claude-sonnet-4-5';
    this.baseUrl = trimSlash(config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com');
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const turns = messages.filter(message => message.role !== 'system');
    const body = JSON.stringify({
      model: this.model,
      max_tokens: options.maxTokens ?? 16_384,
      temperature: options.temperature ?? 0.4,
      ...(system ? { system } : {}),
      messages: turns.length ? turns : [{ role: 'user', content: 'Reply with the JSON now.' }],
    });
    const response = await request(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      signal: timeoutSignal(options.signal),
      headers: jsonHeaders({ 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' }),
      body,
    }, 'Anthropic chat');
    const data: any = await response.json();
    const text = Array.isArray(data?.content) ? data.content.filter((block: any) => block?.type === 'text').map((block: any) => block.text).join('\n') : data?.content?.[0]?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Anthropic chat returned no text');
    return text;
  }
}

export class NvidiaProvider implements AiProvider {
  id = 'nvidia';
  model: string;
  baseUrl: string;
  apiKey: string;

  constructor(config: ProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OVE_AI_API_KEY ?? process.env.NVIDIA_API_KEY ?? '';
    if (!this.apiKey) throw new Error('The nvidia provider needs an API key: set NVIDIA_API_KEY (or OVE_AI_API_KEY)');
    this.model = config.model ?? process.env.OVE_AI_MODEL ?? 'nvidia/nemotron-3.5-bolt-e4b';
    this.baseUrl = trimSlash(config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1');
  }

  private headers() { return { authorization: `Bearer ${this.apiKey}` }; }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const body = (json: boolean) => JSON.stringify({
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.maxTokens ?? 4096,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    });

    let response: Response;
    try {
      response = await request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: timeoutSignal(options.signal),
        headers: jsonHeaders(this.headers()),
        body: body(!!options.json),
      }, 'NVIDIA chat');
    } catch (error) {
      if (!options.json) throw error;
      response = await request(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        signal: timeoutSignal(options.signal),
        headers: jsonHeaders(this.headers()),
        body: body(false),
      }, 'NVIDIA chat');
    }
    const data: any = await response.json();
    const message = data?.choices?.[0]?.message;
    const text = (typeof message?.content === 'string' && message.content.trim())
      ? message.content
      : (typeof message?.reasoning_content === 'string' && message.reasoning_content.trim())
        ? message.reasoning_content
        : '';
    if (!text) throw new Error('NVIDIA chat returned no text');
    return text;
  }
}

const attachGroqAudio = (provider: AiProvider, config: ProviderConfig): AiProvider => {
  if (provider.speak || provider.transcribe || !process.env.GROQ_API_KEY) return provider;
  try {
    const groq = new GroqProvider({ apiKey: process.env.GROQ_API_KEY, speechModel: config.speechModel, transcriptionModel: config.transcriptionModel, baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1' });
    provider.speak = groq.speak.bind(groq);
    provider.transcribe = groq.transcribe.bind(groq);
  } catch { /* Groq audio is optional when composing with Claude or NVIDIA */ }
  return provider;
};

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// An offline stand-in so the whole pipeline (compose, validate, write, render) can be exercised with no key and
// no network. It only speaks chat and images; speech and transcription are deliberately absent.
export class MockProvider implements AiProvider {
  id = 'mock';
  model = 'mock-1';
  baseUrl = 'mock://';
  async chat(messages: ChatMessage[]): Promise<string> {
    const prompt = messages.map(message => message.content).join('\n');
    if (prompt.includes('Here is an existing valid OVE composition JSON:')) {
      const match = /```json\s*([\s\S]*?)\s*```/.exec(prompt);
      if (match) {
        try {
          const comp = JSON.parse(match[1]);
          comp.name = (comp.name || 'Video') + ' (refined)';
          const textLayer = comp.scenes?.[0]?.layers?.find((l: any) => l.type === 'text');
          if (textLayer && typeof textLayer.content === 'string') {
            textLayer.content = textLayer.content + ' [refined]';
          }
          return JSON.stringify(comp);
        } catch { /* fallback to standard mock */ }
      }
    }
    if (/You plan motion-graphics videos/.test(prompt) || /Return the motion plan JSON now/.test(prompt)) {
      const duration = numberFromPrompt(prompt, 'DURATION_SECONDS', 20);
      const a = Math.max(2, Math.round(duration * 0.22)), b = Math.max(3, Math.round(duration * 0.46)), c = Math.max(2, duration - a - b);
      return JSON.stringify({
        idea: 'A designed motion-graphics piece, not a slide deck',
        look: { background: 'dark navy to indigo', ink: '#f5f7fb', muted: '#97a0b6', accent: '#22d3ee' },
        transition: 'push',
        beats: [
          { name: 'hook', takeaway: 'the subject', onScreen: 'Mock video', seconds: a, motion: 'kinetic title rise; glow drifts' },
          { name: 'point', takeaway: 'the idea', onScreen: 'Designed motion', seconds: b, motion: 'cards stagger; camera eases in' },
          { name: 'payoff', takeaway: 'remember this', onScreen: 'Hold the idea', seconds: c, motion: 'logo hold; slow zoom' },
        ],
      });
    }
    if (prompt.includes('You fill in ready-made video templates')) {
      // Picks the first template listed and writes sample text for each of its text variables, as a real model would.
      const first = /^- ([a-z0-9][a-z0-9-]*): [^\n]*\n((?:    - [^\n]*\n?)*)/m.exec(prompt);
      if (!first) return JSON.stringify({ template: 'none' });
      const values = Object.fromEntries([...first[2]!.matchAll(/^    - (\w+) \(string\)/gm)].filter(match => !/^(image|photo|picture)\d*$/i.test(match[1]!)).map(match => [match[1], 'Mock text']));
      return JSON.stringify({ template: first[1], values });
    }
    const number = (name: string, fallback: number) => numberFromPrompt(prompt, name, fallback);
    const width = number('WIDTH', 1080), height = number('HEIGHT', 1920), fps = number('FPS', 30), duration = number('DURATION_FRAMES', fps * 5);
    const fields = [...prompt.matchAll(/^- ([A-Za-z_]\w*): (string|number|boolean|color)(?:, e\.g\. (.+))?$/gm)]
      .map(match => ({ name: match[1]!, type: match[2]!, example: match[3] }));
    const fallback: Record<string, unknown> = { string: 'Example', number: 1, boolean: true, color: '#22d3ee' };
    const variables = Object.fromEntries(fields.map(field => [field.name, { type: field.type, default: field.example === undefined ? fallback[field.type] : JSON.parse(field.example) }]));
    const layers: any[] = [
      { id: 'glow', type: 'circle', x: width * 0.5, y: height * 0.35, width: Math.round(width * 0.9), fill: { type: 'radial', center: [0, 0], radius: Math.round(width * 0.45), stops: [{ offset: 0, color: 'rgba(34,211,238,0.22)' }, { offset: 1, color: 'rgba(34,211,238,0)' }] },
        animations: [{ property: 'y', keyframes: [{ frame: 0, value: height * 0.35 }, { frame: duration, value: height * 0.38, easing: 'drift' }] }] },
      { id: 'title', type: 'text', content: fields.length ? fields.map(field => `{{${field.name}}}`).join(' · ') : 'Mock video', x: width / 2, y: height * 0.4, fontFamily: 'Inter', fontSize: Math.round(width * 0.09), fontWeight: 800, color: '#f5f7fb', textAlign: 'center', maxWidth: width * 0.85, letterSpacing: -2, split: { by: 'words', stagger: 4, preset: 'rise' },
        animations: [{ property: 'opacity', keyframes: [{ frame: 0, value: 0 }, { frame: 18, value: 1, easing: 'land' }] }] },
      { id: 'sub', type: 'text', content: 'Set GROQ_API_KEY for real output.', x: width / 2, y: height * 0.74, fontFamily: 'Inter', fontSize: Math.round(width * 0.03), color: '#97a0b6', textAlign: 'center', maxWidth: width * 0.8 },
    ];
    const camera = (frames: number) => ({ x: width / 2, y: height / 2, zoom: 1, animations: [{ property: 'zoom', keyframes: [{ frame: 0, value: 1 }, { frame: frames, value: 1.06, easing: 'drift' }] }] });
    const glow = layers[0], title = { ...layers[1], split: { by: 'words', stagger: 4, preset: 'rise' } }, sub = layers[2];
    const long = duration >= fps * 8;
    const scene = (id: string, name: string, start: number, frames: number, extra: any[] = []) => ({ id, name, startFrame: start, durationFrames: frames, camera: camera(frames), layers: [glow, { ...title, y: height * 0.36 }, { ...sub, y: height * 0.74 }, ...extra] });
    const scenes = long
      ? (() => { const a = Math.round(duration * 0.22), b = Math.round(duration * 0.46), c = duration - a - b; return [scene('hook', 'Hook', 0, a), scene('point', 'Point', a, b), scene('payoff', 'Payoff', a + b, c)]; })()
      : [scene('main', 'Main', 0, duration)];
    return JSON.stringify({ version: '1.0', id: 'mock-video', name: 'Mock video', width, height, fps, durationFrames: duration, grain: 0.03, motionBlur: { samples: 8, shutter: 180 }, variables,
      background: { type: 'linear', from: [0, 0], to: [width, height], stops: [{ offset: 0, color: '#0b1020' }, { offset: 1, color: '#1e1b4b' }] },
      scenes });
  }
  async image(): Promise<ImageResult> { return { data: onePixelPng, extension: 'png' }; }
}

export function createProvider(config: ProviderConfig = {}): AiProvider {
  const id = (config.provider || process.env.OVE_AI_PROVIDER || (process.env.NVIDIA_API_KEY ? 'nvidia' : process.env.GROQ_API_KEY ? 'groq' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : '')).toLowerCase();
  switch (id) {
    case 'nvidia':
    case 'nim': return attachGroqAudio(new NvidiaProvider(config), config);
    case 'anthropic':
    case 'claude': return attachGroqAudio(new AnthropicProvider(config), config);
    case 'groq': return new GroqProvider(config);
    case 'mock': return new MockProvider();
    case '': throw new Error('No AI provider chosen: pass --provider nvidia|groq|anthropic|mock, or set NVIDIA_API_KEY, GROQ_API_KEY or ANTHROPIC_API_KEY');
    default: throw new Error(`Unknown AI provider "${id}"; use nvidia, groq, anthropic or mock`);
  }
}

export function describeProvider(provider: AiProvider): string {
  const capabilities = providerCapabilities(provider);
  return `${provider.id} (${provider.model}) at ${provider.baseUrl} — ${Object.entries(capabilities).filter(([, on]) => on).map(([name]) => name).join(', ')}`;
}
