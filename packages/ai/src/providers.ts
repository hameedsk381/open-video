// The provider surface the AI commands are written against. There is exactly ONE network integration layer: the
// Vercel AI SDK (generateText / generateImage / transcribe) with per-vendor drivers — OpenAI, Anthropic, Google,
// Groq, and any OpenAI-compatible gateway (FreeLLMAPI, NVIDIA NIM, LiteLLM, OpenRouter, vLLM) all ride the same
// code path, so retries, timeouts and message shaping are the SDK's problem, not ours. What survives here is
// policy, not plumbing: the FreeLLMAPI task-aware model routing probed live against that gateway. Speech is pluggable —
// the free Edge TTS engine by default (attachEdgeAudio), or the provider's own endpoint with OVE_AI_TTS_PROVIDER=native.
// An offline MockProvider covers tests and development with no key and no network.
import { attachEdgeAudio } from './edge-tts';
import { attachIndicAudio } from './indic-tts/engine';
import { generateImage, generateText, experimental_transcribe, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string | any[] };
/** `direct` is the creative stages (planner, direction): few calls, and the ones whose taste decides how the video looks. */
export type ChatTask = 'compose' | 'direct' | 'template' | 'heal' | 'brand' | 'batch' | 'vision' | 'fast';
export type ChatOptions = {
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  task?: ChatTask;
  model?: string;
  /** How many times the SDK retries a failed request (default 2). Rotation sets 0 so a spent model is left at once. */
  maxRetries?: number;
};
export type ImageOptions = { size?: string; signal?: AbortSignal };
export type ImageResult = { data: Uint8Array; extension: string };
export type SpeakOptions = { voice?: string; language?: string; speed?: number; seed?: number; signal?: AbortSignal };
export type AudioResult = { data: Uint8Array; extension: string };

/**
 * The engine that turns a script into voice.
 * `edge` is the reverse-engineered Microsoft Edge endpoint: free, needs no key, and returns word boundaries with the
 * audio. `native` calls the speech endpoint of the provider you already pay, so narration follows your provider rather
 * than a third party that can change the protocol without notice — captions then come from transcribing the result.
 * `indic` runs the released indic-tiny-tts models in this process: no key, no network after the model is downloaded,
 * Hindi/Bengali/Tamil and eight more languages, and word timings that need no transcription.
 */
export type SpeechEngine = 'edge' | 'native' | 'indic';

/** `OVE_AI_TTS_PROVIDER` (or the SDK's `speechEngine`) picks the engine; `groq` and `openai` are aliases for `native`, `local` and `offline` for `indic`. */
export function resolveSpeechEngine(config?: ProviderConfig): SpeechEngine {
  const raw = (config?.speechEngine ?? process.env.OVE_AI_TTS_PROVIDER ?? '').trim().toLowerCase();
  if (raw === 'indic' || raw === 'local' || raw === 'offline') return 'indic';
  return raw === 'native' || raw === 'groq' || raw === 'openai' ? 'native' : 'edge';
}
export type TranscriptWord = { text: string; start: number; end: number };
export type TranscriptCue = { text: string; start: number; end: number };
export type Transcript = { text: string; words: TranscriptWord[]; cues: TranscriptCue[] };

/** A video model: chat is required; image, speech and transcription are optional capabilities. */
export type AiProvider = {
  id: string;
  model: string;
  baseUrl: string;
  /** The credential this provider sends with each request, when one is needed: present to check, never to display. */
  apiKey?: string;
  /** Which engine `speak` was wired to; set by `createProvider`. */
  speechEngine?: SpeechEngine;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  image?(prompt: string, options?: ImageOptions): Promise<ImageResult>;
  speak?(text: string, options?: SpeakOptions): Promise<AudioResult>;
  transcribe?(audio: Uint8Array, filename: string, options?: { language?: string; signal?: AbortSignal }): Promise<Transcript>;
};

export type ProviderId = 'anthropic' | 'claude' | 'groq' | 'nvidia' | 'nim' | 'freellmapi' | 'openai' | 'google' | 'gemini' | 'openrouter' | 'litellm' | 'vercel' | 'custom' | 'mock';

export type ProviderConfig = {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  /** The model used for images and transcription; chat uses `model`. */
  imageModel?: string;
  transcriptionModel?: string;
  /** Speech model for the `native` engine; defaults per provider. */
  speechModel?: string;
  /** Which engine speaks the narration. Defaults to `edge`, which needs no key. */
  speechEngine?: SpeechEngine;
};

export const providerCapabilities = (provider: AiProvider) => ({
  chat: true,
  image: typeof provider.image === 'function',
  speech: typeof provider.speak === 'function',
  transcription: typeof provider.transcribe === 'function',
});

/**
 * Whether this provider's chat model accepts image content. A provider can chat without seeing: Groq's default model is
 * text-only and refuses any message whose content is an array, which is exactly what an image message is.
 */
export function providerVision(provider: AiProvider): boolean {
  if (provider.id === 'mock') return true;
  // The gateway routes by task and its vision preferences are image models, so image content is safe to send.
  if (provider.id === 'freellmapi') return true;
  if (provider.id === 'anthropic' || provider.id === 'claude' || provider.id === 'google' || provider.id === 'gemini') return true;
  if (provider.id === 'openai') return /gpt-4|gpt-5|o1|o3|o4/i.test(provider.model);
  if (provider.id === 'groq') return /vision|-vl|llama-4|maverick|scout/i.test(provider.model);
  if (provider.id === 'nvidia' || provider.id === 'nim') return /vision|-vl|llava|vila|pixstral/i.test(provider.model);
  // A provider this file does not know (a caller's fake, a private gateway) is tried with images: only the vendors whose
  // text-only models were actually seen rejecting image content are refused here.
  return true;
}

/**
 * A provider that can look at rendered frames: the caller's own when its model sees images, otherwise the operator's
 * vision-capable gateway. Undefined means no configured model can see, so the caller skips the pass and says so.
 */
export function visionProvider(provider: AiProvider): AiProvider | undefined {
  if (providerVision(provider)) return provider;
  const gatewayKey = process.env.FREELLMAPI_API_KEY || process.env.FREELLMAPI_KEY;
  if (!gatewayKey || provider.id === 'freellmapi') return undefined;
  return createProvider({ provider: 'freellmapi', model: 'auto' });
}

const trimSlash = (url: string) => url.replace(/\/+$/, '');
const numberFromPrompt = (prompt: string, name: string, fallback: number) => { const found = new RegExp(`${name}=(\\d+)`).exec(prompt); return found ? Number(found[1]) : fallback; };
export const requestTimeoutMs = 180_000;
/** The operator's OpenAI-compatible gateway, used when no base URL is configured. */
export const FREELLMAPI_DEFAULT_BASE_URL = 'https://ai.hamathopc.in/v1';
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

export const TASK_MODEL_PREFERENCES: Record<ChatTask, string[]> = {
  // Preference orders are live-probed against the FreeLLMAPI gateway: qwen3.8-27b delivers the lowest
  // latency (161ms TTFT, 185 tok/s, 199ms JSON task) and highest stability. gpt-oss-120b (stalls 40+ s, 502/429 errors),
  // nemotron (9.7 tok/s), broken stream endpoints (gemini/glm/kilo), and slow routers (free-router 2.6 tok/s) are dropped;
  // 'auto' is the proven fallback.
  compose: ['qwen3.8-27b', 'auto'],
  direct: ['qwen3.8-27b', 'auto'],
  template: ['qwen3.8-27b', 'mistral-small-3.2-24b', 'auto'],
  heal: ['qwen3.8-27b', 'auto'],
  vision: ['llama-3.2-90b-vision', 'qwen2.5-vl-72b', 'llama-3.2-11b-vision-instruct', 'auto'],
  brand: ['qwen3.8-27b', 'auto'],
  batch: ['qwen3.8-27b', 'auto'],
  fast: ['qwen3.8-27b', 'auto', 'mistral-small-3.2-24b'],
};

let cachedFreeLlmModels: { models: Set<string>; expiresAt: number } | undefined;

/** Drops the cached gateway model list (tests, and long-lived processes after the gateway's catalogue changes). */
export function clearFreeLlmModelCache(): void {
  cachedFreeLlmModels = undefined;
}

export async function getAvailableFreeLlmModels(baseUrl: string, headers: Record<string, string>, signal?: AbortSignal): Promise<Set<string>> {
  const now = Date.now();
  if (cachedFreeLlmModels && cachedFreeLlmModels.expiresAt > now) {
    return cachedFreeLlmModels.models;
  }
  try {
    const res = await request(`${baseUrl}/models`, { method: 'GET', signal, headers: jsonHeaders(headers) }, 'FreeLLMAPI models');
    const data: any = await res.json();
    const available = new Set<string>();
    if (Array.isArray(data?.data)) {
      for (const m of data.data) {
        if (m.available !== false && typeof m.id === 'string') {
          available.add(m.id.toLowerCase());
        }
      }
    }
    cachedFreeLlmModels = { models: available, expiresAt: now + 10 * 60 * 1000 };
    return available;
  } catch {
    return new Set<string>(['auto']);
  }
}

export function inferChatTask(messages: ChatMessage[], options?: ChatOptions): ChatTask {
  if (options?.task) return options.task;
  const hasImage = messages.some(m => Array.isArray(m.content) && m.content.some((c: any) => c.type === 'image_url'));
  if (hasImage) return 'vision';

  const fullText = messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  if (/design review found these issues|visual review|fix ONLY these design problems|repair message/i.test(fullText)) {
    return 'heal';
  }
  if (/fill in ready-made video templates|fill a template|candidates\.find/i.test(fullText)) {
    return 'template';
  }
  if (/production planner|Decide how the brief|planBuild|plan motion-graphics|Plan a .*motion-graphics video/i.test(fullText)) {
    return 'fast';
  }
  if (/Extract a clean BrandPack|Brand Identity & Design System|brand pack|brand-scraper/i.test(fullText)) {
    return 'brand';
  }
  if (/planBatch|batch file/i.test(fullText)) {
    return 'batch';
  }
  return 'compose';
}

/**
 * `OVE_AI_MODEL_<TASK>` (OVE_AI_MODEL_DIRECT, OVE_AI_MODEL_VISION, OVE_AI_MODEL_COMPOSE…) sends one kind of call to its own
 * model on any provider, so the stages that decide how a video looks can run on a stronger model than the bulk work.
 * An explicit `options.model` still wins, and nothing is inferred when no such variable is set.
 */
function taskModelOverride(messages: ChatMessage[], options: ChatOptions): string | undefined {
  if (!Object.keys(process.env).some(key => key.startsWith('OVE_AI_MODEL_'))) return undefined;
  return process.env[`OVE_AI_MODEL_${inferChatTask(messages, options).toUpperCase()}`]?.trim() || undefined;
}

/** The most output a single call may be asked for when a reply keeps running out of room. */
const maxOutputCeiling = 32_768;

const extensionFromMediaType = (mediaType: string) => mediaType.split('/')[1]?.split(';')[0] ?? 'png';

/**
 * The one network integration: every vendor rides the Vercel AI SDK. `driver` picks the SDK provider factory;
 * anything OpenAI-compatible (FreeLLMAPI, NVIDIA NIM, LiteLLM, OpenRouter, a self-hosted vLLM) uses the openai
 * driver pointed at its base URL. The FreeLLMAPI task-aware routing is policy layered on top: when the model is
 * `auto`, each task picks its preferred model from the gateway's live model list, and any failure falls back to
 * the gateway's own `auto` router.
 */
export class VercelAiProvider implements AiProvider {
  id: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  driver: 'openai' | 'anthropic' | 'google' | 'groq';
  imageModel: string;
  transcriptionModel: string;
  speechModel: string;
  speechEngine: SpeechEngine;

  constructor(config: ProviderConfig = {}) {
    const rawId = (config.provider || process.env.OVE_AI_PROVIDER || defaultProviderId()).toLowerCase();
    this.id = rawId;

    if (rawId === 'anthropic' || rawId === 'claude') {
      this.driver = 'anthropic';
      this.apiKey = config.apiKey || process.env.OVE_AI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
      this.model = config.model || process.env.OVE_AI_MODEL || 'claude-3-7-sonnet-20250219';
      this.baseUrl = trimSlash((config.baseUrl ?? process.env.OVE_AI_BASE_URL) || 'https://api.anthropic.com/v1');
    } else if (rawId === 'google' || rawId === 'gemini') {
      this.driver = 'google';
      this.apiKey = config.apiKey || process.env.OVE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || '';
      this.model = config.model || process.env.OVE_AI_MODEL || 'gemini-2.0-flash';
      this.baseUrl = trimSlash(config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? '');
    } else if (rawId === 'groq') {
      this.driver = 'groq';
      this.apiKey = config.apiKey || process.env.OVE_AI_API_KEY || process.env.GROQ_API_KEY || '';
      this.model = config.model || process.env.OVE_AI_MODEL || 'openai/gpt-oss-120b';
      this.baseUrl = trimSlash((config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? process.env.GROQ_BASE_URL) || 'https://api.groq.com/openai/v1');
    } else if (rawId === 'nvidia' || rawId === 'nim') {
      this.driver = 'openai';
      this.apiKey = config.apiKey || process.env.OVE_AI_API_KEY || process.env.NVIDIA_API_KEY || '';
      this.model = config.model || process.env.OVE_AI_MODEL || 'nvidia/nemotron-3.5-bolt-e4b';
      this.baseUrl = trimSlash((config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? process.env.NVIDIA_BASE_URL) || 'https://integrate.api.nvidia.com/v1');
    } else if (rawId === 'freellmapi') {
      this.driver = 'openai';
      // No shipped fallback: the gateway key is a secret, so it comes from the operator's environment only.
      this.apiKey = config.apiKey || process.env.FREELLMAPI_API_KEY || process.env.FREELLMAPI_KEY || process.env.OPENAI_API_KEY || process.env.OVE_AI_API_KEY || '';
      this.model = config.model || process.env.FREELLMAPI_MODEL || process.env.OVE_AI_MODEL || 'auto';
      this.baseUrl = trimSlash((config.baseUrl ?? process.env.FREELLMAPI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? process.env.OVE_AI_BASE_URL) || FREELLMAPI_DEFAULT_BASE_URL);
    } else {
      // openai, openrouter, litellm, vercel, custom, or any OpenAI-compatible gateway
      this.driver = 'openai';
      this.apiKey = config.apiKey || process.env.OVE_AI_API_KEY || process.env.OPENAI_API_KEY || '';
      this.baseUrl = trimSlash(config.baseUrl ?? process.env.OVE_AI_BASE_URL ?? '');
      if (rawId === 'openrouter') {
        this.apiKey = this.apiKey || process.env.OPENROUTER_API_KEY || '';
        this.baseUrl = this.baseUrl || 'https://openrouter.ai/api/v1';
        this.model = config.model || process.env.OVE_AI_MODEL || 'anthropic/claude-3.7-sonnet';
      } else if (rawId === 'litellm') {
        this.baseUrl = this.baseUrl || process.env.LITELLM_BASE_URL || 'http://localhost:4000/v1';
        this.model = config.model || process.env.OVE_AI_MODEL || 'claude-3-7-sonnet';
      } else {
        this.model = config.model || process.env.OVE_AI_MODEL || 'gpt-4o';
        if (!this.baseUrl) this.baseUrl = 'https://api.openai.com/v1';
      }
    }
    this.imageModel = config.imageModel || process.env.OVE_AI_IMAGE_MODEL || (this.id === 'freellmapi' ? 'auto' : 'gpt-image-1');
    this.transcriptionModel = config.transcriptionModel || process.env.OVE_AI_TRANSCRIPTION_MODEL
      || (this.id === 'groq' ? 'whisper-large-v3-turbo' : this.id === 'freellmapi' ? 'auto' : 'whisper-1');
    // The gateway routes speech like everything else: `auto` asks it to pick the model, a provider id names one.
    this.speechModel = config.speechModel || process.env.OVE_AI_SPEECH_MODEL
      || (this.id === 'freellmapi' ? 'auto' : this.driver === 'groq' ? 'canopylabs/orpheus-v1-english' : 'gpt-4o-mini-tts');
    this.speechEngine = resolveSpeechEngine(config);
  }

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
  }

  /** An OpenAI-compatible client against this provider's base URL — for transcription and image endpoints. */
  private openaiCompatible() {
    return createOpenAI({ apiKey: this.apiKey || 'dummy-key', baseURL: this.baseUrl });
  }

  private resolveModelInstance(model: string) {
    switch (this.driver) {
      case 'anthropic': {
        const anthropic = createAnthropic({ apiKey: this.apiKey, baseURL: this.baseUrl });
        return anthropic(model);
      }
      case 'google': {
        const google = createGoogleGenerativeAI({ apiKey: this.apiKey, baseURL: this.baseUrl || undefined });
        return google(model);
      }
      case 'groq': {
        const groq = createGroq({ apiKey: this.apiKey, baseURL: this.baseUrl });
        return groq(model);
      }
      case 'openai':
      default: {
        const openai = this.openaiCompatible();
        return openai.chat(model);
      }
    }
  }

  /**
   * Picks the model for one call. An explicit model always wins; a configured model (anything but `auto`/`smart`)
   * is next; on the FreeLLMAPI gateway the task's preferred models are checked against the live model list, and
   * `auto` — the gateway's own router — is the floor.
   */
  async resolveModel(task: ChatTask, explicitModel?: string, signal?: AbortSignal): Promise<string> {
    if (explicitModel) return explicitModel;
    if (this.model && this.model !== 'auto' && this.model !== 'smart') return this.model;
    const available = await getAvailableFreeLlmModels(this.baseUrl, this.authHeaders(), signal);
    for (const candidate of TASK_MODEL_PREFERENCES[task] ?? ['auto']) {
      if (candidate === 'auto' || available.has(candidate.toLowerCase())) return candidate;
    }
    return 'auto';
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<string> {
    const chosen = options.model ?? taskModelOverride(messages, options);
    if (this.id === 'freellmapi') {
      const task = inferChatTask(messages, options);
      const selected = await this.resolveModel(task, chosen, options.signal);
      try {
        return await this.complete(selected, messages, options);
      } catch (error) {
        if (selected === 'auto') throw error;
        // A specific model failing is not the video's problem: the gateway's own router is the safety net.
        return await this.complete('auto', messages, options);
      }
    }
    return this.complete(chosen ?? this.model, messages, options);
  }

  private async complete(model: string, messages: ChatMessage[], options: ChatOptions): Promise<string> {
    const system = messages.filter(m => m.role === 'system').map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n\n');
    const turns = messages.filter(m => m.role !== 'system');

    const coreMessages: ModelMessage[] = turns.map(m => {
      if (m.role === 'assistant') {
        return {
          role: 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        };
      }
      if (typeof m.content === 'string') {
        return { role: 'user', content: m.content };
      }
      if (Array.isArray(m.content)) {
        const parts: any[] = m.content.map((p: any) => {
          if (p.type === 'text') return { type: 'text', text: p.text || '' };
          if (p.type === 'image_url') {
            const url = p.image_url?.url || p.image_url;
            return { type: 'image', image: url };
          }
          return { type: 'text', text: JSON.stringify(p) };
        });
        return { role: 'user', content: parts };
      }
      return { role: 'user', content: String(m.content) };
    });

    if (coreMessages.length === 0) {
      coreMessages.push({ role: 'user', content: 'Generate the JSON now.' });
    }

    const run = (maxOutputTokens: number) => generateText({
      model: this.resolveModelInstance(model),
      system: system || undefined,
      messages: coreMessages,
      temperature: options.temperature ?? 0.4,
      maxOutputTokens,
      abortSignal: timeoutSignal(options.signal),
      maxRetries: options.maxRetries ?? 2,
    });
    // A reply cut off by the output limit is never usable JSON. Models that reason before they answer spend part of the limit
    // thinking, so a cap that suits a plain model truncates them mid-answer: most of this pipeline's failures on one model were
    // exactly that. When the model reports it ran out of room, ask again with twice as much, up to a ceiling.
    const fromEnv = Number(process.env.OVE_AI_MAX_TOKENS);
    let budget = options.maxTokens ?? (fromEnv > 0 ? fromEnv : this.driver === 'anthropic' ? 16_384 : 8192);
    // Some providers count the room asked for against a per-minute allowance ("Limit 8000, Requested 10333"): the prompt plus the
    // output reserved for the answer. When one says so, the prompt's own size is Requested minus what was reserved, and the answer
    // is given what is left; if that is too little to answer in, the error says what the prompt alone weighs.
    const call = async (wanted: number) => {
      try { return { result: await run(wanted), used: wanted }; }
      catch (error) {
        const found = /Limit (\d+), Requested (\d+)/.exec(String((error as Error)?.message ?? ''));
        if (!found) throw error;
        const prompt = Number(found[2]) - wanted, room = Math.floor((Number(found[1]) - prompt) * 0.95);
        if (room < 1000) throw new Error(`${String((error as Error).message).split('\n')[0]} The prompt alone is about ${prompt} tokens, which leaves too little room to answer: send less, or use a plan with a higher limit.`);
        if (room >= wanted) throw error;
        return { result: await run(room), used: room };
      }
    };
    let { result, used } = await call(budget);
    const capped = used < budget;                                // the provider named a limit: asking for more would be refused again
    for (let retry = 1; result.finishReason === 'length' && !capped && retry <= 2 && used < maxOutputCeiling; retry++) {
      const next = Math.min(used * 2, maxOutputCeiling);
      let again;
      try { again = await call(next); } catch { break; }       // a limit that will not stretch: hand back what there is
      ({ result, used } = again);
      if (used < next) break;                                  // capped by that limit: asking again would change nothing
    }

    const text = result.text.trim();
    if (!text) throw new Error(`${this.id} via Vercel AI SDK returned no text`);
    return text;
  }

  /** Image generation through the SDK's image model; OpenAI-compatible gateways only (Groq and NIM have none here). */
  get image(): ((prompt: string, options?: ImageOptions) => Promise<ImageResult>) | undefined {
    if (this.driver !== 'openai' || this.id === 'groq' || this.id === 'nvidia' || this.id === 'nim') return undefined;
    return async (prompt: string, options: ImageOptions = {}) => {
      const result = await generateImage({
        model: this.openaiCompatible().image(this.imageModel as Parameters<ReturnType<typeof createOpenAI>['image']>[0]),
        prompt,
        size: (options.size ?? '1024x1024') as `${number}x${number}`,
        abortSignal: timeoutSignal(options.signal),
        maxRetries: 2,
      });
      return { data: result.image.uint8Array, extension: extensionFromMediaType(result.image.mediaType) };
    };
  }

  /** Transcription through the SDK's transcription model on the OpenAI-compatible endpoint (Groq, gateways, OpenAI).
   *  `responseFormat: 'verbose_json'` is forced via providerOptions because the SDK only requests it for models in
   *  its own catalogue — gateway model ids like `auto` or `whisper-large-v3-turbo` would otherwise come back bare. */
  async transcribe(audio: Uint8Array, _filename: string, options: { language?: string; signal?: AbortSignal } = {}): Promise<Transcript> {
    if (this.driver === 'anthropic' || this.driver === 'google') return { text: '', words: [], cues: [] };
    const result: any = await experimental_transcribe({
      model: this.openaiCompatible().transcription(this.transcriptionModel as Parameters<ReturnType<typeof createOpenAI>['transcription']>[0]),
      audio,
      abortSignal: timeoutSignal(options.signal),
      maxRetries: 2,
      timestampGranularities: ['word', 'segment'],
      providerOptions: {
        openai: { responseFormat: 'verbose_json', ...(options.language ? { language: options.language } : {}) },
      },
    });
    // The SDK renames the timings (startSecond/endSecond); transcriptFrom speaks the wire shape (start/end).
    const seconds = (value: any, fallback: any) => Number(value ?? fallback);
    return transcriptFrom({
      text: result.text,
      words: (result.words ?? []).map((word: any) => ({ text: String(word.text ?? word.word ?? ''), start: seconds(word.start, word.startSecond), end: seconds(word.end, word.endSecond) })),
      segments: (result.segments ?? []).map((segment: any) => ({ text: String(segment.text ?? ''), start: seconds(segment.start, segment.startSecond), end: seconds(segment.end, segment.endSecond) })),
    });
  }

  /** A provider's speech endpoint names voices its own way, so an Edge `…Neural` id is dropped for the engine's own default. */
  private nativeVoice(voice?: string): string | undefined {
    const raw = (voice ?? process.env.OVE_AI_SPEECH_VOICE ?? '').trim();
    if (!raw || /^[a-z]{2}(-[A-Za-z]{2,4})?-[A-Za-z]+Neural$/i.test(raw)) return this.driver === 'groq' ? undefined : 'nova';
    return raw;
  }

  /**
   * Speech from the provider's own endpoint (`/audio/speech`) instead of Edge TTS — the `native` engine. WAV because
   * scene-by-scene voiceover joins the pieces, and word timings come from `transcribe` rather than the speech call.
   */
  async speak(text: string, options: SpeakOptions = {}): Promise<AudioResult> {
    if (this.driver === 'anthropic' || this.driver === 'google') {
      throw new Error(`The ${this.id} provider has no speech endpoint; narrate with the edge engine (unset OVE_AI_TTS_PROVIDER)`);
    }
    const voice = this.nativeVoice(options.voice);
    const body = JSON.stringify({ model: this.speechModel, input: text, response_format: 'wav', ...(voice ? { voice } : {}) });
    const response = await request(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      signal: timeoutSignal(options.signal),
      headers: jsonHeaders(this.authHeaders()),
      body,
    }, 'Speech');
    const data = new Uint8Array(await response.arrayBuffer());
    if (!data.byteLength) throw new Error(`Speech came back empty from ${this.baseUrl}/audio/speech`);
    return { data, extension: 'wav' };
  }
}

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// An offline stand-in so the whole pipeline (compose, validate, write, render) can be exercised with no key and
// no network. It only speaks chat and images; speech and transcription are deliberately absent.
export class MockProvider implements AiProvider {
  id = 'mock';
  model = 'mock-1';
  baseUrl = 'mock://';
  async chat(messages: ChatMessage[]): Promise<string> {
    const prompt = messages.map(message => message.content).join('\n');
    if (prompt.includes('Here is an existing valid MotionRender composition JSON:') || prompt.includes('Here is an existing valid OVE composition JSON:')) {
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
    if (prompt.includes('You find public sources for short videos')) return JSON.stringify({ urls: [] });
    if (prompt.includes('You are the creative director for this video.')) {
      // The mock cannot judge a brief, so it returns a plain, honest direction rather than imitating a house style.
      const seconds = Math.max(2, Number(/at \d+ fps, (\d+) s\./.exec(prompt)?.[1] ?? 6));
      const a = Math.round(seconds * 0.3 * 10) / 10, b = Math.round(seconds * 0.45 * 10) / 10;
      return JSON.stringify({
        concept: 'A deliberately plain motion piece that lets the frame do the talking',
        art: 'Flat graphic field, one strong colour, generous negative space, a single moving element at a time',
        type: { display: 'Space Grotesk', body: 'Inter', treatment: 'Large display lines set tight; body copy small and quiet' },
        palette: { bg: '#0b1020', text: '#f5f7fb', accent: '#22d3ee', accent2: '#a78bfa' },
        motion: 'Word-by-word rise, one slow lateral drift, cuts on the beat',
        sound: 'silent',
        structure: [
          { name: 'Hook', seconds: a, idea: 'A single line of type lands in an empty field' },
          { name: 'Turn', seconds: b, idea: 'The line breaks apart and reassembles around a figure' },
          { name: 'Hold', seconds: Math.max(1, Math.round((seconds - a - b) * 10) / 10), idea: 'Everything settles and holds' },
        ],
        avoid: ['glass cards', 'bento grids', 'neon glow'],
      });
    }
    if (prompt.includes('You are the script editor for a')) {
      // The mock cannot read pages or quote evidence, so it writes a plain script with no claims to ground.
      const found = /Target length: (\d+) seconds/.exec(prompt);
      const seconds = Math.max(2, Number(found?.[1] ?? 6));
      const count = seconds < 8 ? 1 : 3;
      const lines = ['Here is the idea.', 'It is made of motion, not slides.', 'Hold the idea.'];
      return JSON.stringify({
        audience: 'viewers', promise: 'a quick look at MotionRender', cta: 'make your own',
        sources: [],
        beats: Array.from({ length: count }, (_, i) => ({
          id: `beat-${i + 1}`, name: ['Hook', 'Point', 'Payoff'][i]!, seconds: Math.max(2, Math.round(seconds / count)),
          narration: lines[i]!, onScreen: ['Mock video', 'Designed motion', 'Hold the idea'][i]!,
        })),
      });
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

/**
 * Groq is the default provider. A deployment that only has a FreeLLMAPI key (and no Groq key) keeps working: with no provider named, the
 * one that has a credential is used, rather than a default that would fail at the first request.
 */
export function defaultProviderId(): 'groq' | 'freellmapi' {
  const groq = Boolean(process.env.GROQ_API_KEY || process.env.OVE_AI_API_KEY);
  const gateway = Boolean(process.env.FREELLMAPI_API_KEY || process.env.FREELLMAPI_KEY || process.env.OPENAI_API_KEY);
  return !groq && gateway ? 'freellmapi' : 'groq';
}

/** True for a rate or quota limit: waiting a few seconds, which the SDK already does, will not clear it. */
export const isRateLimit = (error: unknown) => /rate.?limit|\b429\b|too many requests|quota|tokens per (day|minute)/i.test(error instanceof Error ? error.message : String(error));

/** Groq chat models, best first. Each has its own token allowance, so one running out leaves the others. OVE_AI_GROQ_MODELS (comma separated) replaces the list; "off" turns rotation off. */
export const GROQ_ROTATION = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b'];

/** How long a daily-limit error says to wait, in ms; a limit that names no wait is treated as an hour. */
const waitFromError = (message: string) => {
  const found = /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i.exec(message);
  const ms = found ? (Number(found[1] ?? 0) * 3600 + Number(found[2] ?? 0) * 60 + Number(found[3] ?? 0)) * 1000 : 0;
  return Math.min(24 * 3600_000, ms || 3600_000);
};

/**
 * Tries `models` in order for a chat call that did not name its own model. A model that hits a rate limit is passed over and, when
 * the limit is a daily one, left alone until it resets, so the next call does not pay for the same failure. Any other error is the caller's.
 */
export function withModelRotation(primary: AiProvider, models: string[]): AiProvider {
  const resting = new Map<string, number>();
  return new Proxy(primary, {
    get(target, key, receiver) {
      if (key !== 'chat' || models.length < 2) return Reflect.get(target, key, receiver);
      return async (messages: ChatMessage[], options?: ChatOptions) => {
        if (options?.model) return target.chat(messages, options);
        const now = Date.now(), awake = models.filter(model => (resting.get(model) ?? 0) <= now), order = awake.length ? awake : models;
        let last: unknown;
        for (const [index, model] of order.entries()) {
          try { return await target.chat(messages, { ...options, model, ...(index < order.length - 1 ? { maxRetries: 0 } : {}) }); }
          catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            // A model this key cannot use is passed over like a spent one, and not asked again for a day.
            const unusable = /does not exist or you do not have access|model_not_found|decommissioned|no longer supported/i.test(text);
            if (!isRateLimit(error) && !unusable) throw error;
            last = error;
            if (unusable) resting.set(model, Date.now() + 24 * 3600_000);
            else if (/per day|TPD/i.test(text)) resting.set(model, Date.now() + waitFromError(text));
            if (index < order.length - 1) console.warn(`${model} is rate limited; trying ${order[index + 1]}.`);
          }
        }
        throw last;
      };
    },
  });
}

/** Chat goes to `fallback` when `primary` is rate limited; every other call, and every other kind of error, is the primary's own. */
export function withFallback(primary: AiProvider, fallback: AiProvider): AiProvider {
  return new Proxy(primary, {
    get(target, key, receiver) {
      if (key !== 'chat') return Reflect.get(target, key, receiver);
      return async (messages: ChatMessage[], options?: ChatOptions) => {
        try { return await target.chat(messages, options); }
        catch (error) {
          if (!isRateLimit(error)) throw error;
          console.warn(`${target.id} is rate limited; answering with ${fallback.id} instead.`);
          // A model name chosen for the primary means nothing to the fallback.
          try { return await fallback.chat(messages, { ...options, model: undefined }); } catch { throw error; }
        }
      };
    },
  });
}

/**
 * The provider for a request. When the operator sets OVE_AI_FALLBACK_PROVIDER (and optionally OVE_AI_FALLBACK_MODEL), a rate-limited
 * chat call is answered by that provider instead of failing. A caller who brought their own key or gateway is never switched to the operator's.
 */
export function createProvider(config: ProviderConfig = {}): AiProvider {
  let primary = createBaseProvider(config);
  // Groq with no model chosen by the caller: spread the load over its models rather than one model's daily allowance.
  const rotation = (process.env.OVE_AI_GROQ_MODELS ?? '').trim();
  if (primary.id === 'groq' && !config.model && !config.apiKey && !config.baseUrl && !process.env.OVE_AI_MODEL && rotation.toLowerCase() !== 'off') {
    primary = withModelRotation(primary, rotation ? rotation.split(',').map(model => model.trim()).filter(Boolean) : GROQ_ROTATION);
  }
  const fallbackId = (process.env.OVE_AI_FALLBACK_PROVIDER || '').trim().toLowerCase();
  if (!fallbackId || primary.id === 'mock' || primary.id === fallbackId || config.apiKey || config.baseUrl) return primary;
  return withFallback(primary, createBaseProvider({ provider: fallbackId, model: process.env.OVE_AI_FALLBACK_MODEL || undefined }));
}

function createBaseProvider(config: ProviderConfig = {}): AiProvider {
  const explicit = (config.provider || process.env.OVE_AI_PROVIDER || '').trim();
  let id = explicit.toLowerCase();

  if (!id) {
    if (config.baseUrl) {
      if (config.baseUrl.includes('openrouter.ai')) id = 'openrouter';
      else if (config.baseUrl.includes('4000') || config.baseUrl.includes('litellm')) id = 'litellm';
      else id = 'custom';
    } else if (config.model && config.model !== 'auto' && config.model !== 'smart') {
      if (/^gemini|^google\//i.test(config.model)) id = 'gemini';
      else if (/^claude|^anthropic\//i.test(config.model)) id = 'anthropic';
      else if (/^gpt-|^o1|^o3|^openai\//i.test(config.model)) id = 'openai';
      else id = defaultProviderId();
    } else {
      id = defaultProviderId();
    }
  }
  if (id === 'mock') return attachSpeech(new MockProvider(), resolveSpeechEngine(config));
  // Every network provider — groq, anthropic, nvidia, freellmapi, openai, google, openrouter, litellm, custom —
  // is the same Vercel AI SDK integration; only the driver and defaults differ. Speech is the one part that is not:
  // edge (the default) and indic both replace speak/transcribe with an engine that needs no key, and native keeps
  // the provider's own endpoints.
  const networkProvider = new VercelAiProvider({ ...config, provider: id });
  const configured = attachSpeech(networkProvider, networkProvider.speechEngine);
  // Nothing configured and nothing but the gateway default to choose: a request here would carry no credential, so
  // say so and hand back the offline provider rather than failing at the endpoint minutes into a render.
  if ((id === 'groq' || id === 'freellmapi') && !explicit && !configured.apiKey) {
    console.warn('No AI provider is configured (set GROQ_API_KEY, or FREELLMAPI_API_KEY, or pass --provider): using the offline mock, which writes placeholder videos and makes no requests.');
    return attachSpeech(new MockProvider(), resolveSpeechEngine(config));
  }
  return configured;
}

/** The engine picks itself for a provider: `native` leaves the provider's own speech in place, the others attach theirs. */
function attachSpeech(provider: AiProvider, engine: SpeechEngine): AiProvider {
  if (engine === 'indic') return attachIndicAudio(provider);
  return engine === 'native' ? provider : attachEdgeAudio(provider);
}

export function describeProvider(provider: AiProvider): string {
  const capabilities = providerCapabilities(provider);
  const routerInfo = (provider.id === 'freellmapi' && (provider.model === 'auto' || provider.model === 'smart'))
    ? ' [task-aware routing: each task picks its preferred model from TASK_MODEL_PREFERENCES, fallback auto]'
    : '';
  return `${provider.id} [Vercel AI SDK] (${provider.model}${routerInfo}) at ${provider.baseUrl} — ${Object.entries(capabilities).filter(([, on]) => on).map(([name]) => name).join(', ')}`;
}
