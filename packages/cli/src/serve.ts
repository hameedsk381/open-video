// Hosted use. `ove serve` is the API behind a login, `ove job-worker` runs the jobs it queues. Both read their settings from the environment
// (containers pass settings that way, see serve-config.ts) and print what they are doing. The same published package serves both; only the command differs.
import { createProvider, type AiProvider } from '@ove/ai';
import { createAccounts, createApp, createQuotas, consoleMailer, PgUserStore } from '@ove/api';
import { RedisQueue, createJobRunner, redisConnection } from '@ove/jobs';
import { AiSettingsStore, FsProjectStore, type Principal } from '@ove/storage';
import { runWorker } from '@ove/worker';
import { jobEnvFor, studioApp, studioLibrary, studioPlayer } from './ai-studio';
import { readApiConfig, readWorkerConfig } from './serve-config';
import { makeThumbnail } from './thumbnail';

/** Takes the storage folder out of any text a person might see (error messages, results), in both plain and JSON-escaped form. */
const hideStorage = (root: string) => { const plain = root, escaped = JSON.stringify(root).slice(1, -1); return (text: string) => text.split(escaped).join('<storage>').split(plain).join('<storage>'); };

export async function runServe(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readApiConfig(env);
  const { dataDir: root, port, host, publicOrigin, secure } = config;
  const store = new FsProjectStore(root), users = await PgUserStore.connect(config.databaseUrl);
  const queue = new RedisQueue(redisConnection(config.redisUrl), hideStorage(root));
  // Jobs are checked here and run by the workers; the API holds no AI key and starts no browser.
  const runner = createJobRunner(jobEnvFor(store, () => { throw new Error('AI work runs on the job workers'); }, () => ({}), false));
  const auth = createAccounts({ users, publicOrigin, secureCookies: secure, trustProxy: config.trustProxy, requireVerified: config.requireVerified, signups: config.signups, mailer: consoleMailer });
  const quotas = createQuotas({ users, limits: config.limits, storageUsed: who => store.usedBytes(who) });
  const publicHost = new URL(publicOrigin).host.replace(/:\d+$/, '');
  // The service holds no AI key. Each person connects their own in Settings; it is stored encrypted under SETTINGS_SECRET.
  const aiSettings = new AiSettingsStore(store, config.settingsSecret);
  const app = createApp({
    mode: 'hosted', store, queue, validate: runner.validate, auth, quotas, library: studioLibrary, player: studioPlayer, app: studioApp,
    makeThumbnail: async () => { throw new Error('Thumbnails are drawn by the render workers'); },
    providerState: () => ({ provider: null, error: null }), aiSettings,
    // 127.0.0.1 and localhost are listed so a container health check can ask; they cannot be reached by a web page on another site.
    allowHosts: [publicHost, '127.0.0.1', 'localhost'], publicOrigin,
  });
  void makeThumbnail;
  const { server } = await app.listen({ host, port, tries: 0 });
  console.log(`OVE studio (hosted)\n  listening on ${host}:${port}, public address ${publicOrigin}\n  storage ${root}`);
  for (const warning of config.warnings) console.log(`  WARNING: ${warning}`);
  const stop = () => { server.close(); server.closeAllConnections(); void Promise.all([queue.close(), users.close?.()]).finally(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}

export async function runJobWorker(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const config = readWorkerConfig(env);
  const { dataDir: root, lane, timeoutSeconds, concurrency } = config;
  const store = new FsProjectStore(root);
  // A job runs with the connection its own person saved in Settings; the worker has no AI key of its own.
  // Only the AI lane reads saved connections; a render worker never touches them and needs no secret.
  const aiSettings = new AiSettingsStore(store, config.settingsSecret);
  const requireProvider = (who: Principal): AiProvider => {
    const own = aiSettings.get(who);
    if (!own) throw new Error('Add your AI model in Settings first: choose a provider, a model and your API key.');
    return createProvider({ provider: own.provider, model: own.model, baseUrl: own.baseUrl, apiKey: own.apiKey });
  };
  const providerInfo = (who: Principal) => { try { const own = aiSettings.get(who); return { provider: own?.provider, model: own?.model }; } catch { return {}; } };
  const runner = createJobRunner(jobEnvFor(store, lane === 'ai' ? requireProvider : () => { throw new Error('This worker does not run AI jobs'); }, providerInfo, false));
  const { close } = runWorker({ connection: redisConnection(config.redisUrl), lane, runner: runner.run, timeoutSeconds, redact: hideStorage(root), concurrency });
  console.log(`MotionRender job worker: ${lane} lane, concurrency: ${concurrency}, ${timeoutSeconds}s limit per job, storage ${root}`);
  for (const warning of config.warnings) console.log(`  WARNING: ${warning}`);
  const stop = () => { void close().finally(() => process.exit(0)); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
