import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractCode, type AiProvider, type BuildPlan } from '@ove/ai';
import { reactFromPlan } from '../../packages/cli/src/react-video';

// A weak model opens a code fence twice, and the route that fails must not leave files that block the fallback.

const code = 'import { AbsoluteFill } from "@ove/react";\nexport const config = { id: "x" };\nexport default function Video() { return null; }';

describe('extractCode', () => {
  it('takes the code from a normal fenced reply, with or without a language', () => {
    expect(extractCode('```tsx\n' + code + '\n```')).toBe(code);
    expect(extractCode('```\n' + code + '\n```')).toBe(code);
    expect(extractCode('```typescript\n' + code + '\n```\n')).toBe(code);
  });

  it('survives a fence opened twice, which is what a weak model wrote and which sank all three attempts', () => {
    expect(extractCode('```tsx\n```tsx\n' + code + '\n```')).toBe(code);
    expect(extractCode('```tsx\n```tsx\n' + code)).toBe(code);                // never closed
    expect(extractCode('```tsx\n' + code + '\n```\n```')).toBe(code);         // closed twice
  });

  it('ignores a sentence around the block and prefers the module when there are several blocks', () => {
    expect(extractCode('Here is the video:\n```tsx\n' + code + '\n```\nHope it helps!')).toBe(code);
    expect(extractCode('Run it with:\n```sh\nove build video.tsx\n```\nThe file:\n```tsx\n' + code + '\n```')).toBe(code);
  });

  it('returns unfenced code as it is', () => {
    expect(extractCode(code + '\n')).toBe(code);
    expect(extractCode('')).toBe('');
  });
});

describe('a failed React attempt', () => {
  let dir = '';
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
  const plan: BuildPlan = { path: 'react', beats: [{ name: 'Hook', onScreen: 'salt', seconds: 3 }], reasons: [] };

  it('leaves the folder as it found it, so the plain composition can be written there next', async () => {
    dir = await mkdtemp(join(tmpdir(), 'ove-react-fail-'));
    await writeFile(join(dir, 'notes.txt'), 'mine');
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async () => 'I could not write that, sorry.' };
    await expect(reactFromPlan(provider, plan, { brief: 'a teaser', width: 1080, height: 1920, fps: 30, durationSeconds: 6, baseDir: dir }, {})).rejects.toThrow(/could not produce a valid build/);
    expect(await readdir(dir)).toEqual(['notes.txt']);
  }, 60_000);
});
