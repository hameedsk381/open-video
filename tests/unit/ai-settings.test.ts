import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiSettingsStore, FsProjectStore, LOCAL_PRINCIPAL } from '@ove/storage';

let root = '', store: FsProjectStore;
const other = { userId: 'u2', tenantId: 'tenant-2' };
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'ove-ai-settings-')); store = new FsProjectStore(root); });
afterAll(() => rm(root, { recursive: true, force: true }));

describe('AiSettingsStore', () => {
  const settings = { provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: 'gsk_secret_abcd1234' };

  it('keeps the key encrypted on disk and only shows its last four characters', async () => {
    const ai = new AiSettingsStore(store, 'a-long-random-secret');
    expect(ai.get(LOCAL_PRINCIPAL)).toBeUndefined();
    ai.set(LOCAL_PRINCIPAL, settings);
    const onDisk = await readFile(join(root, '.ai-settings.json'), 'utf8');
    expect(onDisk).not.toContain('gsk_secret'); expect(onDisk).not.toContain('gpt-oss');
    expect(ai.get(LOCAL_PRINCIPAL)).toEqual(settings);
    expect(ai.view(LOCAL_PRINCIPAL)).toEqual({ provider: 'groq', model: 'openai/gpt-oss-120b', keyHint: '••••1234' });
  });

  it('is private to each person and can be removed', () => {
    const ai = new AiSettingsStore(store, 'a-long-random-secret');
    expect(ai.get(other)).toBeUndefined();
    ai.set(other, { ...settings, apiKey: 'other-key-9999', baseUrl: 'https://example.com/v1' });
    expect(ai.view(other)).toMatchObject({ keyHint: '••••9999', baseUrl: 'https://example.com/v1' });
    expect(ai.get(LOCAL_PRINCIPAL)?.apiKey).toBe(settings.apiKey);
    ai.clear(other);
    expect(ai.get(other)).toBeUndefined();
  });

  it('refuses to store without a secret, and does not read with the wrong one', () => {
    expect(() => new AiSettingsStore(store).set(LOCAL_PRINCIPAL, settings)).toThrow(/SETTINGS_SECRET/);
    expect(() => new AiSettingsStore(store, 'a different secret').get(LOCAL_PRINCIPAL)).toThrow(/could not be read/);
  });
});
