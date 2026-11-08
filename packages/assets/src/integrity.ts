// Telling a file from the one that was approved: a hash recorded when an asset is ingested, checked when the project is validated.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { Asset, AssetNote } from '@ove/schema';

/** SHA-256 of some bytes, as 64 lowercase hex digits (the form `asset.sha256` takes). */
export const sha256Of = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Hash and size of a file, read as a stream so a large video is never held in memory. */
export async function fingerprintFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const hash = createHash('sha256');
  let bytes = 0;
  await new Promise<void>((done, fail) => {
    createReadStream(path).on('data', chunk => { hash.update(chunk); bytes += chunk.length; }).on('end', () => done()).on('error', fail);
  });
  return { sha256: hash.digest('hex'), bytes };
}

const local = (src: string) => !/^([a-z][a-z0-9+.-]{1,}:)/i.test(src) || /^[a-z]:[\\/]/i.test(src);

/**
 * Compares each asset that records a hash with the file now on disk. Assets without a hash, URLs and built-in sounds are not checked.
 * A changed file is a warning, not an error: the person may have replaced it on purpose, and the note says the approval is for the old bytes.
 */
export async function verifyAssetHashes(assets: readonly Pick<Asset, 'id' | 'src' | 'sha256'>[], baseDir: string): Promise<AssetNote[]> {
  const notes: AssetNote[] = [];
  for (const asset of assets) {
    if (!asset.sha256 || !local(asset.src)) continue;
    const path = isAbsolute(asset.src) ? asset.src : resolve(baseDir, asset.src);
    try { await stat(path); } catch { notes.push({ assetId: asset.id, severity: 'warning', code: 'file-missing', message: `Asset "${asset.id}" records a hash but its file ${asset.src} is not there` }); continue; }
    const now = await fingerprintFile(path);
    if (now.sha256 !== asset.sha256) notes.push({ assetId: asset.id, severity: 'warning', code: 'hash-mismatch', message: `Asset "${asset.id}" (${asset.src}) is not the file that was recorded: its contents have changed since it was ingested or approved` });
  }
  return notes;
}
