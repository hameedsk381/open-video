// Hosted use. `ove serve` is the API behind a login, `ove job-worker` runs the jobs it queues. Both read their settings from the environment
// (containers pass settings that way) and print what they are doing. The same published package serves both; only the command differs.
import { resolve } from 'node:path';
import { createProvider, type AiProvider } from '@ove/ai';
import { createAccounts, createApp, createQuotas, consoleMailer, PgUserStore, type Limits } from '@ove/api';
import { RedisQueue, createJobRunner, redisConnection, type JobClass } from '@ove/jobs';
import { AiSettingsStore, FsProjectStore, type Principal } from '@ove/storage';
import { runWorker } from '@ove/worker';
import { jobEnvFor, studioApp, studioLibrary, studioPlayer } from './ai-studio';
import { makeThumbnail } from './thumbnail';

const need = (env: NodeJS.ProcessEnv, name: string) => { const value = env[name]; if (!value) throw new Error(`${name} is not set`); return value; };
const flag = (value: string | undefined, fallback: boolean) => value === undefined || value === '' ? fallback : !/^(0|false|no|off)$/i.test(value);
/** Takes the storage folder out of any text a person might see (error messages, results), in both plain and JSON-escaped form. */
const hideStorage = (root: string) => { const plain = root, escaped = JSON.stringify(root).slice(1, -1); return (text: string) => text.split(escaped).join('<storage>').split(plain).join('<storage>'); };

export async function runServe(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const root = resolve(env.DATA_DIR ?? 'data'), port = Number(env.PORT ?? 3100), host = env.HOST ?? '0.0.0.0';
  const publicOrigin = (env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`).replace(/\/+$/, ''), secure = publicOrigin.startsWith('https://');
  const store = new FsProjectStore(root), users = await PgUserStore.connect(need(env, 'DATABASE_URL'));
  const queue = new RedisQueue(redisConnection(need(env, 'REDIS_URL')), hideStorage(root));
  // Jobs are checked here and run by the workers; the API holds no AI key and starts no browser.
  const runner = createJobRunner(jobEnvFor(store, () => { throw new Error('AI work runs on the job workers'); }, () => ({}), false));
  const auth = createAccounts({ users, publicOrigin, secureCookies: secure, trustProxy: flag(env.TRUST_PROXY, false), requireVerified: flag(env.REQUIRE_VERIFIED, false), signups: flag(env.SIGNUPS, true), mailer: consoleMailer });
  const num = (name: string) => env[name] === undefined ? undefined : Number(env[name]);
  const limits: Partial<Limits> = { maxProjects: num('LIMIT_PROJECTS'), maxUploadBytes: num('LIMIT_UPLOAD_MB') && num('LIMIT_UPLOAD_MB')! * 1024 * 1024, maxStorageBytes: num('LIMIT_STORAGE_MB') && num('LIMIT_STORAGE_MB')! * 1024 * 1024,
    jobsPerDay: { ai: num('LIMIT_AI_PER_DAY') ?? 30, render: num('LIMIT_RENDERS_PER_DAY') ?? 15 } };
  for (const key of Object.keys(limits) as (keyof Limits)[]) if (limits[key] === undefined) delete limits[key];
  const quotas = createQuotas({ users, limits, storageUsed: who => store.usedBytes(who) });
  const publicHost = new URL(publicOrigin).host.replace(/:\d+$/, '');
  // The service holds no AI key. Each person connects their own in Settings; it is stored encrypted under SETTINGS_SECRET.
  const aiSettings = new AiSettingsStore(store, need(env, 'SETTINGS_SECRET'));
  const app = createApp({
    mode: 'hosted', store, queue, validate: runner.validate, auth, quotas, library: studioLibrary, player: studioPlayer, app: studioApp,
    makeThumbnail: async () => { throw new Error('Thumbnails are drawn by the render workers'); },
    providerState: () => ({ provider: null, error: null }), aiSettings,
    // 127.0.0.1 and localhost are listed so a container health check can ask; they cannot be reached by a web page on another site.
    allowHosts: [publicHost, '127.0.0.1', 'localhost'], publicOrigin,
  });
  void makeThumbnail;
  const { server } = await app.listen({ host, port, tries: 0 });
  console.log(`OVE studio (hosted)\n  listening on ${host}:${port}, public address ${publicOrigin}\n  storage ${root}\n  ${secure ? 'cookies are Secure' : 'WARNING: PUBLIC_ORIGIN is not https, so session cookies are not marked Secure'}`);
  if (!env.SMTP_URL) console.log('  WARNING: no mail server is set, so password-reset and confirmation links are only written to this log');
  const stop = () => { server.close(); server.closeAllConnections(); void Promise.all([queue.close(), users.close?.()]).finally(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

export async function runJobWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const lane = env.JOB_LANE as JobClass;
  if (lane !== 'render' && lane !== 'ai') throw new Error('JOB_LANE must be render or ai');
  const root = resolve(env.DATA_DIR ?? 'data'), store = new FsProjectStore(root);
  // A job runs with the connection its own person saved in Settings; the worker has no AI key of its own.
  // Only the AI lane reads saved connections; a render worker never touches them and needs no secret.
  const aiSettings = new AiSettingsStore(store, lane === 'ai' ? need(env, 'SETTINGS_SECRET') : env.SETTINGS_SECRET);
  const requireProvider = (who: Principal): AiProvider => {
    const own = aiSettings.get(who);
    if (!own) throw new Error('Add your AI model in Settings first: choose a provider, a model and your API key.');
    return createProvider({ provider: own.provider, model: own.model, baseUrl: own.baseUrl, apiKey: own.apiKey });
  };
  const providerInfo = (who: Principal) => { try { const own = aiSettings.get(who); return { provider: own?.provider, model: own?.model }; } catch { return {}; } };
  const runner = createJobRunner(jobEnvFor(store, lane === 'ai' ? requireProvider : () => { throw new Error('This worker does not run AI jobs'); }, providerInfo, false));
  const timeoutSeconds = Number(env.JOB_TIMEOUT_SECONDS ?? (lane === 'render' ? 900 : 300));
  const concurrency = Math.max(1, Number(env.WORKER_CONCURRENCY ?? 1));
  const { close } = runWorker({ connection: redisConnection(need(env, 'REDIS_URL')), lane, runner: runner.run, timeoutSeconds, redact: hideStorage(root), concurrency });
  console.log(`MotionRender job worker: ${lane} lane, concurrency: ${concurrency}, ${timeoutSeconds}s limit per job, storage ${root}`);
  const stop = () => { void close().finally(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
