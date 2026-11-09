// A clean-room test of what an agent does with MotionRender, from nothing: set a folder up, write a script, build it, look at it, render a few frames
// and talk to the MCP server. Run it against a packed tarball before publishing, against the agent image after building it, or inside any sandbox
// that has `mr` installed. Only Node built-ins are used, so it runs anywhere Node 22 does.
//
//   node scripts/agent-smoke.mjs --tarball motionrender-0.5.1.tgz     install the tarball into a temporary folder and test that
//   node scripts/agent-smoke.mjs --docker motionrender-agent          test an image (docker run, with a temporary folder mounted as /work)
//   node scripts/agent-smoke.mjs --installed                          test the `mr` already on PATH (inside a sandbox or image)
//   add --keep to leave the folder behind, --dry-run to print the commands without running them
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const argv = process.argv.slice(2);
const option = name => { const at = argv.indexOf(name); return at < 0 ? undefined : argv[at + 1]; };
const flag = name => argv.includes(name);
const tarball = option('--tarball'), image = option('--docker'), dry = flag('--dry-run');
const mode = tarball ? 'tarball' : image ? 'docker' : flag('--installed') ? 'installed' : undefined;
if (!mode) { console.error('Usage: node scripts/agent-smoke.mjs --tarball <file.tgz> | --docker <image> | --installed   [--keep] [--dry-run]'); process.exit(2); }

const root = mkdtempSync(join(tmpdir(), 'mr-agent-smoke-'));
const work = mode === 'docker' ? root : join(root, 'work');
const app = join(root, 'app');

/** The command that runs `mr <args>` in this mode, as [program, args]. */
export function commandFor(args, options = {}) {
  if (mode === 'docker') {
    const user = typeof process.getuid === 'function' ? ['--user', `${process.getuid()}:${process.getgid()}`] : [];
    return ['docker', ['run', ...(options.stdin ? ['-i'] : []), '--rm', ...user, '-e', 'HOME=/tmp', '-v', `${work}:/work`, '-w', '/work', image, 'mr', ...args]];
  }
  if (mode === 'tarball') return [process.execPath, [join(app, 'node_modules', 'motionrender', 'dist', 'cli.js'), ...args]];
  return ['mr', args];
}

const results = [];
const show = (command, args) => [command, ...args].map(part => (/\s/.test(part) ? JSON.stringify(part) : part)).join(' ');
function run(args, options = {}) {
  const [command, commandArgs] = commandFor(args, options);
  if (dry) { console.log(show(command, commandArgs)); return { status: 0, stdout: '', stderr: '' }; }
  const done = spawnSync(command, commandArgs, { cwd: mode === 'docker' ? undefined : work, encoding: 'utf8', input: options.stdin, timeout: options.timeout ?? 600_000, shell: mode === 'installed' && process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  return { status: done.status, stdout: done.stdout ?? '', stderr: done.stderr ?? '', error: done.error };
}

function step(name, body) {
  const started = Date.now();
  let problem;
  // A dry run only prints the commands: what they would have produced is not there to check.
  try { body(); } catch (error) { if (!dry) problem = error.message; }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (!dry) { results.push({ name, problem }); console.log(`${problem ? '✗' : '✓'} ${name.padEnd(34)} ${seconds.padStart(6)} s${problem ? `\n    ${String(problem).split('\n').join('\n    ')}` : ''}`); }
}
const need = (condition, message) => { if (!condition) throw new Error(message); };
const file = name => join(work, name);
const ok = (done, what) => need(done.status === 0, `${what} failed (exit ${done.status ?? done.error?.message})\n${(done.stderr || done.stdout).slice(-600)}`);

try {
  if (mode === 'tarball') {
    step('install the tarball', () => {
      const [npm, npmArgs] = process.platform === 'win32' ? ['cmd', ['/c', 'npm', 'init', '-y']] : ['npm', ['init', '-y']];
      spawnSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(app)},{recursive:true});require('fs').mkdirSync(${JSON.stringify(work)},{recursive:true})`]);
      spawnSync(npm, npmArgs, { cwd: app, encoding: 'utf8' });
      const install = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', resolve(tarball), '--no-audit', '--no-fund'], { cwd: app, encoding: 'utf8', shell: process.platform === 'win32', timeout: 600_000 });
      need(install.status === 0, `npm install failed\n${(install.stderr || install.stdout).slice(-600)}`);
    });
  } else if (!dry) {
    spawnSync(process.execPath, ['-e', `require('fs').mkdirSync(${JSON.stringify(work)},{recursive:true})`]);
  }

  step('help lists the agent commands', () => {
    const done = run(['--help']); ok(done, 'mr --help');
    for (const needle of ['mr setup', 'mr explainer kinds', 'mr facts', 'mr mcp']) need(done.stdout.includes(needle), `the help does not mention "${needle}"`);
  });
  step('doctor: Node, FFmpeg, browser', () => { const done = run(['doctor']); ok(done, 'mr doctor'); });
  step('setup: instructions, skills, MCP', () => {
    ok(run(['setup', '.', '--local']), 'mr setup');
    for (const name of ['AGENTS.md', 'CLAUDE.md', '.mcp.json', '.cursor/mcp.json', '.codex/config.toml', '.claude/skills/ove-explainer/SKILL.md', '.agent/skills/ove/SKILL.md']) need(existsSync(file(name)), `setup did not write ${name}`);
    need(JSON.parse(readFileSync(file('.mcp.json'), 'utf8')).mcpServers.motionrender.command === 'mr', '.mcp.json does not start the installed mr');
  });
  step('explainer example and validate', () => {
    ok(run(['explainer', 'example', '--output', 'explainer.json']), 'explainer example');
    const done = run(['explainer', 'validate', 'explainer.json', '--json']); ok(done, 'explainer validate');
    need(JSON.parse(done.stdout.trim().split('\n').at(-1)).valid === true, 'the example script is not valid');
  });
  step('compile (silent)', () => { ok(run(['explainer', 'compile', 'explainer.json', '--no-voice']), 'explainer compile'); need(existsSync(file('composition.json')), 'no composition.json'); });
  step('still: one frame as a picture', () => {
    ok(run(['still', 'composition.json', '--frame', '120', '--output', 'still.png']), 'mr still');
    const bytes = readFileSync(file('still.png'));
    need(bytes.length > 10_000 && bytes.subarray(1, 4).toString() === 'PNG', `still.png is not a picture (${bytes.length} bytes)`);
  });
  step('render: 30 frames to MP4', () => {
    ok(run(['render', 'composition.json', '--frames', '0-29', '--scale', '0.25', '--output', 'clip.mp4']), 'mr render');
    const bytes = readFileSync(file('clip.mp4'));
    need(bytes.length > 10_000 && bytes.subarray(4, 8).toString() === 'ftyp', `clip.mp4 is not a video (${bytes.length} bytes)`);
  });
  step('MCP: tools, resources, a call', () => {
    const lines = [{ method: 'initialize', params: {} }, { method: 'tools/list' }, { method: 'resources/list' }, { method: 'tools/call', params: { name: 'motionrender_explainer_validate', arguments: { file: 'explainer.json' } } }]
      .map((call, i) => JSON.stringify({ jsonrpc: '2.0', id: i + 1, ...call })).join('\n') + '\n';
    const done = run(['mcp'], { stdin: lines, timeout: 120_000 });
    const replies = new Map(done.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).map(message => [message.id, message]));
    need(replies.get(1)?.result?.serverInfo?.name === 'motionrender', 'the MCP server did not answer initialize');
    const names = (replies.get(2)?.result?.tools ?? []).map(tool => tool.name);
    for (const name of ['motionrender_schema', 'motionrender_explainer_kinds', 'motionrender_explainer_compile', 'motionrender_facts', 'motionrender_render_still']) need(names.includes(name), `the MCP server has no ${name}`);
    need((replies.get(3)?.result?.resources ?? []).some(item => item.uri === 'motionrender://skill/ove-explainer'), 'the ove-explainer skill is not served as a resource');
    need(/Valid explainer/.test(replies.get(4)?.result?.content?.[0]?.text ?? ''), 'explainer_validate did not accept the example');
  });
} finally {
  if (!flag('--keep')) rmSync(root, { recursive: true, force: true });
  else console.log(`\nKept ${root}`);
}

if (!dry) {
  const failed = results.filter(result => result.problem);
  console.log(`\n${failed.length ? `${failed.length} of ${results.length} steps failed` : `all ${results.length} steps passed`} (${mode}${image ? `: ${image}` : ''})`);
  process.exit(failed.length ? 1 : 0);
}
