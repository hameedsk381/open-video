import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { audioCacheKey, clearFreeLlmModelCache, concatWav, createProvider, inferChatTask, MockProvider, providerVision, resolveSpeechEngine, VercelAiProvider, visionProvider, type AiProvider } from '@ove/ai';

// One integration layer: every network provider is VercelAiProvider (the Vercel AI SDK) with per-vendor driver and
// defaults; the FreeLLMAPI task-aware routing is policy on top of it; the mock stays offline. Speech is the pluggable
// part: the free Edge engine is attached by default, the native one keeps the provider's own audio endpoint.

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
  vi.stubEnv('FREELLMAPI_KEY', '');
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('FREELLMAPI_MODEL', '');
  vi.stubEnv('GROQ_API_KEY', '');
  vi.stubEnv('NVIDIA_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('LITELLM_BASE_URL', '');
  vi.stubEnv('OVE_AI_TTS_PROVIDER', '');
  vi.stubEnv('OVE_AI_SPEECH_MODEL', '');
  vi.stubEnv('OVE_AI_SPEECH_VOICE', '');
  vi.stubEnv('OVE_AI_VOICE', '');
  clearFreeLlmModelCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// A reply the model cut off because it ran out of room is never usable JSON, and reasoning models spend part of the limit thinking.
const replyEnding = (content: string, finish: 'stop' | 'length') => json({
  id: 'chatcmpl-test', object: 'chat.completion', created: Date.now(), model: 'test',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});

describe('seeing images', () => {
  it('tells a text-only model from one that reads pictures', () => {
    expect(providerVision(createProvider({ provider: 'groq', apiKey: 'k', model: 'openai/gpt-oss-120b' }))).toBe(false);
    expect(providerVision(createProvider({ provider: 'groq', apiKey: 'k', model: 'meta-llama/llama-4-scout-17b-16e-instruct' }))).toBe(true);
    expect(providerVision(createProvider({ provider: 'anthropic', apiKey: 'k' }))).toBe(true);
    expect(providerVision(new MockProvider())).toBe(true);
  });

  it('lends the operator gateway to a build model that cannot see, and only when the gateway has a key', () => {
    const groq = createProvider({ provider: 'groq', apiKey: 'k', model: 'openai/gpt-oss-120b' });
    expect(visionProvider(groq)).toBeUndefined();
    vi.stubEnv('FREELLMAPI_API_KEY', 'gateway-key');
    expect(visionProvider(groq)?.id).toBe('freellmapi');
    const anthropic = createProvider({ provider: 'anthropic', apiKey: 'k' });
    expect(visionProvider(anthropic)).toBe(anthropic);
  });
});

describe('output limit', () => {
  const asked = (calls: { init: RequestInit }[]) => calls.map(call => JSON.parse(String(call.init.body)).max_tokens as number);
  const run = async (replies: ('stop' | 'length')[], options: Record<string, unknown> = {}) => {
    const calls: { init: RequestInit }[] = []; let at = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init: RequestInit = {}) => { calls.push({ init }); return replyEnding(replies[Math.min(at, replies.length - 1)] === 'length' ? 'The user wants a video, so' : '{"ok":true}', replies[Math.min(at++, replies.length - 1)]!); }));
    const provider = new VercelAiProvider({ provider: 'openai', apiKey: 'k', model: 'm' });
    const text = await provider.chat([{ role: 'user', content: 'JSON please' }], options);
    return { text, limits: asked(calls) };
  };

  it('asks once, with a limit that leaves a model room to think, when the reply is complete', async () => {
    expect(await run(['stop'])).toEqual({ text: '{"ok":true}', limits: [8192] });
  });

  it('asks again with twice the room when the reply was cut off, and returns the complete one', async () => {
    expect(await run(['length', 'stop'])).toEqual({ text: '{"ok":true}', limits: [8192, 16384] });
    expect(await run(['length', 'length', 'stop'])).toEqual({ text: '{"ok":true}', limits: [8192, 16384, 32768] });
  });

  it('widens a limit the caller chose, because a small one is what truncated the reply', async () => {
    expect((await run(['length', 'stop'], { maxTokens: 2200 })).limits).toEqual([2200, 4400]);
  });

  it('gives up after two widenings and hands back what there is, never asking for more than the ceiling', async () => {
    const result = await run(['length']);
    expect(result.limits).toEqual([8192, 16384, 32768]);
    expect(result.text).toBe('The user wants a video, so');
    expect((await run(['length'], { maxTokens: 30000 })).limits).toEqual([30000, 32768]);
  });

  it('takes the default from OVE_AI_MAX_TOKENS, and widens that too', async () => {
    vi.stubEnv('OVE_AI_MAX_TOKENS', '3000');
    expect((await run(['length', 'stop'])).limits).toEqual([3000, 6000]);
    vi.stubEnv('OVE_AI_MAX_TOKENS', 'lots');
    expect((await run(['stop'])).limits).toEqual([8192]);
  });
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
    const provider: AiProvider = createProvider({ provider: 'freellmapi', apiKey: 'k' });
    expect(provider.speak).toBeTypeOf('function');
    expect(provider.transcribe).toBeTypeOf('function');
  });

  it('uses the offline mock, not an unauthenticated gateway, when nothing is configured', () => {
    vi.stubEnv('FREELLMAPI_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(createProvider()).toBeInstanceOf(MockProvider);
  });

  it('keeps an explicitly chosen gateway without a key, so the real endpoint error surfaces', () => {
    expect(createProvider({ provider: 'freellmapi' }).id).toBe('freellmapi');
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

describe('speech engines', () => {
  it('defaults to the free edge engine and says so on the provider', () => {
    expect(resolveSpeechEngine()).toBe('edge');
    const provider = createProvider({ provider: 'freellmapi', apiKey: 'k' });
    expect(provider.speechEngine).toBe('edge');
    expect(provider.speak).toBeTypeOf('function');
  });

  it('switches to the provider endpoint by config or environment', () => {
    expect(resolveSpeechEngine({ speechEngine: 'native' })).toBe('native');
    vi.stubEnv('OVE_AI_TTS_PROVIDER', 'groq');
    expect(resolveSpeechEngine()).toBe('native');
    expect(createProvider({ provider: 'openai', apiKey: 'k', speechEngine: 'native' }).speechEngine).toBe('native');
  });

  it('speaks through the provider audio endpoint and returns WAV', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const wav = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), init });
      return new Response(wav, { status: 200 });
    }));
    const provider = new VercelAiProvider({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', speechEngine: 'native' });
    const spoken = await provider.speak('Hello world', { voice: 'onyx' });
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/audio/speech');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({ model: 'gpt-4o-mini-tts', input: 'Hello world', response_format: 'wav', voice: 'onyx' });
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer k');
    expect(spoken.extension).toBe('wav');
    expect(Array.from(spoken.data)).toEqual(Array.from(wav));
  });

  it('names Groq speech model and drops an Edge voice id the endpoint cannot read', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init: RequestInit = {}) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(new Uint8Array([1]), { status: 200 });
    }));
    await new VercelAiProvider({ provider: 'openai', apiKey: 'k', speechEngine: 'native' }).speak('hi', { voice: 'en-US-AvaNeural' });
    expect(bodies[0]).toMatchObject({ model: 'gpt-4o-mini-tts', voice: 'nova' });
    await new VercelAiProvider({ provider: 'groq', apiKey: 'g', speechEngine: 'native' }).speak('hi');
    expect(bodies[1]).toMatchObject({ model: 'canopylabs/orpheus-v1-english' });
    expect(bodies[1].voice).toBeUndefined();
    await new VercelAiProvider({ provider: 'freellmapi', apiKey: 'g', speechEngine: 'native' }).speak('hi');
    expect(bodies[2]).toMatchObject({ model: 'auto' });
  });

  it('refuses native speech on providers with no audio endpoint', async () => {
    const provider = new VercelAiProvider({ provider: 'anthropic', apiKey: 'a', speechEngine: 'native' });
    await expect(provider.speak('hi')).rejects.toThrow(/no speech endpoint/);
  });

  it('keys the transcript cache on the audio bytes, not its length', () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([9, 8, 7, 6]);
    expect(a.byteLength).toBe(b.byteLength);
    expect(audioCacheKey(a)).not.toBe(audioCacheKey(b));
    expect(audioCacheKey(a)).toBe(audioCacheKey(new Uint8Array(a)));
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
