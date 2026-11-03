// Node-only: bundles the Player into one browser ES module (zod and the engine included). The canvas runtime comes from
// canvasRuntimeSource as a virtual module, so the Player draws with the renderer's code without evaluating strings at runtime.
// Used by scripts/build-package.mjs (dist/player.js) and by `ove dev` when it runs from source.
import { canvasRuntimeSource, lottieSource } from '@ove/graphics/runtime'; import { fileURLToPath } from 'node:url';
export async function bundlePlayer(options: { outfile?: string; minify?: boolean } = {}): Promise<string> { const { build } = await import('esbuild');
  const result = await build({ entryPoints: [fileURLToPath(new URL('./index.ts', import.meta.url))], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: options.minify ?? false, legalComments: 'none', logLevel: 'warning',
    write: !!options.outfile, ...(options.outfile ? { outfile: options.outfile } : {}),
    plugins: [{ name: 'ove-canvas-runtime', setup(b) { b.onResolve({ filter: /^ove:canvas-runtime$/ }, args => ({ path: args.path, namespace: 'ove' })); b.onLoad({ filter: /.*/, namespace: 'ove' }, () => ({ contents: `${lottieSource}\n${canvasRuntimeSource}\nexport { createCanvasRuntime };\n`, loader: 'js' })); } }] });
  return options.outfile ? '' : result.outputFiles![0]!.text; }
