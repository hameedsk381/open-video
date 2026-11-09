// Pictures for explainer media scenes that name a prompt instead of a file: each is drawn once by the image model, kept in the project's assets,
// and reused while its prompt stays the same, so building a video again costs nothing.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Explainer } from '@ove/schema';
import { generateImage } from './image';
import type { AiProvider } from './providers';

const PICTURE = /\.(png|jpe?g|webp)$/i;

/** True when any media scene still has to be drawn. */
export const needsImages = (spec: Explainer): boolean => spec.scenes.some(scene => scene.kind === 'media' && scene.prompt !== undefined);

/**
 * Draws the picture for every media scene that has a prompt and returns the script with `src` set (and the prompt dropped), leaving the
 * original untouched. Pictures go to `<dir>/assets/explainer-<scene>-<hash of the prompt>.<ext>`; one that is already there is reused.
 */
export async function generateExplainerImages(spec: Explainer, provider: AiProvider, options: { dir: string; onProgress?: (message: string) => void; signal?: AbortSignal }): Promise<{ spec: Explainer; made: number; reused: number }> {
  if (!needsImages(spec)) return { spec, made: 0, reused: 0 };
  if (!provider.image) throw new Error(`The ${provider.id} provider cannot draw pictures, so the media scenes that give a prompt have none. Use a provider with image generation, or give those scenes a file (src) such as a stock photo.`);
  const assets = join(options.dir, 'assets'), existing = existsSync(assets) ? await readdir(assets) : [];
  let made = 0, reused = 0;
  const scenes: Explainer['scenes'] = [];
  for (const [i, scene] of spec.scenes.entries()) {
    if (scene.kind !== 'media' || scene.prompt === undefined) { scenes.push(scene); continue; }
    const stem = `explainer-${i + 1}-${createHash('sha1').update(scene.prompt).digest('hex').slice(0, 8)}`;
    let file = existing.find(name => name.startsWith(`${stem}.`) && PICTURE.test(name));
    if (file) reused++;
    else {
      options.onProgress?.(`Drawing the picture for scene ${i + 1}…`);
      const result = await generateImage(provider, { out: join(assets, stem), prompt: scene.prompt, size: 'portrait', signal: options.signal });
      file = relative(assets, result.file); made++;
    }
    const { prompt: _prompt, ...rest } = scene;
    scenes.push({ ...rest, src: `assets/${file}`, credit: scene.credit ?? 'AI-generated picture' });
  }
  return { spec: { ...spec, scenes }, made, reused };
}
