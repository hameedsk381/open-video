import { describe, expect, it, vi } from 'vitest';
import { withModelRotation, type AiProvider, type ChatOptions } from '@ove/ai';

const daily = (model: string) => new Error(`Rate limit reached for model ${model} on tokens per day (TPD): Limit 200000, Used 199929. Please try again in 44m57.4s.`);
const make = (limited: Set<string>) => {
  const calls: { model?: string; retries?: number }[] = [];
  const provider: AiProvider = { id: 'groq', model: 'openai/gpt-oss-120b', baseUrl: '', chat: async (_m, options?: ChatOptions) => {
    calls.push({ model: options?.model, retries: options?.maxRetries });
    if (limited.has(options?.model ?? '')) throw daily(options?.model ?? '');
    return `answered by ${options?.model}`;
  } };
  return { calls, provider };
};

describe('Groq model rotation', () => {
  it('moves to the next model when one is out of tokens, without retrying the spent one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls, provider } = make(new Set(['a']));
    expect(await withModelRotation(provider, ['a', 'b', 'c']).chat([])).toBe('answered by b');
    expect(calls).toEqual([{ model: 'a', retries: 0 }, { model: 'b', retries: 0 }]);
  });

  it('leaves a model with a daily limit alone on later calls', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { calls, provider } = make(new Set(['a']));
    const rotating = withModelRotation(provider, ['a', 'b']);
    await rotating.chat([]); calls.length = 0;
    await rotating.chat([]);
    expect(calls.map(call => call.model)).toEqual(['b']);
  });

  it('fails with the rate limit error when every model is spent, and passes other errors straight through', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(withModelRotation(make(new Set(['a', 'b'])).provider, ['a', 'b']).chat([])).rejects.toThrow(/tokens per day/);
    const broken: AiProvider = { id: 'groq', model: 'a', baseUrl: '', chat: async () => { throw new Error('Invalid API key'); } };
    await expect(withModelRotation(broken, ['a', 'b']).chat([])).rejects.toThrow('Invalid API key');
  });

  it('passes over a model the key cannot use, and does not ask it again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: (string | undefined)[] = [];
    const provider: AiProvider = { id: 'groq', model: 'a', baseUrl: '', chat: async (_m, options) => {
      calls.push(options?.model);
      if (options?.model === 'a') throw new Error('The model `a` does not exist or you do not have access to it.');
      return 'ok ' + options?.model;
    } };
    const rotating = withModelRotation(provider, ['a', 'b']);
    expect(await rotating.chat([])).toBe('ok b'); calls.length = 0;
    expect(await rotating.chat([])).toBe('ok b');
    expect(calls).toEqual(['b']);
  });

  it('respects a model the caller named', async () => {
    const { calls, provider } = make(new Set(['x']));
    await expect(withModelRotation(provider, ['a', 'b']).chat([], { model: 'x' })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
