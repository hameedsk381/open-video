import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildRegistry, explainerPrompt, planBuild, type AiProvider, type ChatMessage } from '@ove/ai';
import { agentInstructions, setupAgents } from '../../packages/cli/src/agent-setup';
import { skillsRoot } from '../../packages/cli/src/init';

// The motion-design skill (LottieFiles, MIT) ships with MotionRender with its licence, links that resolve, and a note on using it in frames;
// what it teaches reaches the planner and the explainer writer; and agents are told about it and about the ffmpeg-skill companion.
const dir = join(skillsRoot, 'motion-design');

describe('the motion-design skill', () => {
  it('is complete, carries its licence and credits its source', async () => {
    const skill = await readFile(join(dir, 'SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\r?\nname: motion-design/);
    expect(skill).toContain('github.com/LottieFiles/motion-design-skill');
    expect(skill).toContain('frames = ms × fps / 1000');
    const licence = await readFile(join(dir, 'LICENSE'), 'utf8');
    expect(licence).toMatch(/MIT License/);
    expect(licence).toContain('LottieFiles');
    expect(await readFile(join(__dirname, '../../THIRD_PARTY_LICENSES.md'), 'utf8')).toContain('motion-design-skill');
  });

  it('has every file its own links point to', async () => {
    const skill = await readFile(join(dir, 'SKILL.md'), 'utf8');
    const links = [...skill.matchAll(/\]\(((?:director|patterns|reference)\/[a-z-]+\.md)\)/g)].map(match => match[1]!);
    expect(links.length).toBeGreaterThanOrEqual(15);
    for (const link of new Set(links)) expect(existsSync(join(dir, link)), link).toBe(true);
  });

  it('is copied to a project by setup, with the other skills', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const folder = await mkdtemp(join(tmpdir(), 'ove-md-'));
    try {
      await setupAgents(folder, {});
      expect(existsSync(join(folder, '.claude', 'skills', 'motion-design', 'SKILL.md'))).toBe(true);
      expect(existsSync(join(folder, '.agent', 'skills', 'motion-design', 'reference', 'timing-easing-tables.md'))).toBe(true);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
});

describe('what the skill changes', () => {
  it('puts the motion rules in the planner prompt', async () => {
    const seen: ChatMessage[][] = [];
    const provider: AiProvider = { id: 'fake', model: 'm', baseUrl: 'fake://', chat: async messages => { seen.push(messages); return JSON.stringify({ path: 'json', beats: [{ name: 'Hook', onScreen: 'the headline', seconds: 6 }] }); } };
    await planBuild(provider, { brief: 'a launch', width: 1080, height: 1080, fps: 30, durationSeconds: 6, registry: buildRegistry({}) });
    const text = String(seen[0]![0]!.content);
    expect(text).toContain('Motion craft');
    expect(text).toContain('never linear easing');
    expect(text).toContain('ONE personality');
  });

  it('tells the explainer writer to match motion to the subject', () => {
    const system = String(explainerPrompt('how caches work')[0]!.content);
    expect(system).toContain('Motion should match the subject');
  });

  it('tells agents about the skill and the ffmpeg-skill companion, and to ask before installing it', () => {
    const text = agentInstructions();
    expect(text).toContain('motion-design');
    expect(text).toContain('ffmpeg-skill');
    expect(text).toMatch(/ask the user before installing/);
  });
});
