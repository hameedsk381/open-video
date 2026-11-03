import pg from 'pg';
import { EmailTaken, type TokenKind, type User, type UserStore } from './users';

// The tables behind accounts. Everything is created if missing, so a fresh database needs no separate step.
export const schema = `
create table if not exists users (
  id text primary key, email text not null unique, password_hash text not null, created_at bigint not null, verified_at bigint,
  failed_logins int not null default 0, locked_until bigint, disabled boolean not null default false);
create table if not exists sessions (id_hash text primary key, user_id text not null references users(id) on delete cascade, expires_at bigint not null);
create index if not exists sessions_user on sessions(user_id);
create table if not exists auth_tokens (hash text primary key, user_id text not null references users(id) on delete cascade, kind text not null, expires_at bigint not null);
create table if not exists usage (tenant text not null, bucket text not null, day text not null, n int not null default 0, primary key (tenant, bucket, day));`;

const row = (r: any): User => ({ id: r.id, email: r.email, passwordHash: r.password_hash, createdAt: Number(r.created_at), verifiedAt: r.verified_at === null ? undefined : Number(r.verified_at), failedLogins: r.failed_logins, lockedUntil: r.locked_until === null ? undefined : Number(r.locked_until), disabled: r.disabled });

export class PgUserStore implements UserStore {
  constructor(private pool: pg.Pool) {}
  static async connect(connectionString: string) { const pool = new pg.Pool({ connectionString, max: 10 }); await pool.query(schema); return new PgUserStore(pool); }
  async create(user: { id: string; email: string; passwordHash: string }) {
    try { const r = await this.pool.query('insert into users (id, email, password_hash, created_at) values ($1, $2, $3, $4) returning *', [user.id, user.email, user.passwordHash, Date.now()]); return row(r.rows[0]); }
    catch (error) { if ((error as { code?: string }).code === '23505') throw new EmailTaken(); throw error; }
  }
  async byEmail(email: string) { const r = await this.pool.query('select * from users where email = $1', [email]); return r.rows[0] && row(r.rows[0]); }
  async byId(id: string) { const r = await this.pool.query('select * from users where id = $1', [id]); return r.rows[0] && row(r.rows[0]); }
  async setPassword(id: string, passwordHash: string) { await this.pool.query('update users set password_hash = $2 where id = $1', [id, passwordHash]); }
  async markVerified(id: string) { await this.pool.query('update users set verified_at = $2 where id = $1', [id, Date.now()]); }
  async setDisabled(id: string, disabled: boolean) { await this.pool.query('update users set disabled = $2 where id = $1', [id, disabled]); }
  async recordFailure(id: string, limit: number, lockMs: number) {
    await this.pool.query('update users set failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end, locked_until = case when failed_logins + 1 >= $2 then $3::bigint else locked_until end where id = $1', [id, limit, Date.now() + lockMs]);
  }
  async clearFailures(id: string) { await this.pool.query('update users set failed_logins = 0, locked_until = null where id = $1', [id]); }
  async createSession(session: { idHash: string; userId: string; expiresAt: number }) { await this.pool.query('insert into sessions (id_hash, user_id, expires_at) values ($1, $2, $3)', [session.idHash, session.userId, session.expiresAt]); }
  async findSession(idHash: string) { const r = await this.pool.query('select user_id, expires_at from sessions where id_hash = $1', [idHash]); return r.rows[0] ? { userId: r.rows[0].user_id as string, expiresAt: Number(r.rows[0].expires_at) } : undefined; }
  async deleteSession(idHash: string) { await this.pool.query('delete from sessions where id_hash = $1', [idHash]); }
  async deleteSessionsOf(userId: string) { await this.pool.query('delete from sessions where user_id = $1', [userId]); }
  async putToken(token: { hash: string; userId: string; kind: TokenKind; expiresAt: number }) { await this.pool.query('insert into auth_tokens (hash, user_id, kind, expires_at) values ($1, $2, $3, $4)', [token.hash, token.userId, token.kind, token.expiresAt]); }
  async takeToken(hash: string, kind: TokenKind) {
    const r = await this.pool.query('delete from auth_tokens where hash = $1 and kind = $2 returning user_id, expires_at', [hash, kind]);
    return r.rows[0] && Number(r.rows[0].expires_at) > Date.now() ? r.rows[0].user_id as string : undefined;
  }
  async bump(tenant: string, bucket: string, day: string) {
    const r = await this.pool.query('insert into usage (tenant, bucket, day, n) values ($1, $2, $3, 1) on conflict (tenant, bucket, day) do update set n = usage.n + 1 returning n', [tenant, bucket, day]);
    return r.rows[0].n as number;
  }
  async close() { await this.pool.end(); }
}
