// `ove ai studio`: a local page for the AI authoring layer. It uses the same @ove/ai functions as the CLI, holds no
// model state of its own, and writes ordinary projects that `ove dev`, `ove render` and `ove review` already know.
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, relative as relativePath, resolve, sep } from 'node:path';
import {
  assetProblems, mergeNarration, ensureBaseline, saveRevision, type RevisionMeta, captionAudio, composeVideo, createProvider, extractJson, fieldsFromRows, generateImage, narrate, planBatch,
  providerCapabilities, refineVideo, renderBatch, sanitizeCompositionJson, systemPrompt, userPrompt, writeCompositionProject, type AiProvider, type BatchSettings, type ComposeOptions,
} from '@ove/ai';
import {
  attachCaptions, defaultConcurrency, defaultPreset, describeError, loadComposition, renderMedia, renderStill,
  reviewComposition, x264Presets, type Composition,
} from '@ove/core';
import { measureMedia, sfxFile } from '@ove/core';
import { builtinFontFaces } from '@ove/graphics';
import { builtinFontDir } from '@ove/graphics/fonts';
import { resolveVariables, sfxNames, variablesSchema } from '@ove/schema';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addBlockRequest, idRequest, newProjectRequest, parseRequest, renameRequest, restoreRequest, textRequest, themeRequest, variablesRequest } from '@ove/contracts';
import { aiStudioPage } from './ai-studio-page';
import { addBlock, applyTheme, emptyComposition, listBlocks, listThemes, readBlock, readTheme, themeTokens } from './blocks';
import { playerScript } from './dev';
import { listProjects, projectMode, projectVariables, setVariableValues, textLayers } from './ai-studio-projects';
import { FsProjectStore, LOCAL_PRINCIPAL, within } from '@ove/storage';
import { InProcessQueue, boolOf, canvasFor, createFsPaths, createHandlers, folderName, integerIn, localInputFile, numberIn, optionalNumber, optionalText, textOf } from '@ove/jobs';
import { listTemplates } from './templates';
import { composeSmart, narrateSmart } from './templates';
import { assetIdFromPath } from '@ove/ai';
import { makeThumbnail } from './thumbnail';

export type AiStudioOptions = {
  /** Interface to listen on. Defaults to 127.0.0.1; anything else exposes a server that has no login. */
  host?: string;
  /** The port people use to reach the studio when it differs from the one it listens on (a container's published port). */
  publicPort?: number;
  port?: number;
  outDir?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  allowHosts?: string[];
};

export type AiStudioServer = { url: string; close(): Promise<void> };

// The request helpers and the job handlers live in @ove/jobs; these are re-exported because tests and callers import them from here.
export { canvasFor, folderName, within };


const mediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8',
};

// The web app (apps/studio, built by `pnpm build:studio`) sits next to blocks/ and themes/, in the workspace and in the published package.
// Without a build the studio falls back to the plain page in ai-studio-page.ts.
const studioDir = fileURLToPath(new URL('../studio', import.meta.url));
const studioFile = async (pathname: string): Promise<string | undefined> => {
  const target = resolve(studioDir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
  if (!within(studioDir, target)) return undefined;
  try { return (await stat(target)).isFile() ? target : undefined; } catch { return undefined; }
};

export async function startAiStudio(options: AiStudioOptions = {}): Promise<AiStudioServer> {
  const root = resolve(options.outDir ?? 'ai-videos');
  await mkdir(root, { recursive: true });
  let provider: AiProvider | undefined, providerError: string | undefined;
  try { provider = createProvider({ provider: options.provider, model: options.model, baseUrl: options.baseUrl }); }
  catch (error) { providerError = describeError(error); }

  // Projects are reached only through the store, as one principal. A hosted API will make a principal per signed-in user.
  const store = new FsProjectStore(root), who = LOCAL_PRINCIPAL;
  const clients = new Set<ServerResponse>();
  const queue = new InProcessQueue();
  let port = 0;

  const providerState = () => provider
    ? { provider: { id: provider.id, model: provider.model, baseUrl: provider.baseUrl, capabilities: providerCapabilities(provider) }, error: null }
    : { provider: null, error: providerError ?? 'No AI provider is configured' };
  const requireProvider = () => { if (!provider) throw new Error(providerError ?? 'No AI provider is configured'); return provider; };

  const sendEvent = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of [...clients]) { try { client.write(message); } catch { clients.delete(client); } }
  };
  queue.subscribe(job => sendEvent('job', job));

  // The jobs get the store's paths, the provider and the pieces that ship with the command line.
  const providerInfo = () => ({ provider: provider?.id, model: provider?.model });
  const paths = createFsPaths(store, who, providerInfo);
  const handlers = createHandlers({ who, paths, provider: requireProvider, providerInfo, assets: id => store.assets(who, id), capabilities: { composeSmart, narrateSmart, makeThumbnail }, local: { inputFile: localInputFile } });
  const { readJson, relative, urlFor, idOf, fileInside, loadForRender, resultFile } = paths;

  // A project edit writes the file's own JSON (variables, components and all), kept as a revision.
  const writeRaw = async (id: string, raw: unknown, meta: RevisionMeta) => { loadComposition(raw); await store.writeRaw(who, id, raw, { provider: provider?.id, model: provider?.model, ...meta }); };
  const projectFile = (value: unknown) => { const id = textOf(value, 'project'), dir = store.projectDir(who, id); return { id, dir, file: resolve(dir, 'composition.json') }; };
  const readBytes = (req: IncomingMessage, limit: number) => new Promise<Buffer>((ok, fail) => {
    const parts: Buffer[] = []; let size = 0;
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) { fail(new Error('That file is too large')); req.destroy(); } else parts.push(chunk); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail);
  });
  const setAtPath = (rootValue: any, path: string, apply: (layer: any) => void) => {
    let node = rootValue;
    for (const [, name, index] of path.matchAll(/([A-Za-z_]+)|\[(\d+)\]/g)) node = node?.[index === undefined ? name! : Number(index)];
    if (!node || typeof node !== 'object') throw new Error('That text is no longer in the video');
    apply(node);
  };
  const projectDetail = async (id: string) => {
    const { dir } = await store.workdir(who, id), raw = await store.readRaw(who, id), composition = loadComposition(raw), mode = projectMode(raw);
    const declared = variablesSchema.parse(raw.variables ?? {}), values = resolveVariables(declared, {});
    return {
      id, name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, mode,
      scenes: composition.scenes.map(scene => ({ id: scene.id, name: scene.name, startFrame: scene.startFrame, durationFrames: scene.durationFrames })),
      variables: mode === 'template' ? projectVariables(raw) : [], theme: Object.fromEntries(themeTokens.filter(token => token in declared).map(token => [token, values[token]])),
      texts: mode === 'finished' ? textLayers(composition) : [], assets: await store.assets(who, id), revisions: (await store.revisions(who, id)).length,
      source: { raw, media: await measureMedia(raw, dir), base: `/files/${id}/` },
    };
  };
  const thumbFor = async (id: string) => {
    const saved = await store.thumb(who, id); if (saved) return saved;
    const work = await store.workdir(who, id), raw = await store.readRaw(who, id);
    const made = await makeThumbnail(raw, {}, work.dir, { width: 480 });
    await store.putThumb(who, id, made.png);
    return made.png;
  };
  const send = (res: ServerResponse, status: number, type: string, body: string | Buffer) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const sendJson = (res: ServerResponse, status: number, body: unknown) => send(res, status, 'application/json', JSON.stringify(body));
  const sendError = (res: ServerResponse, error: unknown) => sendJson(res, 400, { error: describeError(error) });

  const readBody = (req: IncomingMessage) => new Promise<string>((ok, fail) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) fail(new Error('Request body is too large')); });
    req.on('end', () => ok(body)); req.on('error', fail);
  });

  const hostAllowed = (host: string) => {
    const name = host.toLowerCase().replace(/:\d+$/, ''), hostPort = Number(/:(\d+)$/.exec(host)?.[1]);
    return (hostPort === port || hostPort === options.publicPort) && (name === '127.0.0.1' || name === 'localhost' || name === '[::1]' ||
      (options.allowHosts ?? []).some(allowed => allowed.toLowerCase() === name));
  };
  const refusal = (req: IncomingMessage): string | undefined => {
    const host = req.headers.host ?? '';
    if (!hostAllowed(host)) return `Host "${host}" is not allowed; open the studio at http://127.0.0.1:${port}/`;
    if (req.method === 'GET' || req.method === 'HEAD') return undefined;
    if (req.headers.origin !== `http://${host}`) return 'Changes are only accepted from the studio page itself';
    if (req.url?.startsWith('/api/upload?') && /^application\/octet-stream\b/i.test(req.headers['content-type'] ?? '')) return undefined;
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'Changes must be sent as application/json';
    return undefined;
  };

  // Files from the out folder are shown by the page but never run as pages: an SVG or HTML file opened directly would otherwise run
  // as the Studio's own origin and could call its API.
  const fileHeaders = { 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' };
  const serveFile = async (req: IncomingMessage, res: ServerResponse, pathname: string) => {
    const target = resolve(root, decodeURIComponent(pathname.slice('/files/'.length)));
    if (!within(root, target)) return send(res, 403, 'text/plain', `Files must be inside ${root}`);
    let info;
    try { info = await stat(target); } catch { return send(res, 404, 'text/plain', 'Not found'); }
    if (!info.isFile()) return send(res, 404, 'text/plain', 'Not found');
    const type = mediaTypes[extname(target).toLowerCase()] ?? 'application/octet-stream';
    const range = req.headers.range, match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
    res.setHeader('accept-ranges', 'bytes');
    if (match) {
      let start = match[1] ? Number(match[1]) : 0, end = match[2] ? Number(match[2]) : info.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) {
        res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return;
      }
      end = Math.min(end, info.size - 1);
      res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${info.size}`, 'cache-control': 'no-store', ...fileHeaders });
      createReadStream(target, { start, end }).on('error', () => res.destroy()).pipe(res);
      return;
    }
    res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': 'no-store', ...fileHeaders });
    createReadStream(target).on('error', () => res.destroy()).pipe(res);
  };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const refused = refusal(req);
    if (refused) return send(res, 403, 'text/plain', refused);
    try {
      if (req.method === 'GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/files/')) {
        const app = await studioFile(url.pathname);
        if (app) return send(res, 200, mediaTypes[extname(app).toLowerCase()] ?? 'application/octet-stream', await readFile(app));
        if (url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', aiStudioPage);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return sendJson(res, 200, { outDir: root, ...providerState(), jobs: queue.recent() });
      if (req.method === 'GET' && url.pathname === '/api/jobs') return sendJson(res, 200, { jobs: queue.recent() });
      if (req.method === 'GET' && url.pathname === '/api/job') {
        const job = queue.get(url.searchParams.get('id') ?? '');
        return job ? sendJson(res, 200, { job }) : sendJson(res, 404, { error: 'No such job' });
      }
      if (req.method === 'GET' && url.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(': connected\n\n');
        res.write(`event: snapshot\ndata: ${JSON.stringify({ jobs: queue.recent() })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/history') {
        const file = fileInside(url.searchParams.get('file'), 'file');
        return sendJson(res, 200, { revisions: await store.revisions(who, idOf(file)) });
      }
      if (req.method === 'GET' && url.pathname === '/api/still') {
        const file = fileInside(url.searchParams.get('file'), 'file');
        const { composition, baseDir } = await loadForRender(file);
        const requested = url.searchParams.get('frame');
        const frame = requested === null ? Math.floor(composition.durationFrames / 2) : integerIn(requested, 0, 'frame', 0, Math.max(0, composition.durationFrames - 1));
        return send(res, 200, 'image/png', await renderStill(composition, { frame, baseDir }));
      }
      if (req.method === 'GET' && url.pathname === '/api/projects') return sendJson(res, 200, { projects: await listProjects(store, who) });
      if (req.method === 'GET' && url.pathname === '/api/project') return sendJson(res, 200, await projectDetail(textOf(url.searchParams.get('id'), 'project')));
      if (req.method === 'GET' && url.pathname === '/api/thumb') return send(res, 200, 'image/png', await thumbFor(textOf(url.searchParams.get('id'), 'project')));
      if (req.method === 'GET' && url.pathname === '/api/library') return sendJson(res, 200, {
        blocks: (await listBlocks()).map(({ layers, ...block }) => block), themes: await listThemes(),
        templates: (await listTemplates()).map(template => ({ id: template.id, name: template.name, description: template.description })) });
      // The Player the editor previews with, and what it loads beside itself (the same files `ove dev` serves).
      if (req.method === 'GET' && url.pathname === '/player.js') return send(res, 200, 'text/javascript; charset=utf-8', await playerScript());
      if (req.method === 'GET' && url.pathname.startsWith('/sfx/')) {
        const name = url.pathname.slice(5).replace(/\.wav$/, ''); if (!(sfxNames as readonly string[]).includes(name)) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'audio/wav', await readFile(await sfxFile(name)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
        const face = builtinFontFaces.find(f => `/fonts/${f.file}` === url.pathname); if (!face) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'font/woff2', await readFile(join(builtinFontDir(), face.file)));
      }
      if (req.method === 'GET' && url.pathname.startsWith('/files/')) return await serveFile(req, res, url.pathname);
      if (req.method === 'POST' && url.pathname === '/api/upload') {
        const { id } = projectFile(url.searchParams.get('project')), name = textOf(url.searchParams.get('name'), 'name');
        return sendJson(res, 200, { assets: await store.putAsset(who, id, name, await readBytes(req, 150_000_000)) });
      }
      if (req.method === 'POST' && url.pathname !== '/api/upload') {
        const body = JSON.parse(await readBody(req) || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendError(res, new Error('Expected a JSON object'));
        if (url.pathname === '/api/project/new') {
          const { name } = parseRequest(newProjectRequest, body); canvasFor(body);
          return sendJson(res, 200, { id: await store.create(who, name) });
        }
        if (url.pathname === '/api/project/blank') {
          const { name } = parseRequest(newProjectRequest, body), canvas = canvasFor(body), id = await store.create(who, name);
          await store.writeRaw(who, id, emptyComposition(name, canvas.width, canvas.height, canvas.fps));
          return sendJson(res, 200, { id });
        }
        if (url.pathname === '/api/project/rename') {
          const request = parseRequest(renameRequest, body), { id } = projectFile(request.id), raw = await store.readRaw(who, id); raw.name = request.name;
          await writeRaw(id, raw, { kind: 'edit', label: 'Renamed' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/project/duplicate') {
          const request = parseRequest(idRequest, body), { id: source } = projectFile(request.id);
          const id = await store.duplicate(who, source, raw => ({ ...raw, name: `${raw.name ?? source} copy`.slice(0, 120) }));
          return sendJson(res, 200, { id });
        }
        if (url.pathname === '/api/project/delete') { const request = parseRequest(idRequest, body), { id } = projectFile(request.id); await store.trash(who, id); return sendJson(res, 200, { ok: true }); }
        if (url.pathname === '/api/variables') {
          const request = parseRequest(variablesRequest, body), { id } = projectFile(request.id);
          await writeRaw(id, setVariableValues(await store.readRaw(who, id), request.values), { kind: 'edit', label: 'Edited the text' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/theme') {
          const request = parseRequest(themeRequest, body), { id } = projectFile(request.id), theme = await readTheme(request.theme);
          await writeRaw(id, applyTheme(await store.readRaw(who, id), theme), { kind: 'edit', label: `Look: ${theme.name}` }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/text') {
          const request = parseRequest(textRequest, body), { id } = projectFile(request.id), content = request.content, composition = loadComposition(await store.readRaw(who, id)) as any;
          setAtPath(composition, request.path, layer => { if (layer.type !== 'text') throw new Error('That layer is not text'); if (typeof layer.content === 'string' && layer.content) layer.content = content; else if (Array.isArray(layer.spans) && layer.spans.length) layer.spans = [{ ...layer.spans[0], text: content }]; else layer.content = content; });
          await writeRaw(id, { $schema: './composition.schema.json', ...composition }, { kind: 'edit', label: 'Edited the text' }); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/add-block') {
          const request = parseRequest(addBlockRequest, body), { id } = projectFile(request.id), block = await readBlock(request.block);
          const added = addBlock(await store.readRaw(who, id), block, { at: optionalNumber(request.at, 'at', 0, 1e7), frames: optionalNumber(request.frames, 'frames', 1, 1e7), scene: optionalText(request.scene), set: request.set ?? {} });
          await writeRaw(id, added.composition, { kind: 'edit', label: `Added ${block.name}` }); return sendJson(res, 200, { placed: added.placed, where: added.where });
        }
        if (url.pathname === '/api/compose') return sendJson(res, 202, { job: queue.enqueue(handlers.compose(body)) });
        if (url.pathname === '/api/thumbnail') return sendJson(res, 202, { job: queue.enqueue(handlers.thumbnail(body)) });
        if (url.pathname === '/api/restore') {
          const request = parseRequest(restoreRequest, body), file = fileInside(request.file, 'file');
          return sendJson(res, 200, { revision: await store.restore(who, idOf(file), request.n) });
        }
        if (url.pathname === '/api/refine') return sendJson(res, 202, { job: queue.enqueue(handlers.refine(body)) });
        if (url.pathname === '/api/import') return sendJson(res, 202, { job: queue.enqueue(handlers.import(body)) });
        if (url.pathname === '/api/prompt') {
          const brief = optionalText(body.brief) ?? 'A clean promotional video with animated text and shapes';
          const canvas = canvasFor(body);
          const system = systemPrompt({ ...canvas, includeSchema: boolOf(body.schema) });
          const user = userPrompt(brief, { ...canvas, narration: boolOf(body.narration) });
          return sendJson(res, 200, { prompt: `${system}\n\n---\n\n# User Request\n${user}` });
        }
        if (url.pathname === '/api/render') return sendJson(res, 202, { job: queue.enqueue(handlers.render(body)) });
        if (url.pathname === '/api/review') return sendJson(res, 202, { job: queue.enqueue(handlers.review(body)) });
        if (url.pathname === '/api/narrate') return sendJson(res, 202, { job: queue.enqueue(handlers.narrate(body)) });
        if (url.pathname === '/api/transcribe') return sendJson(res, 202, { job: queue.enqueue(handlers.transcribe(body)) });
        if (url.pathname === '/api/image') return sendJson(res, 202, { job: queue.enqueue(handlers.image(body)) });
        if (url.pathname === '/api/batch') return sendJson(res, 202, { job: queue.enqueue(handlers.batch(body)) });
        return send(res, 404, 'text/plain', 'Not found');
      }
      send(res, 404, 'text/plain', 'Not found');
    } catch (error) { if (!res.headersSent) sendError(res, error); else res.destroy(); }
  });

  port = await new Promise<number>((ok, fail) => {
    let attempt = options.port ?? 3100;
    const tryListen = () => {
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && attempt < (options.port ?? 3100) + 20) { attempt++; tryListen(); }
        else fail(error);
      });
      server.listen(attempt, options.host ?? '127.0.0.1', () => ok(attempt));
    };
    tryListen();
  });

  return {
    url: `http://127.0.0.1:${port}/`,
    async close() {
      for (const client of clients) client.end();
      await new Promise<void>(ok => server.close(() => ok()));
    },
  };
}
