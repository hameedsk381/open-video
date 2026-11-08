import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { describeError } from '@ove/core';
import { createGuard } from './guard';
import { readBody, send, sendError, sendJson } from './http';
import { fileRoutes, publicRoutes } from './routes/files';
import { aiSettingsRoutes } from './routes/ai-settings';
import { jobsRoutes } from './routes/jobs';
import { productionRoutes } from './routes/production';
import { projectRoutes } from './routes/projects';
import { ANONYMOUS, type AppDeps, type Ctx, type Route } from './types';

const matches = (route: Route, method: string, path: string) => route.method === method && (route.path.endsWith('*') ? path.startsWith(route.path.slice(0, -1)) : route.path === path);

/** The studio's HTTP API as one request handler. It knows who is asking (Auth), what they may do (Quotas), and where things are (store, queue). */
export function createApp(deps: AppDeps) {
  let port = 0;
  const guard = createGuard(deps, () => port);
  const status: Route = { method: 'GET', path: '/api/status', handle: async c => {
    // Hosted, the AI is the person's own connection from Settings; the machine's provider only describes local use.
    const own = c.deps.aiSettings ? c.deps.aiSettings.view(c.who) : undefined;
    const { provider, error } = c.deps.aiSettings ? { provider: own ? { id: own.provider, model: own.model } : null, error: null } : c.deps.providerState();
    c.json(200, { outDir: c.deps.mode === 'local' ? c.deps.store.root : 'Stored on the server, in your account', provider, error, jobs: await c.deps.queue.recent(c.who) });
  } };
  // Most specific first: exact API paths, then the file and asset prefixes, then the catch-all for the app's own files.
  const health: Route = { method: 'GET', path: '/healthz', open: true, handle: async c => c.json(200, { ok: true }) };
  const routes: Route[] = [...(deps.auth.routes?.() ?? []), health, status, ...(deps.aiSettings ? aiSettingsRoutes() : []), ...projectRoutes(), ...productionRoutes(), ...jobsRoutes(), ...fileRoutes(), ...publicRoutes()];

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const refused = guard(req);
    if (refused) return send(res, 403, 'text/plain', refused);
    try {
      const route = routes.find(candidate => matches(candidate, req.method === 'HEAD' ? 'GET' : req.method ?? 'GET', url.pathname));
      if (!route) return send(res, 404, 'text/plain', 'Not found');
      const who = await deps.auth.authenticate(req);
      if (!who && !route.open) return sendJson(res, 401, { error: 'Sign in to continue' });
      let parsed: Record<string, any> | undefined;
      const ctx: Ctx = {
        req, res, url, deps, who: who ?? ANONYMOUS, signedIn: !!who,
        json: (status, body, headers) => sendJson(res, status, body, headers), send: (status, type, body) => send(res, status, type, body),
        async body() {
          if (parsed) return parsed;
          const value = JSON.parse(await readBody(req) || '{}');
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a JSON object');
          return parsed = value;
        },
      };
      await route.handle(ctx);
    } catch (error) { if (!res.headersSent) sendError(res, error, error instanceof SyntaxError ? 400 : 400); else res.destroy(); void describeError; }
  }

  return {
    handle,
    /** Tells the guard which port the server ended up on. */
    setPort(value: number) { port = value; },
    /** Listens on a port, trying the next ones when it is taken (local use). */
    async listen(options: { host?: string; port?: number; tries?: number }): Promise<{ server: Server; port: number }> {
      const server = createServer((req, res) => { void handle(req, res); });
      const first = options.port ?? 3100, last = first + (options.tries ?? 20);
      const bound = await new Promise<number>((ok, fail) => {
        let attempt = first;
        const tryListen = () => {
          server.once('error', (error: NodeJS.ErrnoException) => { if (error.code === 'EADDRINUSE' && attempt < last) { attempt++; tryListen(); } else fail(error); });
          server.listen(attempt, options.host ?? '127.0.0.1', () => ok(attempt));
        };
        tryListen();
      });
      port = bound;
      return { server, port: bound };
    },
  };
}
export type App = ReturnType<typeof createApp>;
