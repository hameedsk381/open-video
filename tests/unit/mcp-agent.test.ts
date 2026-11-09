import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { explainerExample } from '@ove/schema';
import { agentInstructions, mcpConfig, mcpClients, setupAgents } from '../../packages/cli/src/agent-setup';

// What an agent actually does over the MCP wire, with no AI provider: read the schema and the scene kinds, validate a script, build it, look up
// nothing it should not, and find the skills as resources. And what `setup` leaves in a folder that already has files of its own.
let dir = '';
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'ove-agent-')); });
afterAll(() => rm(dir, { recursive: true, force: true }));

type Call = { method: string; params?: unknown };
async function talk(calls: Call[]): Promise<Map<number, any>> {
  const stdout: string = await new Promise((ok, fail) => {
    const proc = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'packages/cli/src/index.ts', 'mcp'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout.on('data', chunk => { out += chunk.toString(); });
    proc.on('close', () => ok(out)); proc.on('error', fail);
    calls.forEach((call, i) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i + 1, ...call }) + '\n'));
    proc.stdin.end();
  });
  return new Map(stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).map(message => [message.id, message]));
}
const tool = (name: string, args: unknown): Call => ({ method: 'tools/call', params: { name, arguments: args } });
const text = (reply: any): string => reply.result.content[0].text;

describe('the MCP server for agents that write the video themselves', () => {
  it('offers the schema, the scene kinds, validation, building and facts, and serves skills and schemas as resources', async () => {
    const script = explainerExample();
    const out = join(dir, 'built');
    const bad = { topic: 'X', scenes: [{ kind: 'hex', columns: 9 }, { kind: 'phone', app: 'A', messages: [] }] };
    const replies = await talk([
      { method: 'initialize', params: {} },
      { method: 'tools/list' },
      tool('motionrender_schema', { kind: 'explainer' }),
      tool('motionrender_explainer_kinds', {}),
      tool('motionrender_explainer_validate', { script }),
      tool('motionrender_explainer_validate', { script: bad }),
      tool('motionrender_explainer_compile', { script, outputDir: out }),
      tool('motionrender_facts', { lookups: [{ type: 'http', url: 'http://169.254.169.254/' }] }),
      { method: 'resources/list' },
      { method: 'resources/read', params: { uri: 'motionrender://skill/ove-explainer' } },
      { method: 'resources/read', params: { uri: 'motionrender://schema/explainer' } },
      tool('motionrender_environment', {}),
    ]);

    expect(replies.get(1).result.capabilities).toMatchObject({ tools: {}, resources: {} });
    const names = replies.get(2).result.tools.map((item: any) => item.name);
    for (const name of ['motionrender_schema', 'motionrender_explainer_kinds', 'motionrender_explainer_validate', 'motionrender_explainer_compile', 'motionrender_facts', 'motionrender_environment', 'motionrender_init', 'motionrender_render_still']) expect(names, name).toContain(name);
    expect(new Set(names).size).toBe(names.length);

    expect(Object.keys(JSON.parse(text(replies.get(3))).properties)).toEqual(expect.arrayContaining(['topic', 'scenes']));
    expect(JSON.parse(text(replies.get(4))).map((doc: any) => doc.kind)).toContain('hex');
    expect(text(replies.get(5))).toMatch(/Valid explainer "URL SHORTENER": 5 scenes/);
    expect(replies.get(6).result.isError).toBe(true);
    expect(text(replies.get(6))).toMatch(/scenes\.0\.columns[\s\S]*scenes\.1\.messages/);

    expect(text(replies.get(7))).toMatch(/5 scenes, 5 spoken lines \(silent/);
    expect(existsSync(join(out, 'composition.json'))).toBe(true);

    // A lookup the list does not offer is refused, never fetched.
    expect(replies.get(8).result.isError).toBe(true);
    expect(text(replies.get(8))).toMatch(/Skipped/);

    const resources = replies.get(9).result.resources.map((item: any) => item.uri);
    expect(resources).toEqual(expect.arrayContaining(['motionrender://schema/composition', 'motionrender://schema/explainer', 'motionrender://skill/ove-explainer', 'motionrender://skill/ove']));
    expect(replies.get(10).result.contents[0].text).toMatch(/^---\nname: ove-explainer/);
    expect(JSON.parse(replies.get(11).result.contents[0].text).type).toBe('object');
    expect(text(replies.get(12))).toMatch(/Node/);
  }, 120_000);
});

describe('setup for agents', () => {
  it('adds its instructions and servers to a folder that already has its own, and does it only once', async () => {
    const folder = join(dir, 'existing');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'AGENTS.md'), '# Mine\n\nKeep this.\n');
    await writeFile(join(folder, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    await mkdir(join(folder, '.codex'), { recursive: true });
    await writeFile(join(folder, '.codex', 'config.toml'), 'model = "x"\n');

    await setupAgents(folder, { skills: false });
    const again = await setupAgents(folder, { skills: false });
    expect(again.join('\n')).toMatch(/kept\s+\.codex/);

    const agents = await readFile(join(folder, 'AGENTS.md'), 'utf8');
    expect(agents.startsWith('# Mine\n\nKeep this.\n')).toBe(true);
    expect(agents.match(/motionrender:start/g)).toHaveLength(1);
    const mcp = JSON.parse(await readFile(join(folder, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers).sort()).toEqual(['motionrender', 'other']);
    expect(mcp.mcpServers.motionrender).toEqual({ command: 'npx', args: ['-y', 'motionrender', 'mcp'] });
    const toml = await readFile(join(folder, '.codex', 'config.toml'), 'utf8');
    expect(toml.startsWith('model = "x"')).toBe(true);
    expect(toml.match(/\[mcp_servers\.motionrender\]/g)).toHaveLength(1);
    expect(await readFile(join(folder, 'CLAUDE.md'), 'utf8')).toContain('@AGENTS.md');
  });

  it('refuses to overwrite a .mcp.json that is not JSON', async () => {
    const folder = join(dir, 'broken');
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, '.mcp.json'), '{ not json');
    await expect(setupAgents(folder, { skills: false })).rejects.toThrow(/not valid JSON/);
  });

  it('copies the skills, including the explainer one', async () => {
    const folder = join(dir, 'skills');
    await setupAgents(folder);
    expect(existsSync(join(folder, '.claude', 'skills', 'ove-explainer', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(folder, '.agent', 'skills', 'ove', 'SKILL.md'))).toBe(true);
  }, 30_000);

  it('prints the right command for each client, with -- before the npx flags', () => {
    expect(mcpClients).toEqual(['claude-code', 'claude-desktop', 'codex', 'cursor']);
    expect(mcpConfig('claude-code')).toContain('claude mcp add motionrender -- npx -y motionrender mcp');
    expect(mcpConfig('codex')).toContain('codex mcp add motionrender -- npx -y motionrender mcp');
    expect(mcpConfig('codex')).toContain('[mcp_servers.motionrender]');
    expect(JSON.parse(mcpConfig('cursor').split('\n').slice(1).join('\n')).mcpServers.motionrender.command).toBe('npx');
  });

  it('gives instructions that name every command and tool an agent is told to use', () => {
    const text = agentInstructions();
    for (const needle of ['mr explainer kinds', 'mr schema --explainer', 'mr explainer validate', 'mr explainer compile', 'mr still', 'mr review', 'mr render', 'motionrender_facts', 'motionrender_environment']) expect(text, needle).toContain(needle);
  });
});
