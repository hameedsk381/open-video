import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** A URL the server itself will fetch must name a public internet host: http(s) only, standard ports,
 *  no loopback, private, link-local or otherwise internal addresses — resolved, not just checked as text. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('That is not a valid URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https addresses can be fetched');
  if (url.username || url.password) throw new Error('Addresses with embedded credentials cannot be fetched');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Only ports 80 and 443 can be fetched');
  const host = url.hostname.toLowerCase();
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw new Error('That address is not reachable from the server');
    return url;
  }
  if (/^localhost$|\.localhost$|\.local$|\.internal$|\.home$|\.lan$|\.arpa$/i.test(host)) throw new Error('That address is not reachable from the server');
  let resolved: { address: string }[];
  try { resolved = await lookup(host, { all: true, verbatim: true }); } catch { throw new Error('That host does not resolve'); }
  if (resolved.length === 0) throw new Error('That host does not resolve');
  for (const { address } of resolved) if (!isPublicAddress(address)) throw new Error('That address is not reachable from the server');
  return url;
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 6) return isPublicIpv6(address);
  const bytes = address.split('.').map(Number);
  const [a, b] = bytes as [number, number];
  if (a === 0 || a === 10 || a === 127) return false;                          // this-host, private, loopback
  if (a === 169 && b === 254) return false;                                    // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;                           // private
  if (a === 192 && b === 168) return false;                                    // private
  if (a === 100 && b >= 64 && b <= 127) return false;                          // carrier-grade NAT
  if (a === 198 && (b === 18 || b === 19)) return false;                       // benchmarking
  if (a >= 224) return false;                                                  // multicast and reserved
  return true;
}

function isPublicIpv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return false;                         // unspecified, loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return false; // link-local, unique local
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPublicAddress(mapped[1]!);                              // IPv4-mapped
  return true;
}
