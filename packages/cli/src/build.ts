// `ove build video.ts`: runs a file that describes a video in code (see open-video-engine/builder) and writes the composition JSON it
// produces, checked with the real schema. The JSON is what everything else in OVE reads, so validate, review, render and the Studio
// work on it as usual. A .ts file runs through Node's own type stripping (Node 22.18 or newer) or any loader you start Node with.
// A .tsx or .jsx file is a React video (see open-video-engine/react): its component is bundled with esbuild into a file the renderer draws
// every frame, and the composition holds one `react` layer pointing at it.
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compositionJsonSchema, describeError, loadComposition } from '@ove/core';
import { resolveBuildable, type Buildable } from '@ove/builder';

/** Bundles a React video: the component for the browser (the render function the `react` layer calls) and, separately, its exports for Node. */
async function buildReact(source: string, output: string): Promise<void> {
  let esbuild: typeof import('esbuild');
  try { esbuild = await import('esbuild'); } catch { throw new Error('Building a React video needs esbuild, react and react-dom in your project: npm install --save-dev esbuild react react-dom'); }
  const common = { bundle: true, jsx: 'automatic' as const, write: false, logLevel: 'silent' as const, legalComments: 'none' as const, define: { 'process.env.NODE_ENV': '"production"' } };
  const failed = (error: unknown) => { const errors = (error as any)?.errors as { text: string; location?: { file: string; line: number } }[] | undefined; return new Error(errors?.length ? errors.map(e => `${e.location ? `${e.location.file}:${e.location.line}: ` : ''}${e.text}`).join('\n') : (error as Error).message); };
  const abs = source.replace(/\\/g, '/');
  // Node side: the module's exports (config, layers), with everything bundled in so nothing else has to resolve.
  let exported: Record<string, any>;
  try {
    const node = await esbuild.build({ ...common, stdin: { contents: `export * from ${JSON.stringify(abs)};\nexport { default } from ${JSON.stringify(abs)};`, resolveDir: dirname(source), loader: 'ts', sourcefile: 'ove-config.ts' }, platform: 'node', format: 'esm', target: 'node22' });
    exported = await import(`data:text/javascript;base64,${Buffer.from(node.outputFiles?.[0]?.text ?? "").toString('base64')}`);
  } catch (error) { throw new Error(`Could not load ${source}: ${failed(error).message}`); }
  const config = exported.config as Record<string, any> | undefined;
  if (!config || typeof config !== 'object') throw new Error('The file must export const config = { id, width, height, fps, durationInFrames }');
  if (typeof exported.default !== 'function') throw new Error('The file must export the video component as its default export');
  for (const key of ['width', 'height', 'durationInFrames']) if (!(Number(config[key]) > 0)) throw new Error(`config.${key} must be a positive number`);
  const id = String(config.id ?? basename(source).replace(/\.[jt]sx?$/, '')), fps = Number(config.fps ?? 30);
  // Browser side: a script that registers the render function. React and your code are bundled together, so there is one copy of React.
  const shim = [`import * as User from ${JSON.stringify(abs)};`, "import { createElement } from 'react';", "import { renderToStaticMarkup } from 'react-dom/server';",
    'window.__oveReactRender = ({ frame, fps, width, height, durationInFrames, props }) => {', '  let tree = createElement(User.default, props);', '  const shared = globalThis.__oveReact;',
    `  if (shared) tree = createElement(shared.config.Provider, { value: { id: ${JSON.stringify(id)}, width, height, fps, durationInFrames } }, createElement(shared.frame.Provider, { value: frame }, tree));`,
    '  return renderToStaticMarkup(tree);', '};'].join('\n');
  let bundle: string;
  try { bundle = (await esbuild.build({ ...common, stdin: { contents: shim, resolveDir: dirname(source), loader: 'js', sourcefile: 'ove-react-entry.js' }, platform: 'browser', format: 'iife', target: 'es2022', minify: true })).outputFiles?.[0]?.text ?? ""; }
  catch (error) { throw new Error(`Could not bundle ${source}: ${failed(error).message}`); }
  const bundleName = `${basename(source).replace(/\.[jt]sx?$/, '')}.bundle.js`;
  const raw: Record<string, unknown> = { $schema: './composition.schema.json', version: '1.0', id, name: config.name ?? id, width: Number(config.width), height: Number(config.height), fps, durationFrames: Number(config.durationInFrames),
    ...(config.background !== undefined ? { background: config.background } : {}), ...(config.motionBlur ? { motionBlur: config.motionBlur === true ? { samples: 4, shutter: 180 } : config.motionBlur } : {}), ...(config.export ? { export: config.export } : {}), ...(config.assets ? { assets: config.assets } : {}),
    scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: Number(config.durationInFrames), layers: [{ id: 'react', type: 'react', src: bundleName, width: Number(config.width), height: Number(config.height), durationInFrames: Number(config.durationInFrames), props: config.props ?? {} }, ...(Array.isArray(exported.layers) ? exported.layers : [])] }] };
  let composition;
  try { composition = loadComposition(raw); } catch (error) { throw new Error(`The video does not pass the schema:\n${describeError(error)}`); }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(resolve(dirname(output), bundleName), bundle);
  await writeFile(output, JSON.stringify(raw, null, 2) + '\n');
  await writeFile(resolve(dirname(output), 'composition.schema.json'), JSON.stringify(compositionJsonSchema, null, 2) + '\n');
  console.log(`Wrote ${output} and ${bundleName} (${(bundle.length / 1024).toFixed(0)} KB)\n  ${composition.width}x${composition.height}, ${(composition.durationFrames / composition.fps).toFixed(1)} s, a React video`);
  console.log(`\nNext:\n  ove still ${output} --allow-code --frame 30 --output still.png\n  ove review ${output} --allow-code --output review.png\n  ove render ${output} --allow-code --output out.mp4\n\nThe component runs JavaScript while rendering: render only files you trust. Pictures it uses must be declared in config.assets (type "image") and named by id or path in <img src>.`);
}

export async function runBuild(argv: string[]): Promise<void> {
  const option = (name: string) => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
  const file = argv[1];
  if (!file || file.startsWith('--')) throw new Error('Usage: ove build <video.ts|video.js|video.tsx> [--output composition.json]');
  const source = resolve(file);
  if (/\.[jt]sx$/.test(source)) return buildReact(source, resolve(option('--output') ?? resolve(dirname(source), 'composition.json')));
  let loaded: Record<string, unknown>;
  try { loaded = await import(pathToFileURL(source).href); }
  catch (error) {
    const hint = /\.[cm]?ts$/.test(source) && /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|Cannot find module/.test(String((error as Error).message)) ? '\nTypeScript files need Node 22.18 or newer, or run Node with a loader such as tsx.' : '';
    throw new Error(`Could not load ${source}: ${(error as Error).message}${hint}`);
  }
  const value = (loaded.default ?? loaded.video ?? loaded.composition) as Buildable | undefined;
  if (value === undefined) throw new Error(`${basename(source)} must export a video: export default createVideo({...})...`);
  const raw = await resolveBuildable(value);
  let composition;
  try { composition = loadComposition(raw); } catch (error) { throw new Error(`The video does not pass the schema:\n${describeError(error)}`); }
  const output = resolve(option('--output') ?? resolve(dirname(source), 'composition.json'));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(raw, null, 2) + '\n');
  const schema = resolve(dirname(output), 'composition.schema.json');
  await writeFile(schema, JSON.stringify(compositionJsonSchema, null, 2) + '\n');
  const code = JSON.stringify(raw).includes('"type":"code"');
  console.log(`Wrote ${output}\n  ${composition.width}x${composition.height}, ${(composition.durationFrames / composition.fps).toFixed(1)} s, ${composition.scenes.length} scene${composition.scenes.length === 1 ? '' : 's'}`);
  console.log(`\nNext:\n  ove review ${output}${code ? ' --allow-code' : ''} --output review.png\n  ove render ${output}${code ? ' --allow-code' : ''} --output out.mp4`);
  if (code) console.log('\nThis video has code layers, which run your JavaScript while rendering: render only files you trust.');
}
