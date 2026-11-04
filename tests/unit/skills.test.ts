import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { commandSpecs } from '../../packages/cli/src/args';

// The skills are what a coding agent reads to drive the CLI, so they must be well formed and name only commands that exist.
const root = 'packages/cli/skills';
const folders = readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
const aiCommands = ['capabilities', 'doctor', 'compose', 'refine', 'narrate', 'transcribe', 'image', 'batch', 'studio', 'history', 'restore'];

describe('agent skills', () => {
  it('include the main guide and the task guides', () => {
    expect(folders).toEqual(expect.arrayContaining(['ove', 'ove-make-reel', 'ove-voiceover-captions', 'ove-batch-videos', 'ove-ai-compose']));
  });

  it.each(folders)('%s has a name that matches its folder and a description', folder => {
    const text = readFileSync(join(root, folder, 'SKILL.md'), 'utf8');
    const front = /^---\r?\nname: (.+)\r?\ndescription: (.+)\r?\n---/.exec(text);
    expect(front, 'front matter').not.toBeNull();
    expect(front![1]).toBe(folder);
    expect(front![2]!.length).toBeGreaterThan(40); expect(front![2]!.length).toBeLessThan(500);
  });

  it.each(folders)('%s only names commands that exist', folder => {
    const text = readFileSync(join(root, folder, 'SKILL.md'), 'utf8');
    for (const match of text.matchAll(/`ove ([a-z]+)(?: ([a-z]+))?/g)) {
      const [, command, sub] = match;
      expect.soft(Object.keys(commandSpecs), `ove ${command} in ${folder}`).toContain(command);
      if (command === 'ai' && sub) expect.soft(aiCommands, `ove ai ${sub} in ${folder}`).toContain(sub);
    }
  });
});
