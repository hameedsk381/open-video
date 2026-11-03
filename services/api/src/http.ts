import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { describeError } from '@ove/core';

export const mediaTypes: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
  '.json': 'application/json', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.srt': 'text/plain; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8',
};

export const send = (res: ServerResponse, status: number, type: string, body: string | Buffer, headers: Record<string, string | string[]> = {}) => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers });
  res.end(body);
};
export const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) => send(res, status, 'application/json', JSON.stringify(body), headers);
export const sendError = (res: ServerResponse, error: unknown, status = 400) => sendJson(res, status, { error: describeError(error) });

export const readBody = (req: IncomingMessage, limit = 2_000_000) => new Promise<string>((ok, fail) => {
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > limit) { fail(new Error('Request body is too large')); req.destroy(); } });
  req.on('end', () => ok(body)); req.on('error', fail);
});
export const readBytes = (req: IncomingMessage, limit: number) => new Promise<Buffer>((ok, fail) => {
  const parts: Buffer[] = []; let size = 0;
  req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) { fail(new Error('That file is too large')); req.destroy(); } else parts.push(chunk); });
  req.on('end', () => ok(Buffer.concat(parts))); req.on('error', fail);
});

// Files a person uploaded or a job made are shown by the page but never run as pages: an SVG or HTML file opened directly would otherwise run
// as the studio's own origin and could call its API.
const fileHeaders = { 'content-security-policy': 'sandbox', 'x-content-type-options': 'nosniff' };
/** Serves one file from disk, with byte ranges (video needs them). The caller has already decided the path is allowed. */
export async function serveFile(req: IncomingMessage, res: ServerResponse, target: string): Promise<void> {
  let info;
  try { info = await stat(target); } catch { return send(res, 404, 'text/plain', 'Not found'); }
  if (!info.isFile()) return send(res, 404, 'text/plain', 'Not found');
  const type = mediaTypes[extname(target).toLowerCase()] ?? 'application/octet-stream';
  const range = req.headers.range, match = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  res.setHeader('accept-ranges', 'bytes');
  if (match) {
    const start = match[1] ? Number(match[1]) : 0; let end = match[2] ? Number(match[2]) : info.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= info.size) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }); res.end(); return; }
    end = Math.min(end, info.size - 1);
    res.writeHead(206, { 'content-type': type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${info.size}`, 'cache-control': 'no-store', ...fileHeaders });
    createReadStream(target, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': info.size, 'cache-control': 'no-store', ...fileHeaders });
  createReadStream(target).on('error', () => res.destroy()).pipe(res);
}
