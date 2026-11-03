// Where projects live. A project is a folder (composition.json, assets/, history/). The studio reaches projects only through ProjectStore, and
// every call says who is asking (a Principal), so the local folder store here can be replaced by a database and object storage without
// touching routes or jobs. Jobs that need real files (Chromium, ffmpeg) ask for a workdir: a local folder holding the project's files.
import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative as relativePath, resolve, sep } from 'node:path';
import { ensureBaseline, listRevisions, restoreRevision, saveRevision, type Revision, type RevisionMeta } from '@ove/ai';

export type { Revision, RevisionMeta };
/** Who is asking. Local use has one fixed principal; a hosted API makes one per signed-in user. */
export type Principal = { userId: string; tenantId: string };
export const LOCAL_PRINCIPAL: Principal = { userId: 'local', tenantId: 'local' };
export type StoredAsset = { name: string; path: string; kind: string; bytes: number };

export interface ProjectStore {
  /** Folder names under the principal's space; not every one is a valid project. */
  ids(who: Principal): Promise<string[]>;
  exists(who: Principal, id: string): Promise<boolean>;
  /** Makes an empty project folder named after `name` and gives its id (a name that is taken gets -2, -3, ...). */
  create(who: Principal, name: string): Promise<string>;
  readRaw(who: Principal, id: string): Promise<any>;
  /** With `meta`, the change is kept as a numbered revision (and what was there before, the first time). */
  writeRaw(who: Principal, id: string, raw: unknown, meta?: RevisionMeta): Promise<void>;
  modified(who: Principal, id: string): Promise<number>;
  duplicate(who: Principal, id: string, rename: (raw: any) => any): Promise<string>;
  /** Moves the project aside so it can be brought back by hand. */
  trash(who: Principal, id: string): Promise<void>;
  assets(who: Principal, id: string): Promise<StoredAsset[]>;
  putAsset(who: Principal, id: string, name: string, bytes: Buffer): Promise<StoredAsset[]>;
  /** The saved thumbnail, only while it is newer than the composition. */
  thumb(who: Principal, id: string): Promise<Buffer | undefined>;
  putThumb(who: Principal, id: string, png: Buffer): Promise<void>;
  revisions(who: Principal, id: string): Promise<Revision[]>;
  restore(who: Principal, id: string, n: number): Promise<Revision>;
  /** Bytes this principal's projects take up on disk. */
  usedBytes(who: Principal): Promise<number>;
  /** A local folder with the project's files, for work that needs real files. Call commit() when the work wrote something. */
  workdir(who: Principal, id: string): Promise<{ dir: string; commit(): Promise<void> }>;
}

export const assetKinds: Record<string, string> = { '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image', '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.mkv': 'video', '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio', '.ogg': 'audio', '.aac': 'audio', '.flac': 'audio' };
export const slugify = (text: string) => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'untitled';

/** True when target is a file or folder strictly below root (root itself is not allowed). */
export function within(root: string, target: string): boolean {
  const rel = relativePath(resolve(root), resolve(target));
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
}

const tenantPattern = /^[a-zA-Z0-9_-]{1,64}$/;
const idPattern = /^[^\\/:*?"<>|\0]+$/;

/** Projects as folders under one root. The local principal uses the root itself; any other tenant gets its own folder, `_tenants/<id>`. */
export class FsProjectStore implements ProjectStore {
  readonly root: string;
  constructor(root: string) { this.root = resolve(root); }

  /** The folder this principal's projects live in. */
  tenantRoot(who: Principal): string {
    if (who.tenantId === LOCAL_PRINCIPAL.tenantId) return this.root;
    if (!tenantPattern.test(who.tenantId)) throw new Error('That account name is not valid');
    return join(this.root, '_tenants', who.tenantId);
  }
  /** A path inside the principal's space: relative values resolve from `base` (default: the space itself), absolute ones must already be inside. */
  resolve(who: Principal, value: string, label = 'path', base?: string): string {
    const space = this.tenantRoot(who), target = isAbsolute(value) ? resolve(value) : resolve(base ?? space, value);
    if (!within(space, target)) throw new Error(`${label} must be inside ${space}`);
    return target;
  }
  /** The path as the studio shows and serves it: forward slashes, relative to the principal's space. */
  relative(who: Principal, file: string): string { return relativePath(this.tenantRoot(who), file).split(sep).join('/'); }
  projectDir(who: Principal, id: string): string {
    if (typeof id !== 'string' || !id || id.startsWith('.') || !idPattern.test(id)) throw new Error('That project name is not valid');
    return this.resolve(who, id, 'project');
  }
  private file(who: Principal, id: string) { return join(this.projectDir(who, id), 'composition.json'); }

  async ids(who: Principal) {
    const entries = await readdir(this.tenantRoot(who), { withFileTypes: true }).catch(() => []);
    return entries.filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_')).map(entry => entry.name);
  }
  async exists(who: Principal, id: string) { return stat(this.file(who, id)).then(info => info.isFile(), () => false); }

  async create(who: Principal, name: string) {
    const space = this.tenantRoot(who); await mkdir(space, { recursive: true });
    const taken = new Set((await readdir(space).catch(() => [])).map(String)), base = slugify(name);
    let id = base, n = 1; while (taken.has(id)) id = `${base}-${++n}`;
    await mkdir(join(space, id, 'assets'), { recursive: true });
    return id;
  }
  async readRaw(who: Principal, id: string) { return JSON.parse((await readFile(this.file(who, id), 'utf8')).replace(/^﻿/, '')); }
  async writeRaw(who: Principal, id: string, raw: unknown, meta?: RevisionMeta) {
    const file = this.file(who, id);
    if (meta) await ensureBaseline(file);
    await writeFile(file, JSON.stringify(raw, null, 2) + '\n');
    if (meta) await saveRevision(file, meta);
  }
  async modified(who: Principal, id: string) { return (await stat(this.file(who, id))).mtimeMs; }

  async duplicate(who: Principal, id: string, rename: (raw: any) => any) {
    const raw = await this.readRaw(who, id), copy = await this.create(who, `${id.replace(/-\d+$/, '')}-copy`);
    // History and the saved thumbnail belong to the original.
    await cp(this.projectDir(who, id), this.projectDir(who, copy), { recursive: true, filter: source => !/[\\/](history|\.studio)([\\/]|$)/.test(source) });
    await writeFile(this.file(who, copy), JSON.stringify(rename(raw), null, 2) + '\n');
    return copy;
  }
  async trash(who: Principal, id: string) {
    const dir = this.projectDir(who, id), trash = join(this.tenantRoot(who), '.trash'); await mkdir(trash, { recursive: true });
    await rename(dir, join(trash, `${id}-${Date.now()}`));
  }

  async assets(who: Principal, id: string): Promise<StoredAsset[]> {
    const folder = join(this.projectDir(who, id), 'assets'), out: StoredAsset[] = [];
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      const kind = assetKinds[extname(name).toLowerCase()]; if (!kind) continue;
      out.push({ name, path: `assets/${name}`, kind, bytes: (await stat(join(folder, name))).size });
    }
    return out;
  }
  async putAsset(who: Principal, id: string, name: string, bytes: Buffer) {
    const clean = name.split(/[\\/]/).pop()!.replace(/[^A-Za-z0-9._-]+/g, '-');
    if (!assetKinds[extname(clean).toLowerCase()]) throw new Error(`Pictures, video and audio only (${Object.keys(assetKinds).join(' ')})`);
    const folder = join(this.projectDir(who, id), 'assets'); await mkdir(folder, { recursive: true });
    const taken = new Set(await readdir(folder).catch(() => [])); let final = clean;
    for (let n = 2; taken.has(final); n++) final = clean.replace(/(\.[^.]*)?$/, `-${n}$1`);
    await writeFile(join(folder, final), bytes);
    return this.assets(who, id);
  }

  async thumb(who: Principal, id: string) {
    const cache = join(this.projectDir(who, id), '.studio', 'thumb.png');
    const [source, cached] = await Promise.all([stat(this.file(who, id)), stat(cache).catch(() => undefined)]);
    return cached && cached.mtimeMs >= source.mtimeMs ? readFile(cache) : undefined;
  }
  async putThumb(who: Principal, id: string, png: Buffer) {
    const cache = join(this.projectDir(who, id), '.studio', 'thumb.png');
    await mkdir(dirname(cache), { recursive: true }); await writeFile(cache, png);
  }

  async usedBytes(who: Principal) {
    const walk = async (dir: string): Promise<number> => { let total = 0; for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) { const path = join(dir, entry.name); total += entry.isDirectory() ? (entry.name === '_tenants' ? 0 : await walk(path)) : (await stat(path).catch(() => ({ size: 0 }))).size; } return total; };
    return walk(this.tenantRoot(who));
  }
  revisions(who: Principal, id: string) { return listRevisions(this.file(who, id)); }
  restore(who: Principal, id: string, n: number) { return restoreRevision(this.file(who, id), n); }
  async workdir(who: Principal, id: string) { return { dir: this.projectDir(who, id), commit: async () => {} }; }
}
