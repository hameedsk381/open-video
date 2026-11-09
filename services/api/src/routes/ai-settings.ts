import { createProvider } from '@ove/ai';
import { optionalText } from '@ove/jobs';
import type { AiSettings } from '@ove/storage';
import { assertPublicHttpUrl } from '../url-guard';
import type { Ctx, Route } from '../types';

/** Providers a person can connect. `custom` is any OpenAI-compatible service and needs its address. */
export const AI_PROVIDERS = [
  { id: 'groq', label: 'Groq', model: 'openai/gpt-oss-120b' },
  { id: 'openai', label: 'OpenAI', model: 'gpt-4o' },
  { id: 'anthropic', label: 'Anthropic', model: 'claude-3-7-sonnet-20250219' },
  { id: 'google', label: 'Google Gemini', model: 'gemini-2.0-flash' },
  { id: 'openrouter', label: 'OpenRouter', model: 'anthropic/claude-3.7-sonnet' },
  { id: 'nvidia', label: 'NVIDIA NIM', model: 'nvidia/nemotron-3.5-bolt-e4b' },
  { id: 'custom', label: 'Other (OpenAI-compatible)', model: '' },
] as const;

/** Reads a settings request; a blank key keeps the one already saved when the provider has not changed. */
async function readSettings(body: Record<string, unknown>, saved: AiSettings | undefined): Promise<AiSettings> {
  const provider = optionalText(body.provider)?.toLowerCase() ?? '';
  if (!AI_PROVIDERS.some(item => item.id === provider)) throw new Error(`Choose a provider: ${AI_PROVIDERS.map(item => item.label).join(', ')}`);
  const model = optionalText(body.model) ?? '';
  if (!model || model.length > 200) throw new Error('Enter the model name to use');
  const baseUrl = optionalText(body.baseUrl);
  if (provider === 'custom' && !baseUrl) throw new Error('Enter the address of your service');
  // The server (and its workers) will call this address, so it must be a public one.
  if (baseUrl) await assertPublicHttpUrl(baseUrl);
  const apiKey = optionalText(body.apiKey) ?? (saved && saved.provider === provider ? saved.apiKey : '');
  if (!apiKey) throw new Error('Enter your API key');
  if (apiKey.length > 500) throw new Error('That API key is too long');
  return { provider, model, apiKey, ...(baseUrl ? { baseUrl } : {}) };
}

export function aiSettingsRoutes(): Route[] {
  const store = (c: Ctx) => { if (!c.deps.aiSettings) throw new Error('This server does not keep AI settings'); return c.deps.aiSettings; };
  return [
    { method: 'GET', path: '/api/ai-settings', handle: async c => c.json(200, { settings: store(c).view(c.who) ?? null, providers: AI_PROVIDERS }) },
    { method: 'POST', path: '/api/ai-settings', handle: async c => {
      const settings = await readSettings(await c.body(), store(c).get(c.who));
      store(c).set(c.who, settings);
      c.json(200, { settings: store(c).view(c.who) });
    } },
    { method: 'POST', path: '/api/ai-settings/clear', handle: async c => { store(c).clear(c.who); c.json(200, { ok: true }); } },
    // One tiny request with the person's own key, so a wrong key or model shows up here and not minutes into a video.
    { method: 'POST', path: '/api/ai-settings/test', handle: async c => {
      const settings = await readSettings(await c.body(), store(c).get(c.who));
      try {
        const provider = createProvider({ provider: settings.provider, model: settings.model, baseUrl: settings.baseUrl, apiKey: settings.apiKey });
        await provider.chat([{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 16, maxRetries: 0, signal: AbortSignal.timeout(25_000) });
        c.json(200, { ok: true });
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).split(settings.apiKey).join('••••').slice(0, 300);
        c.json(200, { ok: false, error: message });
      }
    } },
  ];
}

export const AI_JOB_KINDS = new Set(['compose', 'explainer', 'refine', 'narrate', 'transcribe', 'image', 'batch']);
