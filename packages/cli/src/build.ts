// `mr build video.ts`: runs a file that describes a video in code (see motionrender/builder) and writes the composition JSON it
// produces, checked with the real schema. The JSON is what everything else in OVE reads, so validate, review, render and the Studio
// work on it as usual. A .ts file runs through Node's own type stripping (Node 22.18 or newer) or any loader you start Node with.
// A .tsx or .jsx file is a React video (see motionrender/react): its component is bundled with esbuild into a file the renderer draws
// every frame, and the composition holds one `react` layer pointing at it.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { compositionJsonSchema, describeError, loadComposition } from '@ove/core';
import { resolveBuildable, type Buildable } from '@ove/builder';

/** Bundles a React video: the component for the browser (the render function the `react` layer calls) and, separately, its exports for Node. */
export async function buildReact(source: string, output: string): Promise<void> {
  let esbuild: typeof import('esbuild');
  try { esbuild = await import('esbuild'); } catch { throw new Error('Building a React video needs esbuild, react and react-dom in your project: npm install --save-dev esbuild react react-dom'); }
  const reactEntry = existsSync(fileURLToPath(new URL('./react.js', import.meta.url)))
    ? fileURLToPath(new URL('./react.js', import.meta.url))
    : fileURLToPath(new URL('../../react/src/index.ts', import.meta.url));

  // A video written outside any project (a generated one in a scratch folder) has no node_modules of its own: fall back to the react
  // this install resolves, so `import 'react'` works wherever the file lives. A project's own copy still wins, as it is looked up first.
  const nodePaths: string[] = [];
  // Both are asked for: a pnpm install keeps each package in its own store folder, so one parent does not hold the other.
  for (const name of ['react', 'react-dom']) {
    try { const parent = dirname(dirname(createRequire(import.meta.url).resolve(`${name}/package.json`))); if (!nodePaths.includes(parent)) nodePaths.push(parent); } catch { /* not beside the CLI: the project must provide it */ }
  }

  // Fonts, pictures and styles that components import are bundled in (as data), so CSS files and web fonts work like any other library.
  const common = {
    nodePaths,
    bundle: true,
    jsx: 'automatic' as const,
    write: false,
    logLevel: 'silent' as const,
    legalComments: 'none' as const,
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: {
      'remotion': reactEntry,
      '@remotion/core': reactEntry,
      '@remotion/media': reactEntry,
      '@ove/react': reactEntry,
      'motionrender/react': reactEntry,
    },
    loader: { '.woff': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.otf': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.gif': 'dataurl', '.webp': 'dataurl', '.svg': 'dataurl' } as Record<string, 'dataurl'>,
  };
  const failed = (error: unknown) => { const errors = (error as any)?.errors as { text: string; location?: { file: string; line: number } }[] | undefined; return new Error(errors?.length ? errors.map(e => `${e.location ? `${e.location.file}:${e.location.line}: ` : ''}${e.text}`).join('\n') : (error as Error).message); };
  const abs = source.replace(/\\/g, '/');
  // Node side: the module's exports (config, layers), with everything bundled in so nothing else has to resolve.
  let exported: Record<string, any>;
  try {
    const entry = (withHelper: boolean) => `export * from ${JSON.stringify(abs)};
export { default } from ${JSON.stringify(abs)};` + (withHelper
      ? `
import * as __User from ${JSON.stringify(abs)};
import { createElement as __ce } from 'react';
import { renderToStaticMarkup as __rs } from 'react-dom/server';
const __getComp = () => __User.default || __User.RemotionRoot || __User.Root || Object.values(__User).find(v => typeof v === 'function' && v.name !== '__render');
export const __render = (frame, props, cfg) => { let tree = __ce(__getComp(), props); const s = globalThis.__oveReact; if (s) tree = __ce(s.config.Provider, { value: cfg }, __ce(s.frame.Provider, { value: frame }, tree)); return __rs(tree); };` : '');
    const nodeBuild = (withHelper: boolean) => esbuild.build({ ...common, stdin: { contents: entry(withHelper), resolveDir: dirname(source), loader: 'ts', sourcefile: 'ove-config.ts' }, platform: 'node', format: 'esm', target: 'node22', outdir: 'out', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(process.cwd() + '/');" } });
    // Looking for Audio and Video needs react and react-dom/server next to the file; without them the video is still built, just without that scan.
    const node = await nodeBuild(true).catch(() => nodeBuild(false));
    exported = await import(`data:text/javascript;base64,${Buffer.from(node.outputFiles?.find(file => file.path.endsWith('.js'))?.text ?? "").toString('base64')}`);
  } catch (error) { throw new Error(`Could not load ${source}: ${failed(error).message}`); }
  let config = exported.config as Record<string, any> | undefined;
  let componentName: string | undefined;

  // Remotion Root or Composition detection
  if (!config) {
    const rootFn = exported.RemotionRoot || exported.Root || (typeof exported.default === 'function' ? exported.default : undefined);
    if (typeof rootFn === 'function') {
      try {
        (globalThis as any).__oveCompositions = [];
        const rootEl = rootFn({});
        const inspectEl = (el: any): any => {
          if (!el || typeof el !== 'object') return null;
          if (el.props?.durationInFrames && el.props?.width && el.props?.height) return el.props;
          if (Array.isArray(el.props?.children)) {
            for (const child of el.props.children) {
              const res = inspectEl(child);
              if (res) return res;
            }
          } else if (el.props?.children) {
            return inspectEl(el.props.children);
          }
          return null;
        };
        const compProps = inspectEl(rootEl) || (globalThis as any).__oveCompositions?.[0];
        if (compProps && compProps.width && compProps.height && compProps.durationInFrames) {
          config = {
            id: compProps.id,
            width: compProps.width,
            height: compProps.height,
            fps: compProps.fps ?? 30,
            durationInFrames: compProps.durationInFrames,
            props: compProps.defaultProps ?? {},
          };
          if (compProps.component) {
            for (const [k, v] of Object.entries(exported)) {
              if (v === compProps.component) { componentName = k; break; }
            }
          }
        }
      } catch {}
    }
  }

  if (!config || typeof config !== 'object') throw new Error('The file must export const config = { id, width, height, fps, durationInFrames } or a Remotion Root component');
  const hasDefault = typeof exported.default === 'function';
  const hasNamed = componentName || Object.entries(exported).some(([k, v]) => typeof v === 'function' && k !== '__render' && k !== 'config');
  if (!hasDefault && !hasNamed) throw new Error('The file must export the video component as its default or named export');
  for (const key of ['width', 'height', 'durationInFrames']) if (!(Number(config[key]) > 0)) throw new Error(`config.${key} must be a positive number`);
  const id = String(config.id ?? basename(source).replace(/\.[jt]sx?$/, '')), fps = Number(config.fps ?? 30);
  // Browser side: a script that registers the render function. React and your code are bundled together, so there is one copy of React.
  const compAccessor = componentName ? `User[${JSON.stringify(componentName)}]` : '(User.default || User.RemotionRoot || User.Root || Object.values(User).find(v => typeof v === "function" && v.name !== "__render"))';
  const shim = [`import * as User from ${JSON.stringify(abs)};`, "import { createElement } from 'react';", "import { renderToStaticMarkup } from 'react-dom/server';", "import { flushSync } from 'react-dom';", "import { createRoot } from 'react-dom/client';",
    `const getComponent = () => ${compAccessor};`,
    'const make = ({ frame, fps, width, height, durationInFrames, props }) => {', '  let tree = createElement(getComponent(), props);', '  const shared = globalThis.__oveReact;',
    `  if (shared) tree = createElement(shared.config.Provider, { value: { id: ${JSON.stringify(id)}, width, height, fps, durationInFrames } }, createElement(shared.frame.Provider, { value: frame }, tree));`,
    '  return tree;', '};', 'window.__oveReactRender = o => renderToStaticMarkup(make(o));',
    // Live mount: the real component in a real page, so effects, canvas, WebGL and any library work. Frames wait for delayRender handles.
    ...(config.live === false ? [] : ['const roots = new WeakMap();', 'window.__oveReactMount = async o => {', '  let root = roots.get(o.container); if (!root) { root = createRoot(o.container); roots.set(o.container, root); }',
      '  flushSync(() => root.render(make(o)));', '  const began = Date.now();', '  while (globalThis.__oveDelays && globalThis.__oveDelays.size > 0) {', "    if (Date.now() - began > 28000) throw new Error('delayRender() was not released within 28 seconds: ' + [...globalThis.__oveDelays.values()].join(', '));", '    await new Promise(r => setTimeout(r, 4));', '  }', '};'])].join('\n');
  let bundle: string;
  try {
    const built = await esbuild.build({ ...common, stdin: { contents: shim, resolveDir: dirname(source), loader: 'js', sourcefile: 'ove-react-entry.js' }, platform: 'browser', format: 'iife', target: 'es2022', minify: true, outdir: 'out' });
    bundle = built.outputFiles?.find(file => file.path.endsWith('.js'))?.text ?? '';
    // CSS the components import becomes a style element, so it reaches the page (and the picture drawn from it) like any stylesheet.
    const css = built.outputFiles?.find(file => file.path.endsWith('.css'))?.text;
    if (css) bundle = `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();` + bundle;
  }
  catch (error) { throw new Error(`Could not bundle ${source}: ${failed(error).message}`); }
  // Audio and Video components: render the component for every frame, and make a layer of each run of frames where one is shown.
  const mediaLayers: { audio: Record<string, unknown>[]; video: Record<string, unknown>[]; videoFront: Record<string, unknown>[] } = { audio: [], video: [], videoFront: [] };
  const total = Number(config.durationInFrames), cfg = { id, width: Number(config.width), height: Number(config.height), fps, durationInFrames: total };
  type Run = { kind: 'audio' | 'video'; attrs: Record<string, string>; start: number; last: number; boxes: Record<string, number>[] };
  const seen = new Map<string, Run[]>();
  const usesMedia = /\b(Audio|Video)\b/.test(await readFile(source, 'utf8').catch(() => ''));
  const scanStart = Date.now();
  let scanFailed: string | undefined;
  if (typeof exported.__render === 'function') for (let frame = 0; frame < Math.min(total, 100_000); frame++) {
    let html: string;
    try { html = exported.__render(frame, config.props ?? {}, cfg); } catch (error) { scanFailed = `frame ${frame}: ${describeError(error)}`; break; }
    const counts = new Map<string, number>();
    for (const tag of html.matchAll(/<i\b[^>]*data-ove-media="(audio|video)"[^>]*>/g)) {
      const attrs: Record<string, string> = {}; for (const a of tag[0].matchAll(/data-([a-z-]+)="([^"]*)"/g)) attrs[a[1]!] = a[2]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const base = `${tag[1]}|${attrs.src}|${attrs.name}`, n = counts.get(base) ?? 0; counts.set(base, n + 1);
      const runs = seen.get(`${base}|${n}`) ?? []; seen.set(`${base}|${n}`, runs);
      const box = { x: Number(attrs.left) || 0, y: Number(attrs.top) || 0, width: Number(attrs.width) || Number(config.width), height: Number(attrs.height) || Number(config.height) };
      const run = runs[runs.length - 1];
      if (run && run.last === frame - 1) { run.last = frame; run.boxes.push(box); } else runs.push({ kind: tag[1] as 'audio' | 'video', attrs, start: frame, last: frame, boxes: [box] });
    }
  }
  if (scanFailed) {
    seen.clear();
    if (usesMedia) console.warn(`Warning: the Audio and Video components were not read, because the component could not be rendered in Node (${scanFailed.slice(0, 200)}). Code that needs window or document should run in an effect, not while rendering. Add the sound and footage as layers instead.`);
  } else if (Date.now() - scanStart > 1500) console.log(`Looked for Audio and Video in ${total} frames (${((Date.now() - scanStart) / 1000).toFixed(1)} s)`);
  // A clip that moves or resizes gets keyframes (counted from where the clip starts); frames where the value stays put are dropped.
  const keyframes = (values: number[]) => values.map((value, i) => ({ frame: i, value })).filter((k, i) => i === 0 || i === values.length - 1 || k.value !== values[i - 1] || k.value !== values[i + 1]);
  let serial = 0;
  for (const runs of seen.values()) for (const run of runs) {
    const a = run.attrs, base = { startFrame: run.start, endFrame: run.last + 1, src: a.src!, trimStart: Math.round(Number(a.trim) || 0), volume: Number(a.volume), playbackRate: Number(a.rate) || 1, loop: a.loop === '1' };
    if (run.kind === 'audio') { mediaLayers.audio.push({ id: `audio-${++serial}`, type: 'audio', ...base }); continue; }
    const first = run.boxes[0]!, moving = (['x', 'y', 'width', 'height'] as const).filter(key => run.boxes.some(box => box[key] !== first[key]));
    const layer = { id: `video-${++serial}`, type: 'video', ...base, muted: a.muted === '1', objectFit: a.fit, ...(Number(a.radius) > 0 ? { radius: Number(a.radius) } : {}), ...first, ...(moving.length ? { animations: moving.map(property => ({ property, keyframes: keyframes(run.boxes.map(box => box[property])) })) } : {}) };
    (a.layer === 'front' ? mediaLayers.videoFront : mediaLayers.video).push(layer);
  }
  // A sound or clip the component names but the project does not hold used to fail minutes later inside ffmpeg. The build
  // is the right place to say so: built-in sounds are `sfx:` names, everything else is a path beside the component.
  const declaredAssets = new Set((Array.isArray(config.assets) ? config.assets : []).map((asset: any) => String(asset?.id)));
  const missingMedia = [...mediaLayers.audio, ...mediaLayers.video, ...mediaLayers.videoFront]
    .map(layer => layer.src).filter((src): src is string => typeof src === 'string' && !declaredAssets.has(src) && !/^[a-z]+:/i.test(src) && !existsSync(resolve(dirname(source), src)));
  if (missingMedia.length) throw new Error(`The video names media that is not in the project: ${[...new Set(missingMedia)].join(', ')}. Add the file beside ${basename(source)}, or use a built-in sound (sfx:whoosh, sfx:pop, sfx:ding, sfx:click, sfx:thump, sfx:tick) instead.`);
  const bundleName = `${basename(source).replace(/\.[jt]sx?$/, '')}.bundle.js`;
  const raw: Record<string, unknown> = { $schema: './composition.schema.json', version: '1.0', id, name: config.name ?? id, width: Number(config.width), height: Number(config.height), fps, durationFrames: Number(config.durationInFrames),
    ...(config.background !== undefined ? { background: config.background } : {}), ...(config.motionBlur ? { motionBlur: config.motionBlur === true ? { samples: 4, shutter: 180 } : config.motionBlur } : {}), ...(config.export ? { export: config.export } : {}), ...(config.assets ? { assets: config.assets } : {}), ...(config.grain !== undefined ? { grain: config.grain } : {}),
    scenes: [{ id: 'main', name: 'Main', startFrame: 0, durationFrames: Number(config.durationInFrames), layers: [...mediaLayers.video, { id: 'react', type: 'react', src: bundleName, width: Number(config.width), height: Number(config.height), durationInFrames: Number(config.durationInFrames), props: config.props ?? {} }, ...mediaLayers.videoFront, ...mediaLayers.audio, ...(Array.isArray(exported.layers) ? exported.layers : [])] }] };
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
