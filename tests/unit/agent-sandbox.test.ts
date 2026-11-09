import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupAgents } from '../../packages/cli/src/agent-setup';

// For an image or a sandbox that has motionrender installed: the MCP config starts the installed `mr`, not a download through npx. And the clean-room
// smoke script builds the right docker command for every step, without needing docker to say so.
let dir = '';
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-sandbox-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('setup --local', () => {
  it('writes the installed mr into every MCP config, and npx without it', async () => {
    const local = join(dir, 'local'), remote = join(dir, 'remote');
    await setupAgents(local, { local: true, skills: false });
    await setupAgents(remote, { skills: false });
    for (const file of ['.mcp.json', '.cursor/mcp.json']) {
      expect(JSON.parse(await readFile(join(local, file), 'utf8')).mcpServers.motionrender, file).toEqual({ command: 'mr', args: ['mcp'] });
      expect(JSON.parse(await readFile(join(remote, file), 'utf8')).mcpServers.motionrender, file).toEqual({ command: 'npx', args: ['-y', 'motionrender', 'mcp'] });
    }
    expect(await readFile(join(local, '.codex', 'config.toml'), 'utf8')).toBe('[mcp_servers.motionrender]\ncommand = "mr"\nargs = ["mcp"]\n');
    expect(await readFile(join(remote, '.codex', 'config.toml'), 'utf8')).toContain('command = "npx"');
  });

  it('switches an existing config from npx to the installed mr', async () => {
    const folder = join(dir, 'switch');
    await setupAgents(folder, { skills: false });
    await setupAgents(folder, { local: true, skills: false });
    expect(JSON.parse(await readFile(join(folder, '.mcp.json'), 'utf8')).mcpServers.motionrender.command).toBe('mr');
  });
});

describe('the agent image', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');

  it('has an agent target before the studio, so the studio stays the default', () => {
    const stages = [...dockerfile.matchAll(/^FROM \S+ AS (\S+)/gm)].map(match => match[1]);
    expect(stages).toContain('agent');
    expect(stages.at(-1)).toBe('studio');
    expect(stages.indexOf('agent')).toBeLessThan(stages.indexOf('studio'));
  });

  it('sets /work up for the agent as the unprivileged user, and stays up for commands', () => {
    const agent = dockerfile.slice(dockerfile.indexOf('FROM chromium AS agent'), dockerfile.indexOf('FROM chromium AS studio'));
    expect(agent).toMatch(/ove setup \/work --local/);
    expect(agent).toMatch(/USER node/);
    expect(agent).toMatch(/WORKDIR \/work/);
    expect(agent).toMatch(/ENTRYPOINT \[\]/);
    expect(agent).toMatch(/CMD \["sleep", "infinity"\]/);
    expect(agent).not.toMatch(/INDIC|onnxruntime/);
  });
});

describe('scripts/agent-smoke.mjs', () => {
  const script = (...args: string[]) => spawnSync(process.execPath, ['scripts/agent-smoke.mjs', ...args], { encoding: 'utf8' });

  it('prints a docker command for every step, with the folder mounted as /work and the user kept', () => {
    const run = script('--docker', 'motionrender-agent', '--dry-run');
    expect(run.status).toBe(0);
    const lines = run.stdout.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(8);
    for (const line of lines) {
      expect(line, line).toMatch(/^docker run (-i )?--rm /);
      expect(line, line).toContain('-w /work motionrender-agent mr ');
      expect(line, line).toMatch(/:\/work /);
    }
    const joined = run.stdout;
    for (const part of ['mr doctor', 'mr setup . --local', 'mr explainer compile explainer.json --no-voice', 'mr still composition.json --frame 120', 'mr render composition.json --frames 0-29', 'docker run -i --rm']) expect(joined, part).toContain(part);
  });

  it('refuses to run without a mode, and leaves nothing behind in a dry run', () => {
    const none = script();
    expect(none.status).toBe(2);
    expect(none.stderr).toMatch(/Usage:/);
    const dry = script('--installed', '--dry-run');
    expect(dry.stdout).toMatch(/^mr --help/m);
  });
});
