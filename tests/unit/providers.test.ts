import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearFreeLlmModelCache, concatWav, createProvider, inferChatTask, MockProvider, VercelAiProvider, type AiProvider } from '@ove/ai';

// One integration layer: every network provider is VercelAiProvider (the Vercel AI SDK) with per-vendor driver and
// defaults; the FreeLLMAPI task-aware routing is policy on top of it; the mock stays offline. Edge TTS supplies
// speech for all of them, so no provider ships its own HTTP clients any more.

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
// The SDK validates the full OpenAI chat envelope; `index` is required even when nothing else is present.
const chatReply = (content: string) => json({
  id: 'chatcmpl-test', object: 'chat.completion', created: Date.now(), model: 'test',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

beforeEach(() => {
  vi.stubEnv('OVE_AI_PROVIDER', '');
  vi.stubEnv('OVE_AI_MODEL', '');
  vi.stubEnv('OVE_AI_BASE_URL', '');
  vi.stubEnv('OVE_AI_API_KEY', '');
  vi.stubEnv('FREELLMAPI_BASE_URL', '');
  vi.stubEnv('FREELLMAPI_API_KEY', '');
  vi.stubEnv('FREELLMAPI_MODEL', '');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('NVIDIA_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('LITELLM_BASE_URL', '');
  clearFreeLlmModelCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createProvider routing', () => {
  it('routes every network id through the Vercel AI SDK with per-vendor defaults', () => {
    const cases: { config: Record<string, string>; id: string; model: string; baseUrl: string; driver: VercelAiProvider['driver'] }[] = [
      { config: { provider: 'groq', apiKey: 'gsk' }, id: 'groq', model: 'openai/gpt-oss-120b', baseUrl: 'https://api.groq.com/openai/v1', driver: 'groq' },
      { config: { provider: 'anthropic', apiKey: 'sk-ant' }, id: 'anthropic', model: 'claude-3-7-sonnet-20250219', baseUrl: 'https://api.anthropic.com/v1', driver: 'anthropic' },
      { config: { provider: 'nvidia', apiKey: 'nvapi' }, id: 'nvidia', model: 'nvidia/nemotron-3.5-bolt-e4b', baseUrl: 'https://integrate.api.nvidia.com/v1', driver: 'openai' },
      { config: { provider: 'freellmapi', apiKey: 'k', baseUrl: 'http://localhost:3001/v1' }, id: 'freellmapi', model: 'auto', baseUrl: 'http://localhost:3001/v1', driver: 'openai' },
      { config: { provider: 'openai', apiKey: 'sk' }, id: 'openai', model: 'gpt-4o', baseUrl: 'https://api.openai.com/v1', driver: 'openai' },
      { config: { provider: 'openrouter', apiKey: 'sk-or' }, id: 'openrouter', model: 'anthropic/claude-3.7-sonnet', baseUrl: 'https://openrouter.ai/api/v1', driver: 'openai' },
      { config: { provider: 'litellm', apiKey: 'sk' }, id: 'litellm', model: 'claude-3-7-sonnet', baseUrl: 'http://localhost:4000/v1', driver: 'openai' },
    ];
    for (const { config, id, model, baseUrl, driver } of cases) {
      const provider = createProvider(config as any) as VercelAiProvider;
      expect(provider).toBeInstanceOf(VercelAiProvider);
      expect(provider.id).toBe(id);
      expect(provider.model).toBe(model);
      expect(provider.baseUrl).toBe(baseUrl);
      expect(provider.driver).toBe(driver);
    }
  });

  it('keeps the mock offline and the inference rules working', () => {
    expect(createProvider({ provider: 'mock' })).toBeInstanceOf(MockProvider);
    expect(createProvider({ baseUrl: 'https://my-vllm.internal/v1', apiKey: 'k', model: 'qwen-2.5-coder' }).id).toBe('custom');
    expect(createProvider({ model: 'gemini-2.0-flash', apiKey: 'g' }).id).toBe('gemini');
    expect(createProvider({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'k' }).id).toBe('openrouter');
  });

  it('attaches Edge TTS speech to every network provider', () => {
    const provider: AiProvider = createProvider({ provider: 'freellmapi' });
    expect(provider.speak).toBeTypeOf('function');
    expect(provider.transcribe).toBeTypeOf('function');
  });

  it('freellmapi is the default when nothing is configured', () => {
    expect(createProvider().id).toBe('freellmapi');
  });
});

describe('FreeLLMAPI task-aware routing', () => {
  it('infers the task from the messages', () => {
    expect(inferChatTask([{ role: 'user', content: 'You fill in ready-made video templates for our catalog' }])).toBe('template');
    expect(inferChatTask([{ role: 'user', content: 'The video compiled but the design review found these issues' }])).toBe('heal');
    expect(inferChatTask([{ role: 'user', content: 'You are the production planner for MotionRender.' }])).toBe('fast');
    expect(inferChatTask([{ role: 'user', content: 'Extract a clean BrandPack JSON from this scraped website data' }])).toBe('brand');
    expect(inferChatTask([{ role: 'user', content: 'planBatch jobs for export' }])).toBe('batch');
    expect(inferChatTask([{ role: 'user', content: 'Write the complete video.tsx file now' }])).toBe('compose');
  });

  it('an explicit or configured model wins over the task preferences', async () => {
    const explicit = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', model: 'auto' });
    expect(await explicit.resolveModel('compose', 'custom-model')).toBe('custom-model');
    const configured = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', model: 'custom-model' });
    expect(await configured.resolveModel('compose')).toBe('custom-model');
  });

  it('picks the preferred available model per task and chats through the SDK', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/models')) return json({ data: [{ id: 'Qwen3.8-27B', available: true }, { id: 'gpt-oss-120b', available: true }] });
      return chatReply('{"ok":true}');
    }));
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', apiKey: 'k' });
    expect(await provider.chat([{ role: 'user', content: 'Write the composition JSON' }], { task: 'compose' })).toBe('{"ok":true}');
    const chat = calls.filter(call => call.url.endsWith('/chat/completions'));
    expect(chat).toHaveLength(1);
    const body = JSON.parse(String(chat[0]!.init.body));
    expect(body.model).toBe('qwen3.8-27b');       // matched case-insensitively from the live model list
    expect(body.messages).toHaveLength(1);
  });

  it('falls back to the gateway auto router when the preferred model fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      if (String(url).endsWith('/models')) return json({ data: [{ id: 'qwen3.8-27b', available: true }] });
      const body = JSON.parse(String(init.body ?? '{}'));
      if (body.model === 'qwen3.8-27b') return new Response('{"error":"upstream exploded"}', { status: 401 });
      return chatReply('routed');
    }));
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', apiKey: 'k' });
    expect(await provider.chat([{ role: 'user', content: 'Write the composition JSON' }], { task: 'compose' })).toBe('routed');
  });

  it('unavailable preferred models fall through the preference order to auto', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/models')) return json({ data: [] });
      return chatReply('ok');
    }));
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', apiKey: 'k' });
    expect(await provider.resolveModel('compose')).toBe('auto');
  });
});

describe('chat through the SDK drivers', () => {
  it('sends the system prompt and temperature to an OpenAI-compatible endpoint', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return chatReply('{"status":"ok"}');
    }));
    const provider = new VercelAiProvider({ provider: 'custom', baseUrl: 'https://my-vllm.internal/v1', apiKey: 'k', model: 'qwen-2.5-coder' });
    expect(await provider.chat([{ role: 'system', content: 'Write JSON' }, { role: 'user', content: 'hello' }], { temperature: 0.2 })).toBe('{"status":"ok"}');
    expect(calls[0]!.url).toBe('https://my-vllm.internal/v1/chat/completions');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe('qwen-2.5-coder');
    expect(body.temperature).toBe(0.2);
    expect(body.messages[0].role).toBe('system');
  });

  it('retries rate limits through the SDK and reports empty replies as errors', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response('{"error":"slow down"}', { status: 429, headers: { 'retry-after': '0' } });
      return chatReply('');
    }));
    const provider = new VercelAiProvider({ provider: 'custom', baseUrl: 'https://gw.internal/v1', apiKey: 'k', model: 'm' });
    await expect(provider.chat([{ role: 'user', content: 'hello' }])).rejects.toThrow(/returned no text/);
    expect(calls).toBe(2);
  });
});

describe('image and transcription through the SDK', () => {
  it('generates an image on OpenAI-compatible gateways', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      calls.push(String(url));
      if (String(url).endsWith('/images/generations')) return json({ created: 1, data: [{ b64_json: png }] });
      throw new Error(`unexpected call to ${url}`);
    }));
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', apiKey: 'k' });
    const result = await provider.image!('a blue sky', { size: '1024x1024' });
    expect(calls[0]).toBe('http://localhost:3001/v1/images/generations');
    expect(result.extension).toBe('png');
    expect(result.data.byteLength).toBeGreaterThan(0);
  });

  it('offers no image capability on Groq or NIM, and none on Anthropic or Google', () => {
    expect(new VercelAiProvider({ provider: 'groq', apiKey: 'k' }).image).toBeUndefined();
    expect(new VercelAiProvider({ provider: 'nvidia', apiKey: 'k' }).image).toBeUndefined();
    expect(new VercelAiProvider({ provider: 'anthropic', apiKey: 'k' }).image).toBeUndefined();
    expect(new VercelAiProvider({ provider: 'google', apiKey: 'k' }).image).toBeUndefined();
  });

  it('transcribes with word timestamps via verbose_json', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return json({
        text: 'hello there',
        words: [{ word: 'hello', start: 0, end: 0.25 }, { word: 'there', start: 0.3, end: 0.6 }],
        segments: [{ id: 0, seek: 0, start: 0, end: 0.6, text: 'hello there', tokens: [0, 1], temperature: 0, avg_logprob: -0.5, compression_ratio: 1.2, no_speech_prob: 0.01 }],
      });
    }));
    const provider = new VercelAiProvider({ provider: 'freellmapi', baseUrl: 'http://localhost:3001/v1', apiKey: 'k' });
    const transcript = await provider.transcribe(new Uint8Array([1, 2, 3]), 'voice.wav', { language: 'en' });
    expect(calls[0]!.url).toBe('http://localhost:3001/v1/audio/transcriptions');
    expect(transcript.text).toBe('hello there');
    expect(transcript.words).toEqual([{ text: 'hello', start: 0, end: 0.25 }, { text: 'there', start: 0.3, end: 0.6 }]);
    expect(transcript.cues).toHaveLength(1);
  });

  it('returns an empty transcript on drivers without a transcription endpoint', async () => {
    const provider = new VercelAiProvider({ provider: 'anthropic', apiKey: 'k' });
    expect(await provider.transcribe(new Uint8Array([1]), 'a.wav')).toEqual({ text: '', words: [], cues: [] });
  });
});

describe('WAV joining', () => {
  function wav(samples: number[], sampleRate = 24000): Uint8Array<ArrayBuffer> {
    const dataLength = samples.length * 2;
    const bytes = new Uint8Array(44 + dataLength);
    const view = new DataView(bytes.buffer);
    const tag = (at: number, text: string) => { for (let index = 0; index < 4; index++) bytes[at + index] = text.charCodeAt(index); };
    tag(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); tag(8, 'WAVE');
    tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    tag(36, 'data'); view.setUint32(40, dataLength, true);
    samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
    return bytes;
  }

  it('reads streamed WAVs whose sizes run past the end', () => {
    const streamed = wav([1, 2, 3]);
    const source = new DataView(streamed.buffer);
    source.setUint32(4, 0xffffffff, true);
    source.setUint32(40, 0xffffffff, true);
    const fixed = concatWav([streamed]);
    const view = new DataView(fixed.buffer, fixed.byteOffset, fixed.byteLength);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getUint32(4, true)).toBe(42);
    expect(fixed.subarray(44)).toEqual(wav([1, 2, 3]).subarray(44));
  });

  it('joins WAV data and refuses different formats', () => {
    const joined = concatWav([wav([1, 2]), wav([3, 4])]);
    const view = new DataView(joined.buffer, joined.byteOffset, joined.byteLength);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getUint32(4, true)).toBe(44);
    expect(() => concatWav([wav([1]), wav([1], 48000)])).toThrow(/different audio formats/);
  });
});
