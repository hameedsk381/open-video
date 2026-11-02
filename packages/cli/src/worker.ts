import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'; import { mkdtemp, readFile, rm } from 'node:fs/promises'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { randomBytes } from 'node:crypto';
import { parseComposition, renderMedia, tokensMatch, describeError, defaultConcurrency, x264Presets, type ChunkFormat } from '@ove/core';
export type WorkerOptions = { port?: number; host?: string; token?: string; concurrency?: number; log?: (line: string) => void };
export type WorkerServer = { url: string; token: string; close(): Promise<void> };
// `ove worker`: renders chunks for a coordinator (`ove render --workers …`). Every request must carry the shared token; the
// composition in a request is validated again before rendering, and jobs run one at a time so they do not compete for the CPU.
// It listens on 127.0.0.1 unless told otherwise: only expose it on a network you trust, since it reads the media paths it is sent.
export async function startWorker(options: WorkerOptions = {}): Promise<WorkerServer> { const token=options.token || randomBytes(18).toString('base64url'), host=options.host ?? '127.0.0.1', log=options.log ?? (() => {});
  const concurrency=options.concurrency ?? defaultConcurrency(); let queue=Promise.resolve(), jobs=0;
  const send=(res: ServerResponse, status: number, type: string, body: string | Buffer) => { res.writeHead(status, { 'content-type': type }); res.end(body); };
  const body=(req: IncomingMessage) => new Promise<string>((ok, fail) => { let data='', size=0; req.on('data', chunk => { size+=chunk.length; if (size > 20e6) { fail(new Error('Request too large')); req.destroy(); } else data+=chunk; }); req.on('end', () => ok(data)); req.on('error', fail); });
  const server=createServer(async (req, res) => { try {
      const auth=req.headers.authorization ?? ''; if (!auth.startsWith('Bearer ') || !tokensMatch(auth.slice(7), token)) return send(res, 401, 'text/plain', 'Missing or wrong token');
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, 'application/json', JSON.stringify({ ok: true, jobs, concurrency }));
      if (req.method !== 'POST' || req.url !== '/render') return send(res, 404, 'text/plain', 'Not found');
      const job=JSON.parse(await body(req)); const composition=parseComposition(job.composition), range=job.frameRange as [number, number], format=job.format as ChunkFormat;
      if (!['mp4','webm','mov'].includes(format)) return send(res, 400, 'text/plain', 'format must be mp4, webm or mov'); if (job.preset && !x264Presets.includes(job.preset)) return send(res, 400, 'text/plain', 'Unknown preset');
      jobs++; const run=queue.then(async () => { const dir=await mkdtemp(join(tmpdir(), 'ove-worker-')); const output=join(dir, `chunk.${format}`); const started=Date.now();
        try { await renderMedia(composition, { output, format, codec: job.codec, transparent: job.transparent, preset: job.preset, frameRange: range, concurrency, audio: false }); log(`rendered frames ${range[0]}–${range[1]} (${format}) in ${((Date.now()-started)/1000).toFixed(1)}s`); return await readFile(output); }
        finally { await rm(dir, { recursive: true, force: true }); } }); queue=run.then(() => {}, () => {});
      try { send(res, 200, 'application/octet-stream', await run); } finally { jobs--; }
    } catch (error) { log(`job failed: ${describeError(error).split('\n')[0]}`); if (!res.headersSent) send(res, 500, 'text/plain', describeError(error)); } });
  const port=await new Promise<number>((ok, fail) => { server.once('error', fail); server.listen(options.port ?? 4400, host, () => ok((server.address() as { port: number }).port)); });
  return { url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`, token, async close() { await new Promise<void>(ok => server.close(() => ok())); await queue; } }; }
