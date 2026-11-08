// Fetches the binaries a packaged build carries: ffmpeg and ffprobe (the same builds the engine auto-installs) and the
// Playwright Chromium the renderer draws frames in. Run from apps/desktop with `pnpm fetch-tools`; resources/tools is copied
// into the installer as resources/tools, and tools.mjs points OVE_FFMPEG_PATH, OVE_FFPROBE_PATH and OVE_CHROMIUM_EXECUTABLE
// at it. Nothing here runs during development: the engine finds the machine's own tools.
import { spawn } from 'node:child_process';
import { chmod, cp, mkdir, stat } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..', '..');
const tools = join(appRoot, 'resources', 'tools');
const exe = process.platform === 'win32' ? '.exe' : '';
const RELEASE = 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1';

const platformArch = () => {
  if (process.platform === 'win32') return `win32-x64`;
  if (process.platform === 'darwin') return `darwin-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
  if (process.platform === 'linux') return `linux-${process.arch === 'arm64' ? 'arm64' : process.arch === 'arm' ? 'arm' : 'x64'}`;
  throw new Error(`No ffmpeg build for ${process.platform}.`);
};

async function exists(path) { try { await stat(path); return true; } catch { return false; } }

async function download(name, dest) {
  const url = `${RELEASE}/${name}-${platformArch()}.gz`;
  console.log(`Downloading ${name} from ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`${url} answered HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createGunzip(), createWriteStream(dest));
  if (process.platform !== 'win32') await chmod(dest, 0o755);
}

async function ffmpeg(name, dest) {
  if (existsSync(dest)) { console.log(`✓ ${name} already in resources/tools`); return; }
  // The engine keeps its auto-installed copies in ~/.motionrender/bin; reuse them when present.
  const cached = join(homedir(), '.motionrender', 'bin', `${name}${exe}`);
  await mkdir(tools, { recursive: true });
  if (existsSync(cached)) { await cp(cached, dest); console.log(`✓ ${name} copied from ${cached}`); return; }
  await download(name, dest);
  console.log(`✓ ${name} downloaded`);
}

async function chromium() {
  const target = join(tools, 'chromium');
  const present = ['chrome.exe', 'chrome', 'Chromium.app', 'Google Chrome for Testing.app'].some(name => existsSync(join(target, name)));
  if (present) { console.log('✓ Chromium already in resources/tools'); return; }
  const require = createRequire(import.meta.url);
  let playwright;
  try { playwright = require('playwright'); }
  catch { throw new Error('Playwright is not installed in the repository; run pnpm install first.'); }
  let executable = playwright.chromium.executablePath();
  if (!existsSync(executable)) {
    console.log('No Playwright Chromium yet; downloading it (about 150 MB)…');
    const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
    await new Promise((resolveRun, reject) => {
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit', cwd: repoRoot });
      child.once('exit', code => code === 0 ? resolveRun() : reject(new Error(`playwright install chromium exited ${code}`)));
      child.once('error', reject);
    });
    executable = playwright.chromium.executablePath();
  }
  if (!existsSync(executable)) throw new Error(`Playwright still reports no Chromium at ${executable}`);
  // The executable needs its sibling libraries, so the whole build folder comes along.
  await cp(dirname(executable), target, { recursive: true });
  console.log(`✓ Chromium copied from ${dirname(executable)}`);
}

async function size(dir) {
  if (!(await exists(dir))) return 'missing';
  const { execFileSync } = await import('node:child_process');
  try {
    const out = execFileSync(process.platform === 'win32' ? 'powershell' : 'du', process.platform === 'win32'
      ? ['-NoProfile', '-Command', `(Get-ChildItem -Recurse '${dir.replace(/'/g, "''")}' | Measure-Object -Property Length -Sum).Sum`]
      : ['-sh', dir], { encoding: 'utf8' }).trim();
    const bytes = Number(out);
    return Number.isFinite(bytes) ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : out;
  } catch { return 'unknown'; }
}

await mkdir(tools, { recursive: true });
await ffmpeg('ffmpeg', join(tools, `ffmpeg${exe}`));
await ffmpeg('ffprobe', join(tools, `ffprobe${exe}`));
await chromium();
console.log(`\nresources/tools: ${await size(tools)}`);
