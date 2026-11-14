import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileExplainer, REACT_KINDS } from '@ove/core';
import { explainerSchema } from '@ove/schema';
import { explainerVariants } from '@ove/react';
import { buildExplainer } from '../../packages/cli/src/explainer';

// With reactKinds the compiler leaves the pictures of those scenes to the React build and keeps everything around them (captions, chapters,
// voice, header). A script's `variant` picks a drawing; without one the scene's content does.
const script = (aspect = '9:16') => explainerSchema.parse({ version: '1.0', topic: 'T', aspect, scenes: [
  { kind: 'title', lines: ['Hello', 'World'] },
  { kind: 'compare', left: { title: 'Before', points: ['Slow'] }, right: { title: 'After', points: ['Fast'] }, variant: 'versus', step: 'A VS B' },
  { kind: 'chart', items: [{ label: 'a', value: 1 }, { label: 'b', value: 3 }], unit: '%' },
  { kind: 'stat', value: '3x', label: 'faster' },
] });

describe('the code scene', () => {
  const code = 'const a = 1;\nconst b = 2;';
  const parse = (scene: Record<string, unknown>) => explainerSchema.safeParse({ version: '1.0', topic: 'T', scenes: [{ kind: 'code', code, ...scene }] });

  it('has a file name by default and keeps its picked lines', () => {
    const result = parse({ highlight: [1, 2] });
    expect(result.success).toBe(true);
    expect((result.data!.scenes[0] as any).file).toBe('main.ts');
    expect((result.data!.scenes[0] as any).highlight).toEqual([1, 2]);
  });

  it('refuses a wall of code, so it can be read on a phone', () => {
    const result = parse({ code: Array.from({ length: 15 }, (_, i) => 'line ' + i).join('\n') });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error!.issues)).toMatch(/At most 14 lines/);
  });

  it('is drawn by the stock scenes too, with each picked line lit and a tick for it', () => {
    const spec = explainerSchema.parse({ version: '1.0', topic: 'T', scenes: [{ kind: 'code', code, highlight: [2] }] });
    const layers = (compileExplainer(spec).composition as any).scenes[0].layers as any[];
    expect(layers.some(layer => layer.id === 'code-pick-1')).toBe(true);
    expect(layers.some(layer => layer.id === 'code-line-0' && layer.content === 'const a = 1;')).toBe(true);
    expect(layers.some(layer => layer.id.startsWith('sfx-tick'))).toBe(true);
  });
});

describe('the React explainer build', () => {
  it('leaves only the kinds with a React drawing to the React build', () => {
    expect([...REACT_KINDS].sort()).toEqual(['chart', 'closing', 'code', 'compare', 'flow', 'freeform', 'grid', 'hex', 'media', 'phone', 'pile', 'quote', 'stat', 'steps', 'timeline', 'title']);
    const { composition, react } = compileExplainer(script(), { reactKinds: REACT_KINDS });
    expect(react?.scenes.map(item => item.scene.kind)).toEqual(['title', 'compare', 'chart', 'stat']);
    expect(react?.scenes.map(item => item.sceneId)).toEqual(['s1-title', 's2-compare', 's3-chart', 's4-stat']);
    const scenes = (composition as any).scenes as any[];
    // The React scenes keep no picture layers, only what surrounds them.
    const around = scenes.find(scene => scene.id === 's2-compare').layers as any[];
    expect(around.filter(layer => !/^(chapter|caption|voice|sfx-)/.test(layer.id))).toEqual([]);
    expect(react?.look.palette.accent).toBeTruthy();
  });

  it('compiles exactly as before when no kind is asked for', () => {
    expect(compileExplainer(script()).react).toBeUndefined();
    expect(compileExplainer(script(), { reactKinds: ['pile'] }).react).toBeUndefined();
  });

  it('draws other shapes too, by fitting the vertical column into the frame like the stock scenes do', () => {
    for (const aspect of ['16:9', '1:1', '4:5']) {
      const { composition, react } = compileExplainer(script(aspect), { reactKinds: REACT_KINDS });
      expect(react?.scenes).toHaveLength(4);
      const scene = ((composition as any).scenes as any[]).find(item => item.id === 's2-compare');
      expect(scene.camera.zoom).toBeLessThan(1.0001);
    }
    const vertical = compileExplainer(script('9:16'), { reactKinds: REACT_KINDS }).composition as any;
    expect(vertical.scenes.find((item: any) => item.id === 's2-compare').camera).toBeUndefined();
  });

  it('knows which variants each React scene offers', () => {
    expect(explainerVariants.compare).toEqual(['split', 'stacked', 'versus']);
    expect(Object.keys(explainerVariants).sort()).toEqual([...REACT_KINDS].sort());
    expect(explainerVariants.stat).toEqual(['hero', 'ring', 'stacked']);
    expect(explainerVariants.phone).toEqual(['handset', 'thread']);
    expect(explainerVariants.media).toEqual(['frame', 'split', 'browser']);
    expect(explainerVariants.steps).toContain('bento');
    expect(explainerVariants.code).toEqual(['editor', 'typed']);
    expect(explainerVariants.quote).toContain('typed');
  });

  it('writes a React video for a script, beside its composition, and falls back to nothing blank', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mr-react-'));
    try {
      const built = await buildExplainer(script(), { output: join(dir, 'composition.json'), voice: false, react: true });
      expect(built.react).toBe(true);
      expect(existsSync(join(dir, 'explainer-react.tsx'))).toBe(true);
      expect(readFileSync(join(dir, 'explainer-react.tsx'), 'utf8')).toContain('ExplainerView');
      const composition = JSON.parse(readFileSync(join(dir, 'composition.json'), 'utf8'));
      expect(JSON.stringify(composition)).toContain('"type":"react"');
      expect(built.notes.join(' ')).toMatch(/4 scenes drawn with React components \((title, compare, chart, stat)\)/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60000);
});
