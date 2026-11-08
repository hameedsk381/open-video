// What `mr serve` and `mr job-worker` read from the environment, in one place. Settings are checked together, so a deployment with three
// mistakes hears about all three at once instead of fixing one and restarting for the next. Nothing here starts a server or opens a connection.
import { resolve } from 'node:path';

export type JobLane = 'render' | 'ai';
export type ApiConfig = {
  dataDir: string; port: number; host: string; publicOrigin: string; secure: boolean;
  databaseUrl: string; redisUrl: string; settingsSecret: string; smtp: boolean;
  trustProxy: boolean; requireVerified: boolean; signups: boolean;
  limits: { maxProjects?: number; maxUploadBytes?: number; maxStorageBytes?: number; jobsPerDay: { ai: number; render: number } };
  warnings: string[];
};
export type WorkerConfig = {
  dataDir: string; lane: JobLane; redisUrl: string; settingsSecret?: string;
  timeoutSeconds: number; concurrency: number; warnings: string[];
};
type Env = Record<string, string | undefined>;

class Problems {
  readonly list: string[] = [];
  add(message: string) { this.list.push(message); }
  done(what: string) { if (this.list.length) throw new Error(`${what} cannot start, fix these settings:\n${this.list.map(item => `  - ${item}`).join('\n')}`); }
}

const blank = (value: string | undefined) => value === undefined || value.trim() === '';
const text = (env: Env, name: string) => blank(env[name]) ? undefined : env[name]!.trim();
const required = (env: Env, name: string, problems: Problems, hint?: string) => {
  const value = text(env, name);
  if (!value) problems.add(`${name} is not set${hint ? ` (${hint})` : ''}`);
  return value ?? '';
};
const flag = (env: Env, name: string, fallback: boolean) => {
  const value = text(env, name);
  return value === undefined ? fallback : !/^(0|false|no|off)$/i.test(value);
};
/** A whole number in [min, max], or `fallback` when the setting is absent. */
const whole = (env: Env, name: string, fallback: number | undefined, problems: Problems, min = 1, max = Number.MAX_SAFE_INTEGER) => {
  const value = text(env, name);
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) { problems.add(`${name} must be a whole number from ${min} to ${max}, not "${value}"`); return fallback; }
  return number;
};
const urlWith = (env: Env, name: string, protocols: string[], problems: Problems, hint?: string) => {
  const value = required(env, name, problems, hint);
  if (value && !protocols.some(protocol => value.startsWith(`${protocol}:`))) problems.add(`${name} must start with ${protocols.map(p => `${p}://`).join(' or ')}`);
  return value;
};

const checkSecret = (secret: string | undefined, warnings: string[]) => {
  if (secret && secret.length < 24) warnings.push('SETTINGS_SECRET is short; use a random string of at least 32 characters (changing it later makes saved AI keys unreadable)');
};

export function readApiConfig(env: Env = process.env): ApiConfig {
  const problems = new Problems(), warnings: string[] = [];
  const port = whole(env, 'PORT', 3100, problems, 1, 65535)!;
  const publicOrigin = (text(env, 'PUBLIC_ORIGIN') ?? `http://127.0.0.1:${port}`).replace(/\/+$/, '');
  try { const url = new URL(publicOrigin); if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol'); }
  catch { problems.add(`PUBLIC_ORIGIN must be a full http(s) address such as https://studio.example.com, not "${publicOrigin}"`); }
  const databaseUrl = urlWith(env, 'DATABASE_URL', ['postgres', 'postgresql'], problems);
  const redisUrl = urlWith(env, 'REDIS_URL', ['redis', 'rediss'], problems);
  const settingsSecret = required(env, 'SETTINGS_SECRET', problems, 'a long random string that encrypts the AI keys people save in Settings');
  checkSecret(settingsSecret, warnings);
  const megabytes = (name: string) => { const value = whole(env, name, undefined, problems, 0); return value === undefined ? undefined : value * 1024 * 1024; };
  const limits = {
    maxProjects: whole(env, 'LIMIT_PROJECTS', undefined, problems, 0), maxUploadBytes: megabytes('LIMIT_UPLOAD_MB'), maxStorageBytes: megabytes('LIMIT_STORAGE_MB'),
    jobsPerDay: { ai: whole(env, 'LIMIT_AI_PER_DAY', 30, problems, 0)!, render: whole(env, 'LIMIT_RENDERS_PER_DAY', 15, problems, 0)! },
  };
  for (const key of ['maxProjects', 'maxUploadBytes', 'maxStorageBytes'] as const) if (limits[key] === undefined) delete limits[key];
  const secure = publicOrigin.startsWith('https://'), smtp = !blank(env.SMTP_URL);
  if (!secure) warnings.push('PUBLIC_ORIGIN is not https, so session cookies are not marked Secure');
  if (!smtp) warnings.push('no mail server is set (SMTP_URL), so password-reset and confirmation links are only written to this log');
  problems.done('The API');
  return {
    dataDir: resolve(text(env, 'DATA_DIR') ?? 'data'), port, host: text(env, 'HOST') ?? '0.0.0.0', publicOrigin, secure, databaseUrl, redisUrl, settingsSecret, smtp,
    trustProxy: flag(env, 'TRUST_PROXY', false), requireVerified: flag(env, 'REQUIRE_VERIFIED', false), signups: flag(env, 'SIGNUPS', true), limits, warnings,
  };
}

export function readWorkerConfig(env: Env = process.env): WorkerConfig {
  const problems = new Problems(), warnings: string[] = [];
  const lane = text(env, 'JOB_LANE');
  if (lane !== 'render' && lane !== 'ai') problems.add(`JOB_LANE must be render or ai, not ${lane ? `"${lane}"` : 'unset'}`);
  const redisUrl = urlWith(env, 'REDIS_URL', ['redis', 'rediss'], problems);
  // Only the AI lane reads people's saved AI connections; a render worker never touches them and needs no secret.
  const settingsSecret = lane === 'ai' ? required(env, 'SETTINGS_SECRET', problems, 'the same value the API uses') : text(env, 'SETTINGS_SECRET');
  if (lane === 'ai') checkSecret(settingsSecret, warnings);
  const timeoutSeconds = whole(env, 'JOB_TIMEOUT_SECONDS', lane === 'render' ? 900 : 300, problems, 1)!;
  const concurrency = whole(env, 'WORKER_CONCURRENCY', 1, problems, 1, 64)!;
  problems.done('The job worker');
  return { dataDir: resolve(text(env, 'DATA_DIR') ?? 'data'), lane: lane as JobLane, redisUrl, ...(settingsSecret ? { settingsSecret } : {}), timeoutSeconds, concurrency, warnings };
}
