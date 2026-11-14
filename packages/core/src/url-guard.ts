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
  // An IPv6 literal comes back from URL with its brackets ("[::1]"); without them isIP sees no address and the host would go to a DNS lookup,
  // which answers differently on each platform (and cannot resolve a public IPv6 literal at all on some).
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
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

/** An IPv6 address as its eight 16-bit groups (the "::" gap filled in, a dotted IPv4 tail turned into two groups), or undefined when it is not one. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase().split('%')[0]!;
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (tail) { const [a, b, c, d] = tail.slice(1).map(Number) as [number, number, number, number]; text = `${text.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`; }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const read = (part: string) => (part === '' ? [] : part.split(':').map(group => parseInt(group, 16)));
  const head = read(halves[0]!), rest = halves.length === 2 ? read(halves[1]!) : [];
  const groups = [...head, ...Array<number>(halves.length === 2 ? Math.max(0, 8 - head.length - rest.length) : 0).fill(0), ...rest];
  return groups.length === 8 && groups.every(group => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : undefined;
}

// Whether an IPv6 address may be fetched. The URL parser writes "::ffff:127.0.0.1" as "::ffff:7f00:1", so an address that carries an IPv4 address
// (mapped, compatible, NAT64 or 6to4) is judged by the IPv4 address inside it. An address that cannot be read is refused.
function isPublicIpv6(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return false;
  const first = g[0]!, zeros = (count: number) => g.slice(0, count).every(group => group === 0);
  const inner = (high: number, low: number) => isPublicAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  if (zeros(8) || (zeros(7) && g[7] === 1)) return false;                      // unspecified, loopback
  if ((first & 0xfe00) === 0xfc00) return false;                               // unique local
  if ((first & 0xffc0) === 0xfe80 || (first & 0xffc0) === 0xfec0) return false; // link-local, site-local
  if ((first & 0xff00) === 0xff00) return false;                               // multicast
  if (first === 0x2001 && g[1] === 0x0db8) return false;                       // documentation
  if (zeros(5) && g[5] === 0xffff) return inner(g[6]!, g[7]!);                 // IPv4-mapped
  if (zeros(6)) return inner(g[6]!, g[7]!);                                    // IPv4-compatible
  if (first === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every(group => group === 0)) return inner(g[6]!, g[7]!); // NAT64
  if (first === 0x2002) return inner(g[1]!, g[2]!);                            // 6to4
  return true;
}
