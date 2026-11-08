import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsProjectStore, LOCAL_PRINCIPAL, StockSettingsStore } from '@ove/storage';

// A person's stock keys: kept per person, encrypted when the server has a secret, and only the last four characters ever shown.
let dir: string, store: FsProjectStore;
const file = () => join(store.tenantRoot(LOCAL_PRINCIPAL), '.stock-settings.json');
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-stock-keys-')); store = new FsProjectStore(dir); });
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('stock keys', () => {
  it('start empty, and show only the last four characters', () => {
    const keys = new StockSettingsStore(store, 'server-secret');
    expect(keys.get(LOCAL_PRINCIPAL)).toEqual({});
    expect(keys.view(LOCAL_PRINCIPAL)).toEqual({ pexels: { connected: false }, pixabay: { connected: false } });
    keys.set(LOCAL_PRINCIPAL, 'pexels', 'abcd-1234-WXYZ');
    expect(keys.view(LOCAL_PRINCIPAL)).toEqual({ pexels: { connected: true, keyHint: '••••WXYZ' }, pixabay: { connected: false } });
  });

  it('are encrypted on disk when the server has a secret, and unreadable under another', () => {
    new StockSettingsStore(store, 'server-secret').set(LOCAL_PRINCIPAL, 'pixabay', 'abcd-1234-WXYZ');
    expect(readFileSync(file(), 'utf8')).not.toContain('abcd-1234-WXYZ');
    expect(new StockSettingsStore(store, 'server-secret').get(LOCAL_PRINCIPAL)).toEqual({ pixabay: 'abcd-1234-WXYZ' });
    expect(() => new StockSettingsStore(store, 'another-secret').get(LOCAL_PRINCIPAL)).toThrow(/could not be read/);
    expect(() => new StockSettingsStore(store).get(LOCAL_PRINCIPAL)).toThrow(/could not be read/);
  });

  it('are a plain file on a person\'s own machine, where there is no secret', () => {
    const keys = new StockSettingsStore(store);
    keys.set(LOCAL_PRINCIPAL, 'pexels', 'abcd-1234-WXYZ');
    expect(new StockSettingsStore(store).get(LOCAL_PRINCIPAL)).toEqual({ pexels: 'abcd-1234-WXYZ' });
  });

  it('keep each library separate, and the file goes when the last key does', () => {
    const keys = new StockSettingsStore(store, 'server-secret');
    keys.set(LOCAL_PRINCIPAL, 'pexels', 'pexels-key-0001'); keys.set(LOCAL_PRINCIPAL, 'pixabay', 'pixabay-key-0002');
    keys.clear(LOCAL_PRINCIPAL, 'pexels');
    expect(keys.get(LOCAL_PRINCIPAL)).toEqual({ pixabay: 'pixabay-key-0002' });
    keys.clear(LOCAL_PRINCIPAL, 'pixabay');
    expect(existsSync(file())).toBe(false); expect(keys.get(LOCAL_PRINCIPAL)).toEqual({});
  });

  it('are kept per person', () => {
    const keys = new StockSettingsStore(store, 'server-secret'), other = { userId: 'u2', tenantId: 't2' };
    keys.set(LOCAL_PRINCIPAL, 'pexels', 'mine-key-000001');
    expect(keys.get(other)).toEqual({});
  });
});
