// Making a folder ready for an agent: instructions it reads on its own (AGENTS.md for Codex and most agents, CLAUDE.md for Claude Code), the skills,
// and the MCP server configured for each client. `mr init` uses it for a new project and `mr setup` for an existing folder. Nothing here touches a
// user-level config file: those are printed by `mr mcp --config <client>` for the person to apply.
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { skillsRoot } from './init';

export const MCP_COMMAND = { command: 'npx', args: ['-y', 'motionrender', 'mcp'] };
/** For a machine or image that already has motionrender installed: no download on first use. */
export const MCP_COMMAND_LOCAL = { command: 'mr', args: ['mcp'] };
export type McpClient = 'claude-code' | 'claude-desktop' | 'codex' | 'cursor';
export const mcpClients: McpClient[] = ['claude-code', 'claude-desktop', 'codex', 'cursor'];

const START = '<!-- motionrender:start -->', END = '<!-- motionrender:end -->';

/** The instructions an agent reads before making a video: what to run, in what order, and how to know it is right. */
export const agentInstructions = (): string => `${START}
# MotionRender: making videos

MotionRender (\`motionrender\`, short \`mr\`) turns JSON into frame-exact video. You write the JSON; the engine draws, times, checks and renders it. **You are the model: nothing here needs an AI key.** The \`mr ai\` commands are optional.

## Pick the route
1. **Explainer** (a vertical video that teaches one idea, scene by scene, with spoken lines): write an \`explainer.json\`. Run \`mr explainer kinds\` for the scene kinds and an example of each, and \`mr schema --explainer\` for every field. This is the fastest route to something good.
   **Choose the look for the subject, not the default:** \`mr explainer looks\` lists 13 whole designs (colours, type, motion, texture, corners, weight). Do not use the same look for every video, and do not leave it at navy unless the subject is finance or technology. \`design\` in the script changes parts of a look.
2. **Composition** (anything else: reels, promos, product videos, kinetic type): write a \`composition.json\` against \`mr schema\`. Start from \`mr init <dir>\` and add ready-made scenes with \`mr add\` (\`mr blocks\` lists them) rather than from nothing.
3. **Code** (logic JSON cannot say: generated layouts, data-driven scenes): see the \`ove-code-video\` and \`ove-react-video\` skills.

## The loop (two calls, not eight)
1. Write the script or composition.
2. \`mr make explainer.json\` (or \`composition.json\`; MCP: \`motionrender_make_video\`). One call validates it, builds \`composition.json\`, runs the design review and draws ONE contact sheet of the whole video (\`review.png\`), and lists every problem with where it is. **Open the contact sheet**, fix what it lists, run it again. Add \`--no-voice\` while iterating: it is silent and faster.
3. When the sheet is right, \`mr make explainer.json --draft\` renders a quick half-size MP4 to check how it moves (about twice as fast as the final), then \`mr make explainer.json --final\` writes \`out.mp4\`. Nothing is rendered over review errors.
Never say a video is done before you have looked at the contact sheet. The single steps still exist when you want one thing only: \`mr explainer validate\`, \`mr explainer compile\`, \`mr still composition.json --frame 90\`, \`mr review\`, \`mr render\`.

## Facts, pictures, voices
- Numbers must be real, never from memory. Look them up (no key needed): \`mr facts country India,Brazil internet_users\`, \`mr facts wikipedia "Load balancing"\`, \`mr facts exchange USD INR\` (\`mr facts indicators\` lists the figures; add \`--json\`), or the \`motionrender_facts\` tool. Every fact has a source and date: put it in the scene's note or caption and in the script's \`sources\`. If a lookup fails, say so and leave the number out; do not guess.
- A media scene takes a file from the project (\`assets/...\`) or a \`prompt\` (needs an image model: \`--images\`). Stock photos: the studio's Media tab.
- Voices: the free Edge voices, which need internet but no key: \`en-IN-NeerjaNeural\`, \`en-US-AriaNeural\`, \`hi-IN-SwaraNeural\`, \`te-IN-ShrutiNeural\` (set \`voice\` in the script; \`voiceRate\` speeds it up or slows it down, +12 suits a promo). \`--no-voice\` builds silently.

## Tools (MCP)
The same things are available as MCP tools. Start with \`motionrender_make_video\` (check, build, review and one contact sheet in a single call, optional draft or final render). The single steps: \`motionrender_schema\`, \`motionrender_explainer_kinds\`, \`motionrender_explainer_validate\`, \`motionrender_explainer_compile\`, \`motionrender_facts\` (or \`mr facts\`), \`motionrender_validate\`, \`motionrender_render_still\`, \`motionrender_review_video\`, \`motionrender_render_video\`, \`motionrender_environment\` (run it first if a render fails). Configure them with \`mr mcp --config <claude-code|codex|cursor|claude-desktop>\`.

## Good to know
- Before choosing timing, easing, staggers or an animation style, read the \`motion-design\` skill (one personality per video, easing and duration tables, a quality checklist). For footage work beyond \`mr ai edit\` (HDR tone mapping, stabilising, multicam, lossless cuts, platform checks) the companion ffmpeg-skill (\`npx ffmpeg-skill\`, MIT, local, needs Python and FFmpeg) is a good fit: ask the user before installing it, because it writes to their skills folder.
- 9:16 is the default. Keep text out of the top 8%, bottom 18% and right 11% (platform buttons cover them); \`mr review\` flags it.
- One idea per scene, a spoken line per scene, five to eight scenes. Scenes last as long as their line.
- Code layers (\`code\`, \`react\`, \`p5\`) run JavaScript while rendering and need \`--allow-code\`, for files you trust. \`model\` (3D .glb), \`physics\`, \`sketch\` and \`shader\` do not.
- First render on a machine: \`mr doctor\` checks Node 22+, FFmpeg and the browser; \`mr browser install\` fetches Chromium.
- Skills with the detail are in \`.claude/skills\` and \`.agent/skills\` (start with \`ove\`, then \`ove-explainer\`).
${END}
`;

const claudeInstructions = (): string => `${START}
# MotionRender

@AGENTS.md

For Claude Code: the MotionRender MCP server is configured in \`.mcp.json\` (approve it when asked), and the skills are in \`.claude/skills\`.
${END}
`;

/** Writes the block into a file, replacing an earlier MotionRender block and leaving the rest of the file alone. */
async function putBlock(file: string, block: string, force: boolean): Promise<'created' | 'updated' | 'kept'> {
  if (!existsSync(file)) { await mkdir(dirname(file), { recursive: true }); await writeFile(file, block); return 'created'; }
  const current = await readFile(file, 'utf8'), from = current.indexOf(START), to = current.indexOf(END);
  if (from >= 0 && to > from) { await writeFile(file, current.slice(0, from) + block.trimEnd() + current.slice(to + END.length)); return 'updated'; }
  if (current.includes('MotionRender') && !force) return 'kept';
  await writeFile(file, `${current.trimEnd()}\n\n${block}`);
  return 'updated';
}

/** Adds the MotionRender server to a {"mcpServers": {...}} file (.mcp.json, .cursor/mcp.json), keeping every other server. */
async function putMcpJson(file: string, command: { command: string; args: string[] }): Promise<'created' | 'updated'> {
  let data: { mcpServers?: Record<string, unknown> } = {}, existed = false;
  if (existsSync(file)) { existed = true; try { data = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error(`${file} is not valid JSON; fix it or remove it, then run setup again`); } }
  data.mcpServers = { ...data.mcpServers, motionrender: command };
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + '\n');
  return existed ? 'updated' : 'created';
}

const codexBlock = (command: { command: string; args: string[] }) => `[mcp_servers.motionrender]\ncommand = "${command.command}"\nargs = [${command.args.map(arg => `"${arg}"`).join(', ')}]\n`;
const CODEX_BLOCK = codexBlock(MCP_COMMAND);

async function putCodexToml(file: string, command: { command: string; args: string[] }): Promise<'created' | 'updated' | 'kept'> {
  if (existsSync(file)) {
    const current = await readFile(file, 'utf8');
    if (current.includes('[mcp_servers.motionrender]')) return 'kept';
    await writeFile(file, `${current.trimEnd()}\n\n${codexBlock(command)}`);
    return 'updated';
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, codexBlock(command));
  return 'created';
}

export type SetupOptions = { force?: boolean; skills?: boolean; /** The server is started with the installed `mr mcp`, not `npx -y motionrender mcp`. */ local?: boolean };

/** Makes a folder ready for agents. Returns what was written, one line each. */
export async function setupAgents(dir: string, options: SetupOptions = {}): Promise<string[]> {
  const out: string[] = [], note = (file: string, what: string) => out.push(`${what.padEnd(8)} ${relative(dir, file) || file}`);
  const agents = join(dir, 'AGENTS.md'), claude = join(dir, 'CLAUDE.md');
  note(agents, await putBlock(agents, agentInstructions(), options.force === true));
  note(claude, await putBlock(claude, claudeInstructions(), options.force === true));
  const command = options.local ? MCP_COMMAND_LOCAL : MCP_COMMAND;
  note(join(dir, '.mcp.json'), await putMcpJson(join(dir, '.mcp.json'), command));
  note(join(dir, '.cursor', 'mcp.json'), await putMcpJson(join(dir, '.cursor', 'mcp.json'), command));
  note(join(dir, '.codex', 'config.toml'), await putCodexToml(join(dir, '.codex', 'config.toml'), command));
  if (options.skills !== false) {
    await cp(skillsRoot, join(dir, '.claude', 'skills'), { recursive: true, force: true });
    await cp(skillsRoot, join(dir, '.agent', 'skills'), { recursive: true, force: true });
    out.push('written  .claude/skills and .agent/skills');
  }
  return out;
}

/** The MCP configuration for one client, as text to apply (user-level files are never edited for you). */
export function mcpConfig(client: McpClient): string {
  switch (client) {
    case 'claude-code': return `# Claude Code (this project, shared through .mcp.json)\nclaude mcp add --scope project motionrender -- npx -y motionrender mcp\n# or just for you:\nclaude mcp add motionrender -- npx -y motionrender mcp`;
    case 'claude-desktop': return `# Claude Desktop: add to claude_desktop_config.json\n# (Windows: %APPDATA%\\Claude\\claude_desktop_config.json, macOS: ~/Library/Application Support/Claude/claude_desktop_config.json)\n${JSON.stringify({ mcpServers: { motionrender: MCP_COMMAND } }, null, 2)}`;
    case 'codex': return `# Codex: one command\ncodex mcp add motionrender -- npx -y motionrender mcp\n# or add to ~/.codex/config.toml (or .codex/config.toml in a trusted project)\n${CODEX_BLOCK.trimEnd()}`;
    case 'cursor': return `# Cursor: add to .cursor/mcp.json (this project) or ~/.cursor/mcp.json\n${JSON.stringify({ mcpServers: { motionrender: MCP_COMMAND } }, null, 2)}`;
  }
}
