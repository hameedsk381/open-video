// Any composition as a React video: the composition becomes data inside a generated component that draws it with CompositionView
// (@ove/react), and the build turns that into the same single `react` layer every React video is. The component's code is the shared
// view, never anything a model wrote, so templates and scene-by-scene videos can take this path wherever model-written React cannot run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadComposition } from '@ove/core';
import { unsupportedFeatures, type CompositionData, type ExplainerReactData } from '@ove/react';
import { buildReact } from './build';

export type ReactConversion = { unsupported: string[]; sourcePath?: string; compositionPath?: string };

/**
 * Writes `<name>.tsx` beside `compositionPath`'s directory and builds it over `outputPath`. Returns what the view cannot draw yet;
 * when that is not empty nothing is written, so the caller keeps the composition it has.
 */
export async function convertToReact(raw: unknown, outputPath: string, options: { baseDir?: string; name?: string; /** An explainer's React scenes: the view draws them beside the stock composition. */ explainer?: ExplainerReactData } = {}): Promise<ReactConversion> {
  const composition = loadComposition(raw as any) as any;
  const unsupported = unsupportedFeatures(composition as CompositionData);
  if (unsupported.length) return { unsupported };
  const dir = resolve(dirname(outputPath));
  await mkdir(dir, { recursive: true });
  const sourcePath = join(dir, `${options.name ?? 'video'}.tsx`);
  // Sound is not drawn: audio layers ride beside the component as extra layers, placed on the one scene the build makes.
  const audio: any[] = [];
  const strip = (layers: any[], sceneStart: number): any[] => (layers ?? []).flatMap((layer: any) => {
    if (layer.type === 'audio') { audio.push({ ...layer, startFrame: (layer.startFrame ?? 0) + sceneStart, ...(layer.endFrame !== undefined ? { endFrame: layer.endFrame + sceneStart } : {}) }); return []; }
    return [layer.children ? { ...layer, children: strip(layer.children, sceneStart) } : layer];
  });
  const scenes = composition.scenes.map((scene: any) => ({ ...scene, layers: strip(scene.layers, scene.startFrame ?? 0) }));
  const data: Record<string, unknown> = { width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, background: composition.background, scenes, ...(composition.overlay ? { overlay: composition.overlay } : {}) };
  // A picture a React scene draws has to be declared as an asset, and is then named by its id; a clip is placed by the build from its path.
  const pictures = (options.explainer?.scenes ?? []).filter(item => item.scene.kind === 'media' && (item.scene as any).src && !/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test((item.scene as any).src));
  const declared = pictures.map(item => ({ id: `media-${item.index}`, type: 'image', src: (item.scene as any).src }));
  const explainer = options.explainer ? { ...options.explainer, scenes: options.explainer.scenes.map(item => (pictures.includes(item) ? { ...item, scene: { ...item.scene, assetId: `media-${item.index}` } } : item)) } : undefined;
  const assets = [...(composition.assets ?? []), ...declared];
  const config = { id: composition.id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationFrames,
    ...(composition.background !== undefined ? { background: composition.background } : {}), ...(composition.export ? { export: composition.export } : {}), ...(assets.length ? { assets } : {}) };
  const source = [
    '// Written by MotionRender: this composition drawn as a React video. Edit the data, or write your own components instead.',
    `import { ${options.explainer ? 'ExplainerView' : 'CompositionView'} } from 'motionrender/react';`,
    `export const config = ${JSON.stringify(config, null, 2)};`,
    `export const layers = ${JSON.stringify(audio, null, 2)};`,
    `const composition = ${JSON.stringify(data)};`,
    ...(explainer ? [`const react = ${JSON.stringify(explainer)};`, 'export default function Video() { return <ExplainerView composition={composition as any} react={react as any} />; }']
      : ['export default function Video() { return <CompositionView composition={composition as any} />; }']),
    '',
  ].join('\n');
  await writeFile(sourcePath, source, 'utf8');
  await buildReact(sourcePath, outputPath);
  // Film grain, background texture, motion blur and the beat grid belong to the whole frame, which the renderer applies itself from these
  // top-level fields whatever the layers are. The build knows only some of them, so carry the rest across rather than lose them.
  const carried: Record<string, unknown> = {};
  for (const key of ['motionBlur', 'grain', 'texture', 'tempo']) if (composition[key] !== undefined && composition[key] !== null && !(key === 'grain' && !composition[key]) && !(key === 'texture' && composition[key].type === 'none')) carried[key] = composition[key];
  if (Object.keys(carried).length) {
    const built = JSON.parse(await readFile(outputPath, 'utf8'));
    await writeFile(outputPath, JSON.stringify({ ...built, ...carried }, null, 2) + '\n', 'utf8');
  }
  return { unsupported: [], sourcePath, compositionPath: outputPath };
}

/** Reads a composition file and converts it in place, keeping the script (`content`) the file carried. */
export async function convertFileToReact(file: string): Promise<ReactConversion> {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const result = await convertToReact(raw, file);
  if (result.compositionPath && raw.content) {
    const built = JSON.parse(await readFile(file, 'utf8'));
    await writeFile(file, JSON.stringify({ ...built, content: raw.content }, null, 2) + '\n', 'utf8');
  }
  return result;
}
