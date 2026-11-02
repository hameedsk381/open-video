import { readFile } from 'node:fs/promises'; import { extname, isAbsolute, resolve } from 'node:path'; import type { Composition } from '@ove/schema';
export const supportedAssetTypes = ['png','jpeg','webp','svg','mp4','webm','mp3','wav','woff','woff2'] as const;
const mimeTypes: Record<string,string> = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.otf':'font/otf' };
export function validateAssetPath(src: string): void { if (!src || src.includes('\0')) throw new Error('Invalid asset source'); }
export const isUrl = (src: string) => /^(https?|data|blob):/i.test(src);
// A source is either an asset id from composition.assets, a URL, or a path relative to the composition file.
export function resolveAssetSource(composition: Composition, src: string, baseDir: string): string { validateAssetPath(src); const target=composition.assets.find(a=>a.id===src)?.src ?? src; validateAssetPath(target); return isUrl(target) || isAbsolute(target) ? target : resolve(baseDir, target); }
export async function toDataUrl(source: string): Promise<string> { if (isUrl(source)) return source; const mime=mimeTypes[extname(source).toLowerCase()]; if (!mime) throw new Error(`Unsupported file type for an image or font: ${source}`); return `data:${mime};base64,${(await readFile(source)).toString('base64')}`; }
export function resolveAudio(composition: Composition, baseDir: string): string | undefined { const audio=composition.export.audio; return audio === undefined ? undefined : resolveAssetSource(composition, audio, baseDir); }
