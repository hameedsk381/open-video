import { afterAll, describe, expect, it } from 'vitest';
import { RateLimiter, hashPassword, verifyPassword, normalizeEmail, passwordProblem, MemoryUserStore, PgUserStore, EmailTaken, type UserStore } from '@ove/api';

// Passwords, the rate limiter, and the one set of rules every user store has to keep. The Postgres store runs the same rules when a
// database is given (OVE_TEST_DATABASE_URL=postgres://user:pass@host:port/db), the memory store always does.
describe('passwords', () => {
  it('hashes with a random salt, checks the right password only, and refuses a stranger\'s hash format', async () => {
    const a = await hashPassword('correct horse battery'), b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/); expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery', a)).toBe(true); expect(await verifyPassword('correct horse batterz', a)).toBe(false);
    expect(await verifyPassword('x', 'plain-text')).toBe(false); expect(await verifyPassword('x', 'scrypt$1$1$1$AAAA')).toBe(false);
  }, 30_000);
  it('holds a password to a minimum and an email to a shape', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/); expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/repeated/); expect(passwordProblem('x'.repeat(300))).toMatch(/too long/); expect(passwordProblem('a decent passphrase')).toBeUndefined();
    expect(normalizeEmail('  Me@Example.COM ')).toBe('me@example.com'); expect(normalizeEmail('nope')).toBeUndefined(); expect(normalizeEmail('a@b')).toBeUndefined(); expect(normalizeEmail(42)).toBeUndefined();
  });
});

describe('rate limiter', () => {
  it('allows a number of tries in a window and then waits for the window to pass', () => {
    const limiter = new RateLimiter(3, 1000);
    expect([1, 2, 3, 4].map(() => limiter.take('k', 0))).toEqual([true, true, true, false]);
    expect(limiter.take('other', 0)).toBe(true); expect(limiter.take('k', 999)).toBe(false); expect(limiter.take('k', 1001)).toBe(true);
  });
});

const stores: [string, () => Promise<UserStore>][] = [['memory', async () => new MemoryUserStore()]];
if (process.env.OVE_TEST_DATABASE_URL) stores.push(['postgres', () => PgUserStore.connect(process.env.OVE_TEST_DATABASE_URL!)]);
const opened: UserStore[] = [];
afterAll(async () => { for (const store of opened) await store.close?.(); });

describe.each(stores)('%s user store', (_name, open) => {
  const unique = () => `${Math.random().toString(36).slice(2)}@example.com`;
  const make = async () => { const store = await open(); opened.push(store); return store; };
  it('keeps one account per email and finds it by email or id', async () => {
    const store = await make(), email = unique(), id = `u-${Math.random().toString(36).slice(2)}`;
    const user = await store.create({ id, email, passwordHash: 'h' });
    expect(user).toMatchObject({ id, email, failedLogins: 0, disabled: false }); expect(user.verifiedAt).toBeUndefined();
    await expect(store.create({ id: `${id}2`, email, passwordHash: 'h' })).rejects.toBeInstanceOf(EmailTaken);
    expect((await store.byEmail(email))?.id).toBe(id); expect((await store.byId(id))?.email).toBe(email); expect(await store.byEmail('nobody@example.com')).toBeUndefined();
  });
  it('counts failures, locks at the limit, and forgets them on success', async () => {
    const store = await make(), id = `u-${Math.random().toString(36).slice(2)}`; await store.create({ id, email: unique(), passwordHash: 'h' });
    await store.recordFailure(id, 3, 60_000); await store.recordFailure(id, 3, 60_000); expect((await store.byId(id))).toMatchObject({ failedLogins: 2 }); expect((await store.byId(id))?.lockedUntil).toBeUndefined();
    await store.recordFailure(id, 3, 60_000); const locked = await store.byId(id); expect(locked?.failedLogins).toBe(0); expect(locked!.lockedUntil! - Date.now()).toBeGreaterThan(50_000);
    await store.clearFailures(id); expect((await store.byId(id))?.lockedUntil).toBeUndefined();
  });
  it('changes a password, verifies, disables, and ends all sessions of a person', async () => {
    const store = await make(), id = `u-${Math.random().toString(36).slice(2)}`; await store.create({ id, email: unique(), passwordHash: 'old' });
    await store.setPassword(id, 'new'); await store.markVerified(id); await store.setDisabled(id, true);
    expect(await store.byId(id)).toMatchObject({ passwordHash: 'new', disabled: true }); expect((await store.byId(id))?.verifiedAt).toBeGreaterThan(0);
    const later = Date.now() + 60_000; await store.createSession({ idHash: `s1-${id}`, userId: id, expiresAt: later }); await store.createSession({ idHash: `s2-${id}`, userId: id, expiresAt: later });
    expect(await store.findSession(`s1-${id}`)).toEqual({ userId: id, expiresAt: later });
    await store.deleteSession(`s1-${id}`); expect(await store.findSession(`s1-${id}`)).toBeUndefined(); expect(await store.findSession(`s2-${id}`)).toBeDefined();
    await store.deleteSessionsOf(id); expect(await store.findSession(`s2-${id}`)).toBeUndefined();
  });
  it('gives a one-time token once, only for its kind, and not after it expires', async () => {
    const store = await make(), id = `u-${Math.random().toString(36).slice(2)}`; await store.create({ id, email: unique(), passwordHash: 'h' });
    await store.putToken({ hash: `t1-${id}`, userId: id, kind: 'reset', expiresAt: Date.now() + 60_000 });
    expect(await store.takeToken(`t1-${id}`, 'verify')).toBeUndefined();            // wrong kind
    await store.putToken({ hash: `t2-${id}`, userId: id, kind: 'reset', expiresAt: Date.now() + 60_000 });
    expect(await store.takeToken(`t2-${id}`, 'reset')).toBe(id); expect(await store.takeToken(`t2-${id}`, 'reset')).toBeUndefined();   // once
    await store.putToken({ hash: `t3-${id}`, userId: id, kind: 'verify', expiresAt: Date.now() - 1 }); expect(await store.takeToken(`t3-${id}`, 'verify')).toBeUndefined();
  });
  it('counts what a person did today, per bucket and per person', async () => {
    const store = await make(), a = `t-${Math.random().toString(36).slice(2)}`, b = `t-${Math.random().toString(36).slice(2)}`;
    expect([await store.bump(a, 'ai', '2026-01-01'), await store.bump(a, 'ai', '2026-01-01'), await store.bump(a, 'render', '2026-01-01'), await store.bump(a, 'ai', '2026-01-02'), await store.bump(b, 'ai', '2026-01-01')]).toEqual([1, 2, 1, 1, 1]);
  });
});
