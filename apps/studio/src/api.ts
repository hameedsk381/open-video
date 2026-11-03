import { useSyncExternalStore } from 'react';

export type Project = { id: string; name: string; width: number; height: number; fps: number; durationFrames: number; seconds: number; scenes: number; modified: number; revisions: number; mode: 'template' | 'finished' };
export type Variable = { name: string; type: 'string' | 'number' | 'boolean' | 'color' | 'list'; description?: string; value: any };
export type TextLayer = { path: string; scene: string; id: string; content: string; fontSize: number };
export type Asset = { name: string; path: string; kind: string; bytes: number };
export type Scene = { id: string; name: string; startFrame: number; durationFrames: number };
export type Detail = { id: string; name: string; width: number; height: number; fps: number; durationFrames: number; mode: 'template' | 'finished'; scenes: Scene[]; variables: Variable[];
  theme: Record<string, string | number>; texts: TextLayer[]; assets: Asset[]; revisions: number; source: { raw: unknown; media: Record<string, unknown>; base: string } };
export type Revision = { n: number; at: string; kind: string; label: string; changes: string[] };
export type Block = { id: string; name: string; description: string; category: string; kind: 'scene' | 'overlay'; durationFrames: number };
export type Theme = { id: string; name: string; description: string; variables: Record<string, string | number> };
export type Library = { blocks: Block[]; themes: Theme[]; templates: { id: string; name: string; description: string }[] };
export type Status = { outDir: string; provider: { id: string; model: string } | null; error: string | null };
export type Job = { id: string; kind: string; status: 'queued' | 'running' | 'done' | 'error'; messages: string[]; result?: any; error?: string };

export async function api<T = any>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await response.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { json = { error: text }; }
  if (!response.ok) throw new Error(json.error || response.statusText);
  return json;
}

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

export const dur = (seconds: number) => { const m = Math.floor(seconds / 60), s = Math.round(seconds - m * 60); return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`; };
export const ago = (ms: number) => { const s = Math.max(1, Math.round((Date.now() - ms) / 1000)); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago`; };
