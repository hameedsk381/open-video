import { describe, expect, it } from 'vitest';
import { readApiConfig, readWorkerConfig } from '../../packages/cli/src/serve-config';

const good = { DATABASE_URL: 'postgres://u:p@db:5432/ove', REDIS_URL: 'redis://:p@redis:6379', SETTINGS_SECRET: 'x'.repeat(40), PUBLIC_ORIGIN: 'https://studio.example.com/' };

describe('API settings', () => {
  it('reads a complete environment with the defaults filled in', () => {
    const config = readApiConfig(good);
    expect(config).toMatchObject({ port: 3100, host: '0.0.0.0', publicOrigin: 'https://studio.example.com', secure: true, signups: true, trustProxy: false, requireVerified: false });
    expect(config.limits).toEqual({ jobsPerDay: { ai: 30, render: 15 } });
    expect(config.warnings).toEqual([expect.stringMatching(/no mail server/)]);
  });

  it('reports every problem at once, not just the first', () => {
    expect(() => readApiConfig({ PORT: '99999', PUBLIC_ORIGIN: 'studio.example.com' })).toThrow(/PORT must be[\s\S]*PUBLIC_ORIGIN must be[\s\S]*DATABASE_URL is not set[\s\S]*REDIS_URL is not set[\s\S]*SETTINGS_SECRET is not set/);
  });

  it('checks the shape of the connection strings and the numeric limits', () => {
    expect(() => readApiConfig({ ...good, DATABASE_URL: 'mysql://x', REDIS_URL: 'http://x', LIMIT_PROJECTS: 'many' })).toThrow(/DATABASE_URL must start with postgres[\s\S]*REDIS_URL must start with redis[\s\S]*LIMIT_PROJECTS/);
  });

  it('turns megabyte limits into bytes and warns about a short secret and a plain-http origin', () => {
    const config = readApiConfig({ ...good, SETTINGS_SECRET: 'short', PUBLIC_ORIGIN: 'http://localhost:3100', LIMIT_UPLOAD_MB: '20', LIMIT_STORAGE_MB: '500', SMTP_URL: 'smtp://x', SIGNUPS: 'off' });
    expect(config).toMatchObject({ secure: false, signups: false, smtp: true });
    expect(config.limits).toMatchObject({ maxUploadBytes: 20 * 1024 * 1024, maxStorageBytes: 500 * 1024 * 1024 });
    expect(config.warnings.join('\n')).toMatch(/SETTINGS_SECRET is short[\s\S]*not https/);
  });
});

describe('job worker settings', () => {
  it('needs the secret only on the AI lane', () => {
    expect(readWorkerConfig({ JOB_LANE: 'render', REDIS_URL: good.REDIS_URL })).toMatchObject({ lane: 'render', timeoutSeconds: 900, concurrency: 1 });
    expect(() => readWorkerConfig({ JOB_LANE: 'ai', REDIS_URL: good.REDIS_URL })).toThrow(/SETTINGS_SECRET is not set/);
    expect(readWorkerConfig({ JOB_LANE: 'ai', REDIS_URL: good.REDIS_URL, SETTINGS_SECRET: good.SETTINGS_SECRET })).toMatchObject({ lane: 'ai', timeoutSeconds: 300, settingsSecret: good.SETTINGS_SECRET });
  });

  it('refuses an unknown lane and a bad concurrency', () => {
    expect(() => readWorkerConfig({ JOB_LANE: 'video', REDIS_URL: good.REDIS_URL, WORKER_CONCURRENCY: '0' })).toThrow(/JOB_LANE must be render or ai, not "video"[\s\S]*WORKER_CONCURRENCY/);
    expect(() => readWorkerConfig({})).toThrow(/JOB_LANE must be render or ai, not unset[\s\S]*REDIS_URL is not set/);
  });
});
