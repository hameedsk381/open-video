import { readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { ensureBaseline, saveRevision, type AiProvider, type ComposeOptions, type NarrateOptions, type NarrateResult, type RevisionMeta, type SmartMode, type SmartResult } from '@ove/ai';
import { attachCaptions, loadComposition, type Composition } from '@ove/core';
import type { FsProjectStore, Principal, StoredAsset } from '@ove/storage';
import { folderName, optionalText, textOf } from './input';

/** How a job names, finds and describes files. The local implementation maps names to folders on disk; a worker maps them to a scratch folder. */
export interface JobPaths {
  /** A path inside the requester's space (relative values resolve from `base`). */
  resolve(value: string, label: string, base?: string): string;
  /** `project/path` style name of a file, as shown to people. */
  relative(file: string): string;
  urlFor(file: string): string;
  /** The requester's tenant id — job-side keys (object storage, external services) must be prefixed with it. */
  tenantId: string;
  /** The project a file belongs to. */
  idOf(file: string): string;
  projectDir(value: unknown, brief: string): string;
  fileInside(value: unknown, label: string): string;
  /** What a job reports about a file it made. */
  resultFile(file: string): { file: string; relative: string; url: string };
  readJson(file: string): Promise<any>;
  loadForRender(file: string): Promise<{ raw: any; composition: Composition; baseDir: string }>;
  writeComposition(file: string, composition: Composition, meta?: RevisionMeta): Promise<void>;
}

/** Work the job code does not own: picking a template and drawing a thumbnail depend on files that ship with the command line. */
export type JobCapabilities = {
  /** The host's router over the shared template catalogue (@ove/ai's composeSmart); it also copies a template's own files. */
  composeSmart(provider: AiProvider, options: ComposeOptions, mode: SmartMode): Promise<SmartResult>;
  narrateSmart(provider: AiProvider, composed: { template?: string }, options: NarrateOptions & { brief: string; composition: NonNullable<NarrateOptions['composition']> }): Promise<NarrateResult>;
  makeThumbnail(raw: any, values: Record<string, unknown>, baseDir: string, options: { frame?: number; title?: string; width?: number }): Promise<{ png: Buffer; frame: number; width: number; height: number }>;
};

export type JobEnv = {
  who: Principal;
  paths: JobPaths;
  /** The AI provider, or the reason there is none. */
  provider(): AiProvider;
  /** Who made a revision, for the history. */
  providerInfo(): { provider?: string; model?: string };
  capabilities: JobCapabilities;
  /** The pictures, video and audio a project holds. */
  assets(projectId: string): Promise<StoredAsset[]>;
  /** Only where people may name files anywhere on their own machine (the local studio). Hosted use leaves it out, and jobs that need it refuse. */
  local?: { inputFile(value: unknown, label: string, extensions: string[]): string };
};

/** Paths for the folder store: every name is resolved inside the principal's space. */
export function createFsPaths(store: FsProjectStore, who: Principal, info: () => { provider?: string; model?: string } = () => ({})): JobPaths {
  const relative = (file: string) => store.relative(who, file);
  const resolveIn = (value: string, label: string, base?: string) => store.resolve(who, value, label, base);
  const readJson = async (file: string) => JSON.parse((await readFile(file, 'utf8')).replace(/^﻿/, ''));
  const paths: JobPaths = {
    tenantId: who.tenantId,
    resolve: resolveIn, relative,
    urlFor: file => '/files/' + relative(file).split('/').map(encodeURIComponent).join('/'),
    idOf: file => relative(file).split('/')[0]!,
    projectDir: (value, brief) => resolveIn(optionalText(value) ?? folderName(brief), 'folder'),
    fileInside: (value, label) => resolveIn(textOf(value, label), label),
    resultFile: file => ({ file, relative: relative(file), url: paths.urlFor(file) }),
    readJson,
    async loadForRender(file) {
      const raw = await readJson(file), baseDir = dirname(file);
      return { raw, composition: await attachCaptions(loadComposition(raw), baseDir) as Composition, baseDir };
    },
    // With `meta`, the change is kept as a numbered revision (and what was there before, the first time).
    async writeComposition(file, composition, meta) {
      if (meta) await ensureBaseline(file);
      await writeFile(file, JSON.stringify({ $schema: './composition.schema.json', ...composition }, null, 2) + '\n');
      if (meta) await saveRevision(file, { ...info(), ...meta });
    },
  };
  return paths;
}

/** Files you already have may be anywhere on disk, but only the kinds the job uses: audio is sent to the provider, rows are read as data. */
export function localInputFile(value: unknown, label: string, extensions: string[]): string {
  const text = textOf(value, label), file = isAbsolute(text) ? resolve(text) : resolve(process.cwd(), text);
  if (!extensions.includes(extname(file).toLowerCase())) throw new Error(`${label} must be a ${extensions.join(', ')} file`);
  return file;
}
