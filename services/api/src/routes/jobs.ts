import type { Job, JobKind } from '@ove/contracts';
import { boolOf, canvasFor, optionalText } from '@ove/jobs';
import { systemPrompt, userPrompt } from '@ove/ai';
import { renderStill, loadComposition, attachCaptions } from '@ove/core';
import { integerIn } from '@ove/jobs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { AI_JOB_KINDS } from './ai-settings';
import type { Ctx, Route } from '../types';

// URL path to job kind. Requests are checked now, so a bad one is refused with its reason before anything is queued.
const jobRoutes: Record<string, JobKind> = {
  '/api/compose': 'compose', '/api/refine': 'refine', '/api/import': 'import', '/api/render': 'render', '/api/thumbnail': 'thumbnail', '/api/review': 'review',
  '/api/narrate': 'narrate', '/api/transcribe': 'transcribe', '/api/image': 'image', '/api/batch': 'batch',
};

export function jobsRoutes(): Route[] {
  const start = async (c: Ctx, kind: JobKind) => {
    const input = await c.body();
    // Integration side-channels and provider identity are the operator's configuration on the hosted service:
    // a request never chooses where results are delivered, where uploads go, or which AI endpoint the worker
    // calls (a caller-supplied baseUrl would make the worker fetch internal addresses). `model` stays: it
    // selects among the operator's gateway models. On your own machine you keep full control.
    if (c.deps.mode !== 'local') { for (const key of ['webhookUrl', 'webhookSecret', 's3Config', 's3Key', 'provider', 'model', 'baseUrl', 'apiKey']) delete input[key];
      // The AI is the person's own: with none saved there is nothing to run, so say so now instead of failing in a worker.
      if (c.deps.aiSettings && AI_JOB_KINDS.has(kind) && !c.deps.aiSettings.view(c.who)) throw new Error('Add your AI model in Settings first: choose a provider, a model and your API key.');
      // Reading public pages is off for hosted callers unless they ask for it: the worker would otherwise fetch whatever
      // third-party URLs a prompt makes the model name, on the operator's network, for any account.
      if (input.research !== true) input.research = false; }
    const request = { kind, input, who: c.who };
    c.deps.validate(request);
    // A job on a project that is not there (or is someone else's, which looks the same) is turned away now, not left to fail later.
    const file = typeof request.input.file === 'string' ? request.input.file : undefined;
    if (file && !await c.deps.store.exists(c.who, file.split('/')[0] ?? '')) throw new Error(`There is no project "${file.split('/')[0]}"`);
    await c.deps.quotas?.beforeJob(c.who, kind);
    c.json(202, { job: await c.deps.queue.enqueue(request) });
  };
  const routes: Route[] = Object.entries(jobRoutes).map(([path, kind]) => ({ method: 'POST' as const, path, handle: (c: Ctx) => start(c, kind) }));
  return [
    ...routes,
    { method: 'GET', path: '/api/jobs', handle: async c => c.json(200, { jobs: await c.deps.queue.recent(c.who) }) },
    { method: 'GET', path: '/api/job', handle: async c => {
      const job = await c.deps.queue.get(c.url.searchParams.get('id') ?? '', c.who);
      return job ? c.json(200, { job }) : c.json(404, { error: 'No such job' });
    } },
    { method: 'GET', path: '/api/events', handle: async c => {
      c.res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      c.res.write(': connected\n\n');
      c.res.write(`event: snapshot\ndata: ${JSON.stringify({ jobs: await c.deps.queue.recent(c.who) })}\n\n`);
      const off = c.deps.queue.subscribe(c.who, (job: Job) => c.res.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`));
      c.req.on('close', off);
    } },
    // Writing prompts and previewing one frame run in this process, so they are for a person on their own machine.
    { method: 'POST', path: '/api/prompt', handle: async c => {
      if (c.deps.mode !== 'local') return c.json(404, { error: 'Not found' });
      const body = await c.body(), brief = optionalText(body.brief) ?? 'A clean promotional video with animated text and shapes', canvas = canvasFor(body);
      const system = systemPrompt({ ...canvas, includeSchema: boolOf(body.schema) }), user = userPrompt(brief, { ...canvas, narration: boolOf(body.narration) });
      c.json(200, { prompt: `${system}\n\n---\n\n# User Request\n${user}` });
    } },
    { method: 'GET', path: '/api/still', handle: async c => {
      if (c.deps.mode !== 'local') return c.json(404, { error: 'Not found' });
      const { store } = c.deps, id = (c.url.searchParams.get('file') ?? '').split('/')[0] ?? '';
      const baseDir = (await store.workdir(c.who, id)).dir, raw = JSON.parse((await readFile(join(baseDir, 'composition.json'), 'utf8')).replace(/^﻿/, ''));
      const composition = await attachCaptions(loadComposition(raw), baseDir), requested = c.url.searchParams.get('frame');
      const frame = requested === null ? Math.floor(composition.durationFrames / 2) : integerIn(requested, 0, 'frame', 0, Math.max(0, composition.durationFrames - 1));
      c.send(200, 'image/png', await renderStill(composition, { frame, baseDir }));
    } },
  ];
}
