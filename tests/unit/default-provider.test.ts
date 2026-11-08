import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider, defaultProviderId } from '@ove/ai';

// Groq is the default provider. A deployment that only has a FreeLLMAPI key keeps working; nothing configured falls back to the offline mock.
const keys = ['GROQ_API_KEY', 'OVE_AI_API_KEY', 'FREELLMAPI_API_KEY', 'FREELLMAPI_KEY', 'OPENAI_API_KEY', 'OVE_AI_PROVIDER', 'OVE_AI_MODEL', 'FREELLMAPI_MODEL', 'FREELLMAPI_BASE_URL', 'OVE_AI_BASE_URL', 'GROQ_BASE_URL', 'OPENAI_BASE_URL'];
beforeEach(() => { for (const key of keys) vi.stubEnv(key, ''); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('the default provider', () => {
  it('is Groq when Groq has a key, with its default model', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    expect(defaultProviderId()).toBe('groq');
    const provider = createProvider();
    expect(provider.id).toBe('groq');
    expect(provider.model).toBe('openai/gpt-oss-120b');
    expect(provider.baseUrl).toBe('https://api.groq.com/openai/v1');
  });

  it('is still Groq when both Groq and the gateway have keys', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test'); vi.stubEnv('FREELLMAPI_API_KEY', 'gateway');
    expect(createProvider().id).toBe('groq');
  });

  it('keeps a gateway-only deployment working: no Groq key, a gateway key, no provider named', () => {
    vi.stubEnv('FREELLMAPI_API_KEY', 'gateway'); vi.stubEnv('FREELLMAPI_MODEL', 'qwen3.8-27b');
    expect(defaultProviderId()).toBe('freellmapi');
    const provider = createProvider();
    expect(provider.id).toBe('freellmapi');
    expect(provider.model).toBe('qwen3.8-27b');
  });

  it('falls back to the offline mock, and says which keys would fix it, when nothing is configured', () => {
    expect(defaultProviderId()).toBe('groq');
    const provider = createProvider();
    expect(provider.id).toBe('mock');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('GROQ_API_KEY'));
  });

  it('does not fall back to the mock when a provider is named, even without a key', () => {
    expect(createProvider({ provider: 'groq' }).id).toBe('groq');
    vi.stubEnv('OVE_AI_PROVIDER', 'freellmapi');
    expect(createProvider().id).toBe('freellmapi');
  });

  it('lets a named provider win over the default, with the Groq key present', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test'); vi.stubEnv('FREELLMAPI_API_KEY', 'gateway');
    expect(createProvider({ provider: 'freellmapi' }).id).toBe('freellmapi');
    vi.stubEnv('OVE_AI_PROVIDER', 'openai'); vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    expect(createProvider().id).toBe('openai');
  });

  it('routes a model by its family and sends any other model name to the default', () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test');
    expect(createProvider({ model: 'gemini-2.0-flash' }).id).toBe('gemini');
    expect(createProvider({ model: 'claude-3-7-sonnet' }).id).toBe('anthropic');
    expect(createProvider({ model: 'gpt-4o' }).id).toBe('openai');
    expect(createProvider({ model: 'llama-3.3-70b-versatile' }).id).toBe('groq');
    expect(createProvider({ model: 'qwen/qwen3.8-27b' }).id).toBe('groq');
    expect(createProvider({ model: 'something-new' }).id).toBe('groq');
  });
});
