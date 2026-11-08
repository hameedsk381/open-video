// Each person's own keys for stock libraries (Pexels, Pixabay). Like the AI connection, the key a person saves in Settings is the only one
// their searches use, and it is never sent back to the browser: the page only gets the last four characters. With a secret
// (SETTINGS_SECRET, hosted) the file is encrypted (AES-256-GCM); without one (a person's own machine) it is a plain file only they can read.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FsProjectStore, Principal } from './index';

export const STOCK_PROVIDERS = ['pexels', 'pixabay'] as const;
export type StockProviderId = typeof STOCK_PROVIDERS[number];
export type StockKeys = Partial<Record<StockProviderId, string>>;

const FILE = '.stock-settings.json';

export class StockSettingsStore {
  constructor(private readonly store: FsProjectStore, private readonly secret?: string) {}

  private path(who: Principal) { return join(this.store.tenantRoot(who), FILE); }
  private key() { return createHash('sha256').update(this.secret ?? '').digest(); }

  get(who: Principal): StockKeys {
    let text: string;
    try { text = readFileSync(this.path(who), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw error; }
    try {
      const file = JSON.parse(text) as { keys?: StockKeys; iv?: string; tag?: string; data?: string };
      if (file.keys) return clean(file.keys);
      if (!this.secret) throw new Error('encrypted');
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(file.iv ?? '', 'base64'));
      decipher.setAuthTag(Buffer.from(file.tag ?? '', 'base64'));
      return clean(JSON.parse(Buffer.concat([decipher.update(Buffer.from(file.data ?? '', 'base64')), decipher.final()]).toString('utf8')));
    } catch {
      throw new Error('Your saved stock keys could not be read. Save them again in Settings.');
    }
  }

  /** What the page may see: whether each library is connected, and the last four characters of its key. */
  view(who: Principal): Record<StockProviderId, { connected: boolean; keyHint?: string }> {
    const keys = this.get(who);
    return Object.fromEntries(STOCK_PROVIDERS.map(id => [id, keys[id] ? { connected: true, keyHint: `••••${keys[id]!.slice(-4)}` } : { connected: false }])) as never;
  }

  set(who: Principal, provider: StockProviderId, apiKey: string): void { this.write(who, { ...this.get(who), [provider]: apiKey }); }

  clear(who: Principal, provider: StockProviderId): void {
    const { [provider]: _removed, ...rest } = this.get(who);
    if (Object.keys(rest).length) this.write(who, rest); else rmSync(this.path(who), { force: true });
  }

  private write(who: Principal, keys: StockKeys): void {
    mkdirSync(this.store.tenantRoot(who), { recursive: true });
    if (!this.secret) { writeFileSync(this.path(who), JSON.stringify({ v: 1, keys }), { mode: 0o600 }); return; }
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(keys), 'utf8'), cipher.final()]);
    writeFileSync(this.path(who), JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
  }
}

const clean = (keys: StockKeys): StockKeys => Object.fromEntries(STOCK_PROVIDERS.flatMap(id => (typeof keys?.[id] === 'string' && keys[id] ? [[id, keys[id]]] : []))) as StockKeys;
