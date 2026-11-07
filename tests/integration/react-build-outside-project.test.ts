import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReact } from '../../packages/cli/src/build';

// A video a model wrote lands in a scratch folder that has no node_modules. `import 'react'` there used to fail the build with
// 'Could not resolve "react"', which the agent could not repair because the model's code was never the problem.
describe('building a React video that lives outside any project', () => {
  it('resolves react and react-dom from the install, not from the video folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-outside-'));
    try {
      await writeFile(join(dir, 'video.tsx'), [
        "import React from 'react';",
        "import { useCurrentFrame } from 'motionrender/react';",
        'export const config = { width: 320, height: 180, fps: 30, durationInFrames: 30 };',
        'export default function Video() { const frame = useCurrentFrame(); return <div style={{ width: 320, height: 180 }}>{frame}</div>; }',
      ].join('\n'), 'utf8');
      await buildReact(join(dir, 'video.tsx'), join(dir, 'composition.json'));
      const composition = JSON.parse(await readFile(join(dir, 'composition.json'), 'utf8'));
      expect(composition.scenes?.length ?? 0).toBeGreaterThan(0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 60_000);
});
