import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { explainerSchema } from '@ove/schema';

// esbuild, react and react-dom are optional peer dependencies of the package, so a plain `npm i -g motionrender` has none of them. The React
// build then cannot run; `mr make` must still produce the video, with the fixed scenes, instead of failing.
vi.mock('../../packages/cli/src/react-compose', () => ({
  convertToReact: async () => { throw new Error('Building a React video needs esbuild, react and react-dom in your project: npm install --save-dev esbuild react react-dom'); },
}));

const { buildExplainer } = await import('../../packages/cli/src/explainer');

describe('the React build when its tools are missing', () => {
  it('falls back to the fixed scenes, with a note, and leaves a composition with every picture drawn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mr-react-missing-'));
    try {
      const script = explainerSchema.parse({ version: '1.0', topic: 'T', scenes: [
        { kind: 'title', lines: ['Hello', 'World'] },
        { kind: 'stat', value: '3x', label: 'faster' },
      ] });
      const built = await buildExplainer(script, { output: join(dir, 'composition.json'), voice: false, react: true });
      expect(built.react).toBe(false);
      expect(built.notes.join(' ')).toMatch(/React: not used \(Building a React video needs esbuild/);
      const composition = JSON.parse(readFileSync(join(dir, 'composition.json'), 'utf8'));
      expect(JSON.stringify(composition)).not.toContain('"type":"react"');
      const stat = composition.scenes.find((scene: any) => /stat/.test(scene.id));
      expect(stat.layers.some((layer: any) => layer.type === 'text')).toBe(true);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
