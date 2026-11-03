import type { IncomingMessage } from 'node:http';
import type { AppDeps } from './types';

// The server may listen where a web page open in the same browser (or another site's script) can reach it, by sending requests (a POST with
// a text/plain body needs no CORS preflight) or by pointing a domain it controls at this address (DNS rebinding). So every request must name
// this server as its Host, and every request that changes something must come from this server's own page (Origin) and carry JSON, which a
// cross-site page cannot send without the browser asking first.
export function createGuard(deps: Pick<AppDeps, 'mode' | 'allowHosts' | 'publicPort' | 'publicOrigin'>, listeningPort: () => number) {
  const hostAllowed = (host: string) => {
    const name = host.toLowerCase().replace(/:\d+$/, ''), hostPort = Number(/:(\d+)$/.exec(host)?.[1] ?? NaN);
    const listed = (deps.allowHosts ?? []).some(allowed => allowed.toLowerCase() === name);
    if (deps.mode === 'hosted') return listed || (!!deps.publicOrigin && new URL(deps.publicOrigin).host.toLowerCase() === host.toLowerCase());
    return (hostPort === listeningPort() || hostPort === deps.publicPort) && (name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || listed);
  };
  /** The reason a request is refused, or nothing when it may go on. */
  return (req: IncomingMessage): string | undefined => {
    const host = req.headers.host ?? '';
    if (!hostAllowed(host)) return deps.mode === 'hosted' ? `Host "${host}" is not served here` : `Host "${host}" is not allowed; open the studio at http://127.0.0.1:${listeningPort()}/`;
    if (req.method === 'GET' || req.method === 'HEAD') return undefined;
    const expected = deps.publicOrigin ?? `http://${host}`;
    if (req.headers.origin !== expected) return 'Changes are only accepted from the studio page itself';
    if (req.url?.startsWith('/api/upload?') && /^application\/octet-stream\b/i.test(req.headers['content-type'] ?? '')) return undefined;
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'Changes must be sent as application/json';
    return undefined;
  };
}
