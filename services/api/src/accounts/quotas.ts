import type { JobKind } from '@ove/contracts';
import { jobClass } from '@ove/jobs';
import type { Principal } from '@ove/storage';
import type { Quotas } from '../types';
import type { UserStore } from './users';

export type Limits = {
  maxProjects: number;
  maxUploadBytes: number;
  maxStorageBytes: number;
  /** Jobs a person may start per UTC day, by kind of work: asking the AI, and drawing frames. Thumbnails are not counted. */
  jobsPerDay: { ai: number; render: number };
};
/** Numbers for a free beta: enough to try the product, small enough that one person cannot run up the bill. */
export const betaLimits: Limits = { maxProjects: 25, maxUploadBytes: 50 * 1024 * 1024, maxStorageBytes: 1024 * 1024 * 1024, jobsPerDay: { ai: 30, render: 15 } };

const today = () => new Date().toISOString().slice(0, 10);

export function createQuotas(options: { limits?: Partial<Limits>; users: Pick<UserStore, 'bump'>; storageUsed(who: Principal): Promise<number> }): Quotas {
  const limits: Limits = { ...betaLimits, ...options.limits, jobsPerDay: { ...betaLimits.jobsPerDay, ...options.limits?.jobsPerDay } };
  return {
    async beforeJob(who: Principal, kind: JobKind) {
      if (kind === 'thumbnail') return;
      const cls = jobClass(kind), used = await options.users.bump(who.tenantId, cls, today());
      if (used > limits.jobsPerDay[cls]) throw new Error(cls === 'ai' ? `You have used today's ${limits.jobsPerDay.ai} AI requests. They reset at midnight UTC.` : `You have used today's ${limits.jobsPerDay.render} renders and checks. They reset at midnight UTC.`);
    },
    async beforeProject(_who: Principal, existing: number) { if (existing >= limits.maxProjects) throw new Error(`You can keep ${limits.maxProjects} projects. Delete one to make room.`); },
    async beforeUpload(who: Principal, bytes: number) {
      if (bytes > limits.maxUploadBytes) throw new Error(`Files can be up to ${Math.round(limits.maxUploadBytes / 1024 / 1024)} MB`);
      if (await options.storageUsed(who) + bytes > limits.maxStorageBytes) throw new Error(`Your storage is full (${Math.round(limits.maxStorageBytes / 1024 / 1024)} MB). Delete something to make room.`);
    },
  };
}
