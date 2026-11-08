// Where projects live. A project is a folder (composition.json, assets/, history/). The studio reaches projects only through ProjectStore, and
// every call says who is asking (a Principal), so the local folder store here can be replaced by a database and object storage without
// touching routes or jobs. Jobs that need real files (Chromium, ffmpeg) ask for a workdir: a local folder holding the project's files.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative as relativePath, resolve, sep } from 'node:path';
import { ensureBaseline, listRevisions, restoreRevision, saveRevision, type Revision, type RevisionMeta } from '@ove/ai';

export type { Revision, RevisionMeta };
/** Who is asking. Local use has one fixed principal; a hosted API makes one per signed-in user. */
export type Principal = { userId: string; tenantId: string };
export const LOCAL_PRINCIPAL: Principal = { userId: 'local', tenantId: 'local' };
/** `sha256` and `addedAt` are recorded when a file is uploaded; files placed in the folder by hand have neither. */
export type StoredAsset = { name: string; path: string; kind: string; bytes: number; sha256?: string; addedAt?: string };
/** What an upload records about a file, kept in assets/.manifest.json beside the files so the hash is computed once, not on every listing. */
type UploadRecord = { sha256: string; bytes: number; addedAt: string; originalName: string };
const manifestPath = (folder: string) => join(folder, '.manifest.json');
async function readManifest(folder: string): Promise<Record<string, UploadRecord>> { try { const parsed = JSON.parse(await readFile(manifestPath(folder), 'utf8')); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; } }
/** The JSON files a project keeps at its root, each with its own revision history. */
export type ProjectFile = 'composition.json' | 'production.json';

export type TrashedProject = { key: string; id: string; name: string; trashedAt: number };
const trashKey = /^(.+)-(\d{13})$/;

export interface ProjectStore {
  /** Folder names under the principal's space; not every one is a valid project. */
  ids(who: Principal): Promise<string[]>;
  exists(who: Principal, id: string): Promise<boolean>;
  /** Makes an empty project folder named after `name` and gives its id (a name that is taken gets -2, -3, ...). */
  create(who: Principal, name: string): Promise<string>;
  readRaw(who: Principal, id: string): Promise<any>;
  /** With `meta`, the change is kept as a numbered revision (and what was there before, the first time). */
  writeRaw(who: Principal, id: string, raw: unknown, meta?: RevisionMeta): Promise<void>;
  /** The production manifest, or undefined while the project has only a composition. */
  readProduction(who: Principal, id: string): Promise<any | undefined>;
  writeProduction(who: Principal, id: string, raw: unknown, meta?: RevisionMeta): Promise<void>;
  productionModified(who: Principal, id: string): Promise<number | undefined>;
  modified(who: Principal, id: string): Promise<number>;
  duplicate(who: Principal, id: string, rename: (raw: any) => any): Promise<string>;
  /** Moves the project aside so it can be brought back by hand. */
  trash(who: Principal, id: string): Promise<void>;
  /** What trash() moved aside, newest first. `key` is what untrash() takes. */
  trashed(who: Principal): Promise<TrashedProject[]>;
  /** Brings a trashed project back under its old name (-2, -3… if that name is taken again) and gives its id. */
  untrash(who: Principal, key: string): Promise<string>;
  assets(who: Principal, id: string): Promise<StoredAsset[]>;
  putAsset(who: Principal, id: string, name: string, bytes: Buffer): Promise<StoredAsset[]>;
  /** A file the product itself ships that a project's layers draw from (a block's React bundle). Never reachable from an upload: only a named bundle, written by the server. */
  putSupportFile(who: Principal, id: string, name: string, bytes: Buffer): Promise<void>;
  /** The saved thumbnail, only while it is newer than the composition. */
  thumb(who: Principal, id: string): Promise<Buffer | undefined>;
  putThumb(who: Principal, id: string, png: Buffer): Promise<void>;
  revisions(who: Principal, id: string, file?: ProjectFile): Promise<Revision[]>;
  restore(who: Principal, id: string, n: number, file?: ProjectFile): Promise<Revision>;
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
  private file(who: Principal, id: string) { return this.named(who, id, 'composition.json'); }
  /** One of the project's root JSON files; anything else is refused rather than turned into a path. */
  private named(who: Principal, id: string, file: ProjectFile) {
    if (file !== 'composition.json' && file !== 'production.json') throw new Error(`"${file}" is not one of this project's files`);
    return join(this.projectDir(who, id), file);
  }

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
  private async readJson(file: string) { return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  private async writeJson(file: string, raw: unknown, meta?: RevisionMeta) {
    if (meta) await ensureBaseline(file);
    await writeFile(file, JSON.stringify(raw, null, 2) + '\n');
    if (meta) await saveRevision(file, meta);
  }
  async readRaw(who: Principal, id: string) { return this.readJson(this.file(who, id)); }
  async writeRaw(who: Principal, id: string, raw: unknown, meta?: RevisionMeta) { await this.writeJson(this.file(who, id), raw, meta); }
  async readProduction(who: Principal, id: string) {
    try { return await this.readJson(this.named(who, id, 'production.json')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async writeProduction(who: Principal, id: string, raw: unknown, meta?: RevisionMeta) { await this.writeJson(this.named(who, id, 'production.json'), raw, meta); }
  async productionModified(who: Principal, id: string) {
    try { return (await stat(this.named(who, id, 'production.json'))).mtimeMs; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  async modified(who: Principal, id: string) {
    const [composition, production] = await Promise.all([stat(this.file(who, id)).then(info => info.mtimeMs), this.productionModified(who, id)]);
    return Math.max(composition, production ?? 0);
  }

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
  async trashed(who: Principal): Promise<TrashedProject[]> {
    const trash = join(this.tenantRoot(who), '.trash'), out: TrashedProject[] = [];
    for (const entry of await readdir(trash, { withFileTypes: true }).catch(() => [])) {
      const match = entry.isDirectory() ? trashKey.exec(entry.name) : null; if (!match) continue;
      const name = await this.readJson(join(trash, entry.name, 'composition.json')).then(raw => typeof raw?.name === 'string' ? raw.name : match[1]!, () => match[1]!);
      out.push({ key: entry.name, id: match[1]!, name, trashedAt: Number(match[2]) });
    }
    return out.sort((a, b) => b.trashedAt - a.trashedAt);
  }
  async untrash(who: Principal, key: string) {
    const match = typeof key === 'string' ? trashKey.exec(key) : null; if (!match || !idPattern.test(key)) throw new Error('That is not a trashed project');
    const space = this.tenantRoot(who), from = join(space, '.trash', key);
    if (!await stat(from).then(info => info.isDirectory(), () => false)) throw new Error('That project is no longer in the trash');
    const taken = new Set((await readdir(space).catch(() => [])).map(String)); let id = match[1]!, n = 1; while (taken.has(id)) id = `${match[1]}-${++n}`;
    await rename(from, join(space, id));
    return id;
  }

  async assets(who: Principal, id: string): Promise<StoredAsset[]> {
    const folder = join(this.projectDir(who, id), 'assets'), out: StoredAsset[] = [], manifest = await readManifest(folder);
    for (const name of await readdir(folder).catch(() => [] as string[])) {
      const kind = assetKinds[extname(name).toLowerCase()]; if (!kind) continue;
      const bytes = (await stat(join(folder, name))).size, record = manifest[name];
      // A file whose size no longer matches its record was replaced by hand: the old hash would be a false statement about it.
      out.push({ name, path: `assets/${name}`, kind, bytes, ...(record && record.bytes === bytes ? { sha256: record.sha256, addedAt: record.addedAt } : {}) });
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
    const manifest = await readManifest(folder);
    manifest[final] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, addedAt: new Date().toISOString(), originalName: name };
    await writeFile(manifestPath(folder), JSON.stringify(manifest, null, 2) + '\n');
    return this.assets(who, id);
  }

  async putSupportFile(who: Principal, id: string, name: string, bytes: Buffer) {
    if (!/^[a-z0-9][a-z0-9._-]{0,60}\.bundle\.js$/.test(name)) throw new Error(`"${name}" is not a support file name`);
    const dir = this.projectDir(who, id); await mkdir(dir, { recursive: true });
    await writeFile(join(dir, name), bytes);
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
  revisions(who: Principal, id: string, file: ProjectFile = 'composition.json') { return listRevisions(this.named(who, id, file)); }
  restore(who: Principal, id: string, n: number, file: ProjectFile = 'composition.json') { return restoreRevision(this.named(who, id, file), n); }
  async workdir(who: Principal, id: string) { return { dir: this.projectDir(who, id), commit: async () => {} }; }
}

export { S3Client, loadS3ConfigFromEnv, type S3Config, type S3UploadResult } from './s3';
