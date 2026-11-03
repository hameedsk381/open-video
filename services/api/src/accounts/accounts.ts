import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Principal } from '@ove/storage';
import { decoyHash, hashPassword, normalizeEmail, passwordProblem, verifyPassword } from './passwords';
import { EmailTaken, type UserStore } from './users';
import type { Auth, Route } from '../types';

export interface Mailer { send(to: string, subject: string, text: string): Promise<void> }
/** For development and tests: writes the message where you can read it. */
export const consoleMailer: Mailer = { async send(to, subject, text) { console.log(`[mail to ${to}] ${subject}\n${text}`); } };

/** Limits how fast one key (an address, a person) may try something. Memory-only: with several API processes, each keeps its own count. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}
  /** True when this attempt is allowed (and counts it). */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(time => now - time < this.windowMs);
    if (recent.length >= this.max) { this.hits.set(key, recent); return false; }
    recent.push(now); this.hits.set(key, recent);
    if (this.hits.size > 10_000) for (const [k, v] of this.hits) if (!v.some(time => now - time < this.windowMs)) this.hits.delete(k);
    return true;
  }
}

export type AccountsOptions = {
  users: UserStore;
  mailer?: Mailer;
  /** Where links in emails point (the studio's public address). */
  publicOrigin: string;
  /** Mark the session cookie Secure (behind HTTPS). */
  secureCookies?: boolean;
  /** Read the client address from X-Forwarded-For (only behind a proxy you control). */
  trustProxy?: boolean;
  /** Turn people away until they have used the link in their verification email. */
  requireVerified?: boolean;
  /** Turn sign-ups off (invite-only). */
  signups?: boolean;
  sessionDays?: number;
  /** Attempts allowed from one address (and, for logins, one email) in the window: sign-ups per hour, logins per 15 minutes. */
  rateLimits?: { signups?: number; logins?: number };
};

const COOKIE = 'ove_session';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const generic = 'Wrong email or password';

/** Email-and-password accounts with server-side sessions. Each account is its own tenant, so what it owns is reachable by nobody else. */
export function createAccounts(options: AccountsOptions): Auth & { routes(): Route[] } {
  const { users, publicOrigin } = options, mailer = options.mailer ?? consoleMailer, sessionMs = (options.sessionDays ?? 30) * 86_400_000;
  const loginLimit = new RateLimiter(options.rateLimits?.logins ?? 10, 15 * 60_000), signupLimit = new RateLimiter(options.rateLimits?.signups ?? 5, 60 * 60_000), mailLimit = new RateLimiter(5, 60 * 60_000);
  const cookieFlags = (maxAge: number) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${options.secureCookies ? '; Secure' : ''}`;
  const address = (req: IncomingMessage) => (options.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim() : '') || req.socket.remoteAddress || 'unknown';
  const sessionIn = (req: IncomingMessage) => /(?:^|;\s*)ove_session=([A-Za-z0-9_-]{20,100})/.exec(req.headers.cookie ?? '')?.[1];
  const principalOf = (userId: string): Principal => ({ userId, tenantId: userId });

  async function startSession(userId: string) {
    const token = randomBytes(32).toString('base64url');
    await users.createSession({ idHash: sha(token), userId, expiresAt: Date.now() + sessionMs });
    return `${COOKIE}=${token}; ${cookieFlags(Math.floor(sessionMs / 1000))}`;
  }
  async function sendLink(userId: string, email: string, kind: 'verify' | 'reset') {
    const token = randomBytes(32).toString('base64url');
    await users.putToken({ hash: sha(token), userId, kind, expiresAt: Date.now() + (kind === 'reset' ? 3_600_000 : 86_400_000) });
    const link = `${publicOrigin}/#/${kind}/${token}`;
    await mailer.send(email, kind === 'reset' ? 'Reset your OVE password' : 'Confirm your email for OVE', kind === 'reset' ? `Open this link within an hour to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this message.` : `Open this link to confirm your email:\n${link}`);
  }
  const view = (user: { id: string; email: string; verifiedAt?: number }) => ({ id: user.id, email: user.email, verified: !!user.verifiedAt });

  const authenticate = async (req: IncomingMessage): Promise<Principal | undefined> => {
    const token = sessionIn(req); if (!token) return undefined;
    const session = await users.findSession(sha(token));
    if (!session || session.expiresAt < Date.now()) return undefined;
    const user = await users.byId(session.userId);
    if (!user || user.disabled || (options.requireVerified && !user.verifiedAt)) return undefined;
    return principalOf(user.id);
  };

  const routes = (): Route[] => [
    { method: 'POST', path: '/api/auth/signup', open: true, handle: async c => {
      if (options.signups === false) return c.json(403, { error: 'Sign-ups are closed right now' });
      if (!signupLimit.take(address(c.req))) return c.json(429, { error: 'Too many sign-ups from here. Try again later.' });
      const body = await c.body(), email = normalizeEmail(body.email), problem = passwordProblem(body.password);
      if (!email) return c.json(400, { error: 'Enter a valid email address' });
      if (problem) return c.json(400, { error: problem });
      let user; try { user = await users.create({ id: randomUUID(), email, passwordHash: await hashPassword(body.password) }); } catch (error) { if (error instanceof EmailTaken) return c.json(409, { error: error.message }); throw error; }
      void sendLink(user.id, email, 'verify').catch(() => {});
      c.json(201, { user: view(user) }, { 'set-cookie': await startSession(user.id) });
    } },
    { method: 'POST', path: '/api/auth/login', open: true, handle: async c => {
      const body = await c.body(), email = normalizeEmail(body.email), ip = address(c.req);
      if (!loginLimit.take(`ip:${ip}`) || (email && !loginLimit.take(`email:${email}`))) return c.json(429, { error: 'Too many attempts. Wait a few minutes and try again.' });
      const user = email ? await users.byEmail(email) : undefined, password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
      // Always do one password check, so a missing account costs the same as a wrong password.
      const ok = await verifyPassword(password, user?.passwordHash ?? await decoyHash());
      if (user?.lockedUntil && user.lockedUntil > Date.now()) return c.json(429, { error: 'This account is locked for a few minutes after too many wrong passwords' });
      if (!user || !ok || user.disabled) { if (user && !ok) await users.recordFailure(user.id, 5, 15 * 60_000); return c.json(401, { error: generic }); }
      if (options.requireVerified && !user.verifiedAt) return c.json(403, { error: 'Confirm your email first: open the link we sent you' });
      await users.clearFailures(user.id);
      c.json(200, { user: view(user) }, { 'set-cookie': await startSession(user.id) });
    } },
    { method: 'POST', path: '/api/auth/logout', open: true, handle: async c => {
      const token = sessionIn(c.req); if (token) await users.deleteSession(sha(token));
      c.json(200, { ok: true }, { 'set-cookie': `${COOKIE}=; ${cookieFlags(0)}` });
    } },
    { method: 'GET', path: '/api/auth/me', open: true, handle: async c => {
      const who = await authenticate(c.req), user = who && await users.byId(who.userId);
      c.json(200, { user: user ? view(user) : null, mode: 'hosted', signups: options.signups !== false });
    } },
    { method: 'POST', path: '/api/auth/forgot', open: true, handle: async c => {
      const body = await c.body(), email = normalizeEmail(body.email);
      // The answer is the same whether or not the address has an account.
      if (email && mailLimit.take(`${address(c.req)}|${email}`)) { const user = await users.byEmail(email); if (user && !user.disabled) void sendLink(user.id, email, 'reset').catch(() => {}); }
      c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/auth/reset', open: true, handle: async c => {
      const body = await c.body(), problem = passwordProblem(body.password);
      if (problem) return c.json(400, { error: problem });
      const userId = typeof body.token === 'string' ? await users.takeToken(sha(body.token), 'reset') : undefined;
      if (!userId) return c.json(400, { error: 'That link has expired or was already used. Ask for a new one.' });
      await users.setPassword(userId, await hashPassword(body.password)); await users.clearFailures(userId); await users.deleteSessionsOf(userId);
      c.json(200, { ok: true });
    } },
    { method: 'POST', path: '/api/auth/verify', open: true, handle: async c => {
      const body = await c.body(), userId = typeof body.token === 'string' ? await users.takeToken(sha(body.token), 'verify') : undefined;
      if (!userId) return c.json(400, { error: 'That link has expired or was already used.' });
      await users.markVerified(userId); c.json(200, { ok: true });
    } },
  ];
  return { authenticate, routes };
}
