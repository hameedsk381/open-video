import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider, concatWav, createProvider, GroqProvider, splitSpeech, type AiProvider } from '@ove/ai';

// A minimal 16-bit mono PCM WAV, the shape Groq's speech endpoint returns.
function wav(samples: number[], sampleRate = 24000): Uint8Array<ArrayBuffer> {
  const dataLength = samples.length * 2;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, text: string) => { for (let index = 0; index < 4; index++) bytes[at + index] = text.charCodeAt(index); };
  tag(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, dataLength, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Groq provider', () => {
  it('uses the chat completions endpoint with JSON mode and completion tokens', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json({ choices: [{ message: { content: '{"ok":true}' } }] });
    }));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    const text = await provider.chat([{ role: 'user', content: 'hello' }], { json: true });
    expect(text).toBe('{"ok":true}');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer test-key');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('falls back to a plain completion when JSON mode rejects its own generation', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (bodies.length === 1) return new Response(JSON.stringify({ error: { code: 'json_validate_failed', message: 'Failed to generate JSON' } }), { status: 400 });
      return json({ choices: [{ message: { content: '```json\n{"ok":true}\n```' } }] });
    }));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    expect(await provider.chat([{ role: 'user', content: 'hello' }], { json: true })).toContain('"ok":true');
    expect(bodies).toHaveLength(2);
    expect(bodies[0].response_format).toEqual({ type: 'json_object' });
    expect(bodies[1].response_format).toBeUndefined();
  });

  it('waits and retries after a rate limit', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls++;
      if (calls === 1) return new Response(JSON.stringify({ error: { code: 'rate_limit_exceeded' } }), { status: 429, headers: { 'retry-after': '0' } });
      return json({ choices: [{ message: { content: 'ok' } }] });
    }));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    expect(await provider.chat([{ role: 'user', content: 'hello' }])).toBe('ok');
    expect(calls).toBe(2);
  });

  it('splits long narration into requests under 200 characters and joins the WAV parts', async () => {
    const inputs: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      inputs.push(JSON.parse(String(init.body)).input);
      return new Response(wav([1, 2]), { status: 200 });
    }));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    const text = 'This is one sentence. '.repeat(20).trim();
    const result = await provider.speak(text, { voice: 'troy' });
    expect(inputs.length).toBeGreaterThan(1);
    expect(inputs.every(input => input.length <= 200)).toBe(true);
    expect(inputs.join(' ')).toBe(text);
    expect(result.extension).toBe('wav');
    const view = new DataView(result.data.buffer, result.data.byteOffset, result.data.byteLength);
    expect(view.getUint32(40, true)).toBe(4 * inputs.length); // two samples, two bytes each, per request
    expect(view.getUint32(4, true)).toBe(36 + 4 * inputs.length);
  });

  it('speaks each chunk with the configured model, voice and WAV format', async () => {
    const bodies: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(wav([0]), { status: 200 });
    }));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    await provider.speak('Short line.', { voice: 'austin' });
    expect(bodies[0]).toEqual({ model: 'canopylabs/orpheus-v1-english', input: 'Short line.', voice: 'austin', response_format: 'wav' });
  });

  it('transcribes with word timestamps', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({
      text: 'hello there',
      words: [{ word: 'hello', start: 0, end: 0.25 }, { word: 'there', start: 0.3, end: 0.6 }],
      segments: [{ text: 'hello there', start: 0, end: 0.6 }],
    })));
    const provider = new GroqProvider({ apiKey: 'test-key' });
    const transcript = await provider.transcribe(new Uint8Array([1, 2, 3]), 'voice.wav');
    expect(transcript.text).toBe('hello there');
    expect(transcript.words).toEqual([{ text: 'hello', start: 0, end: 0.25 }, { text: 'there', start: 0.3, end: 0.6 }]);
    expect(transcript.cues).toHaveLength(1);
  });

  it('has speech and transcription but no image generation', () => {
    const provider: AiProvider = new GroqProvider({ apiKey: 'test-key' });
    expect(provider.image).toBeUndefined();
    expect(provider.speak).toBeTypeOf('function');
    expect(provider.transcribe).toBeTypeOf('function');
  });

  it('is selected automatically when GROQ_API_KEY is the only key', () => {
    for (const name of ['OVE_AI_PROVIDER', 'ANTHROPIC_API_KEY']) vi.stubEnv(name, '');
    vi.stubEnv('GROQ_API_KEY', 'test-key');
    expect(createProvider().id).toBe('groq');
  });
});

describe('Anthropic provider', () => {
  it('posts to /v1/messages with the system prompt split out', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return json({ content: [{ type: 'text', text: '{"ok":true}' }] });
    }));
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test' });
    const text = await provider.chat([{ role: 'system', content: 'Write JSON' }, { role: 'user', content: 'hello' }], { json: true });
    expect(text).toBe('{"ok":true}');
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect((calls[0]!.init.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body.model).toBe('claude-sonnet-4-5');
    expect(body.system).toBe('Write JSON');
    expect(body.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(body.max_tokens).toBe(16384);
  });

  it('is selected automatically when ANTHROPIC_API_KEY is set and GROQ_API_KEY is not', () => {
    for (const name of ['OVE_AI_PROVIDER', 'GROQ_API_KEY']) vi.stubEnv(name, '');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    const provider = createProvider();
    expect(provider.id).toBe('anthropic');
  });

  it('attaches Groq speech when provider is anthropic and GROQ_API_KEY exists', () => {
    vi.stubEnv('OVE_AI_PROVIDER', 'anthropic');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
    const provider = createProvider();
    expect(provider.id).toBe('anthropic');
    expect(provider.speak).toBeTypeOf('function');
    expect(provider.transcribe).toBeTypeOf('function');
  });
});

describe('speech chunking and WAV joining', () => {
  it('keeps every chunk under the limit and preserves the words', () => {
    const text = 'This is sentence number one. This is sentence number two! And a third one?';
    const chunks = splitSpeech(text, 40);
    expect(chunks.every(chunk => chunk.length <= 40)).toBe(true);
    expect(chunks.join(' ')).toBe(text);
    const long = 'word '.repeat(100).trim();
    const pieces = splitSpeech(long, 50);
    expect(pieces.every(piece => piece.length <= 50)).toBe(true);
    expect(pieces.join(' ')).toBe(long);
  });

  it('cuts a long sentence at a comma without losing it', () => {
    const chunks = splitSpeech('Alpha beta gamma, delta epsilon zeta, eta theta iota kappa lambda mu.', 25);
    expect(chunks.every(chunk => chunk.length <= 25)).toBe(true);
    expect(chunks.join(' ')).toBe('Alpha beta gamma, delta epsilon zeta, eta theta iota kappa lambda mu.');
  });

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

