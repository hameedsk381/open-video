import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createProvider, VercelAiProvider, type AiProvider } from '@ove/ai';

describe('VercelAiProvider', () => {
  beforeEach(() => {
    vi.stubEnv('OVE_AI_PROVIDER', '');
    vi.stubEnv('OVE_AI_MODEL', '');
    vi.stubEnv('OVE_AI_BASE_URL', '');
    vi.stubEnv('OVE_AI_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('LITELLM_BASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('initializes OpenRouter with openrouter.ai/api/v1 baseUrl and custom model', () => {
    const provider = new VercelAiProvider({
      provider: 'openrouter',
      apiKey: 'sk-or-test',
      model: 'anthropic/claude-3.7-sonnet',
    });
    expect(provider.id).toBe('openrouter');
    expect(provider.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(provider.model).toBe('anthropic/claude-3.7-sonnet');
    expect(provider.driver).toBe('openai');
  });

  it('initializes LiteLLM with default localhost:4000/v1 or custom baseUrl', () => {
    const provider = new VercelAiProvider({
      provider: 'litellm',
      apiKey: 'sk-litellm-test',
      model: 'deepseek-r1',
    });
    expect(provider.id).toBe('litellm');
    expect(provider.baseUrl).toBe('http://localhost:4000/v1');
    expect(provider.model).toBe('deepseek-r1');
    expect(provider.driver).toBe('openai');
  });

  it('initializes Google Gemini with gemini-2.0-flash default', () => {
    const provider = new VercelAiProvider({
      provider: 'google',
      apiKey: 'gemini-key',
    });
    expect(provider.id).toBe('google');
    expect(provider.model).toBe('gemini-2.0-flash');
    expect(provider.driver).toBe('google');
  });

  it('initializes Anthropic with claude-3-7-sonnet default', () => {
    const provider = new VercelAiProvider({
      provider: 'anthropic',
      apiKey: 'sk-ant-test',
    });
    expect(provider.id).toBe('anthropic');
    expect(provider.model).toBe('claude-3-7-sonnet-20250219');
    expect(provider.driver).toBe('anthropic');
  });

  it('createProvider selects VercelAiProvider for openrouter, litellm, google, and custom', () => {
    const openrouter = createProvider({ provider: 'openrouter', apiKey: 'sk-or-test' });
    expect(openrouter).toBeInstanceOf(VercelAiProvider);
    expect(openrouter.id).toBe('openrouter');
    expect(openrouter.speak).toBeTypeOf('function'); // edge-tts attached

    const litellm = createProvider({ provider: 'litellm', apiKey: 'sk-litellm' });
    expect(litellm).toBeInstanceOf(VercelAiProvider);
    expect(litellm.id).toBe('litellm');

    const gemini = createProvider({ provider: 'gemini', apiKey: 'gemini-key' });
    expect(gemini).toBeInstanceOf(VercelAiProvider);
    expect(gemini.id).toBe('gemini');

    const custom = createProvider({ provider: 'custom', baseUrl: 'https://my-vllm.internal/v1', model: 'qwen-2.5-coder' });
    expect(custom).toBeInstanceOf(VercelAiProvider);
    expect(custom.model).toBe('qwen-2.5-coder');
  });

  it('createProvider automatically infers provider from model or baseUrl', () => {
    const fromGeminiModel = createProvider({ model: 'gemini-2.0-flash', apiKey: 'g-key' });
    expect(fromGeminiModel).toBeInstanceOf(VercelAiProvider);
    expect(fromGeminiModel.id).toBe('gemini');

    const fromOpenRouterUrl = createProvider({ baseUrl: 'https://openrouter.ai/api/v1', apiKey: 'or-key' });
    expect(fromOpenRouterUrl).toBeInstanceOf(VercelAiProvider);
    expect(fromOpenRouterUrl.id).toBe('openrouter');

    const fromLiteLlmUrl = createProvider({ baseUrl: 'http://localhost:4000/v1', apiKey: 'litellm-key' });
    expect(fromLiteLlmUrl).toBeInstanceOf(VercelAiProvider);
    expect(fromLiteLlmUrl.id).toBe('litellm');

    const fromCustomUrl = createProvider({ baseUrl: 'https://custom-ai.company.internal/v1', apiKey: 'custom-key', model: 'my-model' });
    expect(fromCustomUrl).toBeInstanceOf(VercelAiProvider);
    expect(fromCustomUrl.id).toBe('custom');
  });

  it('createProvider routes openai and anthropic through Vercel AI SDK when engine is vercel', () => {
    const openaiVercel = createProvider({ provider: 'openai', engine: 'vercel', apiKey: 'sk-openai' });
    expect(openaiVercel).toBeInstanceOf(VercelAiProvider);

    const anthropicVercel = createProvider({ provider: 'anthropic', engine: 'vercel', apiKey: 'sk-ant' });
    expect(anthropicVercel).toBeInstanceOf(VercelAiProvider);
  });

  it('executes chat completion through Vercel AI SDK', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      return new Response(JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"status":"ok"}' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }));

    const provider = new VercelAiProvider({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o'
    });

    const reply = await provider.chat([
      { role: 'system', content: 'You are an AI video designer.' },
      { role: 'user', content: 'Output the JSON.' }
    ]);

    expect(reply).toBe('{"status":"ok"}');
  });
});
