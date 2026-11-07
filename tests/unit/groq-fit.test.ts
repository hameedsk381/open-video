import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry, planBuild, VercelAiProvider, type AiProvider, type ChatMessage, type PlanOptions } from '@ove/ai';

// Groq's on-demand tier counts the output reserved for the answer against a per-minute allowance: "Limit 8000, Requested 10333" is the
// prompt plus the room asked for. The pipeline used to fail every large request on it and skip planning without saying why.

afterEach(() => vi.unstubAllGlobals());

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const reply = (content: string, finish: 'stop' | 'length') => json({
  id: 'c', object: 'chat.completion', created: Date.now(), model: 'test',
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
});
const tooLarge = (requested: number) => json({ error: { message: `Request too large for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Requested ${requested}, please reduce your message size and try again.`, type: 'tokens', code: 'rate_limit_exceeded' } }, 413);

describe('a request the provider calls too large', () => {
  const run = async (script: (maxTokens: number, call: number) => Response, options: Record<string, unknown> = {}) => {
    const limits: number[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init: RequestInit = {}) => { const max = JSON.parse(String(init.body)).max_tokens as number; limits.push(max); return script(max, limits.length); }));
    const provider = new VercelAiProvider({ provider: 'openai', apiKey: 'k', model: 'm' });
    try { return { text: await provider.chat([{ role: 'user', content: 'JSON please' }], options), limits }; }
    catch (error) { return { error: (error as Error).message, limits }; }
  };

  it('asks again with the room the provider said it has: the limit minus the prompt, which is what was requested minus what was reserved', async () => {
    const result = await run((max, call) => (call === 1 ? tooLarge(2141 + max) : reply('{"ok":true}', 'stop')));
    expect(result.text).toBe('{"ok":true}');
    expect(result.limits).toEqual([8192, Math.floor((8000 - 2141) * 0.95)]);
  });

  it('says what the prompt alone weighs when it leaves no room to answer', async () => {
    const result = await run(max => tooLarge(9500 + max));
    expect(result.error).toMatch(/The prompt alone is about 9500 tokens, which leaves too little room to answer/);
    expect(result.limits).toEqual([8192]);                           // no point asking again
  });

  it('does not stretch an answer that was cut off past a limit it just learned about', async () => {
    const result = await run((max, call) => (call === 1 ? tooLarge(2141 + max) : reply('{"ok":', 'length')));
    expect(result.limits).toEqual([8192, 5566]);
    expect(result.text).toBe('{"ok":');
  });

  it('leaves any other failure alone', async () => {
    const result = await run(() => json({ error: { message: 'bad key' } }, 401));
    expect(result.error).toContain('bad key'); expect(result.limits).toHaveLength(1);
  });
});

describe('planning for a provider with a small request limit', () => {
  const beat = { name: 'Hook', onScreen: 'the headline springs in', seconds: 6 };
  const big = buildRegistry({
    templates: Array.from({ length: 12 }, (_, i) => ({ id: `tpl-${i}`, name: `Template ${i}`, description: 'A ready-made layout for a product story with a long description that keeps going and going and going and going and going', width: 1080, height: 1080, durationSeconds: 6, variables: [{ name: 'title', type: 'string' }, { name: 'subtitle', type: 'string' }] })),
    themes: [{ id: 'midnight', name: 'Midnight', description: 'Dark blues' }],
    blocks: Array.from({ length: 20 }, (_, i) => ({ id: `block-${i}`, name: `Block ${i}`, description: 'A scene block', category: 'scene', kind: 'scene' as const, durationFrames: 90 })),
  });
  const options: PlanOptions = { brief: 'a product intro', width: 1080, height: 1080, fps: 30, durationSeconds: 6, registry: big };
  const plan = { path: 'json', beats: [beat] };
  const scripted = (id = 'fake') => { const seen: ChatMessage[][] = []; const provider: AiProvider & { seen: ChatMessage[][] } = { id, model: 'm', baseUrl: 'fake://', seen, chat: async messages => { seen.push(messages); return JSON.stringify(plan); } }; return provider; };
  const systemOf = (provider: { seen: ChatMessage[][] }) => String(provider.seen[0]![0]!.content);

  it('sends names and one short line each, with no blocks, sounds or parameter lists', async () => {
    const full = scripted(), short = scripted();
    await planBuild(full, options); await planBuild(short, { ...options, compact: true });
    expect(systemOf(full)).toContain('block-3'); expect(systemOf(full)).toContain('values: title (string)');
    expect(systemOf(short)).not.toContain('block-3'); expect(systemOf(short)).not.toContain('values:'); expect(systemOf(short)).not.toContain('Sounds:'); expect(systemOf(full)).toContain('Sounds:');
    expect(systemOf(short)).toContain('tpl-3'); expect(systemOf(short)).toContain('midnight');
    expect(systemOf(short).length).toBeLessThan(systemOf(full).length * 0.75);
  });

  it('does that by itself for Groq', async () => {
    const provider = scripted('groq');
    await planBuild(provider, options);
    expect(systemOf(provider)).not.toContain('block-3');
  });

  it('retries once with the short list, without using an attempt, when a provider says the request was too large', async () => {
    const progress: string[] = [], seen: string[] = []; let calls = 0;
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async messages => {
      seen.push(String(messages[0]!.content)); calls++;
      if (calls === 1) throw new Error('Request too large for model x on tokens per minute (TPM): Limit 8000, Requested 10333, please reduce your message size');
      return JSON.stringify(plan);
    } };
    const result = await planBuild(provider, { ...options, maxAttempts: 1, onProgress: message => progress.push(message) });
    expect(result?.path).toBe('json');
    expect(seen[0]).toContain('block-3'); expect(seen[1]).not.toContain('block-3');
    expect(progress.some(message => message.includes('shorter capability list'))).toBe(true);
  });

  it('does not hide a failure that has nothing to do with size', async () => {
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async () => { throw new Error('Invalid API key'); } };
    await expect(planBuild(provider, options)).rejects.toThrow('Invalid API key');
  });
});
