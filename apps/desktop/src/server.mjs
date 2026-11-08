// The studio server behind the desktop window: one `ai studio` process for the chosen project folder, on a loopback port
// picked at launch. Everything the window can reach is served by it, so the shell never talks to the filesystem itself.
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 300;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function portFree(port) {
  return new Promise(resolve => {
    const probe = createServer();
    probe.unref();
    probe.once('error', () => resolve(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

export class StudioServer {
  #child = null;
  #log = null;
  #tail = '';
  #stopping = false;

  constructor({ repoRoot, packaged, env = {}, logDir, port }) {
    this.repoRoot = repoRoot;
    this.packaged = packaged;
    this.env = env;
    this.logDir = logDir;
    // The window's origin is the port, and localStorage belongs to the origin: a stable port keeps the studio's theme and
    // other preferences across launches. When something else holds the port, any free one will do for this run.
    this.preferredPort = port;
    this.url = null;
    this.root = null;
  }

  get origin() {
    return this.url ? new URL(this.url).origin : undefined;
  }

  #command() {
    if (this.packaged) {
      // Electron's own binary runs the bundled CLI as Node, so the app does not need Node installed.
      return {
        command: process.execPath,
        args: [join(process.resourcesPath, 'motionrender', 'dist', 'cli.js')],
        env: { ELECTRON_RUN_AS_NODE: '1' },
      };
    }
    const node = process.env.MOTIONRENDER_NODE || 'node';
    return {
      command: node,
      args: [join(this.repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(this.repoRoot, 'packages', 'cli', 'src', 'index.ts')],
      env: {},
    };
  }

  async start(projectRoot) {
    if (this.#child) await this.stop();
    this.root = projectRoot;
    this.#stopping = false;
    this.#tail = '';
    mkdirSync(projectRoot, { recursive: true });
    mkdirSync(this.logDir, { recursive: true });
    this.#log = createWriteStream(join(this.logDir, 'studio.log'), { flags: 'a' });
    const port = this.preferredPort && await portFree(this.preferredPort) ? this.preferredPort : await freePort();
    this.url = `http://127.0.0.1:${port}/`;

    const { command, args, env } = this.#command();
    const child = spawn(command, [...args, 'ai', 'studio', '--port', String(port), '--out', projectRoot], {
      cwd: projectRoot,
      env: { ...process.env, ...this.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.#child = child;

    const record = (stream) => (chunk) => {
      const text = chunk.toString();
      this.#tail = `${this.#tail}${text}`.slice(-8000);
      this.#log?.write(`[${stream}] ${text}`);
      process.stdout.write(`[studio:${stream}] ${text}`);
    };
    child.stdout.on('data', record('out'));
    child.stderr.on('data', record('err'));

    child.once('exit', (code, signal) => {
      this.#child = null;
      this.#log?.end();
      this.#log = null;
      if (!this.#stopping) this.onExit?.(code, signal, this.#tail);
    });

    await this.#waitUntilHealthy(child);
    return this.url;
  }

  #waitUntilHealthy(child) {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (this.#child !== child || child.exitCode !== null) {
          return reject(new Error(`The studio server stopped before it was ready (exit ${child.exitCode ?? 'unknown'}).\n${this.#tail.slice(-2000)}`));
        }
        if (await this.healthy()) return resolve();
        if (Date.now() > deadline) {
          await this.stop();
          return reject(new Error(`The studio server did not answer within ${HEALTH_TIMEOUT_MS / 1000} s.\n${this.#tail.slice(-2000)}`));
        }
        setTimeout(poll, HEALTH_POLL_MS);
      };
      void poll();
    });
  }

  async healthy() {
    if (!this.url) return false;
    try {
      const response = await fetch(`${this.url}healthz`, { signal: AbortSignal.timeout(2000) });
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Whether the studio is in the middle of work: switching folders now would stop it. */
  async busy() {
    if (!this.url) return false;
    try {
      const response = await fetch(`${this.url}api/status`, { signal: AbortSignal.timeout(2000) });
      if (!response.ok) return false;
      const body = await response.json();
      return (body.jobs ?? []).some(job => job.status === 'running' || job.status === 'queued');
    } catch {
      return false;
    }
  }

  async stop() {
    const child = this.#child;
    this.#child = null;
    this.#stopping = true;
    if (!child || child.exitCode !== null) return;
    if (process.platform === 'win32') {
      await new Promise(resolve => {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.once('exit', resolve);
        killer.once('error', resolve);
      });
    } else {
      child.kill('SIGTERM');
      await new Promise(resolve => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  }

  async restart(projectRoot) {
    await this.stop();
    return this.start(projectRoot);
  }
}
