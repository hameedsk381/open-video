export type User = { id: string; email: string; passwordHash: string; createdAt: number; verifiedAt?: number; failedLogins: number; lockedUntil?: number; disabled: boolean };
export type TokenKind = 'verify' | 'reset';
export class EmailTaken extends Error { constructor() { super('That email already has an account'); } }

/** Where accounts, sessions and one-time tokens are kept. Session ids and tokens are stored only as hashes, so a leaked table logs nobody in. */
export interface UserStore {
  create(user: { id: string; email: string; passwordHash: string }): Promise<User>;
  byEmail(email: string): Promise<User | undefined>;
  byId(id: string): Promise<User | undefined>;
  setPassword(id: string, passwordHash: string): Promise<void>;
  markVerified(id: string): Promise<void>;
  setDisabled(id: string, disabled: boolean): Promise<void>;
  /** Counts a wrong password; at `limit` failures the account is locked for `lockMs`. */
  recordFailure(id: string, limit: number, lockMs: number): Promise<void>;
  clearFailures(id: string): Promise<void>;
  createSession(session: { idHash: string; userId: string; expiresAt: number }): Promise<void>;
  findSession(idHash: string): Promise<{ userId: string; expiresAt: number } | undefined>;
  deleteSession(idHash: string): Promise<void>;
  deleteSessionsOf(userId: string): Promise<void>;
  putToken(token: { hash: string; userId: string; kind: TokenKind; expiresAt: number }): Promise<void>;
  /** Uses a token up: the user it belongs to, once, if it is still valid. */
  takeToken(hash: string, kind: TokenKind): Promise<string | undefined>;
  /** Counts something a person did today (UTC day) and gives the new total. */
  bump(tenant: string, bucket: string, day: string): Promise<number>;
  close?(): Promise<void>;
}

export class MemoryUserStore implements UserStore {
  private users = new Map<string, User>(); private emails = new Map<string, string>();
  private sessions = new Map<string, { userId: string; expiresAt: number }>();
  private tokens = new Map<string, { userId: string; kind: TokenKind; expiresAt: number }>();
  private usage = new Map<string, number>();
  async create(user: { id: string; email: string; passwordHash: string }) {
    if (this.emails.has(user.email)) throw new EmailTaken();
    const made: User = { ...user, createdAt: Date.now(), failedLogins: 0, disabled: false };
    this.users.set(made.id, made); this.emails.set(made.email, made.id); return { ...made };
  }
  async byEmail(email: string) { const id = this.emails.get(email); const user = id && this.users.get(id); return user ? { ...user } : undefined; }
  async byId(id: string) { const user = this.users.get(id); return user ? { ...user } : undefined; }
  async setPassword(id: string, passwordHash: string) { this.users.get(id)!.passwordHash = passwordHash; }
  async markVerified(id: string) { this.users.get(id)!.verifiedAt = Date.now(); }
  async setDisabled(id: string, disabled: boolean) { this.users.get(id)!.disabled = disabled; }
  async recordFailure(id: string, limit: number, lockMs: number) { const user = this.users.get(id)!; user.failedLogins++; if (user.failedLogins >= limit) { user.lockedUntil = Date.now() + lockMs; user.failedLogins = 0; } }
  async clearFailures(id: string) { const user = this.users.get(id)!; user.failedLogins = 0; user.lockedUntil = undefined; }
  async createSession(session: { idHash: string; userId: string; expiresAt: number }) { this.sessions.set(session.idHash, { userId: session.userId, expiresAt: session.expiresAt }); }
  async findSession(idHash: string) { const session = this.sessions.get(idHash); return session ? { ...session } : undefined; }
  async deleteSession(idHash: string) { this.sessions.delete(idHash); }
  async deleteSessionsOf(userId: string) { for (const [hash, session] of this.sessions) if (session.userId === userId) this.sessions.delete(hash); }
  async putToken(token: { hash: string; userId: string; kind: TokenKind; expiresAt: number }) { this.tokens.set(token.hash, { userId: token.userId, kind: token.kind, expiresAt: token.expiresAt }); }
  async takeToken(hash: string, kind: TokenKind) { const token = this.tokens.get(hash); this.tokens.delete(hash); return token && token.kind === kind && token.expiresAt > Date.now() ? token.userId : undefined; }
  async bump(tenant: string, bucket: string, day: string) { const key = `${tenant}|${bucket}|${day}`, n = (this.usage.get(key) ?? 0) + 1; this.usage.set(key, n); return n; }
}
