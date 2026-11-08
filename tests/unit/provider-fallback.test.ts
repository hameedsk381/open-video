import { afterEach, describe, expect, it, vi } from 'vitest';
import { isRateLimit, withFallback, createProvider, type AiProvider } from '@ove/ai';

const fake = (id: string, chat: AiProvider['chat']): AiProvider => ({ id, model: `${id}-model`, baseUrl: '', chat });

describe('rate limit fallback', () => {
  afterEach(() => { vi.restoreAllMocks(); delete process.env.OVE_AI_FALLBACK_PROVIDER; });

  it('recognises rate and quota limits and nothing else', () => {
    expect(isRateLimit(new Error('Failed after 3 attempts. Last error: AI_APICallError: Rate limit reached for model x on tokens per day (TPD)'))).toBe(true);
    expect(isRateLimit(new Error('HTTP 429'))).toBe(true);
    expect(isRateLimit(new Error('Invalid API key'))).toBe(false);
  });

  it('answers with the fallback when the primary is rate limited, and drops the primary model name', async () => {
    const seen: unknown[] = [];
    const primary = fake('groq', async () => { throw new Error('Rate limit reached (TPD)'); });
    const backup = fake('freellmapi', async (_m, options) => { seen.push(options?.model); return 'from backup'; });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = withFallback(primary, backup);
    expect(await provider.chat([{ role: 'user', content: 'hi' }], { model: 'openai/gpt-oss-120b' })).toBe('from backup');
    expect(seen).toEqual([undefined]);
    expect(provider.id).toBe('groq');
  });

  it('does not use the fallback for other errors, and reports the original error if the fallback fails too', async () => {
    const backup = vi.fn(async () => 'x');
    await expect(withFallback(fake('a', async () => { throw new Error('Invalid API key'); }), fake('b', backup)).chat([])).rejects.toThrow('Invalid API key');
    expect(backup).not.toHaveBeenCalled();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withFallback(fake('a', async () => { throw new Error('429 slow down'); }), fake('b', async () => { throw new Error('also down'); })).chat([])).rejects.toThrow('429 slow down');
  });

  it('wraps only when the operator names a fallback and the caller brought no key of their own', () => {
    expect(createProvider({ provider: 'openai', apiKey: 'k' })).toBeDefined();
    process.env.OVE_AI_FALLBACK_PROVIDER = 'freellmapi';
    const wrapped = createProvider({ provider: 'groq', model: 'm' });
    expect(wrapped.id).toBe('groq');
    expect(wrapped.chat).not.toBe(createProvider({ provider: 'groq', model: 'm', apiKey: 'own' }).chat);
  });
});
