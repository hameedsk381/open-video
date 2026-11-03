import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt is memory-hard, ships with Node, and needs no native add-on. The cost parameters are stored with each hash, so they can be raised later
// and old hashes still check. Format: scrypt$N$r$p$salt(base64url)$hash(base64url).
const N = 2 ** 15, r = 8, p = 1, keyLength = 64;
const derive = (password: string, salt: Buffer, options: ScryptOptions) => new Promise<Buffer>((ok, fail) => scrypt(password, salt, keyLength, options, (error, key) => error ? fail(error) : ok(key)));
const options = (n: number, rr: number, pp: number): ScryptOptions => ({ N: n, r: rr, p: pp, maxmem: 128 * n * rr * 2 });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16), key = await derive(password.normalize('NFKC'), salt, options(N, r, p));
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, rr, pp, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !rr || !pp || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url'), key = await derive(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), options(Number(n), Number(rr), Number(pp)));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to check against when the email is unknown, so an unknown email takes as long to answer as a wrong password. */
let decoy: Promise<string> | undefined;
export const decoyHash = () => decoy ??= hashPassword('not-a-real-password');

export function passwordProblem(password: unknown): string | undefined {
  if (typeof password !== 'string') return 'Choose a password';
  if (password.length < 10) return 'Use at least 10 characters for your password';
  if (password.length > 200) return 'That password is too long';
  if (/^(.)\1+$/.test(password)) return 'Choose a password that is not one repeated character';
  return undefined;
}
export function normalizeEmail(email: unknown): string | undefined {
  if (typeof email !== 'string') return undefined;
  const value = email.trim().toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : undefined;
}
