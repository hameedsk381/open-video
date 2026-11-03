// A durable queue: jobs wait in Redis (BullMQ), survive a restart of the API, and are run by separate worker processes, in two lanes. Drawing jobs
// (render, thumbnail, review, batch) and AI jobs go to different queues, so they can run on different machines with different permissions.
import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents, type ConnectionOptions, type Job as BullJob } from 'bullmq';
import type { Job } from '@ove/contracts';
import type { Principal } from '@ove/storage';
import { jobClass, type JobClass, type JobQueue, type JobRequest } from './queue';

export const queueName = (cls: JobClass) => `ove-${cls}`;
const classes: JobClass[] = ['render', 'ai'];
/** The id carries its lane (r- or a-), so a job can be found without asking both queues. */
const laneOf = (id: string): JobClass | undefined => id.startsWith('r-') ? 'render' : id.startsWith('a-') ? 'ai' : undefined;

type Data = JobRequest;

export class RedisQueue implements JobQueue {
  private queues = {} as Record<JobClass, Queue<Data>>;
  private events = {} as Record<JobClass, QueueEvents>;
  private listeners = new Set<{ tenant: string; listener: (job: Job) => void }>();
  constructor(private connection: ConnectionOptions, private redact: (message: string) => string = message => message) {
    for (const cls of classes) this.queues[cls] = new Queue<Data>(queueName(cls), { connection });
  }

  async enqueue(request: JobRequest): Promise<Job> {
    const cls = jobClass(request.kind), id = `${cls === 'render' ? 'r' : 'a'}-${randomUUID()}`;
    const job = await this.queues[cls].add(request.kind, request, { jobId: id, attempts: 1, removeOnComplete: { age: 3600, count: 1000 }, removeOnFail: { age: 86_400, count: 1000 } });
    return this.toJob(job, 'queued');
  }
  async get(id: string, who: Principal) {
    const cls = laneOf(id); if (!cls) return undefined;
    const job = await this.queues[cls].getJob(id);
    return job && job.data.who.tenantId === who.tenantId ? this.toJob(job) : undefined;
  }
  async recent(who: Principal) {
    const found: BullJob<Data>[] = [];
    for (const cls of classes) for (const job of await this.queues[cls].getJobs(['waiting', 'active', 'completed', 'failed', 'delayed'], 0, 200, false)) if (job.data.who.tenantId === who.tenantId) found.push(job);
    found.sort((a, b) => a.timestamp - b.timestamp);
    return Promise.all(found.slice(-20).map(job => this.toJob(job)));
  }
  subscribe(who: Principal, listener: (job: Job) => void) {
    const item = { tenant: who.tenantId, listener }; this.listeners.add(item); this.listen();
    return () => { this.listeners.delete(item); };
  }

  private listening = false;
  /** One event stream per lane, started when the first person subscribes; each event is turned into the job as it now is and sent to its owner. */
  private listen() {
    if (this.listening) return; this.listening = true;
    for (const cls of classes) {
      const events = this.events[cls] = new QueueEvents(queueName(cls), { connection: this.connection });
      const tell = async ({ jobId }: { jobId: string }) => {
        try {
          const job = await this.queues[cls].getJob(jobId); if (!job) return;
          const view = await this.toJob(job);
          for (const item of [...this.listeners]) if (item.tenant === job.data.who.tenantId) { try { item.listener(view); } catch { this.listeners.delete(item); } }
        } catch { /* the job went away between the event and the lookup */ }
      };
      for (const name of ['waiting', 'active', 'progress', 'completed', 'failed'] as const) events.on(name as any, tell);
    }
  }

  private async toJob(first: BullJob<Data>, known?: Job['status']): Promise<Job> {
    let job = first;
    const state = known ?? await job.getState();
    // A job that finished after it was fetched has its result or failure only on a fresh copy.
    if (!known && (state === 'completed' || state === 'failed')) { const lane = laneOf(String(job.id)); job = (lane && await this.queues[lane].getJob(String(job.id))) || job; }
    const status: Job['status'] = state === 'completed' ? 'done' : state === 'failed' ? 'error' : state === 'active' ? 'running' : 'queued';
    const progress = job.progress as { messages?: string[] } | number | undefined;
    return {
      id: job.id!, kind: job.data.kind, status, messages: typeof progress === 'object' && progress?.messages ? progress.messages : [],
      ...(status === 'done' ? { result: job.returnvalue } : {}), ...(status === 'error' ? { error: this.redact(job.failedReason ?? 'The job failed') } : {}),
      ...(job.processedOn ? { startedAt: job.processedOn } : {}), ...(job.finishedOn ? { endedAt: job.finishedOn } : {}),
    };
  }

  async close() { for (const cls of classes) { await this.events[cls]?.close(); await this.queues[cls].close(); } }
}

/** BullMQ's connection settings from a redis:// address (redis://:password@host:6379/0). */
export function redisConnection(url: string): ConnectionOptions {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 6379), ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}), ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}), ...(parsed.pathname.length > 1 ? { db: Number(parsed.pathname.slice(1)) } : {}), ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}), maxRetriesPerRequest: null };
}
