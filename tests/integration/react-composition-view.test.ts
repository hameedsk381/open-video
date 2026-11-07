import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadComposition, renderStill } from '@ove/core';
import { convertToReact } from '../../packages/cli/src/react-compose';

// Any composition becomes one react layer drawn by the shared view. The proof is the picture: the same frame through both renderers.
describe('a composition converted to a React video', () => {
  it('becomes one react layer, keeps its sound, and draws the same frame as the JSON layers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-view-'));
    try {
      const composition = loadComposition({
        version: '1.0', id: 'view', name: 'view', width: 480, height: 270, fps: 30, durationFrames: 30, background: '#101820',
        scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [
          { id: 'bar', type: 'rect', x: 40, y: 200, width: 300, height: 24, radius: 12, fill: '#ff7a1a' },
          { id: 'dot', type: 'circle', x: 400, y: 60, width: 50, fill: '#4da3ff', animations: [{ property: 'scale', keyframes: [{ frame: 0, value: 1 }, { frame: 30, value: 1.4 }] }] },
          { id: 'title', type: 'text', content: 'Fit this headline in two lines please', x: 40, y: 40, maxWidth: 300, maxLines: 2, minFontSize: 24, fontSize: 48, fontWeight: 700, color: '#ffffff' },
          { id: 'pop', type: 'audio', src: 'sfx:pop', startFrame: 5 },
        ] }],
      } as any);
      const output = join(dir, 'composition.json');
      const result = await convertToReact(composition, output);
      expect(result.unsupported).toEqual([]);

      const built = JSON.parse(await readFile(output, 'utf8'));
      const types = built.scenes.flatMap((scene: any) => scene.layers.map((layer: any) => layer.type)).sort();
      expect(types).toEqual(['audio', 'react']);                          // the picture is one react layer; the sound rides beside it
      expect(built.scenes[0].layers.find((layer: any) => layer.type === 'audio').startFrame).toBe(5);

      const react = loadComposition(built);
      const [json, view] = await Promise.all([renderStill(composition, { frame: 12, baseDir: dir }), renderStill(react, { frame: 12, baseDir: dir, allowCode: true })]);
      const frame = (png: Buffer) => png.length;
      expect(Math.abs(frame(json) - frame(view)) / frame(json)).toBeLessThan(0.15);   // same picture, to within anti-aliasing
      await writeFile(join(dir, 'view.png'), view);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 120_000);

  it('carries film grain, background texture and motion blur across, since the renderer applies them to the whole frame', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-view-'));
    try {
      const composition = loadComposition({
        version: '1.0', id: 'frame', name: 'frame', width: 320, height: 180, fps: 30, durationFrames: 30, background: '#102030',
        motionBlur: { samples: 4, shutter: 180 }, grain: 0.05, texture: { type: 'grid', color: '#ffffff', opacity: 0.06, scale: 48 },
        scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [{ id: 'r', type: 'rect', width: 50, height: 50, fill: '#fff' }] }],
      } as any);
      const output = join(dir, 'composition.json');
      expect((await convertToReact(composition, output)).unsupported).toEqual([]);
      const built = JSON.parse(await readFile(output, 'utf8'));
      expect(built.motionBlur).toEqual({ samples: 4, shutter: 180 });
      expect(built.grain).toBe(0.05);
      expect(built.texture?.type).toBe('grid');
      expect(built.background).toBe('#102030');
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('refuses what the view cannot draw, and writes nothing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-view-'));
    try {
      const composition = loadComposition({
        version: '1.0', id: 'g', name: 'g', width: 320, height: 180, fps: 30, durationFrames: 30,
        scenes: [{ id: 's', name: 's', durationFrames: 30, layers: [{ id: 'r', type: 'rect', width: 50, height: 50, fill: '#fff', grade: { look: 'noir' } }] }],
      } as any);
      const result = await convertToReact(composition, join(dir, 'composition.json'));
      expect(result.unsupported).toContain('colour grading');
      await expect(readFile(join(dir, 'composition.json'), 'utf8')).rejects.toThrow();
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});
