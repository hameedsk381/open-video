import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVideoAgent } from '@ove/ai';
import type { AiProvider, ChatMessage } from '../../packages/ai/src/providers';

const validReactCode = `import { AbsoluteFill, useCurrentFrame } from '@ove/react';
export const config = {
  id: 'test-reel',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 180,
  props: { title: 'Test' }
};
export default function Video({ title }: typeof config.props) {
  const frame = useCurrentFrame();
  return <AbsoluteFill><h1>{title}</h1></AbsoluteFill>;
}
`;

describe('Video Agent', () => {
  it('generates a React video and self-corrects on build failure', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-agent-test-'));
    const calls: ChatMessage[][] = [];

    let attemptCount = 0;
    const mockProvider: AiProvider = {
      id: 'mock-agent',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat(messages) {
        calls.push(messages);
        attemptCount++;
        if (attemptCount === 1) {
          // Attempt 1: output bad code
          return '```tsx\nexport default function Bad() { return <div>bad</div> }\n```';
        }
        // Attempt 2: output corrected code
        return `\`\`\`tsx\n${validReactCode}\n\`\`\``;
      },
    };

    let buildCalls = 0;
    const mockBuild = async (_source: string, _output: string) => {
      buildCalls++;
      if (buildCalls === 1) {
        throw new Error('Missing config export: config must be exported');
      }
    };

    try {
      const result = await runVideoAgent(
        mockProvider,
        {
          brief: 'A fast launch reel for an AI agent',
          dir,
          format: 'reel',
          durationSeconds: 6,
        },
        mockBuild
      );

      expect(result.attempts).toBe(2);
      expect(result.videoPath).toBe(join(dir, 'video.tsx'));
      expect(calls.length).toBe(2);
      expect(calls[0]![0]!.content).toContain('You are the lead Motion Graphics Director');
      expect(calls[1]![calls[1]!.length - 1]!.content).toContain('The generated video.tsx failed to build with this error:');

      const savedCode = await readFile(result.videoPath, 'utf8');
      expect(savedCode).toContain('export const config');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runs without a build helper in standalone mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ove-agent-test-'));
    const mockProvider: AiProvider = {
      id: 'mock-agent',
      model: 'mock-model',
      baseUrl: 'http://mock',
      async chat() {
        return validReactCode;
      },
    };

    try {
      const result = await runVideoAgent(mockProvider, {
        brief: 'Simple promo',
        dir,
        format: 'landscape',
      });

      expect(result.attempts).toBe(1);
      const savedCode = await readFile(result.videoPath, 'utf8');
      expect(savedCode).toBe(validReactCode.trim());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
