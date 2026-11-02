import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'; import { watch } from 'node:fs'; import { readFile, writeFile } from 'node:fs/promises'; import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'; import { fileURLToPath } from 'node:url';
import { loadComposition, sfxNames, variablesSchema, resolveVariables, describeError, type Composition, type MediaInfo } from '@ove/schema'; import { measureMedia, attachCaptions, sfxFile } from '@ove/core'; import { createRenderer, defaultConcurrency, type Renderer } from '@ove/renderer'; import { builtinFontFaces } from '@ove/graphics'; import { builtinFontDir } from '@ove/graphics/fonts'; import { devPage } from './dev-page'; import { findRawLayers, layerTimeline, applyLayerEdit, formatLike } from './studio';
export type DevOptions = { port?: number; values?: Record<string, unknown>; concurrency?: number };
const mediaTypes: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
// The installed package ships a prebuilt player.js next to the CLI; from source it is bundled on first use (needs esbuild, a dev dependency).
let playerCode: Promise<string> | undefined;
const playerScript = () => playerCode ??= readFile(fileURLToPath(new URL('./player.js', import.meta.url)), 'utf8').catch(() => import('@ove/player/bundle').then(m => m.bundlePlayer()));
export type DevServer = { url: string; close(): Promise<void> };
// The preview shows frames rendered by the same Chromium renderer as `ove render`, so what you scrub is exactly what gets encoded.
// The composition file is watched; every successful reload (file save or variable change in the page) bumps `version`, which keys
// the frame cache. A failed reload keeps the last good composition on screen and reports the error to the page.
export async function startDevServer(file: string, options: DevOptions = {}): Promise<DevServer> { const path=resolve(file), baseDir=dirname(path), concurrency=options.concurrency ?? defaultConcurrency();
  let values: Record<string, unknown>={ ...options.values }, media: Record<string, MediaInfo>={}, raw: any, composition: Composition | undefined, renderer: Renderer | undefined, version=0, error: string | undefined;
  const frames=new Map<string, Promise<Buffer>>(), clients=new Set<ServerResponse>();
  const notify=() => { for (const client of clients) client.write(`event: change\ndata: ${JSON.stringify({ version, error: error ?? null })}\n\n`); };
  let queue=Promise.resolve();
  const reload=() => queue=queue.then(async () => { try { raw=JSON.parse(await readFile(path, 'utf8')); media=await measureMedia(raw, baseDir); const next=await attachCaptions(loadComposition(raw, values, { media }), baseDir); const nextRenderer=await createRenderer(next, { baseDir, concurrency }); const old=renderer;
      composition=next; renderer=nextRenderer; version++; error=undefined; frames.clear(); if (old) setTimeout(() => { old.close().catch(() => {}); }, 2000); } catch (e) { error=describeError(e); } notify(); });
  await reload();
  const state=() => { let resolved: Record<string, unknown>={}; try { resolved=resolveVariables(variablesSchema.parse(raw?.variables ?? {}), values); } catch {} return { file: path, version, error: error ?? null, variables: raw?.variables ?? {}, values: resolved, canUndo: history.length > 0, composition: composition && { name: composition.name, width: composition.width, height: composition.height, fps: composition.fps, durationFrames: composition.durationFrames, scenes: composition.scenes.map(s => ({ id: s.id, name: s.name, startFrame: s.startFrame, durationFrames: s.durationFrames })), layers: layerTimeline(composition, raw) } }; };
  // Studio edits: validated against the schema before anything is written, so a bad edit never breaks the file; each write keeps the
  // previous text for undo. The file watcher then reloads the preview as for any save.
  const history: string[]=[];
  const writeComposition=async (next: unknown) => { loadComposition(next, values, { media: await measureMedia(next, baseDir) }); const previous=await readFile(path, 'utf8'); history.push(previous); if (history.length > 100) history.shift(); await writeFile(path, formatLike(previous, next)); };
  const send=(res: ServerResponse, status: number, type: string, body: string | Buffer) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  const readBody=(req: IncomingMessage) => new Promise<string>((ok, fail) => { let body=''; req.on('data', chunk => { body+=chunk; if (body.length > 1e6) fail(new Error('Body too large')); }); req.on('end', () => ok(body)); req.on('error', fail); });
  const server=createServer(async (req, res) => { const url=new URL(req.url ?? '/', 'http://localhost'); try {
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, 'text/html; charset=utf-8', devPage);
      if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, 'application/json', JSON.stringify(state()));
      if (req.method === 'GET' && url.pathname === '/api/layer') { const id=url.searchParams.get('id') ?? '', matches=findRawLayers(raw, id); return send(res, 200, 'application/json', JSON.stringify({ id, editable: matches.length === 1, layer: matches[0] ?? null, reason: matches.length === 1 ? null : matches.length ? 'Several layers share this id; give them unique ids to edit them here.' : 'This layer comes from a repeat or a component, so it can only be changed in that template.' })); }
      if (req.method === 'POST' && url.pathname === '/api/layer') { const edit=JSON.parse(await readBody(req) || '{}'); try { await writeComposition(applyLayerEdit(raw, edit)); } catch (e) { return send(res, 400, 'application/json', JSON.stringify({ ok: false, error: describeError(e) })); } return send(res, 200, 'application/json', JSON.stringify({ ok: true })); }
      if (req.method === 'POST' && url.pathname === '/api/undo') { const previous=history.pop(); if (previous === undefined) return send(res, 409, 'application/json', JSON.stringify({ ok: false, error: 'Nothing to undo' })); await writeFile(path, previous); return send(res, 200, 'application/json', JSON.stringify({ ok: true })); }
      // Live playback: the page runs the Player with the same raw composition and values, loading media through /media/.
      if (req.method === 'GET' && url.pathname === '/api/source') return send(res, 200, 'application/json', JSON.stringify({ raw: raw ?? null, values, media }));
      if (req.method === 'GET' && url.pathname === '/player.js') return send(res, 200, 'text/javascript; charset=utf-8', await playerScript());
      // Built-in sound effects for the Player (it loads them from ./sfx/ beside player.js).
      if (req.method === 'GET' && url.pathname.startsWith('/sfx/')) { const name=url.pathname.slice(5).replace(/\.wav$/, ''); if (!(sfxNames as readonly string[]).includes(name)) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'audio/wav', await readFile(await sfxFile(name))); }
      // The Player's built-in fonts (it loads them from ./fonts/ beside player.js).
      if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) { const face=builtinFontFaces.find(f => `/fonts/${f.file}` === url.pathname); if (!face) return send(res, 404, 'text/plain', 'Not found');
        return send(res, 200, 'font/woff2', await readFile(join(builtinFontDir(), face.file))); }
      if (req.method === 'GET' && url.pathname.startsWith('/media/')) { const target=resolve(baseDir, decodeURIComponent(url.pathname.slice('/media/'.length))); const inside=relative(baseDir, target);
        if (!inside || inside.startsWith('..') || isAbsolute(inside)) return send(res, 403, 'text/plain', 'Only files inside the composition folder are served');
        const data=await readFile(target).catch(() => undefined); return data ? send(res, 200, mediaTypes[extname(target).toLowerCase()] ?? 'application/octet-stream', data) : send(res, 404, 'text/plain', 'Not found'); }
      if (req.method === 'GET' && url.pathname === '/api/events') { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(': connected\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return; }
      if (req.method === 'GET' && url.pathname === '/api/frame') { const frame=Number(url.searchParams.get('f')); if (!composition || !renderer) return send(res, 409, 'text/plain', error ?? 'No composition loaded');
        if (!Number.isInteger(frame) || frame < 0 || frame >= composition.durationFrames) return send(res, 400, 'text/plain', `Frame must be 0–${composition.durationFrames-1}`);
        const key=`${version}:${frame}`; let job=frames.get(key); if (!job) { job=renderer.renderFrame(frame); frames.set(key, job); job.catch(() => frames.delete(key)); if (frames.size > 600) frames.delete(frames.keys().next().value!); }
        return send(res, 200, 'image/png', await job); }
      if (req.method === 'POST' && url.pathname === '/api/variables') { const body=JSON.parse(await readBody(req) || '{}'); if (typeof body !== 'object' || body === null || Array.isArray(body)) return send(res, 400, 'text/plain', 'Expected a JSON object'); values=body; await reload(); return send(res, 200, 'application/json', JSON.stringify({ ok: !error, error: error ?? null })); }
      send(res, 404, 'text/plain', 'Not found');
    } catch (e) { if (!res.headersSent) send(res, 500, 'text/plain', (e as Error).message); } });
  // Editors often save by writing a temp file and renaming it, so the folder is watched rather than the file, and changes are debounced.
  let timer: NodeJS.Timeout | undefined; const watcher=watch(baseDir, (_event, name) => { if (name && basename(String(name)) === basename(path)) { clearTimeout(timer); timer=setTimeout(reload, 150); } });
  const port=await new Promise<number>((ok, fail) => { let attempt=options.port ?? 3000; const tryListen=() => { server.once('error', (e: NodeJS.ErrnoException) => { if (e.code === 'EADDRINUSE' && attempt < (options.port ?? 3000)+20) { attempt++; tryListen(); } else fail(e); }); server.listen(attempt, '127.0.0.1', () => ok(attempt)); }; tryListen(); });
  return { url: `http://127.0.0.1:${port}/`, async close() { clearTimeout(timer); watcher.close(); for (const client of clients) client.end(); await new Promise<void>(ok => server.close(() => ok())); await queue; await renderer?.close(); } }; }
