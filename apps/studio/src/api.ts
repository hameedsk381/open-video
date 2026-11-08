import { useSyncExternalStore } from 'react';

export type { Asset, Block, CompileProductionResult, Detail, Job, Library, Production, ProductionIssue, ProductionShot, ProductionState, ProductionSummaryState, Project, Revision, RevisionRaw, SaveProductionResult, Scene, Status, TemplateSummary, TextLayer, Theme, Variable } from '@ove/contracts';
import type { Job } from '@ove/contracts';

/** A failed request, with the server's body: plan saves carry field-level issues and conflicts there. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: any) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await response.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  if (response.status === 401 && !path.startsWith('/api/auth/')) window.dispatchEvent(new Event('ove-signed-out'));
  if (!response.ok) throw new ApiError(json.error || response.statusText, response.status, json);
  return json;
}

/* Whether this studio runs on this machine (your keys, your gateway, full control) or on a hosted service
 * (the operator's managed gateway does the work). A hosted service answers /api/auth/me; a local one does not. */
let hostMode: 'loading' | 'local' | 'hosted' = 'loading';
const modeListeners = new Set<() => void>();
fetch('/api/auth/me').then(
  r => { hostMode = r.ok ? 'hosted' : 'local'; },
  () => { hostMode = 'local'; },
).finally(() => modeListeners.forEach(fn => fn()));
export const useHostMode = () => useSyncExternalStore(fn => { modeListeners.add(fn); return () => modeListeners.delete(fn); }, () => hostMode);

export async function upload(project: string, file: File): Promise<void> {
  const response = await fetch(`/api/upload?project=${encodeURIComponent(project)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: file });
  if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Upload failed');
}

/* Jobs: one event stream feeds a small store, and a promise per job resolves from it. */
let jobs: Record<string, Job> = {};
const listeners = new Set<() => void>();
const waiters = new Map<string, { ok: (job: Job) => void; fail: (error: Error) => void; progress: (job: Job) => void }[]>();
const emit = () => { jobs = { ...jobs }; listeners.forEach(fn => fn()); };
function onJob(job: Job) {
  jobs[job.id] = job; emit();
  for (const waiter of waiters.get(job.id) ?? []) { waiter.progress(job); if (job.status === 'done') waiter.ok(job); if (job.status === 'error') waiter.fail(new Error(job.error || 'Failed')); }
  if (job.status === 'done' || job.status === 'error') waiters.delete(job.id);
}
let started = false;
export function connectJobs() {
  if (started) return; started = true;
  const source = new EventSource('/api/events');
  source.addEventListener('snapshot', event => (JSON.parse((event as MessageEvent).data).jobs as Job[]).forEach(onJob));
  source.addEventListener('job', event => onJob(JSON.parse((event as MessageEvent).data)));
}
export const useJobs = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => jobs);

export function waitJob(id: string, progress: (job: Job) => void = () => {}): Promise<Job> {
  return new Promise((ok, fail) => {
    const known = jobs[id];
    if (known?.status === 'done') return ok(known);
    if (known?.status === 'error') return fail(new Error(known.error));
    waiters.set(id, [...(waiters.get(id) ?? []), { ok, fail, progress }]);
    // The stream may be briefly down: look again now and then, so a finished job is never missed.
    const poll = setInterval(() => { if (!waiters.has(id)) return clearInterval(poll); api<{ job: Job }>(`/api/job?id=${id}`).then(r => onJob(r.job), () => {}); }, 4000);
  });
}
export async function runJob<T = any>(path: string, body: unknown, progress?: (job: Job) => void): Promise<T> {
  const { job } = await api<{ job: Job }>(path, body);
  return (await waitJob(job.id, progress)).result as T;
}

export function cleanUserStatus(raw?: string): string {
  if (!raw) return 'Making your video…';
  const clean = raw.replace(/^PROGRESS:\s*/i, '').trim();
  if (/synthesiz|speak|voice|narrat/i.test(clean)) return 'Adding the voiceover…';
  if (/transcrib|caption|cue|timing/i.test(clean)) return 'Timing the captions…';
  if (/retim/i.test(clean)) return 'Smoothing the pacing and transitions…';
  if (/visual system|contract|palette|brand/i.test(clean)) return 'Choosing colours and type…';
  if (/designing.*scene|storyboard|beat|plan/i.test(clean)) return 'Laying out the scenes…';
  if (/template|compose|layer|scene/i.test(clean)) return 'Designing the scenes…';
  if (/review|check|inspect/i.test(clean)) return 'Checking the design…';
  if (/heal|re-design|polish/i.test(clean)) return 'Polishing the motion…';
  if (/render/i.test(clean)) {
    const frames = clean.match(/Rendered\s+(\d+\/\d+)\s+frames/i);
    return frames ? `Rendering the video (${frames[1]} frames)…` : 'Rendering the video…';
  }
  if (/(freellm|qwen|llama|gpt|nemotron|claude|openai|mistral|attempt|\.schema|json|ast|token|px)/i.test(clean)) {
    return 'Making your video…';
  }
  return clean;
}

export const dur = (seconds: number) => { const m = Math.floor(seconds / 60), s = Math.round(seconds - m * 60); return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; };
export const ago = (ms: number) => { const s = Math.max(1, Math.round((Date.now() - ms) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
