// Node-only: the drawing runtime and text layout as source text. They are plain browser scripts in packages/graphics/runtime/ (real
// files, so they are written, read and linted as JavaScript rather than escaped inside a template string). The published package ships
// them in dist/runtime, next to its bundled code; from source they are read from the graphics package.
import { existsSync, readFileSync } from 'node:fs'; import { join } from 'node:path'; import { fileURLToPath } from 'node:url';
import type { TextLayoutOptions, TextLayout, TextSpan, RichLayout } from './index';
const runtimeDir = (): string => { const bundled = fileURLToPath(new URL('./runtime/', import.meta.url)); return existsSync(join(bundled, 'canvas-runtime.js')) ? bundled : fileURLToPath(new URL('../runtime/', import.meta.url)); };
const read = (name: string) => readFileSync(join(runtimeDir(), name), 'utf8');
/** layoutText and layoutRich, as source. */
export const textLayoutSource: string = read('text-layout.js');
/** The whole page runtime: text layout followed by createCanvasRuntime(canvas, measurePath). */
export const canvasRuntimeSource: string = `${textLayoutSource}\n${read('canvas-runtime.js')}`;
// The same layout code compiled here, for the unit tests and anything in Node that needs to predict how text wraps.
export const layoutText = new Function(`${textLayoutSource}; return layoutText;`)() as (text: string, options: TextLayoutOptions, measure: (text: string, fontSize: number) => number) => TextLayout;
export const layoutRich = new Function(`${textLayoutSource}; return layoutRich;`)() as (spans: TextSpan[], options: TextLayoutOptions, measure: (text: string, span: TextSpan, fontSize: number) => number) => RichLayout;
