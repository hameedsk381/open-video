import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { Composition } from '@ove/core';
import type { AiProvider } from './providers';
import { assetIdFromPath, compositionRelative, validateTemplate } from './project';

export type GenerateImageOptions = {
  out: string;
  prompt: string;
  size?: string;
  composition?: Composition;
  compositionPath?: string;
  id?: string;
  signal?: AbortSignal;
};

export type GenerateImageResult = { file: string; id: string; composition?: Composition };

const sizes: Record<string, string> = {
  square: '1024x1024', '1:1': '1024x1024',
  portrait: '1024x1536', vertical: '1024x1536', '9:16': '1024x1536', '4:5': '1024x1536',
  landscape: '1536x1024', horizontal: '1536x1024', '16:9': '1536x1024',
};

export function imageSize(size?: string): string {
  if (!size) return '1024x1024';
  return sizes[size.toLowerCase()] ?? size;
}

/** Generates one picture, writes it, and optionally registers it as an asset in a composition. */
export async function generateImage(provider: AiProvider, options: GenerateImageOptions): Promise<GenerateImageResult> {
  if (!provider.image) throw new Error(`The ${provider.id} provider cannot generate images; use --provider mock (Groq has no image model; or add an image() adapter)`);
  const generated = await provider.image(options.prompt, { size: imageSize(options.size), signal: options.signal });
  const file = resolve(/\.(png|jpe?g|webp)$/i.test(options.out) ? options.out : `${options.out}.${generated.extension}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, generated.data);
  const id = (options.id ?? assetIdFromPath(file)).trim();
  if (!options.composition || !options.compositionPath) return { file, id };
  const next: Composition = JSON.parse(JSON.stringify(options.composition));
  const baseDir = dirname(resolve(options.compositionPath));
  next.assets = (next.assets ?? []).filter(asset => asset.id !== id);
  next.assets.push({ id, type: 'image', src: compositionRelative(baseDir, file), metadata: {} });
  validateTemplate(next);
  return { file, id, composition: next };
}
