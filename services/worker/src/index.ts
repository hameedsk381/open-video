// Runs jobs from the durable queue. One worker process serves one lane (render or ai) and does one job at a time. A job that outlives its time
// limit is not left to hang a machine: the process exits (the container restarts it) and the queue marks that job failed as stalled.
import { Worker, type ConnectionOptions } from 'bullmq';
import { jobClass, queueName, type JobClass, type JobRunner } from '@ove/jobs';

export type WorkerOptions = {
  connection: ConnectionOptions;
  lane: JobClass;
  runner: JobRunner;
  /** How long one job may run, in seconds, before the process gives up on it. */
  timeoutSeconds: number;
  concurrency?: number;
  /** Removes anything a person should not see (server paths) from results and messages. */
  redact?: (text: string) => string;
  log?: (line: string) => void;
  /** What to do when a job runs out of time. Exits the process unless a test says otherwise. */
  onTimeout?: () => void;
};

export function runWorker(options: WorkerOptions) {
  const log = options.log ?? (line => console.log(line)), redact = options.redact ?? ((text: string) => text);
  const scrub = (value: unknown) => value === undefined ? value : JSON.parse(redact(JSON.stringify(value)));
  const worker = new Worker(queueName(options.lane), async job => {
    const request = job.data;
    if (jobClass(request.kind) !== options.lane) throw new Error(`A ${options.lane} worker was given a ${request.kind} job`);
    const messages: string[] = [];
    const watchdog = setTimeout(() => { log(`job ${job.id} (${request.kind}) ran past ${options.timeoutSeconds}s; stopping this worker`); (options.onTimeout ?? (() => process.exit(70)))(); }, options.timeoutSeconds * 1000);
    try {
      log(`job ${job.id}: ${request.kind} started`);
      const result = await options.runner(request, message => { messages.push(redact(String(message))); if (messages.length > 200) messages.shift(); void job.updateProgress({ messages: [...messages] }).catch(() => {}); });
      log(`job ${job.id}: ${request.kind} done`);
      return scrub(result);
    } catch (error) {
      log(`job ${job.id}: ${request.kind} failed: ${(error as Error).message}`);
      throw new Error(redact((error as Error).message));
    } finally { clearTimeout(watchdog); }
  }, { connection: options.connection, concurrency: options.concurrency ?? 1, lockDuration: 60_000, maxStalledCount: 0 });
  worker.on('error', error => log(`worker error: ${error.message}`));
  /** Closing waits for the job that is running, unless `force` (a job that will never finish would hold it forever). */
  return { worker, async close(force = false) { await worker.close(force); } };
}
