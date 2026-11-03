import { describeError } from '@ove/core';
import type { Job, JobKind } from '@ove/contracts';

/** What a handler gives the queue: what kind of job it is and the work to do, reporting progress as it goes. */
export type JobSpec = { kind: JobKind; run: (progress: (message: string) => void) => Promise<unknown> };

export interface JobQueue {
  enqueue(spec: JobSpec): Job;
  get(id: string): Job | undefined;
  recent(): Job[];
  /** Called with a copy of a job each time it is added, starts, reports, or ends. Returns a function that stops listening. */
  subscribe(listener: (job: Job) => void): () => void;
}

type Entry = { job: Job; run: JobSpec['run'] };

/** One job at a time, in this process, forgotten on restart. A hosted setup puts a durable queue behind the same interface. */
export class InProcessQueue implements JobQueue {
  private entries = new Map<string, Entry>();
  private waiting: Entry[] = [];
  private listeners = new Set<(job: Job) => void>();
  private running = false;
  private nextId = 0;

  enqueue(spec: JobSpec): Job {
    const job: Job = { id: String(++this.nextId), kind: spec.kind, status: 'queued', messages: [] };
    const entry = { job, run: spec.run };
    this.entries.set(job.id, entry); this.waiting.push(entry);
    if (this.entries.size > 40) for (const [id, old] of this.entries) { if (this.entries.size <= 20) break; if (old.job.status === 'done' || old.job.status === 'error') this.entries.delete(id); }
    this.emit(job); void this.pump();
    return { ...job };
  }
  get(id: string) { const entry = this.entries.get(id); return entry && { ...entry.job }; }
  recent() { return [...this.entries.values()].slice(-20).map(entry => ({ ...entry.job })); }
  subscribe(listener: (job: Job) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  private emit(job: Job) { const copy = { ...job, messages: [...job.messages] }; for (const listener of [...this.listeners]) { try { listener(copy); } catch { this.listeners.delete(listener); } } }
  private async pump(): Promise<void> {
    if (this.running) return;
    const entry = this.waiting.shift();
    if (!entry) return;
    const { job } = entry;
    this.running = true; job.status = 'running'; job.startedAt = Date.now(); this.emit(job);
    try {
      job.result = await entry.run(message => {
        job.messages.push(String(message));
        if (job.messages.length > 200) job.messages.shift();
        this.emit(job);
      });
      job.status = 'done';
    } catch (error) {
      job.error = describeError(error);
      job.status = 'error';
    } finally {
      job.endedAt = Date.now(); this.running = false; this.emit(job); void this.pump();
    }
  }
}
