// Each person's own AI connection: which provider and model to use, and their key for it. The service holds no AI key of its own;
// the key a person saves in Settings is the only one their jobs use. It is kept encrypted (AES-256-GCM) in the person's own space,
// under a secret the operator sets (SETTINGS_SECRET), and is never sent back to the browser: the page only gets the last four characters.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FsProjectStore, Principal } from './index';

export type AiSettings = { provider: string; model: string; apiKey: string; baseUrl?: string };
export type AiSettingsView = { provider: string; model: string; baseUrl?: string; keyHint: string };

const FILE = '.ai-settings.json';

export class AiSettingsStore {
  constructor(private readonly store: FsProjectStore, private readonly secret?: string) {}

  private path(who: Principal) { return join(this.store.tenantRoot(who), FILE); }
  private key() {
    if (!this.secret) throw new Error('SETTINGS_SECRET is not set on the server, so AI settings cannot be stored');
    return createHash('sha256').update(this.secret).digest();
  }

  get(who: Principal): AiSettings | undefined {
    let text: string;
    try { text = readFileSync(this.path(who), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
    try {
      const box = JSON.parse(text) as { iv: string; tag: string; data: string };
      const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(box.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data, 'base64')), decipher.final()]).toString('utf8')) as AiSettings;
    } catch (error) {
      if (error instanceof Error && /SETTINGS_SECRET/.test(error.message)) throw error;
      throw new Error('Your saved AI settings could not be read. Save them again in Settings.');
    }
  }

  view(who: Principal): AiSettingsView | undefined {
    const settings = this.get(who);
    return settings && { provider: settings.provider, model: settings.model, ...(settings.baseUrl ? { baseUrl: settings.baseUrl } : {}), keyHint: `••••${settings.apiKey.slice(-4)}` };
  }

  set(who: Principal, settings: AiSettings): void {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()]);
    mkdirSync(this.store.tenantRoot(who), { recursive: true });
    writeFileSync(this.path(who), JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 });
  }

  clear(who: Principal): void { rmSync(this.path(who), { force: true }); }
}
