// Node-only: where the built-in font files are. The published package ships them in dist/fonts (next to its bundled code);
// from source they come from the @fontsource-variable/inter package.
import { existsSync } from 'node:fs'; import { readFile } from 'node:fs/promises'; import { createRequire } from 'node:module'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
import { builtinFontFaces, type FontSpec } from './index';
export function builtinFontDir(): string { const bundled = fileURLToPath(new URL('./fonts/', import.meta.url)); if (existsSync(join(bundled, builtinFontFaces[0]!.file))) return bundled;
  return join(dirname(createRequire(import.meta.url).resolve('@fontsource-variable/inter/package.json')), 'files'); }
// Every built-in face as a data URL, for pages that cannot fetch files (the renderer's).
let cached: Promise<FontSpec[]> | undefined;
export const builtinFonts = (): Promise<FontSpec[]> => cached ??= Promise.all(builtinFontFaces.map(async face => ({ ...face, src: `builtin:${face.file}`, url: `data:font/woff2;base64,${(await readFile(join(builtinFontDir(), face.file))).toString('base64')}` })));
