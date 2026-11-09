/**
 * The Indic voices: which released model speaks each language, and getting one onto the machine on first use.
 *
 * Eleven small models, one per language (~88 MB each), published on Hugging Face under CC-BY-4.0. The files live in a
 * cache folder (`~/.cache/motionrender/tts/<language>`, or `OVE_TTS_DIR`), written atomically and checked against the
 * model's own manifest, so an interrupted download never leaves a half-readable model behind. `OVE_TTS_MIRROR` points
 * the download at a mirror, and a folder with the files already in it works offline.
 */
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type IndicLanguage = 'hi' | 'bn' | 'ta' | 'te' | 'ml' | 'gu' | 'pa' | 'kn' | 'mr' | 'as' | 'or';

export type IndicLanguageInfo = {
  code: IndicLanguage;
  /** English name, for menus and messages. */
  name: string;
  /** The language's own name, for a voice picker that shows it. */
  native: string;
  script: string;
  repo: string;
};

const LANGUAGES: IndicLanguageInfo[] = [
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', script: 'Devanagari', repo: 'sulabhkatiyar/indic-tiny-tts-hindi' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', script: 'Bengali', repo: 'sulabhkatiyar/indic-tiny-tts-bengali' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', script: 'Devanagari', repo: 'sulabhkatiyar/indic-tiny-tts-marathi' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', script: 'Gujarati', repo: 'sulabhkatiyar/indic-tiny-tts-gujarati' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Gurmukhi', repo: 'sulabhkatiyar/indic-tiny-tts-punjabi' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', script: 'Tamil', repo: 'sulabhkatiyar/indic-tiny-tts-tamil' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', script: 'Telugu', repo: 'sulabhkatiyar/indic-tiny-tts-telugu' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', script: 'Kannada', repo: 'sulabhkatiyar/indic-tiny-tts-kannada' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', script: 'Malayalam', repo: 'sulabhkatiyar/indic-tiny-tts-malayalam' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', script: 'Bengali', repo: 'sulabhkatiyar/indic-tiny-tts-assamese' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Odia', repo: 'sulabhkatiyar/indic-tiny-tts-odia' },
];

const MANIFEST_FORMAT = 'indic-tiny-tts-onnx/1';
const CONFIG = 'config.json';
const MANIFEST = 'onnx/onnx_manifest.json';

export function indicLanguages(): IndicLanguageInfo[] {
  return LANGUAGES.map(language => ({ ...language }));
}

export function indicLanguage(code: string): IndicLanguageInfo | undefined {
  return LANGUAGES.find(language => language.code === code);
}

/** 'hi-IN', 'hi_IN', 'HI' or 'Hindi' -> 'hi'. Undefined for anything the released models do not speak. */
export function indicLanguageFor(locale: string): IndicLanguageInfo | undefined {
  const asked = locale.trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find(language => language.code === asked || language.name.toLowerCase() === locale.trim().toLowerCase());
}

/** Where models are kept: `OVE_TTS_DIR`, else a per-user cache folder (the same shape on Windows, macOS and Linux). */
export function ttsCacheDir(): string {
  const configured = process.env.OVE_TTS_DIR?.trim();
  return configured ? configured : join(homedir(), '.cache', 'motionrender', 'tts');
}

export function indicModelDir(code: IndicLanguage): string {
  return join(ttsCacheDir(), code);
}

export type ModelState = { code: IndicLanguage; name: string; dir: string; ready: boolean };

/** Which languages have their model files on disk, for status screens. Never downloads. */
export async function indicModelStates(): Promise<ModelState[]> {
  return Promise.all(LANGUAGES.map(async language => {
    const dir = indicModelDir(language.code);
    return { code: language.code, name: language.name, dir, ready: await hasModel(dir) };
  }));
}

/** A file name from a model's manifest is only ever a plain name, optionally under onnx/: never a path that leaves the model folder. */
export function safeModelFile(file: unknown): file is string {
  return typeof file === 'string' && /^(?:onnx\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file) && !file.includes('..');
}

async function hasModel(dir: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(join(dir, MANIFEST), 'utf8')) as Manifest;
    if (manifest.format !== MANIFEST_FORMAT) return false;
    for (const graph of Object.values(manifest.graphs ?? {})) {
      if (!safeModelFile(graph?.file)) return false;
      const info = await stat(join(dir, graph.file));
      if (info.size !== graph.bytes) return false;
    }
    await stat(join(dir, CONFIG));
    return true;
  } catch {
    return false;
  }
}

export type DownloadOptions = {
  signal?: AbortSignal;
  /** Bytes written so far for the file being written, out of its % of the whole model. */
  onProgress?: (progress: { file: string; done: number; total: number; model: string }) => void;
};

type Manifest = {
  format?: string;
  graphs?: Record<string, { file: string; sha256: string; bytes: number }>;
};

const inFlight = new Map<string, Promise<string>>();

/** Absolute folder of a ready model, downloading it first if needed. Concurrent callers share one download. */
export async function ensureIndicModel(code: string, options: DownloadOptions = {}): Promise<string> {
  const language = indicLanguage(code);
  if (!language) throw new Error(`${code} is not one of the released Indic voices (${LANGUAGES.map(l => l.code).join(', ')})`);
  const dir = indicModelDir(language.code);
  if (await hasModel(dir)) return dir;
  const pending = inFlight.get(language.code);
  if (pending) return pending;
  const download = downloadModel(language, dir, options).finally(() => inFlight.delete(language.code));
  inFlight.set(language.code, download);
  return download;
}

async function downloadModel(language: IndicLanguageInfo, dir: string, options: DownloadOptions): Promise<string> {
  options.signal?.throwIfAborted();
  await mkdir(join(dir, 'onnx'), { recursive: true });
  await fetchFile(language, MANIFEST, join(dir, MANIFEST), {}, options);
  const manifest = JSON.parse(await readText(join(dir, MANIFEST))) as Manifest;
  if (manifest.format !== MANIFEST_FORMAT) {
    throw new Error(`The ${language.name} model is in an unsupported format (${manifest.format ?? 'missing'}), not ${MANIFEST_FORMAT}`);
  }
  await fetchFile(language, CONFIG, join(dir, CONFIG), {}, options);
  for (const [graph, file] of Object.entries(manifest.graphs ?? {})) {
    if (!file?.file) throw new Error(`The ${language.name} model manifest has no file for its ${graph}`);
    if (!safeModelFile(file.file)) throw new Error(`The ${language.name} model manifest names a file outside the model folder (${JSON.stringify(file.file)}), so nothing was downloaded`);
    // graph checksums come from the manifest; config.json has none, so it is covered by the format check above
    await fetchFile(language, file.file, join(dir, file.file), { sha256: file.sha256, bytes: file.bytes }, options);
  }
  return dir;
}

type Expect = { sha256?: string; bytes?: number };

async function fetchFile(language: IndicLanguageInfo, path: string, dest: string, expect: Expect, options: DownloadOptions): Promise<void> {
  if (expect.bytes !== undefined && await sizeIs(dest, expect.bytes)) return;
  const base = (process.env.OVE_TTS_MIRROR?.trim() || 'https://huggingface.co').replace(/\/+$/, '');
  const url = `${base}/${language.repo}/resolve/main/${path}`;
  const part = `${dest}.part`;
  await mkdir(dirname(dest), { recursive: true });
  let response: Response;
  try {
    response = await fetch(url, { signal: options.signal, redirect: 'follow' });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error(`Could not reach Hugging Face to download the ${language.name} voice. Check your internet connection, or set OVE_TTS_DIR to a folder that already holds the models.`, { cause: error });
  }
  if (!response.ok || !response.body) {
    await rm(part, { force: true });
    throw new Error(`Downloading the ${language.name} voice failed (HTTP ${response.status} for ${path}). Try again, or set OVE_TTS_MIRROR to a mirror you can reach.`);
  }
  const total = Number(response.headers.get('content-length')) || expect.bytes || 0;
  const hash = createHash('sha256');
  let done = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, done_) {
      hash.update(chunk);
      done += chunk.length;
      options.onProgress?.({ file: basename(path), done, total, model: language.name });
      done_(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(part), { signal: options.signal });
  } catch (error) {
    await rm(part, { force: true });
    if (options.signal?.aborted) throw error;
    throw new Error(`The ${language.name} voice download was interrupted. Run it again to finish.`, { cause: error });
  }
  if (expect.sha256 && hash.digest('hex') !== expect.sha256) {
    await rm(part, { force: true });
    throw new Error(`The ${language.name} voice arrived damaged (${basename(path)} did not match the model's checksum). Run it again to re-download.`);
  }
  await rename(part, dest);
}

async function sizeIs(file: string, bytes: number): Promise<boolean> {
  try { return (await stat(file)).size === bytes; } catch { return false; }
}

async function readText(path: string): Promise<string> {
  const stream = createReadStream(path);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** sha256 of a file, for tests and integrity checks. */
export async function fileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
