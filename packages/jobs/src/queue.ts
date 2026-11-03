import { describeError } from '@ove/core';
import type { Job, JobKind } from '@ove/contracts';
import type { Principal } from '@ove/storage';
import type { JobEnv } from './env';
import { createHandlers } from './handlers';

/** What a handler gives back: the kind of job and the work to do, reporting progress as it goes. */
export type JobSpec = { kind: JobKind; run: (progress: (message: string) => void) => Promise<unknown> };

/** A job as a description, so it can wait in a queue, cross to another process, and be run there: what to do, with what, for whom. */
export type JobRequest = { kind: JobKind; input: Record<string, unknown>; who: Principal };
/** Does the work for a request, reporting progress as it goes, and gives the result. */
export type JobRunner = (request: JobRequest, progress: (message: string) => void) => Promise<unknown>;

/** Jobs that draw frames (and so need Chromium and run user compositions) are kept apart from jobs that only talk to the AI. */
export type JobClass = 'render' | 'ai';
export const jobClass = (kind: JobKind): JobClass => kind === 'render' || kind === 'thumbnail' || kind === 'review' || kind === 'batch' ? 'render' : 'ai';

export interface JobQueue {
  enqueue(request: JobRequest): Promise<Job>;
  /** A job, only for the person who asked for it. */
  get(id: string, who: Principal): Promise<Job | undefined>;
  recent(who: Principal): Promise<Job[]>;
  /** Called with a copy of each of this person's jobs when it is added, starts, reports, or ends. Returns a function that stops listening. */
  subscribe(who: Principal, listener: (job: Job) => void): () => void;
  close?(): Promise<void>;
}

/** Builds the handlers for one person and checks a request with them, which refuses a bad request straight away (before it is queued). */
export function createJobRunner(makeEnv: (who: Principal) => JobEnv) {
  const handlersFor = (who: Principal) => createHandlers(makeEnv(who));
  const spec = (request: JobRequest) => { const make = (handlersFor(request.who) as any)[request.kind]; if (typeof make !== 'function') throw new Error(`There is no job called "${request.kind}"`); return make(request.input); };
  return {
    /** Throws the same Error the handler would, without running anything. */
    validate(request: JobRequest): void { spec(request); },
    run: (async (request, progress) => (spec(request) as JobSpec).run(progress)) as JobRunner,
  };
}

type Entry = { job: Job; request: JobRequest };

/** One job at a time, in this process, forgotten on restart. A hosted setup puts a durable queue behind the same interface. */
export class InProcessQueue implements JobQueue {
  private entries = new Map<string, Entry>();
  private waiting: Entry[] = [];
  private listeners = new Set<{ tenant: string; listener: (job: Job) => void }>();
  private running = false;
  private nextId = 0;
  /** `redact` cleans a failure message before anyone sees it (a hosted setup removes server paths). */
  constructor(private runner: JobRunner, private redact: (message: string) => string = message => message) {}

  async enqueue(request: JobRequest): Promise<Job> {
    const job: Job = { id: String(++this.nextId), kind: request.kind, status: 'queued', messages: [] };
    const entry = { job, request };
    this.entries.set(job.id, entry); this.waiting.push(entry);
    if (this.entries.size > 40) for (const [id, old] of this.entries) { if (this.entries.size <= 20) break; if (old.job.status === 'done' || old.job.status === 'error') this.entries.delete(id); }
    const copy = { ...job, messages: [...job.messages] };
    this.emit(entry); void this.pump();
    // The job may already have started by the time the caller reads this; the copy is how it looked when it was added.
    return { ...copy, status: entry.job.status === 'running' ? 'running' : 'queued' };
  }
  async get(id: string, who: Principal) { const entry = this.entries.get(id); return entry && entry.request.who.tenantId === who.tenantId ? { ...entry.job, messages: [...entry.job.messages] } : undefined; }
  async recent(who: Principal) { return [...this.entries.values()].filter(entry => entry.request.who.tenantId === who.tenantId).slice(-20).map(entry => ({ ...entry.job, messages: [...entry.job.messages] })); }
  subscribe(who: Principal, listener: (job: Job) => void) { const item = { tenant: who.tenantId, listener }; this.listeners.add(item); return () => { this.listeners.delete(item); }; }

  private emit(entry: Entry) {
    const copy = { ...entry.job, messages: [...entry.job.messages] };
    for (const item of [...this.listeners]) { if (item.tenant !== entry.request.who.tenantId) continue; try { item.listener(copy); } catch { this.listeners.delete(item); } }
  }
  private async pump(): Promise<void> {
    if (this.running) return;
    const entry = this.waiting.shift();
    if (!entry) return;
    const { job } = entry;
    this.running = true; job.status = 'running'; job.startedAt = Date.now(); this.emit(entry);
    try {
      job.result = await this.runner(entry.request, message => {
        job.messages.push(this.redact(String(message)));
        if (job.messages.length > 200) job.messages.shift();
        this.emit(entry);
      });
      job.status = 'done';
    } catch (error) {
      job.error = this.redact(describeError(error));
      job.status = 'error';
    } finally {
      job.endedAt = Date.now(); this.running = false; this.emit(entry); void this.pump();
    }
  }
}
