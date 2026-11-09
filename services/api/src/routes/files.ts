import { readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { within } from '@ove/storage';
import { mediaTypes, serveFile } from '../http';
import type { Ctx, Route } from '../types';

/** The person's own files (uploads, renders, thumbnails), served from their space only. */
export function fileRoutes(): Route[] {
  return [{ method: 'GET', path: '/files/*', handle: async c => {
    const space = c.deps.store.tenantRoot(c.who), target = resolve(space, decodeURIComponent(c.url.pathname.slice('/files/'.length)));
    if (!within(space, target)) return c.send(403, 'text/plain', 'That file is not yours to open');
    // Housekeeping folders are not for download.
    if (/[\\/](history|\.studio|\.trash)([\\/]|$)/.test(target.slice(space.length))) return c.send(404, 'text/plain', 'Not found');

    await serveFile(c.req, c.res, target);
  } }];
}

/** The built web app, the Player it previews with and what the Player loads next to itself. These are the same for everyone. */
export function publicRoutes(): Route[] {
  const staticFile = async (c: Ctx, pathname: string): Promise<string | undefined> => {
    const dir = c.deps.app.dir, target = resolve(dir, pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)));
    if (!within(dir, target)) return undefined;
    try { return (await stat(target)).isFile() ? target : undefined; } catch { return undefined; }
  };
  return [
    { method: 'GET', path: '/p5.min.js', open: true, handle: async c => { const p5 = c.deps.player.p5; if (!p5) return c.json(404, { error: 'This server does not serve p5.js' }); c.send(200, 'text/javascript; charset=utf-8', await p5()); } },
    { method: 'GET', path: '/three-runtime.js', open: true, handle: async c => { const three = c.deps.player.three; if (!three) return c.json(404, { error: 'This server does not serve three.js' }); c.send(200, 'text/javascript; charset=utf-8', await three()); } },
    { method: 'GET', path: '/player.js', open: true, handle: async c => c.send(200, 'text/javascript; charset=utf-8', await c.deps.player.script()) },
    { method: 'GET', path: '/sfx/*', open: true, handle: async c => {
      const sound = await c.deps.player.sound(c.url.pathname.slice(5).replace(/\.wav$/, ''));
      return sound ? c.send(200, 'audio/wav', sound) : c.send(404, 'text/plain', 'Not found');
    } },
    { method: 'GET', path: '/fonts/*', open: true, handle: async c => {
      const font = await c.deps.player.font(c.url.pathname);
      return font ? c.send(200, 'font/woff2', font) : c.send(404, 'text/plain', 'Not found');
    } },
    // Anything else that is not the API: the app's files, and its page for the front door.
    { method: 'GET', path: '/*', open: true, handle: async c => {
      if (c.url.pathname.startsWith('/api/') || c.url.pathname.startsWith('/files/')) return c.send(404, 'text/plain', 'Not found');
      const file = await staticFile(c, c.url.pathname);
      if (file) return c.send(200, mediaTypes[extname(file).toLowerCase()] ?? 'application/octet-stream', await readFile(file));
      if (c.url.pathname === '/') return c.send(200, 'text/html; charset=utf-8', c.deps.app.fallbackPage);
      c.send(404, 'text/plain', 'Not found');
    } },
  ];
}
