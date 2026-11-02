// The cache folder: OVE_CACHE_DIR, or ove-video-cache in the system temp folder. Each kind of entry has its own subfolder:
//   media/  measured lengths and phrases of audio and video (JSON per file version)
//   video/  decoded video frames (a folder per source, size and fps)
//   sfx/    synthesised built-in sound effects
//   other   video frame folders left in the root by versions that kept them there (named by a 32-character hash). Nothing else in
//           the root is ever listed or removed, so pointing OVE_CACHE_DIR at a shared folder is safe.
// Entries are touched when used, so `ove cache clean --older-than 30d` keeps what recent renders still use.
import { readdir, rm, stat, utimes } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
export const cacheKinds = ['media', 'video', 'sfx'] as const;
export type CacheKind = typeof cacheKinds[number];
export const cacheRoot = () => process.env.OVE_CACHE_DIR ?? join(tmpdir(), 'ove-video-cache');
export const cacheDir = (kind: CacheKind) => join(cacheRoot(), kind);
/** Marks an entry as used now (its modification time), for cleaning by age. Missing entries are ignored. */
export const touchCacheEntry = (path: string) => { const now = new Date(); return utimes(path, now, now).catch(() => {}); };
const sizeOf = async (path: string): Promise<number> => { const info = await stat(path).catch(() => undefined); if (!info) return 0; if (!info.isDirectory()) return info.size;
  let total = 0; for (const name of await readdir(path).catch(() => [] as string[])) total += await sizeOf(join(path, name)); return total; };
type Listed = CacheKind | 'other';
const legacyEntry = /^[0-9a-f]{32}(\.partial-[0-9a-f-]{36})?$/;
const entries = async (kind: Listed) => { const dir = kind === 'other' ? cacheRoot() : cacheDir(kind); const names = (await readdir(dir).catch(() => [] as string[])).filter(name => kind !== 'other' || legacyEntry.test(name));
  return Promise.all(names.map(async name => { const path = join(dir, name), info = await stat(path).catch(() => undefined); return { path, used: info?.mtimeMs ?? 0 }; })); };
export type CacheUsage = { root: string; kinds: { kind: Listed; entries: number; bytes: number }[]; bytes: number };
export async function cacheUsage(): Promise<CacheUsage> { const kinds = await Promise.all([...cacheKinds, 'other' as const].map(async kind => { const list = await entries(kind); let bytes = 0; for (const e of list) bytes += await sizeOf(e.path); return { kind, entries: list.length, bytes }; }));
  return { root: cacheRoot(), kinds, bytes: kinds.reduce((n, k) => n + k.bytes, 0) }; }
/** Removes cache entries last used before `olderThanMs` ago (all of them when not given). Returns what was freed. */
export async function cleanCache(options: { olderThanMs?: number; kinds?: readonly Listed[] } = {}): Promise<{ entries: number; bytes: number }> { const cutoff = options.olderThanMs === undefined ? Infinity : Date.now() - options.olderThanMs; let removed = 0, bytes = 0;
  for (const kind of options.kinds ?? [...cacheKinds, 'other' as const]) for (const e of await entries(kind)) if (e.used < cutoff) { bytes += await sizeOf(e.path); await rm(e.path, { recursive: true, force: true }); removed++; }
  return { entries: removed, bytes }; }
