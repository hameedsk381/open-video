// Any composition as a React video: the composition becomes data inside a generated component that draws it with CompositionView
// (@ove/react), and the build turns that into the same single `react` layer every React video is. The component's code is the shared
// view, never anything a model wrote, so templates and scene-by-scene videos can take this path wherever model-written React cannot run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { loadComposition } from '@ove/core';
import { unsupportedFeatures, type CompositionData } from '@ove/react';
import { buildReact } from './build';

export type ReactConversion = { unsupported: string[]; sourcePath?: string; compositionPath?: string };

/**
 * Writes `<name>.tsx` beside `compositionPath`'s directory and builds it over `outputPath`. Returns what the view cannot draw yet;
 * when that is not empty nothing is written, so the caller keeps the composition it has.
 */
export async function convertToReact(raw: unknown, outputPath: string, options: { baseDir?: string; name?: string } = {}): Promise<ReactConversion> {
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
  const data = { width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, background: composition.background, scenes };
  const config = { id: composition.id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationFrames,
    ...(composition.background !== undefined ? { background: composition.background } : {}), ...(composition.export ? { export: composition.export } : {}), ...(composition.assets?.length ? { assets: composition.assets } : {}) };
  const source = [
    '// Written by MotionRender: this composition drawn as a React video. Edit the data, or write your own components instead.',
    "import { CompositionView } from 'motionrender/react';",
    `export const config = ${JSON.stringify(config, null, 2)};`,
    `export const layers = ${JSON.stringify(audio, null, 2)};`,
    `const composition = ${JSON.stringify(data)};`,
    'export default function Video() { return <CompositionView composition={composition as any} />; }',
    '',
  ].join('\n');
  await writeFile(sourcePath, source, 'utf8');
  await buildReact(sourcePath, outputPath);
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
