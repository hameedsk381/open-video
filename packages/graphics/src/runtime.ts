// Node-only: the drawing runtime and text layout as source text. They are plain browser scripts in packages/graphics/runtime/ (real
// files, so they are written, read and linted as JavaScript rather than escaped inside a template string). The published package ships
// them in dist/runtime, next to its bundled code; from source they are read from the graphics package.
import { existsSync, readFileSync } from 'node:fs'; import { createRequire } from 'node:module'; import { join } from 'node:path'; import { fileURLToPath } from 'node:url';
import type { TextLayoutOptions, TextLayout, TextSpan, RichLayout } from './index';
const runtimeDir = (): string => { const bundled = fileURLToPath(new URL('./runtime/', import.meta.url)); return existsSync(join(bundled, 'canvas-runtime.js')) ? bundled : fileURLToPath(new URL('../runtime/', import.meta.url)); };
const read = (name: string) => readFileSync(join(runtimeDir(), name), 'utf8');
/** layoutText and layoutRich, as source. */
export const textLayoutSource: string = read('text-layout.js');
// lottie-web's light canvas player: it leaves out After Effects expressions, which are JavaScript the full player evaluates. Shipped
// next to the runtime in the published package; read from the lottie-web package otherwise.
const lottieFile = 'lottie_light_canvas.min.js';
const lottiePath = () => { const bundled = join(runtimeDir(), lottieFile); return existsSync(bundled) ? bundled : createRequire(import.meta.url).resolve(`lottie-web/build/player/${lottieFile}`); };
/** The Lottie player as source; it defines a global `lottie` when run as a script. */
export const lottieSource: string = readFileSync(lottiePath(), 'utf8');
export const lottiePlayerPath = lottiePath;
// rough.js draws shapes as if by hand. Shipped next to the runtime in the published package; read from the roughjs package otherwise.
const roughFile = 'rough.js';
const roughPath = () => { const bundled = join(runtimeDir(), roughFile); return existsSync(bundled) ? bundled : createRequire(import.meta.url).resolve('roughjs/bundled/rough.js'); };
/** rough.js as source; it defines a global `rough` when run as a script. */
export const roughSource: string = readFileSync(roughPath(), 'utf8');
export const roughLibraryPath = roughPath;
// matter.js is the physics engine. Wrapped so its UMD header finds the global object even where a script's own `this` is undefined (a bundled module).
const matterFile = 'matter.min.js';
const matterPath = () => { const bundled = join(runtimeDir(), matterFile); return existsSync(bundled) ? bundled : createRequire(import.meta.url).resolve('matter-js/build/matter.min.js'); };
/** matter.js as source; it defines a global `Matter` when run as a script. */
export const matterSource: string = `(function(){${readFileSync(matterPath(), 'utf8')}\n}).call(typeof globalThis!=='undefined'?globalThis:this);`;
export const matterLibraryPath = matterPath;
// p5.js (pinned to 1.11): creative-coding sketches. It is about 1 MB, so it is read when asked for and only videos with p5 layers load it.
const p5File = 'p5.min.js';
const p5Path = () => { const bundled = join(runtimeDir(), p5File); return existsSync(bundled) ? bundled : createRequire(import.meta.url).resolve('p5/lib/p5.min.js'); };
let p5Text: string | undefined;
/** p5.js as source; it defines a global `p5` when run as a script. */
export const p5Source = (): string => (p5Text ??= readFileSync(p5Path(), 'utf8'));
export const p5LibraryPath = p5Path;
/** The whole page runtime: text layout followed by createCanvasRuntime(canvas, measurePath). */
export const canvasRuntimeSource: string = `${textLayoutSource}\n${read('canvas-runtime.js')}`;
// The same layout code compiled here, for the unit tests and anything in Node that needs to predict how text wraps.
export const layoutText = new Function(`${textLayoutSource}; return layoutText;`)() as (text: string, options: TextLayoutOptions, measure: (text: string, fontSize: number) => number) => TextLayout;
export const layoutRich = new Function(`${textLayoutSource}; return layoutRich;`)() as (spans: TextSpan[], options: TextLayoutOptions, measure: (text: string, span: TextSpan, fontSize: number) => number) => RichLayout;
